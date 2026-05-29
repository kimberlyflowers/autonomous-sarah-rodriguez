const API = '';

let currentVariants = null;
let currentBatchId = null;
let studioJobs = [];
let knownVideoStatuses = {};
let videoStatusWatchStarted = false;
let authConfig = null;
let supabaseClient = null;
let authToken = localStorage.getItem('bloomStudioToken') || '';
let currentTenant = JSON.parse(localStorage.getItem('bloomStudioTenant') || 'null');
let assetsCache = { products: [], subjects: [], audio: [], outputs: [], videos: [] };
let ugcCharactersCache = []; // pulled from Supabase ugc_characters via /api/characters
let selectedCharacter = null;
let currentCharacterTab = 'library';
let currentCharacterPickerTab = 'all';
let characterPickerContext = 'video'; // 'video' | 'productPlacement' | 'addLook'
let currentCharacterRatio = 'portrait';
let currentLibraryImageRatio = 'portrait';
let libraryImageItems = [];
let libraryVideoItems = [];
let renderedVideoItems = [];
let selectedVideoKeys = new Set();
let lastSelectedVideoIndex = -1;
let assetLightboxItems = {};
let videoErrorDetails = {};
let videoStatusDetails = {};
let lightboxCollection = [];
let lightboxIndex = 0;
let trendsCache = [];
let trendIndex = 0;
let trendsTimer = null;
let remixOptionsCache = { brands: [], products: [], characters: [] };
let trendRemixMode = false;
let visibleTrendCount = 100;
let trendScrollWatcherAttached = false;
let currentLibraryVideoRatio = 'portrait';
let productPlacementCharacter = null;
let productPlacementProduct = null;
let productPlacementReferences = [];
let productPlacementRequest = null;
let productPlacementTimedOut = false;
let latestProductPlacementImage = '';
let latestProductPlacementPrompt = '';
let latestProductPlacementAspectRatio = '9:16';
let latestProductPlacementSize = '1k';
let latestBuiltAgentImage = '';
let currentAgentBuildPreviewRatio = 'portrait';
let studioCrop = { x: 50, y: 50 };
let cropDrag = null;
let previewAudioAsset = null;
let voicePreviewTimer = null;
let generationTimer = null;
let generationStartedAt = 0;
let generationOverlayMode = 'active';
let activeBackgroundVideoKey = '';
let activeBackgroundVideoLastCheck = 0;
let activeBackgroundVideoCheckInFlight = false;
let studioStatusCache = null;
let campaignState = { selectedCharacters: new Set(), assetMap: new Map(), productKey: '', trendId: '', scenePlan: [], frameWorkflow: null };
let currentCreateImageType = 'products';

const starterCharacters = [
  { slug: 'library-financial-advisor', name: 'Financial Advisor', role: 'Advisor specialist', imageUrl: '/agent-library/financial-advisor.png' },
  { slug: 'library-real-estate-agent', name: 'Real Estate Agent', role: 'Listing specialist', imageUrl: '/agent-library/real-estate-agent.png' },
  { slug: 'library-small-business', name: 'Small Business Owner', role: 'Founder presenter', imageUrl: '/agent-library/small-business-owner.png' },
  { slug: 'library-ecommerce-founder', name: 'Ecommerce Founder', role: 'Product seller', imageUrl: '/agent-library/ecommerce-founder.png' },
  { slug: 'library-sarah-studio', name: 'Sarah Studio', role: 'Bloomie narrator', imageUrl: '/agent-library/sarah-studio.png', voiceId: 'TOhxx937tpk5BU3jtXir' },
  { slug: 'library-marcus-chen', name: 'Marcus Chen', role: 'Finance narrator', imageUrl: '/agent-library/marcus-chen.png', voiceId: 'iP95p4xoKVk53GoZ742B' },
  { slug: 'library-rebecca-advisor', name: 'Rebecca Advisor', role: 'Finance narrator', imageUrl: '/agent-library/rebecca-advisor.jpg' },
  { slug: 'library-janelle-real-estate', name: 'Janelle Real Estate', role: 'Market narrator', imageUrl: '/agent-library/janelle-real-estate.jpg' },
  { slug: 'library-andre-founder', name: 'Andre Founder', role: 'Business owner', imageUrl: '/agent-library/andre-founder.jpg' },
  { slug: 'library-studio-presenter', name: 'Studio Presenter', role: 'Podcast host', imageUrl: '/agent-library/studio-presenter.png' },
  { slug: 'library-coach-presenter', name: 'Coach Presenter', role: 'Training coach', imageUrl: '/agent-library/coach-presenter.png' }
];

const defaultCharacterVoiceIds = {
  sarah: 'TOhxx937tpk5BU3jtXir',
  marcus: 'iP95p4xoKVk53GoZ742B'
};

const savedTheme = localStorage.getItem('bloomStudioTheme') || 'dark';
document.body.dataset.theme = savedTheme;

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.addEventListener('change', (event) => {
  if (event.target?.id === 'genDuration') {
    document.getElementById('genCustomDurationGroup').style.display = event.target.value === 'custom' ? '' : 'none';
  }
  if (event.target?.id === 'studioAspectRatio') {
    updatePreviewRatio();
  }
  if (event.target?.id === 'studioImage') {
    previewUploadedImage(event.target.files?.[0]);
  }
  if (event.target?.id === 'productPlacementModel') {
    updateProductPlacementModelCopy();
  }
});

document.addEventListener('pointermove', handlePreviewDragMove);
document.addEventListener('pointerup', endPreviewDrag);
document.addEventListener('pointercancel', endPreviewDrag);

function switchTab(tabId) {
  const target = document.getElementById(`tab-${tabId}`);
  if (!target) return;
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.toggle('active', t === target);
  });

  if (tabId === 'assets' || tabId === 'characters' || tabId === 'products') loadAssets();
  if (tabId === 'brands') loadBrands();
  if (tabId === 'billing') loadBilling();
  if (tabId === 'advanced') loadGenerateOptions();
  if (tabId === 'videos') loadVideos();
  if (tabId === 'studio') loadStudioStatus();
  if (tabId === 'products') loadProductPlacementStatus();
  if (tabId === 'trends') loadTrends();
}

function isolateStudioTabIfActive() {
  const studio = document.getElementById('tab-studio');
  if (!studio?.classList.contains('active')) return;
  document.querySelectorAll('.tab-content.active').forEach(section => {
    if (section !== studio) section.classList.remove('active');
  });
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === 'studio');
  });
}

function isTabActive(tabId) {
  return !!document.getElementById(`tab-${tabId}`)?.classList.contains('active');
}

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  if (type === 'success' || type === 'error') playNotificationSound(type);
  setTimeout(() => el.remove(), 4800);
}

function playNotificationSound(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(type === 'error' ? 0.05 : 0.035, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    gain.connect(ctx.destination);
    [type === 'error' ? 220 : 660, type === 'error' ? 165 : 880].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(ctx.currentTime + index * 0.08);
      osc.stop(ctx.currentTime + 0.16 + index * 0.08);
    });
    setTimeout(() => ctx.close().catch(() => {}), 420);
  } catch (error) {}
}

function startVideoStatusWatcher() {
  if (videoStatusWatchStarted) return;
  videoStatusWatchStarted = true;
  setInterval(() => {
    if (!authToken && !currentTenant) return;
    if (isTabActive('videos') || activeBackgroundVideoKey) loadVideos({ notify: true });
  }, 20000);
}

function startGenerationOverlay({ engine = 'wan-comfy', mode = 'i2v' } = {}) {
  const overlay = document.getElementById('generationOverlay');
  if (!overlay) return;
  generationStartedAt = Date.now();
  generationOverlayMode = 'active';
  activeBackgroundVideoKey = '';
  overlay.classList.add('active');
  document.getElementById('generationSuccessActions').style.display = 'none';
  document.getElementById('generationDismissButton').textContent = 'Keep working';
  document.getElementById('generationNote').textContent = 'You can navigate away from this page or keep using the app. Bloom Studio will notify you with a popup and sound when this request finishes.';
  const label = engine === 'infinitetalk-hd'
    ? 'InfiniteTalk HD'
    : engine === 'seedance-campaign'
    ? 'RunPod Seedance campaign'
    : engine === 'musetalk'
    ? 'MuseTalk lip sync'
    : engine === 'meigen'
    ? 'Meigen lip sync'
    : engine === 'wan22-serverless'
      ? 'Wan 2.2 Serverless'
      : engine === 'wan-animate'
        ? 'Wan Animate motion remix'
        : mode === 'v2v' ? 'WAN V2V' : 'WAN ComfyUI';
  document.getElementById('generationEngine').textContent = label;
  updateGenerationOverlay(engine, mode);
  clearInterval(generationTimer);
  generationTimer = setInterval(() => updateGenerationOverlay(engine, mode), 1000);
}

function setBackgroundGenerationOverlay({ engine = 'wan-comfy', mode = 'i2v', jobKey = '' } = {}) {
  generationOverlayMode = 'background';
  activeBackgroundVideoKey = jobKey || '';
  activeBackgroundVideoLastCheck = 0;
  activeBackgroundVideoCheckInFlight = false;
  document.getElementById('generationSuccessActions').style.display = 'none';
  document.getElementById('generationTitle').textContent = 'Success!';
  document.getElementById('generationDetail').textContent = 'Your video is currently processing in background. You can navigate away from this page or keep using the app while your video is cooking. We will notify you when it is complete.';
  document.getElementById('generationPercent').textContent = 'Processing';
  document.getElementById('generationProgressFill').style.width = '18%';
  document.getElementById('generationNote').textContent = 'Video complete? A green popup will say “Video complete — check your Library to see the completed video.”';
  document.getElementById('generationDismissButton').textContent = 'Keep working';
  updateGenerationOverlay(engine, mode);
  clearInterval(generationTimer);
  generationTimer = setInterval(() => updateGenerationOverlay(engine, mode), 1000);
}

function updateGenerationOverlay(engine = 'wan-comfy', mode = 'i2v') {
  const elapsed = Math.max(0, Math.round((Date.now() - generationStartedAt) / 1000));
  const estimate = engine === 'infinitetalk-hd' ? 900 : engine === 'musetalk' ? 360 : engine === 'seedance-campaign' ? 260 : engine === 'meigen' ? 180 : engine === 'wan22-serverless' ? 260 : engine === 'wan-animate' ? 420 : mode === 'v2v' ? 300 : 240;
  const progress = Math.min(96, Math.max(3, Math.round((elapsed / estimate) * 92)));
  if (generationOverlayMode === 'background') {
    document.getElementById('generationElapsed').textContent = `${elapsed}s elapsed`;
    document.getElementById('generationPercent').textContent = `${progress}% estimated`;
    document.getElementById('generationProgressFill').style.width = `${progress}%`;
    maybeCheckActiveBackgroundVideo();
    return;
  }
  const stages = engine === 'infinitetalk-hd'
    ? [
        [10, 'Uploading references', 'Sending your image and voiceover to InfiniteTalk HD.'],
        [35, 'Rendering lip sync', 'Wan 2.1 InfiniteTalk is building the talking-head video.'],
        [70, 'Restoring face', 'CodeFormer is refining the face region.'],
        [90, 'Upscaling video', 'Real-ESRGAN is preparing the final output when 1080p is selected.'],
        [96, 'Saving to Library', 'Almost there. Bloom Studio is collecting the finished video.']
      ]
    : engine === 'meigen'
    ? [
        [10, 'Uploading references', 'Sending your selected image and voiceover to the lip sync endpoint.'],
        [35, 'Building the face track', 'Matching the speaker motion to the audio.'],
        [70, 'Rendering video', 'Generating the final talking-head clip.'],
        [96, 'Saving to Library', 'Almost there. Bloom Studio is collecting the finished video.']
      ]
    : engine === 'musetalk'
    ? [
        [10, 'Uploading avatar and audio', 'Sending your selected image and voiceover to the MuseTalk endpoint.'],
        [32, 'Preparing face region', 'MuseTalk is locating and caching the face region for lip sync.'],
        [72, 'Rendering lip sync', 'Generating the mouth movement from the audio.'],
        [96, 'Saving to Library', 'Almost there. Bloom Studio is collecting the finished video.']
      ]
    : engine === 'wan22-serverless'
      ? [
          [10, 'Uploading character image', 'Sending the selected image to the Wan 2.2 serverless endpoint.'],
          [35, 'Building motion plan', 'Wan 2.2 is interpreting the prompt and image.'],
          [76, 'Rendering video', 'Generating natural motion from the still image.'],
          [96, 'Saving to Library', 'Almost there. Bloom Studio is collecting the finished video.']
        ]
      : engine === 'wan-animate'
        ? [
            [10, 'Uploading references', 'Sending the character image and source movement video.'],
            [32, 'Reading motion', 'Wan Animate is estimating pose and facial movement from the reference.'],
            [74, 'Rendering motion remix', 'Generating your character with the source movement.'],
            [96, 'Saving to Library', 'Almost there. Bloom Studio is collecting the finished video.']
          ]
    : [
        [10, 'Waking the workflow', 'Preparing the ComfyUI video workflow.'],
        [35, 'Loading media', 'Sending the selected image, video, and audio into the workflow.'],
        [75, 'Rendering frames', 'Generating the video frames and syncing motion.'],
        [96, 'Finalizing output', 'Almost there. Bloom Studio is waiting for the final file.']
      ];
  const stage = stages.find(item => progress <= item[0]) || stages[stages.length - 1];
  document.getElementById('generationTitle').textContent = `${stage[1]}...`;
  document.getElementById('generationDetail').textContent = stage[2];
  document.getElementById('generationElapsed').textContent = `${elapsed}s elapsed`;
  document.getElementById('generationPercent').textContent = `${progress}% estimated`;
  document.getElementById('generationProgressFill').style.width = `${progress}%`;
}

async function maybeCheckActiveBackgroundVideo() {
  if (!activeBackgroundVideoKey || activeBackgroundVideoCheckInFlight) return;
  const now = Date.now();
  if (now - activeBackgroundVideoLastCheck < 5000) return;
  activeBackgroundVideoLastCheck = now;
  activeBackgroundVideoCheckInFlight = true;
  try {
    const job = await api(`/api/studio/jobs/${encodeURIComponent(activeBackgroundVideoKey)}`);
    if (job.status === 'completed') {
      toast('Video complete — check your Library to see the completed video.', 'success');
      stopGenerationOverlay({ success: true });
      await loadVideos();
    } else if (job.status === 'failed') {
      stopGenerationOverlay();
      toast(job.error || 'Video generation failed.', 'error');
      await loadVideos();
    }
  } catch (error) {
    console.warn('Background video status check failed', error);
  } finally {
    activeBackgroundVideoCheckInFlight = false;
  }
}

function stopGenerationOverlay({ success = false } = {}) {
  clearInterval(generationTimer);
  generationTimer = null;
  const overlay = document.getElementById('generationOverlay');
  if (!overlay) return;
  generationOverlayMode = success ? 'complete' : 'active';
  activeBackgroundVideoKey = '';
  if (success) {
    document.getElementById('generationTitle').textContent = 'Video ready';
    document.getElementById('generationDetail').textContent = 'Video complete — check your Library to see the completed video.';
    document.getElementById('generationPercent').textContent = '100%';
    document.getElementById('generationProgressFill').style.width = '100%';
    document.getElementById('generationNote').textContent = 'This message will stay here until you open Library or dismiss it.';
    document.getElementById('generationSuccessActions').style.display = '';
    document.getElementById('generationDismissButton').textContent = 'Dismiss';
    return;
  }
  overlay.classList.remove('active');
}

function dismissGenerationOverlay() {
  const overlay = document.getElementById('generationOverlay');
  if (overlay) overlay.classList.remove('active');
  generationOverlayMode = 'active';
  activeBackgroundVideoKey = '';
}

function openGeneratedLibrary() {
  dismissGenerationOverlay();
  switchTab('videos');
  loadVideos();
}

function captureVideoPoster(video, imgId) {
  const img = document.getElementById(imgId);
  const wrap = video.closest('.video-thumb-wrap');
  if (!img || !wrap || img.dataset.ready === '1') return;
  try {
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    img.src = canvas.toDataURL('image/jpeg', 0.72);
    img.dataset.ready = '1';
    wrap.classList.add('ready');
  } catch (error) {
    wrap.classList.add('no-poster');
  }
}

function markVideoPlaying(video, isPlaying) {
  const wrap = video.closest('.video-thumb-wrap');
  if (wrap) wrap.classList.toggle('playing', isPlaying);
}

function aspectRatioToCssValue(value = '16:9') {
  const [width, height] = String(value).split(':').map(Number);
  if (!width || !height) return '16 / 9';
  return `${width} / ${height}`;
}

function aspectRatioKind(value = '') {
  const [width, height] = String(value).split(':').map(Number);
  if (!width || !height) return 'landscape';
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

function openLibraryLightbox(kind, index) {
  lightboxCollection = kind === 'videos' ? libraryVideoItems : libraryImageItems;
  lightboxIndex = Number(index) || 0;
  renderLibraryLightbox();
  document.getElementById('libraryLightbox').classList.add('active');
}

function openAssetImageLightbox(type, index) {
  lightboxCollection = assetLightboxItems[type] || [];
  lightboxIndex = Number(index) || 0;
  renderLibraryLightbox();
  document.getElementById('libraryLightbox').classList.add('active');
}

function closeLibraryLightbox() {
  const body = document.getElementById('lightboxBody');
  if (body) body.innerHTML = '';
  document.getElementById('libraryLightbox').classList.remove('active');
}

function moveLibraryLightbox(direction) {
  if (!lightboxCollection.length) return;
  lightboxIndex = (lightboxIndex + direction + lightboxCollection.length) % lightboxCollection.length;
  renderLibraryLightbox();
}

function renderLibraryLightbox() {
  const item = lightboxCollection[lightboxIndex];
  const body = document.getElementById('lightboxBody');
  if (!item || !body) return;
  document.getElementById('lightboxTitle').textContent = item.name || 'Library preview';
  document.getElementById('lightboxMeta').textContent = `${lightboxIndex + 1} of ${lightboxCollection.length}${item.prompt ? ` · ${item.prompt}` : ''}`;
  const ratioClass = 'natural';
  body.className = `lightbox-body ${ratioClass}`;
  const media = item.type === 'video'
    ? `<video class="lightbox-media" controls autoplay playsinline src="${item.url}"></video>`
    : `<img class="lightbox-media" src="${item.url}" alt="${escapeHtml(item.name || 'Library image')}">`;
  const sourceUrl = item.sourceTrendUrl || '';
  const sourcePanel = item.type === 'video' && sourceUrl
    ? `<aside class="lightbox-source-panel">
        <div class="lightbox-source-title">Trend source</div>
        <div class="lightbox-source-name">${escapeHtml(item.sourceTrendTitle || item.sourceTrendId || 'Original trend')}</div>
        <iframe class="lightbox-source-frame" src="${trendEmbedUrl(sourceUrl)}" title="Trend source preview" loading="lazy" referrerpolicy="no-referrer"></iframe>
        <button class="btn btn-secondary" type="button" onclick="window.open('${sourceUrl.replace(/'/g, "\\'")}','_blank','noopener')">Open source trend</button>
      </aside>`
    : '';
  body.innerHTML = `
    <button class="lightbox-nav lightbox-prev" type="button" onclick="moveLibraryLightbox(-1)">‹</button>
    <div class="${sourcePanel ? 'lightbox-review-grid' : 'lightbox-single-media'}">
      <div class="lightbox-generated-panel">${media}</div>
      ${sourcePanel}
    </div>
    <button class="lightbox-nav lightbox-next" type="button" onclick="moveLibraryLightbox(1)">›</button>
  `;
  const download = document.getElementById('lightboxDownload');
  const post = document.getElementById('lightboxPost');
  if (download) download.href = item.url;
  if (post) post.onclick = () => openPublishModal(item.url, item.type);
}

function trendEmbedUrl(url = '') {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host.includes('instagram.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const typeIndex = parts.findIndex(part => ['p', 'reel', 'tv'].includes(part));
      const type = parts[typeIndex];
      const code = parts[typeIndex + 1];
      if (typeIndex !== -1 && code) {
        return `https://www.instagram.com/${type}/${code}/embed`;
      }
    }
    if (host.includes('tiktok.com')) {
      const match = parsed.pathname.match(/\/video\/(\d+)/);
      if (match) return `https://www.tiktok.com/embed/v2/${match[1]}`;
    }
  } catch (error) {
    return '';
  }
  return '';
}

function trendThumbnailUrl(url = '') {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host.includes('instagram.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const typeIndex = parts.findIndex(part => ['p', 'reel', 'tv'].includes(part));
      const type = parts[typeIndex];
      const code = parts[typeIndex + 1];
      if (typeIndex !== -1 && code) {
        return authenticatedMediaUrl(`/api/trends/thumbnail?url=${encodeURIComponent(url)}`);
      }
    }
  } catch (error) {
    return '';
  }
  return '';
}

function debouncedLoadTrends() {
  clearTimeout(trendsTimer);
  trendsTimer = setTimeout(loadTrends, 260);
}

async function loadTrends() {
  const grid = document.getElementById('trendGrid');
  const count = document.getElementById('trendCount');
  if (!grid || !count) return;
  count.textContent = 'Loading trends...';
  grid.innerHTML = '<div class="empty-state">Loading trending hook library...</div>';
  visibleTrendCount = 100;
  try {
    const params = new URLSearchParams({
      q: document.getElementById('trendSearch')?.value || '',
      industry: document.getElementById('trendIndustry')?.value || 'All',
      platform: document.getElementById('trendPlatform')?.value || 'All',
      limit: '1200'
    });
    const data = await api(`/api/trends?${params.toString()}`);
    trendsCache = data.trends || [];
    hydrateTrendFilters(data);
    count.textContent = `Showing ${Math.min(visibleTrendCount, trendsCache.length)} of ${trendsCache.length} matching trend hooks. Views are not imported from the PDF yet.`;
    renderTrends();
    attachTrendScrollWatcher();
  } catch (error) {
    count.textContent = 'Could not load trends.';
    grid.innerHTML = `<div class="empty-state">Trend library failed to load: ${escapeHtml(error.message)}</div>`;
  }
}

function attachTrendScrollWatcher() {
  if (trendScrollWatcherAttached) return;
  trendScrollWatcherAttached = true;
  window.addEventListener('scroll', () => {
    const active = document.getElementById('tab-trends')?.classList.contains('active');
    if (!active || visibleTrendCount >= trendsCache.length) return;
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 900) {
      loadMoreTrends(false);
    }
  }, { passive: true });
}

function hydrateTrendFilters(data = {}) {
  const industry = document.getElementById('trendIndustry');
  const platform = document.getElementById('trendPlatform');
  if (industry && industry.options.length <= 1) {
    industry.innerHTML = (data.industries || ['All']).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  }
  if (platform && platform.options.length <= 1) {
    platform.innerHTML = (data.platforms || ['All']).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  }
}

function renderTrendFrame(trend, large = false) {
  const embed = trendEmbedUrl(trend.url);
  if (embed) {
    const frame = `<iframe ${large ? 'class="trend-lightbox-frame"' : ''} src="${embed}" loading="lazy" scrolling="no" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe>`;
    if (large) {
      return `<div class="trend-watch-shell">${frame}<div class="trend-watch-overlay"><span>Use Source if Instagram blocks playback</span></div></div>`;
    }
    return frame;
  }
  const fallback = `<div class="trend-fallback">
    <div>
      <strong>${escapeHtml(trend.platform || 'Trend')}</strong>
      <p style="margin-top:8px">${escapeHtml(trend.hook || 'Open source to view this trend.')}</p>
    </div>
  </div>`;
  return large ? `<div class="trend-watch-shell">${fallback}</div>` : fallback;
}

function renderTrendCardPreview(trend) {
  const industries = (trend.industries || []).filter(item => item !== 'General');
  const label = industries[0] || trend.platform || 'Viral format';
  const thumb = trendThumbnailUrl(trend.url);
  return `<div class="trend-preview ${thumb ? 'has-thumb' : ''}">
    <div class="trend-art"></div>
    ${thumb ? `<img class="trend-thumb-img" src="${thumb}" alt="${escapeHtml(trend.hook || 'Trend preview')}" loading="lazy" onerror="this.remove();this.closest('.trend-preview')?.classList.remove('has-thumb')">` : ''}
    <div class="trend-play">▶</div>
    <span class="chip chip-warn trend-platform">${escapeHtml(trend.platform || 'Web')}</span>
    <div class="trend-preview-copy">
      <strong>${escapeHtml(label)}</strong>
      <span>Click to preview source video</span>
    </div>
  </div>`;
}

function renderTrends() {
  const grid = document.getElementById('trendGrid');
  if (!grid) return;
  if (!trendsCache.length) {
    grid.innerHTML = '<div class="empty-state">No trends match that search yet.</div>';
    return;
  }
  const visible = trendsCache.slice(0, visibleTrendCount);
  grid.innerHTML = visible.map((trend, index) => `
    <article class="trend-card" onclick="openTrendLightbox(${index})">
      ${renderTrendCardPreview(trend)}
      <div class="trend-body">
        <div class="trend-hook">${escapeHtml(trend.hook || 'Untitled hook')}</div>
        <div class="trend-meta">
          <span class="chip chip-soft">${escapeHtml(trend.platform || 'Web')}</span>
          <span class="chip chip-soft">${trend.views ? escapeHtml(trend.views) : 'Views not imported'}</span>
          ${(trend.industries || []).slice(0, 2).map(industry => `<span class="chip chip-warn">${escapeHtml(industry)}</span>`).join('')}
        </div>
        <div class="trend-card-actions">
          <button class="btn btn-secondary" type="button" onclick="event.stopPropagation();openTrendLightbox(${index}, false)">Preview</button>
          <button class="btn btn-primary" type="button" onclick="event.stopPropagation();openTrendLightbox(${index}, true)">Remix</button>
          <button class="btn btn-secondary btn-campaign" type="button" onclick="event.stopPropagation();useTrendForCampaign('${escapeHtml(trend.id || '')}')">Campaign</button>
        </div>
      </div>
    </article>
  `).join('');
  const count = document.getElementById('trendCount');
  if (count) count.textContent = `Showing ${visible.length} of ${trendsCache.length} matching trend hooks. Views are not imported from the PDF yet.`;
  const more = document.getElementById('trendLoadMore');
  if (more) {
    more.style.display = visible.length < trendsCache.length ? '' : 'none';
    more.textContent = visible.length < trendsCache.length ? `Load more (${trendsCache.length - visible.length} left)` : 'All trends loaded';
  }
}

function loadMoreTrends(scrollAfter = true) {
  if (visibleTrendCount >= trendsCache.length) return;
  visibleTrendCount = Math.min(visibleTrendCount + 100, trendsCache.length);
  renderTrends();
  if (scrollAfter) {
    document.getElementById('trendLoadMore')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

async function ensureRemixOptions() {
  if (remixOptionsCache.loaded) return remixOptionsCache;
  const [brands, assets] = await Promise.all([api('/api/brands'), api('/api/assets')]);
  remixOptionsCache = {
    loaded: true,
    brands: brands || [],
    products: assets.products || [],
    characters: [...starterCharacters, ...(assets.subjects || [])]
  };
  return remixOptionsCache;
}

async function openTrendLightbox(index, remix = false) {
  trendIndex = Number(index) || 0;
  trendRemixMode = remix;
  await renderTrendLightbox();
  document.getElementById('trendLightbox')?.classList.add('active');
}

function closeTrendLightbox() {
  trendRemixMode = false;
  document.getElementById('trendLightbox')?.classList.remove('active');
}

async function moveTrendLightbox(direction) {
  if (!trendsCache.length) return;
  trendIndex = (trendIndex + direction + trendsCache.length) % trendsCache.length;
  trendRemixMode = false;
  await renderTrendLightbox();
}

async function showTrendRemixOptions() {
  trendRemixMode = true;
  await renderTrendLightbox();
}

async function extractTrendScript() {
  const trend = trendsCache[trendIndex];
  if (!trend?.url) return toast('Choose a trend first.', 'error');
  const button = document.getElementById('extractTrendScriptButton');
  const output = document.getElementById('trendSourceScript');
  if (button) {
    button.disabled = true;
    button.textContent = 'Extracting...';
  }
  try {
    toast('Extracting source script from the trend...', 'info');
    const result = await api('/api/trends/extract-script', {
      method: 'POST',
      body: JSON.stringify({ url: trend.url, maxDuration: 180 })
    });
    if (output) output.value = result.text || '';
    toast('Source script extracted. Review it, then confirm remix.', 'success');
  } catch (error) {
    toast(`Could not extract script yet: ${error.message}`, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Extract script';
    }
  }
}

async function renderTrendLightbox() {
  const trend = trendsCache[trendIndex];
  const body = document.getElementById('trendLightboxBody');
  if (!trend || !body) return;
  document.getElementById('trendLightboxTitle').textContent = trend.hook || 'Trend preview';
  document.getElementById('trendLightboxMeta').textContent = `${trendIndex + 1} of ${trendsCache.length} · ${trend.platform || 'Web'} · ${trend.views || 'Views not imported'}`;
  document.getElementById('trendSourceLink').href = trend.url || '#';

  let options = { brands: [], products: [], characters: [] };
  try {
    options = await ensureRemixOptions();
  } catch (error) {
    toast(`Remix options could not load: ${error.message}`, 'error');
  }

  body.innerHTML = `
    <div>${renderTrendFrame(trend, true)}</div>
      <div class="trend-remix-panel ${trendRemixMode ? 'is-remix' : 'is-preview'}">
        <h3>${trendRemixMode ? 'Confirm remix setup' : 'Preview this trend'}</h3>
        <p class="trend-preview-guidance">Watch the source if the platform allows it, move through trends with the arrows, or open the original post to analyze the creator profile.</p>
        <div class="actions trend-preview-guidance" style="margin-top:12px">
          <button class="btn btn-primary" type="button" onclick="showTrendRemixOptions()">Remix this trend</button>
          <button class="btn btn-secondary" type="button" onclick="useTrendForCampaign('${escapeHtml(trend.id || '')}')">Use in Campaign</button>
        </div>
      <div class="trend-remix-fields">
        <p>Choose the character, brand, and product first. The source hook/script will load into Create as the remix structure.</p>
        <div class="form-group">
          <label class="form-label">Source hook / script structure</label>
          <textarea class="form-textarea" id="trendSourceScript" style="min-height:96px">${escapeHtml(trend.hook || '')}</textarea>
          <div class="actions" style="margin-top:10px">
            <button class="btn btn-secondary" id="extractTrendScriptButton" type="button" onclick="extractTrendScript()">Extract script</button>
          </div>
          <div class="hint" style="margin-top:7px;color:rgba(255,255,255,.55)">If the platform blocks downloading, use the hook here or upload the source video as the reference motion clip in Create.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Character</label>
          <select class="form-select" id="trendCharacterSelect">
            ${options.characters.map(character => `<option value="${escapeHtml(character.slug)}">${escapeHtml(character.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Brand</label>
          <select class="form-select" id="trendBrandSelect">
            <option value="">No brand selected</option>
            ${options.brands.map(brand => `<option value="${escapeHtml(brand.slug)}">${escapeHtml(brand.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Product</label>
          <select class="form-select" id="trendProductSelect">
            <option value="">No product selected</option>
            ${options.products.map(product => `<option value="${escapeHtml(product.slug)}">${escapeHtml(product.name)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" type="button" onclick="remixCurrentTrend()">Confirm remix into Create</button>
        <p class="hint" style="margin-top:10px;color:rgba(255,255,255,.55)">Tip: select a saved brand first so the hook fills in with the right offer, audience, and CTA.</p>
      </div>
    </div>
  `;
}

function fillTrendHook(hook, brand = {}, product = {}) {
  const brandName = brand.name || 'your brand';
  const productName = product.name || brand.category || 'your offer';
  const audience = brand.targetAudience || 'your audience';
  const cta = brand.cta || 'try it today';
  return String(hook || '')
    .replace(/\bX\b/g, productName)
    .replace(/\[product\]/gi, productName)
    .replace(/\[brand\]/gi, brandName)
    .replace(/\[audience\]/gi, audience)
    .trim()
    .concat(`\n\nAdapt this for ${brandName}. Audience: ${audience}. Product or offer: ${productName}. End with: ${cta}.`);
}

async function remixCurrentTrend() {
  const trend = trendsCache[trendIndex];
  if (!trend) return toast('Choose a trend first.', 'error');
  const options = await ensureRemixOptions();
  const character = options.characters.find(item => item.slug === document.getElementById('trendCharacterSelect')?.value);
  const brand = options.brands.find(item => item.slug === document.getElementById('trendBrandSelect')?.value) || {};
  const product = options.products.find(item => item.slug === document.getElementById('trendProductSelect')?.value) || {};
  const sourceScript = document.getElementById('trendSourceScript')?.value?.trim() || trend.hook || '';
  const script = fillTrendHook(sourceScript, brand, product);
  const prompt = [
    `Remix source trend: ${trend.url}`,
    `Use the source hook/script as the structure, but make the words original for this brand.`,
    trend.remixPrompt || 'Match the pacing, visual setup, and creator energy of the source trend without copying the creator identity.',
    brand.description ? `Brand context: ${brand.description}` : '',
    product.name ? `Feature product: ${product.name}` : ''
  ].filter(Boolean).join('\n');

  setRemixContext({ url: trend.url || '', sourceScript });
  document.getElementById('studioScript').value = script;
  document.getElementById('studioPrompt').value = prompt;
  document.getElementById('studioNegativePrompt').value ||= 'subtitles, watermark, distorted hands, extra fingers, low quality, random nail color, camera shake';
  document.getElementById('studioVideoEngine').value = 'wan-animate';
  document.getElementById('studioReferenceVideoUrl').value = trend.url || '';
  setStudioMode('i2v');
  setStudioVideoEngine('wan-animate');
  if (character) selectCharacter(character);
  closeTrendLightbox();
  switchTab('studio');
  toast('Trend remix loaded into Create. Review the script, choose voice/audio, then generate.', 'success');
}

function toggleTheme() {
  const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  document.body.dataset.theme = next;
  localStorage.setItem('bloomStudioTheme', next);
  updateThemeButton();
}

function updateThemeButton() {
  const button = document.getElementById('themeButton');
  if (button) button.textContent = document.body.dataset.theme === 'light' ? 'Dark mode' : 'Light mode';
}

async function api(path, opts = {}) {
  const headers = opts.body instanceof FormData
    ? (opts.headers || {})
    : { 'Content-Type': 'application/json', ...(opts.headers || {}) };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  if (currentTenant?.slug || currentTenant?.id) {
    headers['X-Tenant-Slug'] = currentTenant.slug || currentTenant.id;
  }

  const res = await fetch(`${API}${path}`, { headers, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `Request failed: ${res.status}`);
  return data;
}

async function playableMediaUrl(path) {
  if (!path || !path.startsWith('/api/')) return path;
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (currentTenant?.slug || currentTenant?.id) headers['X-Tenant-Slug'] = currentTenant.slug || currentTenant.id;
  const res = await fetch(path, { headers });
  if (!res.ok) throw new Error(`Could not load media preview: ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

async function initAuth() {
  try {
    authConfig = await fetch('/api/auth/config').then(res => res.json());
    const isSupabase = authConfig.mode === 'supabase';
    document.getElementById('workspaceGroup').style.display = isSupabase ? 'none' : '';
    document.getElementById('loginEmailLabel').textContent = isSupabase ? 'Email' : 'Workspace';
    document.getElementById('loginPasswordLabel').textContent = isSupabase ? 'Password' : 'Access key';
    document.getElementById('loginEmail').type = isSupabase ? 'email' : 'text';
    document.getElementById('loginEmail').placeholder = isSupabase ? 'you@example.com' : 'kimberly';
    document.getElementById('authModeNote').textContent = isSupabase
      ? 'Supabase Auth is enabled. Your files and jobs are isolated by tenant.'
      : authConfig.supabaseAvailable
        ? 'Workspace-key mode is active. Supabase is available but stays off until the UGC tables and tenant login are enabled.'
        : 'Workspace-key mode is active until Supabase storage and auth are enabled.';

    if (isSupabase && window.supabase) {
      supabaseClient = window.supabase.createClient(authConfig.supabaseUrl, authConfig.supabaseAnonKey);
      const { data } = await supabaseClient.auth.getSession();
      if (data?.session?.access_token) {
        authToken = data.session.access_token;
        await hydrateUser();
        return;
      }
    }

    if (authToken) {
      await hydrateUser();
      return;
    }

    showLogin();
  } catch (error) {
    showLogin();
    document.getElementById('authModeNote').textContent = `Auth check failed: ${error.message}`;
  }
}

function showLogin() {
  document.getElementById('authScreen').classList.add('active');
}

function hideLogin() {
  document.getElementById('authScreen').classList.remove('active');
}

async function login(e) {
  e.preventDefault();
  const button = document.getElementById('loginButton');
  button.disabled = true;
  button.textContent = 'Signing in...';
  try {
    if (authConfig?.mode === 'supabase') {
      if (!supabaseClient) throw new Error('Supabase client is not ready.');
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value
      });
      if (error) throw error;
      authToken = data.session.access_token;
      localStorage.setItem('bloomStudioToken', authToken);
    } else {
      const workspace = document.getElementById('loginWorkspace').value.trim() || document.getElementById('loginEmail').value.trim();
      const data = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace,
          accessKey: document.getElementById('loginPassword').value
        })
      }).then(async res => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Login failed');
        return payload;
      });
      authToken = data.token;
      currentTenant = data.tenant;
      localStorage.setItem('bloomStudioToken', authToken);
      localStorage.setItem('bloomStudioTenant', JSON.stringify(currentTenant));
    }

    await hydrateUser();
    toast('Workspace opened.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
}

async function hydrateUser() {
  const data = await api('/api/auth/me');
  currentTenant = data.tenant;
  localStorage.setItem('bloomStudioTenant', JSON.stringify(currentTenant));
  document.getElementById('tenantPill').textContent = currentTenant?.name || currentTenant?.slug || currentTenant?.id || 'Workspace';
  hideLogin();
  switchTab('characters'); // land immediately — don't wait for data loads
  await Promise.all([loadDashboard(), loadStudioStatus(), loadAssets()]);
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  authToken = '';
  currentTenant = null;
  localStorage.removeItem('bloomStudioToken');
  localStorage.removeItem('bloomStudioTenant');
  document.getElementById('tenantPill').textContent = 'No workspace';
  showLogin();
}

async function loadDashboard() {
  try {
    const status = await api('/api/status');
    document.getElementById('statusDot').style.background = status.comfyuiConfigured ? 'var(--green)' : 'var(--primary)';
    document.getElementById('statusText').textContent = status.comfyuiConfigured ? 'ComfyUI connected' : 'Studio ready, ComfyUI URL needed';
  } catch (e) {
    document.getElementById('statusDot').style.background = 'var(--red)';
    document.getElementById('statusText').textContent = 'Connection error';
  }
}

async function loadStudioStatus() {
  try {
    const data = await api('/api/studio/status');
    studioStatusCache = data;
    const comfyLabel = data.comfyReady
      ? 'Connected'
      : data.runpod?.autoStartConfigured
        ? 'Auto-start ready'
        : data.configured ? 'Pod offline' : 'Needs URL';
    const comfyState = data.comfyReady ? 'green' : data.runpod?.autoStartConfigured ? 'warn' : 'red';
    setChip('comfyStatus', comfyLabel, comfyState);
    updateRunPodStatus(data.runpod, data.comfyReady);

    const i2v = data.presets.find(p => p.id === 'sarah-i2v-lipsync');
    const v2v = data.presets.find(p => p.id === 'bloomies-v2v');
    setWorkflowChip('i2vStatus', 'i2vNote', i2v, data.comfyReady, 'Sarah image-to-video workflow is installed and ready to queue.');
    setWorkflowChip('v2vStatus', 'v2vNote', v2v, data.comfyReady, 'Bloomies video-to-video workflow is installed and ready to queue.');

    const qwen = data.audioProviders.find(p => p.id === 'qwen');
    const chatterbox = data.audioProviders.find(p => p.id === 'chatterbox');
    const vibevoice = data.audioProviders.find(p => p.id === 'vibevoice');
    const meigen = data.videoEngines?.find(p => p.id === 'meigen');
    const infiniteTalkHd = data.videoEngines?.find(p => p.id === 'infinitetalk-hd');
    const museTalk = data.videoEngines?.find(p => p.id === 'musetalk');
    const wan22 = data.videoEngines?.find(p => p.id === 'wan22-serverless');
    const wanAnimate = data.videoEngines?.find(p => p.id === 'wan-animate');
    setChip('qwenStatus', qwen?.available ? 'Ready' : 'Needs workflow', qwen?.available ? 'soft' : 'warn');
    const serverlessReady = [meigen, infiniteTalkHd, museTalk, wan22, wanAnimate].filter(Boolean).filter(engine => engine.available).length;
    setChip('meigenStatus', serverlessReady ? `${serverlessReady} ready` : 'Needs keys', serverlessReady ? 'green' : 'warn');
    const qwenNote = document.getElementById('qwenNote');
    if (qwenNote) qwenNote.textContent = vibevoice?.available
      ? 'VibeVoice longform is ready for English narration.'
      : chatterbox?.available
        ? 'Legacy Chatterbox is available for short tests, but VibeVoice is preferred for longform.'
      : qwen?.note || 'Waiting for Qwen TTS API workflow export.';
    const currentCreateType = document.getElementById('studioCreateType')?.value;
    const studioActive = document.getElementById('tab-studio')?.classList.contains('active');
    if (currentCreateType && !studioActive) setCreateType(currentCreateType, { preserveToast: true });
    loadRunPodBalance();
  } catch (e) {
    setChip('comfyStatus', 'Error', 'red');
    setChip('runpodStatus', 'Unknown', 'red');
  }
}

function updateRunPodStatus(runpod, comfyReady) {
  if (!runpod?.autoStartConfigured) {
    setChip('runpodStatus', 'Not configured', 'warn');
    return;
  }
  const state = runpod.state || 'unknown';
  const labels = {
    running: comfyReady ? 'Running + ready' : 'Running, Comfy loading',
    starting: 'Starting',
    booting: 'Booting',
    stopped: 'Stopped',
    error: 'Status error',
    unknown: 'Unknown'
  };
  const chipState = state === 'running' && comfyReady
    ? 'green'
    : ['starting', 'booting', 'running', 'stopped'].includes(state)
      ? 'warn'
      : 'red';
  setChip('runpodStatus', labels[state] || state, chipState);
}

function setWorkflowChip(chipId, noteId, preset, comfyReady, readyText) {
  if (!preset?.available) {
    setChip(chipId, 'Missing', 'red');
    const note = document.getElementById(noteId);
    if (note) note.textContent = 'Workflow API export is missing from the server config.';
    return;
  }
  if (!comfyReady) {
    setChip(chipId, 'Installed', 'soft');
    const note = document.getElementById(noteId);
    if (note) note.textContent = 'Installed, but waiting for the RunPod and ComfyUI API to become ready.';
    return;
  }
  setChip(chipId, 'Ready', 'green');
  const note = document.getElementById(noteId);
  if (note) note.textContent = readyText;
}

async function loadRunPodBalance() {
  try {
    const data = await api('/api/studio/runpod/balance');
    const balance = data.balance || {};
    const amount = Number(balance.balance);
    const spend = Number(balance.currentSpendPerHr || 0);
    const label = Number.isFinite(amount)
      ? `$${amount.toFixed(2)} left${spend ? ` · $${spend.toFixed(2)}/hr` : ''}`
      : 'Unavailable';
    setChip('runpodBalance', label, balance.underBalance ? 'red' : 'green');
  } catch (error) {
    setChip('runpodBalance', 'Needs API key', 'warn');
  }
}

function setChip(id, label, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = label;
  el.className = `chip chip-${state}`;
}

function mountStudioControlsUnderPreview() {
  const form = document.getElementById('studioForm');
  const slot = document.getElementById('previewControlSlot');
  if (!form || !slot || form.parentElement === slot) return;
  slot.appendChild(form);
}

function mountImageWorkspaceInCreate() {
  const lab = document.getElementById('productLab');
  const slot = document.getElementById('previewControlSlot');
  if (!lab || !slot || lab.parentElement === slot) return;
  slot.appendChild(lab);
}

function mountCampaignControlsUnderPreview() {
  const panel = document.getElementById('seedanceCampaignPanel');
  const slot = document.getElementById('previewControlSlot');
  if (!panel || !slot || panel.parentElement === slot) return;
  slot.appendChild(panel);
}

function toggleStudioStatusPanel(forceOpen) {
  const panel = document.getElementById('studioStatusPanel');
  const button = document.querySelector('.status-pill-button');
  if (!panel) return;
  const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !panel.classList.contains('active');
  panel.classList.toggle('active', nextOpen);
  panel.setAttribute('aria-hidden', String(!nextOpen));
  if (button) button.setAttribute('aria-expanded', String(nextOpen));
}

function initializeStudioResize() {
  const width = Number(localStorage.getItem('bloomStudioBuilderWidth'));
  if (Number.isFinite(width) && width >= 240 && width <= 760) {
    updateStudioBuilderWidth(width);
  }
  if (localStorage.getItem('bloomStudioLeftCollapsed') === 'true') {
    document.getElementById('tab-studio')?.classList.add('left-collapsed');
  }
}

function updateStudioBuilderWidth(width) {
  const tab = document.getElementById('tab-studio');
  if (!tab || !Number.isFinite(width)) return;
  const workbench = tab.querySelector('.creator-workbench');
  const clamped = Math.max(240, Math.min(760, Math.round(width)));
  tab.style.setProperty('--studio-builder-width', `${clamped}px`);
  workbench?.style.setProperty('--studio-builder-width', `${clamped}px`);
  tab.classList.toggle('narrow-create', clamped < 390);
}

function initializeStudioPreviewResize() {
  const height = Number(localStorage.getItem('bloomStudioPreviewHeight'));
  if (Number.isFinite(height) && height >= 220 && height <= 900) {
    document.querySelector('#tab-studio .preview-card')?.style.setProperty('--studio-preview-height', `${height}px`);
  }
}

function startStudioResize(event) {
  const tab = document.getElementById('tab-studio');
  const handle = event.currentTarget;
  if (!tab || window.innerWidth < 1180) return;
  event.preventDefault();
  if (tab.classList.contains('left-collapsed')) {
    tab.classList.remove('left-collapsed');
    localStorage.setItem('bloomStudioLeftCollapsed', 'false');
  }
  handle?.classList.add('dragging');
  handle?.setPointerCapture?.(event.pointerId);
  const move = pointerEvent => {
    const rect = tab.querySelector('.creator-workbench')?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(240, Math.min(760, Math.round(pointerEvent.clientX - rect.left)));
    updateStudioBuilderWidth(width);
    localStorage.setItem('bloomStudioBuilderWidth', String(width));
  };
  const up = () => {
    handle?.classList.remove('dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function toggleCreateLeftColumn() {
  const tab = document.getElementById('tab-studio');
  if (!tab) return;
  const collapsed = !tab.classList.contains('left-collapsed');
  tab.classList.toggle('left-collapsed', collapsed);
  localStorage.setItem('bloomStudioLeftCollapsed', String(collapsed));
}

function startStudioPreviewResize(event) {
  const card = document.querySelector('#tab-studio .preview-card');
  const handle = event.currentTarget;
  if (!card) return;
  event.preventDefault();
  handle?.classList.add('dragging');
  handle?.setPointerCapture?.(event.pointerId);
  const move = pointerEvent => {
    const rect = card.getBoundingClientRect();
    const maxHeight = Math.max(220, Math.min(900, rect.height - 190));
    const height = Math.max(220, Math.min(maxHeight, Math.round(pointerEvent.clientY - rect.top)));
    card.style.setProperty('--studio-preview-height', `${height}px`);
    localStorage.setItem('bloomStudioPreviewHeight', String(height));
  };
  const up = () => {
    handle?.classList.remove('dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function toggleVoiceDetails(forceOpen) {
  const form = document.getElementById('studioForm');
  if (!form) return;
  const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !form.classList.contains('show-voice-details');
  form.classList.toggle('show-voice-details', nextOpen);
}

function flowStatusChip(label, available, note = '') {
  return `<span class="create-flow-status ${available ? 'ready' : 'missing'}" title="${note || label}">${label}: ${available ? 'Ready' : 'Missing'}</span>`;
}

function renderFlowStatus(selected) {
  const data = studioStatusCache;
  if (!data) return '';
  const engine = id => data.videoEngines?.find(item => item.id === id);
  const tool = id => data.remixTools?.find(item => item.id === id);
  const audio = id => data.audioProviders?.find(item => item.id === id);
  const statusSets = {
    shorts: [
      flowStatusChip('InfiniteTalk HD', engine('infinitetalk-hd')?.available, engine('infinitetalk-hd')?.note),
      flowStatusChip('MuseTalk', engine('musetalk')?.available, engine('musetalk')?.note),
      flowStatusChip('Meigen', engine('meigen')?.available, engine('meigen')?.note),
      flowStatusChip('VibeVoice', audio('vibevoice')?.available, audio('vibevoice')?.note)
    ],
    remix: [
      flowStatusChip('Wan Animate', engine('wan-animate')?.available, engine('wan-animate')?.note),
      flowStatusChip('Faster Whisper', tool('faster-whisper')?.available, tool('faster-whisper')?.note),
      flowStatusChip('Downloader', tool('downloader')?.available, tool('downloader')?.note)
    ],
    'long-form': [
      flowStatusChip('Wan 2.2', engine('wan22-serverless')?.available, engine('wan22-serverless')?.note),
      flowStatusChip('VibeVoice', audio('vibevoice')?.available, audio('vibevoice')?.note)
    ],
    webinar: [
      flowStatusChip('WAN/ComfyUI', engine('wan-comfy')?.available, engine('wan-comfy')?.note),
      flowStatusChip('Uploaded audio', true, 'Upload final webinar audio or source video.')
    ],
    course: [
      flowStatusChip('Wan 2.2', engine('wan22-serverless')?.available, engine('wan22-serverless')?.note),
      flowStatusChip('VibeVoice', audio('vibevoice')?.available, audio('vibevoice')?.note)
    ]
  };
  return `<div class="create-flow-status-row">${(statusSets[selected] || statusSets.shorts).join('')}</div>`;
}

function setCreateTool(tool = 'video') {
  const selected = tool || 'video';
  isolateStudioTabIfActive();
  const studioTab = document.getElementById('tab-studio');
  if (studioTab) studioTab.dataset.createTool = selected;
  studioTab?.classList.add('focused-create');
  document.querySelector('#tab-studio .create-tool-grid')?.classList.remove('expanded');
  studioTab?.classList.toggle('create-tool-audio', selected === 'audio');
  document.querySelectorAll('[data-create-tool]:not(#tab-studio)').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.createTool === selected);
  });

  const title = document.querySelector('#tab-studio .panel-title');
  const note = document.querySelector('#tab-studio .panel-note');
  if (selected === 'audio') {
    if (title) title.textContent = 'Create voice-over';
    if (note) note.textContent = 'Write or paste a script, choose VibeVoice or ElevenLabs v3, preview it, then save the approved audio.';
    const scriptLabel = document.getElementById('studioScriptLabel');
    const script = document.getElementById('studioScript');
    if (scriptLabel) scriptLabel.textContent = 'Voiceover script';
    if (script) script.placeholder = 'Paste the exact narration script for VibeVoice or ElevenLabs v3.';
    setAudioPreviewMode();
    setStudioMode('audio');
    setStudioAudio(document.getElementById('studioAudioProvider')?.value || 'upload', { preserveToast: true });
    return;
  }

  if (selected === 'campaign') {
    if (title) title.textContent = 'Create UGC campaign';
    if (note) note.textContent = 'Connect creators, products, environments, and trends into editable scenes before generating.';
    resetPreview();
    mountCampaignControlsUnderPreview();
    loadCampaignBuilder();
    return;
  }

  if (selected === 'image') {
    if (title) title.textContent = 'Create image';
    if (note) note.textContent = 'Choose an image folder, then build prompt-led creative with optional references.';
    mountImageWorkspaceInCreate();
    setCreateImageType(currentCreateImageType || 'products');
    loadProductPlacementStatus();
    loadAssets();
    return;
  }

  if (title) title.textContent = 'Create video';
  if (note) note.textContent = 'Choose a video type, load a character, add voice, then generate.';
  const scriptLabel = document.getElementById('studioScriptLabel');
  const script = document.getElementById('studioScript');
  if (scriptLabel) scriptLabel.textContent = 'Narration script';
  if (script) script.placeholder = 'Paste the narration script here so the job record keeps the creative direction with the video.';
  resetPreview();
  setCreateType(document.getElementById('studioCreateType')?.value || 'shorts');
}

function setCreateImageType(type = 'products') {
  currentCreateImageType = type;
  document.querySelectorAll('[data-image-type]').forEach(btn => btn.classList.toggle('active', btn.dataset.imageType === type));
  const panel = document.getElementById('createImagePanel');
  if (!panel) return;
  const lab = document.getElementById('productLab');
  if (type === 'products' || type === 'composite') {
    mountImageWorkspaceInCreate();
    if (lab) lab.style.display = '';
    panel.querySelectorAll('[data-placeholder]').forEach(el => el.remove());
    return;
  }
  if (lab) lab.style.display = 'none';
  const label = type === 'environment' ? 'Environments' : 'Instagram post';
  panel.insertAdjacentHTML('beforeend', `<div class="create-image-placeholder" data-placeholder="${type}"><strong>${label}</strong><br>This image folder is reserved for the next workspace. Image Composite stays ready now, and this slot can become environment scenes, Instagram posts, product shots, or carousel creative without leaving Create.</div>`);
  panel.querySelectorAll(`[data-placeholder]:not([data-placeholder="${type}"])`).forEach(el => el.remove());
}

function toggleCreateTools() {
  const grid = document.querySelector('#tab-studio .create-tool-grid');
  if (!grid) return;
  grid.classList.toggle('expanded');
}

async function loadCampaignBuilder() {
  try {
    if (!assetsCache.products?.length && !assetsCache.subjects?.length) await loadAssets();
    renderCampaignBuilder(assetsCache);
    await loadCampaignTrendOptions();
  } catch (error) {
    toast(`Could not load campaign assets: ${error.message}`, 'error');
  }
}

async function ensureTrendsLoadedForCampaign() {
  if (trendsCache.length) return trendsCache;
  const data = await api('/api/trends?limit=1200');
  trendsCache = data.trends || [];
  return trendsCache;
}

async function loadCampaignTrendOptions() {
  const select = document.getElementById('campaignTrendSelect');
  if (!select) return;
  const previous = campaignState.trendId || select.value;
  try {
    const trends = await ensureTrendsLoadedForCampaign();
    select.innerHTML = '<option value="">No trend source</option>' + trends.map(trend => {
      const label = `${trend.id || 'trend'} · ${trend.hook || trend.platform || 'Untitled trend'}`;
      return `<option value="${escapeHtml(trend.id || '')}">${escapeHtml(label)}</option>`;
    }).join('');
    if (previous && trends.some(trend => trend.id === previous)) select.value = previous;
    renderCampaignTrendSource();
  } catch (error) {
    select.innerHTML = '<option value="">Could not load trends</option>';
  }
}

function selectedCampaignTrend() {
  return trendsCache.find(trend => trend.id === campaignState.trendId) || null;
}

function renderCampaignTrendSource() {
  const card = document.getElementById('campaignTrendSource');
  const analyzeButton = document.getElementById('campaignAnalyzeTrendButton');
  const frameButton = document.getElementById('campaignFrameAnalyzeButton');
  const refineButton = document.getElementById('campaignRefineSceneButton');
  const trend = selectedCampaignTrend();
  if (!card) return;
  if (!trend) {
    card.style.display = 'none';
    if (analyzeButton) analyzeButton.style.display = 'none';
    if (frameButton) frameButton.style.display = 'none';
    if (refineButton) refineButton.style.display = 'none';
    return;
  }
  card.style.display = '';
  if (analyzeButton) analyzeButton.style.display = '';
  if (frameButton) frameButton.style.display = '';
  if (refineButton) refineButton.style.display = campaignState.scenePlan.length ? '' : 'none';
  const frameSummary = campaignState.frameWorkflow?.frameAnalysis?.summary
    ? `<div class="campaign-frame-summary">${escapeHtml(String(campaignState.frameWorkflow.frameAnalysis.summary.totalFrames))} exact frames analyzed · ${escapeHtml(String(campaignState.frameWorkflow.frameAnalysis.summary.detectedScenes))} scene beats</div>`
    : '';
  card.innerHTML = `<strong>${escapeHtml(trend.hook || 'Selected trend')}</strong>
    <span class="chip chip-soft">${escapeHtml(trend.id || 'trend')}</span>
    <span class="chip chip-soft">${escapeHtml(trend.platform || 'Web')}</span>
    ${(trend.industries || []).slice(0, 2).map(industry => `<span class="chip chip-warn">${escapeHtml(industry)}</span>`).join('')}
    <div class="hint" style="margin-top:6px">This trend can be broken into timed scenes or cloned from exact frame analysis before any paid generation is submitted.</div>
    ${frameSummary}`;
}

async function selectCampaignTrend(trendId = '') {
  campaignState.trendId = trendId;
  campaignState.scenePlan = [];
  campaignState.frameWorkflow = null;
  renderCampaignTrendSource();
  renderCampaignScenePlan();
  renderCampaignNodeView();
  const submitButton = document.getElementById('campaignSubmitButton');
  if (submitButton) submitButton.style.display = 'none';
}

async function useTrendForCampaign(trendId = '') {
  if (!trendId) return toast('That trend does not have an ID yet.', 'error');
  await ensureTrendsLoadedForCampaign();
  const trend = trendsCache.find(item => item.id === trendId);
  if (!trend) return toast('Could not find that trend in the local library.', 'error');
  closeTrendLightbox();
  switchTab('studio');
  setCreateTool('campaign');
  await loadCampaignTrendOptions();
  const select = document.getElementById('campaignTrendSelect');
  if (select) select.value = trendId;
  await selectCampaignTrend(trendId);
  toast('Trend loaded into Campaign. Analyze scenes first; no paid jobs were submitted.', 'success');
}

function getCampaignAssetImage(asset = {}) {
  return asset.imageUrl || asset.files?.[0]?.path || asset.path || '';
}

function getCampaignAssetKey(asset = {}, type = 'subject') {
  return `${type}:${asset.slug || asset.name || getCampaignAssetImage(asset)}`;
}

function renderCampaignBuilder(data = assetsCache) {
  const grid = document.getElementById('campaignCharacterGrid');
  const characterSelect = document.getElementById('campaignCharacterSelect');
  const productSelect = document.getElementById('campaignProductSelect');
  const environmentSelect = document.getElementById('campaignEnvironmentAssetSelect');
  if (!productSelect) return;

  campaignState.assetMap = new Map();
  const characters = [
    ...(starterCharacters || []).map(item => ({ ...item, _campaignType: 'subjects', _library: true })),
    ...(data.subjects || []).map(item => ({ ...item, _campaignType: 'subjects', _library: false }))
  ];
  const products = (data.products || []).map(item => ({ ...item, _campaignType: 'products', _library: false }));
  const environmentImages = [
    ...(data.products || []).map(item => ({ ...item, _campaignType: 'products', _library: false })),
    ...(data.outputs || []).map(item => ({ ...item, _campaignType: 'outputs', _library: false }))
  ];

  for (const asset of [...characters, ...products, ...environmentImages]) {
    campaignState.assetMap.set(getCampaignAssetKey(asset, asset._campaignType), asset);
  }

  if (characterSelect) {
    const selected = new Set([...campaignState.selectedCharacters]);
    characterSelect.innerHTML = characters.length
      ? characters.map(asset => {
          const key = getCampaignAssetKey(asset, 'subjects');
          return `<option value="${escapeHtml(key)}" ${selected.has(key) ? 'selected' : ''}>${escapeHtml(asset.name || 'Character')}</option>`;
        }).join('')
      : '<option disabled>No characters yet</option>';
  }

  if (grid && !characters.length) {
    grid.innerHTML = '<div class="empty-state">Upload or create a character first.</div>';
  } else if (grid) {
    grid.innerHTML = characters.map(asset => {
      const key = getCampaignAssetKey(asset, 'subjects');
      const imageUrl = authenticatedMediaUrl(getCampaignAssetImage(asset));
      const active = campaignState.selectedCharacters.has(key);
      return `<button class="campaign-character-card ${active ? 'active' : ''}" type="button" onclick="toggleCampaignCharacter('${escapeHtml(key)}')">
        <img src="${imageUrl}" alt="${escapeHtml(asset.name || 'Character')}" loading="lazy">
        <span><strong>${escapeHtml(asset.name || 'Character')}</strong><span>${escapeHtml(asset.role || (asset._library ? 'Starter character' : 'Saved character'))}</span></span>
      </button>`;
    }).join('');
  }

  const currentProduct = campaignState.productKey || productSelect.value;
  productSelect.innerHTML = '<option value="">No product image</option>' + products.map(asset => {
    const key = getCampaignAssetKey(asset, 'products');
    return `<option value="${escapeHtml(key)}">${escapeHtml(asset.name || 'Product')}</option>`;
  }).join('');
  if (currentProduct && campaignState.assetMap.has(currentProduct)) productSelect.value = currentProduct;
  campaignState.productKey = productSelect.value;
  productSelect.onchange = () => {
    campaignState.productKey = productSelect.value;
    estimateSeedanceCampaign({ quiet: true });
    renderCampaignNodeView();
  };
  if (environmentSelect) {
    const currentEnvironment = environmentSelect.value;
    environmentSelect.innerHTML = '<option value="">Choose saved image</option>' + environmentImages.map(asset => {
      const key = getCampaignAssetKey(asset, asset._campaignType);
      return `<option value="${escapeHtml(key)}">${escapeHtml(asset.name || 'Image')}</option>`;
    }).join('');
    if (currentEnvironment && campaignState.assetMap.has(currentEnvironment)) environmentSelect.value = currentEnvironment;
  }
  setCampaignEnvironmentMode(document.getElementById('campaignEnvironmentMode')?.value || 'text');
  renderCampaignTrendSource();
  renderCampaignScenePlan();
  renderCampaignNodeView();
  estimateSeedanceCampaign({ quiet: true });
}

function setCampaignEnvironmentMode(mode = 'text') {
  const textGroup = document.getElementById('campaignEnvironmentTextGroup');
  const libraryGroup = document.getElementById('campaignEnvironmentLibraryGroup');
  if (textGroup) textGroup.style.display = mode === 'text' ? '' : 'none';
  if (libraryGroup) libraryGroup.style.display = mode === 'library' ? '' : 'none';
}

function syncCampaignCharacterSelection() {
  const select = document.getElementById('campaignCharacterSelect');
  campaignState.selectedCharacters = new Set(Array.from(select?.selectedOptions || []).map(option => option.value));
  estimateSeedanceCampaign({ quiet: true });
  renderCampaignNodeView();
}

function toggleCampaignCharacter(key) {
  if (campaignState.selectedCharacters.has(key)) campaignState.selectedCharacters.delete(key);
  else campaignState.selectedCharacters.add(key);
  renderCampaignBuilder(assetsCache);
  renderCampaignNodeView();
}

function absolutePublicUrl(url = '') {
  if (!url) return '';
  const hydrated = authenticatedMediaUrl(url);
  return new URL(hydrated, window.location.origin).href;
}

async function resolveCampaignAssetUrl(asset, type) {
  const imageUrl = getCampaignAssetImage(asset);
  if (!imageUrl) throw new Error(`${asset?.name || 'Asset'} has no image file.`);
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (asset?._library) return absolutePublicUrl(imageUrl);
  if (asset?.slug) {
    const data = await api(`/api/assets/${type}/${asset.slug}/temp-url`, { method: 'POST' });
    return data.url;
  }
  return absolutePublicUrl(imageUrl);
}

function buildCampaignPrompt({ basePrompt, character, product, environment, aspectRatio }) {
  return [
    `@image1 is the main creator: ${character.name || 'the selected creator'}. Keep their identity consistent.`,
    product ? `@image2 is the product to feature. Keep it recognizable and naturally visible.` : '',
    environment ? `Scene: ${environment}.` : '',
    basePrompt,
    `Create a ${aspectRatio} UGC ad clip with natural creator energy, clear product interaction, realistic lighting, no captions, no watermark.`
  ].filter(Boolean).join('\n');
}

function getCampaignEngineLabel(engine = '') {
  if (engine === 'wan-animate') return 'Wan Animate motion mimic';
  if (engine === 'infinitetalk-hd') return 'InfiniteTalk talking head';
  if (engine === 'musetalk') return 'MuseTalk talking head';
  if (engine === 'seedance2-standard') return 'Seedance fixed camera';
  return 'Seedance 1.5';
}

function getCampaignEngineRequirement(scene = {}) {
  const engine = scene.engine || 'seedance2-fast';
  if (engine === 'wan-animate') {
    return scene.referenceVideoUrl || scene.sourceTrendUrl ? 'Ready: source trend/reference video' : 'Needs reference video URL';
  }
  if (engine === 'infinitetalk-hd') {
    return scene.audioUrl || scene.voiceUrl ? 'Ready: audio URL' : 'Needs audio URL in JSON';
  }
  if (engine === 'musetalk') {
    return scene.audioUrl || scene.voiceUrl ? 'Ready: audio URL' : 'Needs audio URL in JSON';
  }
  return 'Ready: source image';
}

function getCampaignWorkflowJson() {
  const trend = selectedCampaignTrend();
  const characters = selectedCampaignCharacters();
  const product = campaignState.productKey ? campaignState.assetMap.get(campaignState.productKey) : null;
  const environmentMode = document.getElementById('campaignEnvironmentMode')?.value || 'text';
  const environmentAssetKey = document.getElementById('campaignEnvironmentAssetSelect')?.value || '';
  const environmentAsset = environmentMode === 'library' && environmentAssetKey ? campaignState.assetMap.get(environmentAssetKey) : null;
  const sourceTrendUrl = trend?.url || '';
  return {
    schema: 'bloom.campaign.workflow.v1',
    workflowType: 'trend_remix_campaign',
    source: {
      trendId: trend?.id || campaignState.trendId || '',
      url: sourceTrendUrl,
      hook: trend?.hook || '',
      platform: trend?.platform || ''
    },
    global: {
      prompt: document.getElementById('campaignPrompt')?.value || '',
      cta: document.getElementById('campaignCta')?.value || '',
      outputMode: document.getElementById('campaignOutputMode')?.value || 'separate',
      aspectRatio: document.getElementById('campaignAspectRatio')?.value || '9:16',
      resolution: document.getElementById('campaignResolution')?.value || '720p',
      duration: Number(document.getElementById('campaignDuration')?.value || 5)
    },
    assets: {
      characters: characters.map(character => ({
        name: character.name || 'Character',
        key: getCampaignAssetKey(character, character._campaignType || 'subjects'),
        imagePreview: getCampaignAssetImage(character)
      })),
      product: product ? {
        name: product.name || 'Product',
        key: campaignState.productKey,
        imagePreview: getCampaignAssetImage(product)
      } : null,
      environment: {
        mode: environmentMode,
        text: document.getElementById('campaignEnvironments')?.value || '',
        key: environmentAssetKey,
        imagePreview: environmentAsset ? getCampaignAssetImage(environmentAsset) : ''
      }
    },
    frameWorkflow: campaignState.frameWorkflow ? {
      schema: campaignState.frameWorkflow.schema,
      source: campaignState.frameWorkflow.source,
      frameAnalysis: campaignState.frameWorkflow.frameAnalysis,
      nodeGraph: campaignState.frameWorkflow.nodeGraph,
      assembly: campaignState.frameWorkflow.assembly,
      replacements: campaignState.frameWorkflow.replacements
    } : null,
    scenes: (campaignState.scenePlan || []).map((scene, index) => ({
      id: scene.id || `scene-${index + 1}`,
      title: scene.title || `Scene ${index + 1}`,
      start: Number(scene.start || 0),
      end: Number(scene.end || 0),
      duration: Number(scene.duration || 5),
      engine: scene.engine || 'seedance2-fast',
      pacing: scene.pacing || '',
      script: scene.script || '',
      visualPrompt: scene.visualPrompt || '',
      negativePrompt: scene.negativePrompt || '',
      referenceVideoUrl: scene.referenceVideoUrl || scene.sourceTrendUrl || sourceTrendUrl,
      audioUrl: scene.audioUrl || '',
      seed: scene.seed ?? -1,
      steps: scene.steps || undefined,
      requirement: getCampaignEngineRequirement(scene)
    })),
    assembly: {
      order: (campaignState.scenePlan || []).map((scene, index) => scene.id || `scene-${index + 1}`),
      method: campaignState.frameWorkflow?.assembly?.method || 'concat_in_scene_order',
      preserveSourceTiming: Boolean(campaignState.frameWorkflow?.assembly?.preserveSourceTiming),
      audio: campaignState.frameWorkflow?.assembly?.audio || 'per_scene_or_post_mix',
      output: campaignState.frameWorkflow?.assembly?.output || 'assembled_campaign_video',
      captions: false
    }
  };
}

function syncCampaignWorkflowJson() {
  const textarea = document.getElementById('campaignWorkflowJson');
  if (!textarea) return;
  textarea.value = JSON.stringify(getCampaignWorkflowJson(), null, 2);
}

function toggleCampaignWorkflowJson() {
  const panel = document.getElementById('campaignWorkflowJsonPanel');
  if (!panel) return;
  panel.classList.toggle('active');
  if (panel.classList.contains('active')) syncCampaignWorkflowJson();
}

function applyCampaignWorkflowJson() {
  const textarea = document.getElementById('campaignWorkflowJson');
  if (!textarea) return;
  try {
    const workflow = JSON.parse(textarea.value || '{}');
    if (workflow.global) {
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el && typeof value !== 'undefined' && value !== null) el.value = value;
      };
      set('campaignPrompt', workflow.global.prompt);
      set('campaignCta', workflow.global.cta);
      set('campaignOutputMode', workflow.global.outputMode);
      set('campaignAspectRatio', workflow.global.aspectRatio);
      set('campaignResolution', workflow.global.resolution);
      set('campaignDuration', workflow.global.duration);
    }
    if (workflow.source?.trendId) campaignState.trendId = workflow.source.trendId;
    if (workflow.frameWorkflow) {
      campaignState.frameWorkflow = {
        schema: workflow.frameWorkflow.schema || 'bloom.trend.frame_workflow.v1',
        source: workflow.frameWorkflow.source || workflow.source || {},
        frameAnalysis: workflow.frameWorkflow.frameAnalysis || null,
        nodeGraph: workflow.frameWorkflow.nodeGraph || null,
        assembly: workflow.frameWorkflow.assembly || workflow.assembly || null,
        replacements: workflow.frameWorkflow.replacements || {}
      };
    }
    if (Array.isArray(workflow.scenes)) {
      campaignState.scenePlan = workflow.scenes.map((scene, index) => ({
        id: scene.id || `scene-${index + 1}`,
        title: scene.title || `Scene ${index + 1}`,
        start: Number(scene.start || 0),
        end: Number(scene.end || Number(scene.start || 0) + Number(scene.duration || 5)),
        duration: Number(scene.duration || 5),
        engine: scene.engine || 'seedance2-fast',
        pacing: scene.pacing || '',
        script: scene.script || '',
        visualPrompt: scene.visualPrompt || '',
        negativePrompt: scene.negativePrompt || '',
        referenceVideoUrl: scene.referenceVideoUrl || workflow.source?.url || '',
        sourceTrendUrl: scene.sourceTrendUrl || workflow.source?.url || '',
        audioUrl: scene.audioUrl || '',
        seed: scene.seed ?? -1,
        steps: scene.steps
      }));
    }
    renderCampaignScenePlan();
    renderCampaignNodeView();
    syncCampaignWorkflowJson();
    toast('Workflow JSON applied to the campaign controls.', 'success');
  } catch (error) {
    toast(`Workflow JSON is not valid: ${error.message}`, 'error');
  }
}

function campaignSceneUpdate(index, field, value) {
  if (!campaignState.scenePlan[index]) return;
  campaignState.scenePlan[index][field] = value;
  renderCampaignNodeView();
  syncCampaignWorkflowJson();
}

function renderCampaignScenePlan() {
  const list = document.getElementById('campaignSceneList');
  if (!list) return;
  if (!campaignState.scenePlan.length) {
    list.innerHTML = '';
    renderCampaignTrendSource();
    return;
  }
  list.innerHTML = campaignState.scenePlan.map((scene, index) => `
    <div class="campaign-scene-card">
      <div class="campaign-scene-head">
        <strong>${escapeHtml(scene.title || `Scene ${index + 1}`)}</strong>
        <div class="campaign-scene-time">${escapeHtml(String(scene.start ?? 0))}s-${escapeHtml(String(scene.end ?? 0))}s</div>
        <select class="form-select" onchange="campaignSceneUpdate(${index}, 'engine', this.value)">
          <option value="seedance2-fast" ${scene.engine === 'seedance2-fast' ? 'selected' : ''}>RunPod Seedance 1.5</option>
          <option value="seedance2-standard" ${scene.engine === 'seedance2-standard' ? 'selected' : ''}>RunPod Seedance 1.5 fixed camera</option>
          <option value="wan-animate" ${scene.engine === 'wan-animate' ? 'selected' : ''}>Wan Animate trend mimic</option>
          <option value="infinitetalk-hd" ${scene.engine === 'infinitetalk-hd' ? 'selected' : ''}>InfiniteTalk talking head</option>
          <option value="musetalk" ${scene.engine === 'musetalk' ? 'selected' : ''}>MuseTalk talking head</option>
        </select>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Scene script</label>
          <textarea class="form-textarea" oninput="campaignSceneUpdate(${index}, 'script', this.value)">${escapeHtml(scene.script || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Visual direction</label>
          <textarea class="form-textarea" oninput="campaignSceneUpdate(${index}, 'visualPrompt', this.value)">${escapeHtml(scene.visualPrompt || '')}</textarea>
        </div>
      </div>
      <div class="hint">Pacing: ${escapeHtml(scene.pacing || 'match source pacing')} · ${escapeHtml(String(scene.duration || 0))}s · ${escapeHtml(getCampaignEngineRequirement(scene))}</div>
      ${Array.isArray(scene.refinementNotes) && scene.refinementNotes.length ? `<div class="hint">Refined: ${escapeHtml(scene.refinementNotes.join(' '))}</div>` : ''}
    </div>
  `).join('');
  renderCampaignTrendSource();
  renderCampaignNodeView();
  syncCampaignWorkflowJson();
}

function toggleCampaignNodeView() {
  const view = document.getElementById('campaignNodeView');
  if (!view) return;
  view.style.display = view.style.display === 'none' ? '' : 'none';
  renderCampaignNodeView();
}

function renderCampaignNodeView() {
  const view = document.getElementById('campaignNodeView');
  if (!view || view.style.display === 'none') return;
  if (campaignState.frameWorkflow?.nodeGraph?.nodes?.length) {
    const graph = campaignState.frameWorkflow.nodeGraph;
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    const typeLabel = type => String(type || '').replace(/\./g, ' / ');
    view.innerHTML = `
      <div class="campaign-node-canvas-head">
        <strong>Bloom Canvas workflow</strong>
        <span>${escapeHtml(String(campaignState.frameWorkflow.frameAnalysis?.summary?.totalFrames || 0))} source frames · ${escapeHtml(String(campaignState.frameWorkflow.scenes?.length || campaignState.scenePlan.length || 0))} render scenes · reassemble final video</span>
      </div>
      <div class="campaign-node-canvas">
        ${nodes.map(node => `
          <div class="campaign-node-box campaign-node-box-${escapeHtml(String(node.type || '').split('.')[0])}">
            <strong>${escapeHtml(node.label || node.id || 'Node')}</strong>
            <span>${escapeHtml(typeLabel(node.type))}<br>${escapeHtml(node.id || '')}</span>
          </div>
        `).join('')}
      </div>
      <div class="campaign-node-edges">
        ${edges.slice(0, 18).map(edge => `<span>${escapeHtml(edge.from)} → ${escapeHtml(edge.to)} · ${escapeHtml(edge.label || '')}</span>`).join('')}
        ${edges.length > 18 ? `<span>+ ${escapeHtml(String(edges.length - 18))} more edges in JSON</span>` : ''}
      </div>
    `;
    syncCampaignWorkflowJson();
    return;
  }
  const trend = selectedCampaignTrend();
  const characters = selectedCampaignCharacters();
  const product = campaignState.productKey ? campaignState.assetMap.get(campaignState.productKey) : null;
  const outputMode = document.getElementById('campaignOutputMode')?.value || 'separate';
  const cta = document.getElementById('campaignCta')?.value.trim() || 'No CTA set';
  const sceneCount = campaignState.scenePlan.length || 0;
  const finalCount = outputMode === 'together' ? 1 : Math.max(characters.length, 1);
  const engineCounts = (campaignState.scenePlan || []).reduce((acc, scene) => {
    const label = getCampaignEngineLabel(scene.engine || 'seedance2-fast');
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const engineSummary = Object.entries(engineCounts).map(([label, count]) => `<span class="campaign-engine-pill">${escapeHtml(label)} x${count}</span>`).join('') || '<span>Analyze trend to create scenes.</span>';
  view.innerHTML = `
    <div class="campaign-node-view-row">
      <div class="campaign-node-box"><strong>Trend</strong><span>${escapeHtml(trend?.id || 'None selected')}<br>${escapeHtml(trend?.hook || 'Choose a trend or write a campaign prompt.')}</span></div>
      <div class="campaign-node-box"><strong>Inputs</strong><span>${escapeHtml(characters.map(c => c.name).join(', ') || 'No characters')}<br>${escapeHtml(product?.name || 'No product image')}</span></div>
      <div class="campaign-node-box"><strong>Controls</strong><span>${escapeHtml(outputMode === 'together' ? 'Selected characters together' : 'Separate video per character')}<br>CTA: ${escapeHtml(cta)}</span></div>
    </div>
    <div class="campaign-node-arrow">↓</div>
    <div class="campaign-node-view-row">
      <div class="campaign-node-box"><strong>Scenes</strong><span>${sceneCount ? `${sceneCount} timed scene${sceneCount === 1 ? '' : 's'}` : 'Analyze trend to create scenes.'}</span></div>
      <div class="campaign-node-box"><strong>Model Routing</strong><span>${engineSummary}</span></div>
      <div class="campaign-node-box"><strong>Output</strong><span>${finalCount} final assembled video${finalCount === 1 ? '' : 's'} after scene clips complete.</span></div>
    </div>
  `;
  syncCampaignWorkflowJson();
}

async function analyzeCampaignTrendScenes(options = {}) {
  await ensureCampaignAssetsLoaded();
  await ensureTrendsLoadedForCampaign();
  const trend = selectedCampaignTrend();
  if (!trend) return toast('Choose a trend source first.', 'error');
  const characters = selectedCampaignCharacters();
  const product = campaignState.productKey ? campaignState.assetMap.get(campaignState.productKey) : null;
  const environment = (document.getElementById('campaignEnvironments')?.value || '').split('\n').map(line => line.trim()).filter(Boolean)[0] || '';
  const duration = Number(document.getElementById('campaignDuration')?.value || 10);
  const cta = document.getElementById('campaignCta')?.value.trim() || '';
  const button = document.getElementById('campaignAnalyzeTrendButton');
  if (button) {
    button.disabled = true;
    button.textContent = 'Analyzing...';
  }
  try {
    const data = await api('/api/trends/scene-plan', {
      method: 'POST',
      body: JSON.stringify({
        trendId: trend.id,
        duration,
        productName: product?.name || '',
        characterName: characters[0]?.name || '',
        environment,
        cta
      })
    });
    campaignState.scenePlan = data.scenes || [];
    renderCampaignScenePlan();
    syncCampaignWorkflowJson();
    if (!options.quiet) toast(`Trend analyzed into ${campaignState.scenePlan.length} timed scenes. Review before generating.`, 'success');
  } catch (error) {
    toast(`Could not analyze trend scenes: ${error.message}`, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Analyze trend into scenes';
    }
  }
}

async function analyzeCampaignTrendFrames(options = {}) {
  await ensureCampaignAssetsLoaded();
  await ensureTrendsLoadedForCampaign();
  const trend = selectedCampaignTrend();
  if (!trend) return toast('Choose a trend source first.', 'error');
  const characters = selectedCampaignCharacters();
  const product = campaignState.productKey ? campaignState.assetMap.get(campaignState.productKey) : null;
  const environmentMode = document.getElementById('campaignEnvironmentMode')?.value || 'text';
  const environmentAssetKey = document.getElementById('campaignEnvironmentAssetSelect')?.value || '';
  const environmentAsset = environmentMode === 'library' && environmentAssetKey ? campaignState.assetMap.get(environmentAssetKey) : null;
  const environment = environmentAsset
    ? (environmentAsset.name || 'selected environment image')
    : (document.getElementById('campaignEnvironments')?.value || '').split('\n').map(line => line.trim()).filter(Boolean)[0] || '';
  const button = document.getElementById('campaignFrameAnalyzeButton');
  if (button) {
    button.disabled = true;
    button.textContent = 'Cloning frames...';
  }
  try {
    const data = await api('/api/trends/frame-workflow', {
      method: 'POST',
      body: JSON.stringify({
        trendId: trend.id,
        sourceTrendUrl: trend.url || '',
        maxDuration: Number(document.getElementById('campaignDuration')?.value || 10),
        aspectRatio: document.getElementById('campaignAspectRatio')?.value || '9:16',
        prompt: document.getElementById('campaignPrompt')?.value.trim() || '',
        productName: product?.name || '',
        characterName: characters[0]?.name || '',
        environment,
        cta: document.getElementById('campaignCta')?.value.trim() || '',
        targetSceneSeconds: 2.0
      })
    });
    campaignState.frameWorkflow = data.workflow || null;
    campaignState.scenePlan = data.scenes || [];
    renderCampaignScenePlan();
    renderCampaignTrendSource();
    renderCampaignNodeView();
    syncCampaignWorkflowJson();
    const output = document.getElementById('campaignOutputList');
    if (output) {
      output.insertAdjacentHTML('afterbegin', `<div class="campaign-output-item campaign-frame-report"><strong>Frame clone workflow created</strong><br>${escapeHtml(String(data.frameCount || 0))} exact frames analyzed · ${escapeHtml(String(data.detectedScenes || 0))} Seedance scene beats · ${escapeHtml(String(data.totalDuration || 0))}s source duration<br><span class="hint">The JSON now includes the full frame timeline plus brand replacements for character, product, environment, script, and CTA. No paid render jobs were submitted.</span></div>`);
    }
    if (!options.quiet) toast(`Frame clone workflow ready: ${data.frameCount} frames condensed into ${campaignState.scenePlan.length} scenes.`, 'success');
  } catch (error) {
    toast(`Could not clone trend frames: ${error.message}`, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Clone frames to JSON';
    }
  }
}

async function refineCampaignScenePlan(options = {}) {
  await ensureCampaignAssetsLoaded();
  await ensureTrendsLoadedForCampaign();
  const trend = selectedCampaignTrend();
  if (!trend) return toast('Choose a trend source first.', 'error');
  if (!campaignState.scenePlan.length) return toast('Analyze the trend into scenes first.', 'error');
  const characters = selectedCampaignCharacters();
  const product = campaignState.productKey ? campaignState.assetMap.get(campaignState.productKey) : null;
  const environmentMode = document.getElementById('campaignEnvironmentMode')?.value || 'text';
  const environmentAssetKey = document.getElementById('campaignEnvironmentAssetSelect')?.value || '';
  const environmentAsset = environmentMode === 'library' && environmentAssetKey ? campaignState.assetMap.get(environmentAssetKey) : null;
  const environment = environmentAsset
    ? (environmentAsset.name || 'selected environment image')
    : (document.getElementById('campaignEnvironments')?.value || '').split('\n').map(line => line.trim()).filter(Boolean)[0] || '';
  const button = document.getElementById('campaignRefineSceneButton');
  if (button) {
    button.disabled = true;
    button.textContent = 'Refining...';
  }
  try {
    syncCampaignWorkflowJson();
    const data = await api('/api/trends/refine-scene-plan', {
      method: 'POST',
      body: JSON.stringify({
        trendId: trend.id,
        trend,
        sourceTrendUrl: trend.url || '',
        scenes: campaignState.scenePlan,
        duration: document.getElementById('campaignDuration')?.value || undefined,
        prompt: document.getElementById('campaignPrompt')?.value.trim() || '',
        productName: product?.name || '',
        characterName: characters[0]?.name || '',
        environment,
        cta: document.getElementById('campaignCta')?.value.trim() || ''
      })
    });
    campaignState.scenePlan = data.scenes || campaignState.scenePlan;
    renderCampaignScenePlan();
    renderCampaignNodeView();
    syncCampaignWorkflowJson();
    const output = document.getElementById('campaignOutputList');
    if (output && !options.quiet) {
      output.insertAdjacentHTML('afterbegin', `<div class="campaign-output-item"><strong>Scene plan refined</strong><br>${(data.refinementSummary || []).map(item => escapeHtml(item)).join('<br>')}<br><span class="hint">No paid render jobs were submitted.</span></div>`);
    }
    if (!options.quiet) toast('Scene plan refined to match the trend more closely. No paid jobs were submitted.', 'success');
  } catch (error) {
    toast(`Could not refine scene plan: ${error.message}`, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Refine scene plan';
    }
  }
}

function selectedCampaignCharacters() {
  return [...campaignState.selectedCharacters]
    .map(key => campaignState.assetMap.get(key))
    .filter(Boolean);
}

async function ensureCampaignAssetsLoaded() {
  if (!assetsCache.products?.length && !assetsCache.subjects?.length && !assetsCache.outputs?.length) {
    await loadAssets();
  } else if (!campaignState.assetMap?.size) {
    renderCampaignBuilder(assetsCache);
  }
}

async function estimateSeedanceCampaign(options = {}) {
  const quiet = options.quiet === true;
  const count = selectedCampaignCharacters().length;
  const text = document.getElementById('campaignEstimateText');
  if (!text) return null;
  if (!count) {
    text.textContent = 'Select characters to estimate the batch.';
    return null;
  }
  try {
    const outputMode = document.getElementById('campaignOutputMode')?.value || 'separate';
    const sceneMultiplier = campaignState.scenePlan.length || 1;
    const variants = outputMode === 'together' ? sceneMultiplier : count * sceneMultiplier;
    const data = await api('/api/generate/estimate', {
      method: 'POST',
      body: JSON.stringify({
        variants,
        duration: Number(document.getElementById('campaignDuration')?.value || 5),
        resolution: document.getElementById('campaignResolution')?.value || '720p',
        model: document.getElementById('campaignModel')?.value || 'seedance2-fast'
      })
    });
    const unit = campaignState.scenePlan.length ? 'scene renders' : 'videos';
    text.textContent = `${data.count} ${unit} · about $${Number(data.total || 0).toFixed(2)} total.`;
    if (!quiet) toast(text.textContent, 'info');
    return data;
  } catch (error) {
    text.textContent = `Could not estimate: ${error.message}`;
    if (!quiet) toast(error.message, 'error');
    return null;
  }
}

async function previewCampaignPlan() {
  await ensureCampaignAssetsLoaded();
  const prompt = document.getElementById('campaignPrompt')?.value.trim();
  const characters = selectedCampaignCharacters();
  const trend = selectedCampaignTrend();
  if (!prompt && !trend) return toast('Add a campaign prompt or choose a trend source first.', 'error');
  if (!characters.length) return toast('Select at least one character.', 'error');
  if (trend && !campaignState.scenePlan.length) {
    await analyzeCampaignTrendScenes({ quiet: true });
  }
  const output = document.getElementById('campaignOutputList');
  const submitButton = document.getElementById('campaignSubmitButton');
  const product = campaignState.productKey ? campaignState.assetMap.get(campaignState.productKey) : null;
  const environmentMode = document.getElementById('campaignEnvironmentMode')?.value || 'text';
  const environmentAssetKey = document.getElementById('campaignEnvironmentAssetSelect')?.value || '';
  const environmentAsset = environmentMode === 'library' && environmentAssetKey ? campaignState.assetMap.get(environmentAssetKey) : null;
  const environments = (document.getElementById('campaignEnvironments')?.value || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
  const model = document.getElementById('campaignModel')?.value || 'seedance2-fast';
  const engineLabel = model === 'seedance2-standard' ? 'RunPod Seedance fixed camera' : 'RunPod Seedance 1.5';
  const resolution = document.getElementById('campaignResolution')?.value || '720p';
  const duration = Number(document.getElementById('campaignDuration')?.value || 5);
  const aspectRatio = document.getElementById('campaignAspectRatio')?.value || '9:16';

  if (output) {
    const sceneSummary = campaignState.scenePlan.length
      ? `<div class="campaign-output-item"><strong>Trend scene plan</strong><br>${campaignState.scenePlan.map(scene => `${escapeHtml(scene.start)}-${escapeHtml(scene.end)}s ${escapeHtml(scene.title || 'Scene')} · ${escapeHtml(getCampaignEngineLabel(scene.engine || 'seedance2-fast'))}`).join('<br>')}<br><span class="hint">Scene generation and assembly will use these editable beats next. This review did not submit paid jobs.</span></div>`
      : '';
    output.innerHTML = characters.map((character, index) => {
      const visualEnvironment = environmentAsset
        ? (environmentAsset.name || 'selected environment image')
        : environments[index % Math.max(environments.length, 1)] || 'creator-style product demo setting';
      return `<div class="campaign-output-item"><strong>${escapeHtml(character.name || 'Character')}</strong><br>${campaignState.scenePlan.length ? 'Scene-by-scene trend campaign' : escapeHtml(engineLabel)} · ${escapeHtml(aspectRatio)} · ${escapeHtml(resolution)} · ${duration}s<br>${product ? `Product: ${escapeHtml(product.name || 'Selected product')}` : 'No product image'}<br>Environment: ${escapeHtml(visualEnvironment)}${trend ? `<br>Trend: ${escapeHtml(trend.id)} · ${escapeHtml(trend.hook || '')}` : ''}</div>`;
    }).join('') + sceneSummary;
  }
  if (submitButton) {
    submitButton.style.display = '';
    submitButton.textContent = campaignState.scenePlan.length ? 'Generate approved scenes' : 'Submit approved jobs';
  }
  await estimateSeedanceCampaign({ quiet: true });
  toast(campaignState.scenePlan.length ? 'Scene plan reviewed. No paid jobs were submitted yet.' : 'Campaign reviewed. No paid jobs were submitted yet.', 'success');
}

async function submitSeedanceCampaign() {
  if (campaignState.scenePlan.length) {
    return submitTrendSceneCampaign();
  }
  const prompt = document.getElementById('campaignPrompt')?.value.trim();
  const characters = selectedCampaignCharacters();
  if (!prompt) return toast('Add a campaign prompt first.', 'error');
  if (!characters.length) return toast('Select at least one character.', 'error');

  const button = document.getElementById('campaignGenerateButton');
  const output = document.getElementById('campaignOutputList');
  const product = campaignState.productKey ? campaignState.assetMap.get(campaignState.productKey) : null;
  const environmentMode = document.getElementById('campaignEnvironmentMode')?.value || 'text';
  const environmentAssetKey = document.getElementById('campaignEnvironmentAssetSelect')?.value || '';
  const environmentAsset = environmentMode === 'library' && environmentAssetKey ? campaignState.assetMap.get(environmentAssetKey) : null;
  const environments = (document.getElementById('campaignEnvironments')?.value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const batchId = `campaign-${Date.now()}`;
  const duration = Number(document.getElementById('campaignDuration')?.value || 5);
  const resolution = document.getElementById('campaignResolution')?.value || '720p';
  const model = document.getElementById('campaignModel')?.value || 'seedance2-fast';
  const aspectRatio = document.getElementById('campaignAspectRatio')?.value || '9:16';

  if (document.getElementById('campaignOutputMode')?.value === 'together' && characters.length > 1) {
    return toast('RunPod Seedance I2V accepts one source character image. Use separate videos or make a composite image first.', 'error');
  }
  if (!confirm(`Submit ${characters.length} RunPod Seedance video${characters.length === 1 ? '' : 's'} now?`)) return;

  button.disabled = true;
  button.textContent = 'Submitting campaign...';
  if (output) output.innerHTML = '';
  showVideoProcessingPreview({
    imageUrl: getCampaignAssetImage(characters[0]),
    aspectRatio,
    title: 'Success! Your campaign video is processing in background.',
    detail: 'You can navigate away from this page or keep using the app while your video is cooking. We will notify you when it is complete.'
  });
  startGenerationOverlay({ engine: 'seedance-campaign', mode: 'campaign' });
  toast('Campaign started. You can navigate away; completed videos will appear in Library with popup and sound notifications.', 'info');

  try {
    const productUrl = product ? await resolveCampaignAssetUrl(product, 'products') : '';
    const environmentUrl = environmentAsset ? await resolveCampaignAssetUrl(environmentAsset, environmentAsset._campaignType || 'products') : '';
    const results = [];
    for (let index = 0; index < characters.length; index++) {
      const character = characters[index];
      const environment = environments[index % Math.max(environments.length, 1)] || '';
      const imageUrl = await resolveCampaignAssetUrl(character, 'subjects');
      const visualEnvironment = environmentAsset ? (environmentAsset.name || 'selected environment image') : environment;
      const videoPrompt = buildCampaignPrompt({ basePrompt: prompt, character, product, environment: visualEnvironment, aspectRatio });
      const referenceImageUrls = [imageUrl, productUrl, environmentUrl].filter(Boolean);
      const result = await api('/api/generate/single', {
        method: 'POST',
        body: JSON.stringify({
          prompt: videoPrompt,
          imageUrl: environmentUrl ? undefined : imageUrl,
          productImageUrl: !environmentUrl ? productUrl || undefined : undefined,
          referenceImageUrls: environmentUrl ? referenceImageUrls : undefined,
          forceMultiReference: Boolean(environmentUrl),
          duration,
          resolution,
          model,
          aspectRatio,
          batchId,
          variant: character.name || `Character ${index + 1}`,
          format: 'seedance-campaign'
        })
      });
      results.push({ character, result });
      if (output) {
        output.insertAdjacentHTML('beforeend', `<div class="campaign-output-item"><strong>${escapeHtml(character.name || 'Character')}</strong><br>Submitted request ${escapeHtml(result.requestId || '')}</div>`);
      }
      if (index === 0) setBackgroundGenerationOverlay({ engine: 'seedance-campaign', mode: 'campaign', jobKey: result.requestId || '' });
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    toast(`${results.length} Seedance campaign videos submitted. You can keep working here or open Library.`, 'success');
    await loadVideos({ notify: true });
    if (output) {
      output.insertAdjacentHTML('beforeend', `<div class="campaign-output-item"><strong>Processing in background</strong><br>Library now has the processing card${results.length === 1 ? '' : 's'} with the selected character preview.<div class="actions" style="margin-top:8px"><button class="btn btn-secondary" type="button" onclick="switchTab('videos')">Open Library</button></div></div>`);
    }
  } catch (error) {
    toast(`Campaign failed: ${error.message}`, 'error');
    if (output) output.insertAdjacentHTML('beforeend', `<div class="campaign-output-item"><strong>Failed</strong><br>${escapeHtml(error.message)}</div>`);
  } finally {
    button.disabled = false;
    button.textContent = 'Generate campaign';
  }
}

async function submitTrendSceneCampaign() {
  const characters = selectedCampaignCharacters();
  const trend = selectedCampaignTrend();
  const prompt = document.getElementById('campaignPrompt')?.value.trim() || trend?.hook || '';
  if (!characters.length) return toast('Select at least one character.', 'error');
  if (!campaignState.scenePlan.length) return toast('Analyze or add scenes first.', 'error');

  const submitButton = document.getElementById('campaignSubmitButton');
  const output = document.getElementById('campaignOutputList');
  const product = campaignState.productKey ? campaignState.assetMap.get(campaignState.productKey) : null;
  const environmentMode = document.getElementById('campaignEnvironmentMode')?.value || 'text';
  const environmentAssetKey = document.getElementById('campaignEnvironmentAssetSelect')?.value || '';
  const environmentAsset = environmentMode === 'library' && environmentAssetKey ? campaignState.assetMap.get(environmentAssetKey) : null;

  const sceneCount = campaignState.scenePlan.length * characters.length;
  const outputMode = document.getElementById('campaignOutputMode')?.value || 'separate';
  const renderCount = outputMode === 'together' ? campaignState.scenePlan.length : sceneCount;
  const finalCount = outputMode === 'together' ? 1 : characters.length;
  syncCampaignWorkflowJson();
  if (!confirm(`Submit ${renderCount} scene render${renderCount === 1 ? '' : 's'} now for ${finalCount} final video${finalCount === 1 ? '' : 's'}? The final campaign video will assemble after all scenes finish.`)) return;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting scenes...';
  }
  showVideoProcessingPreview({
    imageUrl: getCampaignAssetImage(characters[0]),
    aspectRatio: document.getElementById('campaignAspectRatio')?.value || '9:16',
    title: 'Success! Your scene campaign is processing in background.',
    detail: 'You can navigate away from this page or keep using the app while the scene renders in the background. We will notify you when the campaign video is complete.'
  });
  startGenerationOverlay({ engine: 'seedance-campaign', mode: 'campaign' });
  toast('Scene campaign started. You can navigate away; Library will show scene clips and the assembled final when it finishes.', 'info');

  try {
    const resolvedCharacters = [];
    for (const character of characters) {
      resolvedCharacters.push({
        name: character.name || 'Character',
        imageUrl: await resolveCampaignAssetUrl(character, 'subjects')
      });
    }
    const productImageUrl = product ? await resolveCampaignAssetUrl(product, 'products') : '';
    const environmentImageUrl = environmentAsset ? await resolveCampaignAssetUrl(environmentAsset, environmentAsset._campaignType || 'products') : '';
    const data = await api('/api/generate/campaign-scenes', {
      method: 'POST',
      body: JSON.stringify({
        campaignId: `trend-campaign-${Date.now()}`,
        prompt,
        characters: resolvedCharacters,
        productImageUrl,
        environmentImageUrl,
        scenes: campaignState.scenePlan,
        resolution: document.getElementById('campaignResolution')?.value || '720p',
        aspectRatio: document.getElementById('campaignAspectRatio')?.value || '9:16',
        outputMode,
        sourceTrendId: trend?.id || '',
        sourceTrendUrl: trend?.url || '',
        sourceTrendTitle: trend?.title || trend?.hook || 'Selected trend source',
        sourceTrendHook: trend?.hook || '',
        sourceTrendThumbnail: trend?.thumbnailUrl || trend?.thumbnail || trend?.imageUrl || '',
        workflow: getCampaignWorkflowJson(),
        assembly: getCampaignWorkflowJson().assembly,
        cta: document.getElementById('campaignCta')?.value.trim() || ''
      })
    });
    const firstRequestId = data.results?.find(item => item.requestId)?.requestId || '';
    setBackgroundGenerationOverlay({ engine: 'seedance-campaign', mode: 'campaign', jobKey: firstRequestId });
    if (output) {
      const errors = (data.errors || []).map(item => `${escapeHtml(item.character || 'Scene')} ${escapeHtml(String(item.sceneIndex || ''))}: ${escapeHtml(item.error || 'failed')}`).join('<br>');
      output.insertAdjacentHTML('afterbegin', `<div class="campaign-output-item"><strong>Submitted scene campaign</strong><br>${data.submitted} scene jobs submitted · ${data.failed} failed<br>${(data.batches || []).map(batch => `Batch: ${escapeHtml(batch)}`).join('<br>')}${errors ? `<br><br><strong>Errors</strong><br>${errors}` : ''}<br><span class="hint">When every scene in a batch completes, Bloom Studio assembles the final silent campaign video automatically.</span></div>`);
      output.insertAdjacentHTML('afterbegin', `<div class="campaign-output-item"><strong>Processing in background</strong><br>Library now has scene processing cards with character previews.<div class="actions" style="margin-top:8px"><button class="btn btn-secondary" type="button" onclick="switchTab('videos')">Open Library</button></div></div>`);
    }
    if (data.failed) toast(`${data.submitted} scenes submitted, ${data.failed} failed to submit. Open the review list for details.`, 'error');
    else toast(`${data.submitted} scenes submitted. Final assembly starts automatically after clips complete.`, 'success');
    await loadVideos({ notify: true });
  } catch (error) {
    toast(`Scene campaign failed: ${error.message}`, 'error');
    if (output) output.insertAdjacentHTML('afterbegin', `<div class="campaign-output-item"><strong>Failed</strong><br>${escapeHtml(error.message)}</div>`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Generate approved scenes';
    }
  }
}

function openCreateCharacterBuilder() {
  switchTab('studio');
  showAgentModal();
  setAgentModalMode('build');
}

function returnToCharactersTab() {
  switchTab('characters');
  setCharacterTab('mine');
}

function setCreateType(type, options = {}) {
  const selected = type || 'shorts';
  isolateStudioTabIfActive();
  const studioTab = document.getElementById('tab-studio');
  if (studioTab) {
    studioTab.dataset.createTool = 'video';
    studioTab.dataset.createType = selected;
    studioTab.classList.add('focused-create');
    studioTab.classList.remove('create-tool-audio');
  }
  document.querySelectorAll('[data-create-tool]:not(#tab-studio)').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.createTool === 'video');
  });
  const flows = {
    shorts: {
      title: 'Shorts workflow',
      badge: 'Talking-head',
      desc: 'Create a short creator video from a character, script or approved audio, then save it to Library for posting.',
      mode: 'i2v',
      engine: 'musetalk',
      audio: 'upload',
      aspect: '9:16',
      steps: [
        ['Choose character', 'Select an influencer or upload a portrait.'],
        ['Create audio', 'Upload audio or generate a voice preview.'],
        ['Lip sync', 'Use MuseTalk or another talking-head model for the render.'],
        ['Save + post', 'Review in Library, then publish.']
      ]
    },
    scenes: {
      title: 'B-roll / Scenes workflow',
      badge: 'Scene clips',
      desc: 'Create product, environment, or character motion clips that can be used as campaign scenes or edited into a larger video.',
      mode: 'i2v',
      engine: 'seedance2-fast',
      audio: 'upload',
      aspect: '9:16',
      steps: [
        ['Choose image', 'Use a product, character, environment, or generated image.'],
        ['Pick model', 'Seedance, Wan, InfiniteTalk, Meigen, or Comfy when compatible.'],
        ['Direct motion', 'Describe camera movement, action, setting, and product use.'],
        ['Save scene', 'Send the clip to Library for campaigns or edits.']
      ]
    },
    remix: {
      title: 'Remix videos workflow',
      badge: 'Motion mimic',
      desc: 'Start from a viral source, extract the script, choose your character/product/voice, then use Wan Animate to mimic the reference movement.',
      mode: 'i2v',
      engine: 'wan-animate',
      audio: 'upload',
      aspect: '9:16',
      steps: [
        ['Pick trend', 'Choose a source from Trends or paste/upload one.'],
        ['Extract script', 'Use Faster Whisper when media is available.'],
        ['Choose creator', 'Select character, product, brand, and voice.'],
        ['Motion remix', 'Wan Animate rebuilds the movement with your character.']
      ]
    },
    'long-form': {
      title: 'Long form workflow',
      badge: 'Script led',
      desc: 'Use a longer script or finished voiceover, then generate presenter sections so the output does not depend on one giant render.',
      mode: 'i2v',
      engine: 'musetalk',
      audio: 'upload',
      aspect: '16:9',
      steps: [
        ['Write script', 'Paste the full script or outline.'],
        ['Approve audio', 'Upload or generate voiceover before rendering.'],
        ['Lip sync sections', 'Use MuseTalk or another compatible video model by segment.'],
        ['Assemble', 'Save each section to Library for editing.']
      ]
    },
    webinar: {
      title: 'Webinar workflow',
      badge: 'Training',
      desc: 'Build webinar-style content from a teaching script, slides, or long source audio. Best for 16:9 output.',
      mode: 'i2v',
      engine: 'musetalk',
      audio: 'upload',
      aspect: '16:9',
      steps: [
        ['Choose presenter', 'Use a character portrait or upload a webinar host image.'],
        ['Add narration', 'Upload final audio or use saved audio.'],
        ['Lip sync presenter', 'Use MuseTalk or another compatible talking-head model.'],
        ['Review', 'Save finished sections to Library.']
      ]
    },
    course: {
      title: 'Course workflow',
      badge: 'Lessons',
      desc: 'Create lesson videos from structured scripts and approved narration. Works best as repeatable lesson modules.',
      mode: 'i2v',
      engine: 'musetalk',
      audio: 'elevenlabs',
      aspect: '16:9',
      steps: [
        ['Lesson script', 'Paste one lesson at a time.'],
        ['Approve voice', 'Preview or upload clean narration.'],
        ['Generate lesson', 'Use a presenter or course scene in 16:9.'],
        ['Library', 'Store each lesson as a reusable asset.']
      ]
    }
  };
  const flow = flows[selected] || flows.shorts;
  document.getElementById('studioCreateType').value = selected;
  document.querySelectorAll('[data-create-type]:not(#tab-studio)').forEach(btn => btn.classList.toggle('active', btn.dataset.createType === selected));
  const note = document.querySelector('#tab-studio .panel-note');
  if (note) note.textContent = flow.desc;

  const flowPanel = document.getElementById('createFlowPanel');
  if (flowPanel) {
    flowPanel.innerHTML = `
      <div class="create-flow-head">
        <div>
          <div class="create-flow-title">${flow.title}</div>
          <div class="create-flow-desc">${flow.desc}</div>
        </div>
        <div class="create-flow-chip">${flow.badge}</div>
      </div>
      <div class="create-flow-steps">
        ${flow.steps.map(step => `<div class="create-flow-step"><strong>${step[0]}</strong><span>${step[1]}</span></div>`).join('')}
      </div>
      ${renderFlowStatus(selected)}
    `;
  }

  if (document.getElementById('studioAspectRatio')) {
    document.getElementById('studioAspectRatio').value = flow.aspect;
    updatePreviewRatio();
  }
  const scriptLabel = document.getElementById('studioScriptLabel');
  const script = document.getElementById('studioScript');
  if (scriptLabel) scriptLabel.textContent = selected === 'remix' ? 'Remix narration script' : 'Narration script';
  if (script) script.placeholder = selected === 'remix'
    ? 'Paste the adapted narration script for this remix.'
    : 'Paste the spoken words VibeVoice or ElevenLabs should turn into voiceover.';

  if (selected === 'remix') {
    document.getElementById('studioRemixContext')?.classList.add('active');
  } else {
    document.getElementById('studioRemixContext')?.classList.remove('active');
  }
  document.getElementById('studioCourseContext')?.classList.toggle('active', selected === 'course');
  if (selected === 'course') {
    if (scriptLabel) scriptLabel.textContent = 'Course narration script';
    if (script) script.placeholder = 'Paste the spoken lesson narration here. ElevenLabs v3 tags like [warmly], [short pause], and [confident] can guide the delivery.';
  }

  setStudioMode(flow.mode);
  if (flow.mode === 'i2v') {
    document.getElementById('studioVideoEngine').value = flow.engine;
    setStudioVideoEngine(flow.engine);
  }
  setStudioAudio(flow.audio, { preserveToast: true });
  if (selected === 'course') toggleVoiceDetails(true);
  updateCoursePresentationSource();
}

function updateCoursePresentationSource() {
  const source = document.getElementById('coursePresentationSource')?.value || 'upload';
  const upload = document.getElementById('coursePresentationUploadGroup');
  const asset = document.getElementById('coursePresentationAssetGroup');
  const generate = document.getElementById('coursePresentationGenerateGroup');
  if (upload) upload.style.display = source === 'upload' ? '' : 'none';
  if (asset) asset.style.display = source === 'asset' ? '' : 'none';
  if (generate) generate.style.display = source === 'generate' ? '' : 'none';
  buildCourseTimeline({ quiet: true });
}

function setCourseStyle(style = 'instructor-led') {
  const input = document.getElementById('courseStyle');
  if (input) input.value = style;
  document.querySelectorAll('[data-course-style]').forEach(button => {
    button.classList.toggle('active', button.dataset.courseStyle === style);
  });
  buildCourseTimeline({ quiet: true });
}

function estimateScriptSeconds(script = '') {
  const wordCount = String(script || '').replace(/\[[^\]]+\]/g, '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(24, Math.round((wordCount / 135) * 60) || 60);
}

function secondsLabel(seconds = 0) {
  const value = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(value / 60);
  const secs = String(value % 60).padStart(2, '0');
  return `${minutes}:${secs}`;
}

function splitCourseScriptBeats(script = '') {
  const cleaned = String(script || '').trim();
  if (!cleaned) return ['Course intro', 'Core lesson', 'Example or walkthrough', 'Recap and next step'];
  return cleaned
    .split(/\n{2,}|(?<=\.)\s+(?=\[|[A-Z])/)
    .map(part => part.replace(/\[[^\]]+\]/g, '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function courseLayoutForBeat(style, index, total, beat = '') {
  const text = beat.toLowerCase();
  if (index === 0) return 'teacher';
  if (index === total - 1) return style === 'slide-first' ? 'teacher_slide_split' : 'teacher';
  if (style === 'demo-walkthrough') return index % 2 ? 'screen_full_teacher_pip' : 'teacher_slide_split';
  if (style === 'slide-first') return /example|mistake|decision|step|module|framework|list/.test(text) ? 'slide_full' : 'teacher_slide_split';
  if (style === 'recap') return index % 2 ? 'teacher_slide_split' : 'teacher';
  return /step|list|framework|example|module|decision/.test(text) ? 'teacher_slide_split' : 'slide_full';
}

function buildCourseTimeline(options = {}) {
  const style = document.getElementById('courseStyle')?.value || 'instructor-led';
  const script = document.getElementById('studioScript')?.value || '';
  const lessonTitle = document.getElementById('courseLessonTitle')?.value.trim() || 'Lesson';
  const moduleTitle = document.getElementById('courseModuleTitle')?.value.trim() || 'Module';
  const source = document.getElementById('coursePresentationSource')?.value || 'upload';
  const sourceLabel = source === 'asset'
    ? (document.getElementById('coursePresentationAssetId')?.selectedOptions?.[0]?.textContent || 'Saved asset')
    : source === 'generate'
      ? 'Generated presentation'
      : (document.getElementById('coursePresentationFile')?.files?.[0]?.name || 'Uploaded presentation');
  const totalSeconds = estimateScriptSeconds(script);
  const beats = splitCourseScriptBeats(script);
  const beatLength = totalSeconds / beats.length;
  let cursor = 0;
  const timeline = beats.map((beat, index) => {
    const duration = index === beats.length - 1 ? totalSeconds - cursor : Math.max(6, Math.round(beatLength));
    const start = cursor;
    const end = Math.min(totalSeconds, cursor + duration);
    cursor = end;
    return {
      id: `course-scene-${index + 1}`,
      start,
      end,
      startLabel: secondsLabel(start),
      endLabel: secondsLabel(end),
      layout: courseLayoutForBeat(style, index, beats.length, beat),
      slide: index + 1,
      title: index === 0 ? `${lessonTitle} opening` : index === beats.length - 1 ? `${moduleTitle} recap` : `Teaching beat ${index + 1}`,
      narrationBeat: beat.slice(0, 180),
      visualSource: sourceLabel,
      reason: index === 0 ? 'intro' : index === beats.length - 1 ? 'recap' : 'script concept beat'
    };
  });
  const workflow = {
    schema: 'bloom.course.timeline.v1',
    style,
    moduleTitle,
    lessonTitle,
    presentation: {
      source,
      assetId: document.getElementById('coursePresentationAssetId')?.value || '',
      fileName: document.getElementById('coursePresentationFile')?.files?.[0]?.name || '',
      brief: document.getElementById('coursePresentationBrief')?.value || ''
    },
    totalSeconds,
    scenes: timeline
  };
  const hidden = document.getElementById('courseTimelineJson');
  if (hidden) hidden.value = JSON.stringify(workflow);
  renderCourseTimeline(workflow);
  if (!options.quiet) toast('Course timeline built from the script and selected style.', 'success');
  return workflow;
}

function renderCourseTimeline(workflow) {
  const panel = document.getElementById('courseTimeline');
  if (!panel) return;
  const scenes = workflow?.scenes || [];
  panel.innerHTML = `
    <div class="course-context-head" style="margin-bottom:0">
      <div>
        <div class="course-context-title">Auto lesson timeline</div>
        <div class="hint">${escapeHtml(workflow?.style || 'instructor-led')} · ${secondsLabel(workflow?.totalSeconds || 0)} estimated</div>
      </div>
      <button class="btn btn-secondary" type="button" onclick="buildCourseTimeline()">Refresh</button>
    </div>
    ${scenes.map(scene => `
      <div class="course-timeline-row">
        <strong>${escapeHtml(scene.startLabel)}-${escapeHtml(scene.endLabel)}</strong>
        <span>${escapeHtml(scene.layout.replace(/_/g, ' '))}<br>Slide ${escapeHtml(String(scene.slide))}</span>
        <span><strong>${escapeHtml(scene.title)}</strong><br>${escapeHtml(scene.narrationBeat || scene.reason)}</span>
      </div>
    `).join('')}
  `;
}

function toggleCourseTimeline() {
  const panel = document.getElementById('courseTimeline');
  if (!panel) return;
  if (!document.getElementById('courseTimelineJson')?.value) buildCourseTimeline({ quiet: true });
  panel.classList.toggle('active');
}

function fillCourseIntroScript() {
  const moduleTitle = document.getElementById('courseModuleTitle')?.value.trim() || 'Module 1: The big picture';
  const lessonTitle = document.getElementById('courseLessonTitle')?.value.trim() || 'Lesson 1: Welcome and course roadmap';
  const objective = document.getElementById('courseLessonObjective')?.value.trim() || 'understand what we are building, why it matters, and how to get the most out of each lesson';
  const outline = document.getElementById('courseModuleOutline')?.value.trim();
  const script = document.getElementById('studioScript');
  if (!script) return;
  const moduleLine = outline
    ? `Here is the path we will follow:\n${outline.split('\n').map(line => line.trim()).filter(Boolean).map(line => `- ${line}`).join('\n')}\n\n`
    : '';
  script.value = `[warmly] Welcome to ${lessonTitle}.\n\nIn this first lesson, we are setting the foundation for ${moduleTitle}. By the end, you will ${objective}.\n\n[short pause]\n\nThis course is built to be practical. Each lesson gives you one clear idea, one useful example, and one action step you can apply before moving forward.\n\n${moduleLine}[confident]\nBefore we begin, open the presentation or workbook for this module. As we go, I will point out the key decisions to make, the common mistakes to avoid, and the next step to complete.\n\nLet us start with the big picture.`;
  const tone = document.getElementById('studioVoiceTone');
  if (tone) tone.value = 'training';
  applyStudioTonePreset();
  buildCourseTimeline({ quiet: true });
  toast('Course intro script drafted with light ElevenLabs v3 delivery tags.', 'success');
}

function setRemixContext({ url = '', sourceScript = '' } = {}) {
  document.getElementById('studioRemixSourceUrl').value = url;
  document.getElementById('studioRemixSourceScript').value = sourceScript;
  document.getElementById('studioRemixSourceLabel').textContent = url || 'No source selected yet.';
  document.getElementById('studioRemixContext')?.classList.add('active');
  setCreateType('remix');
}

function clearRemixContext() {
  document.getElementById('studioRemixSourceUrl').value = '';
  document.getElementById('studioRemixSourceScript').value = '';
  document.getElementById('studioRemixSourceLabel').textContent = 'No source selected yet.';
  document.getElementById('studioRemixContext')?.classList.remove('active');
  if (document.getElementById('studioCreateType')?.value === 'remix') setCreateType('shorts');
}

function setStudioMode(mode) {
  const actualMode = mode;

  document.getElementById('studioMode').value = actualMode;
  document.getElementById('studioPreset').value = actualMode === 'v2v' ? 'bloomies-v2v' : 'sarah-i2v-lipsync';
  document.querySelectorAll('[data-mode-choice]').forEach(btn => btn.classList.toggle('active', btn.dataset.modeChoice === actualMode));
  document.getElementById('studioImageGroup').style.display = actualMode === 'i2v' ? '' : 'none';
  document.getElementById('studioVideoEngineGroup').style.display = actualMode === 'i2v' ? '' : 'none';
  document.getElementById('studioVideoGroup').style.display = actualMode === 'v2v' ? '' : 'none';
  const submitButton = document.getElementById('studioSubmitButton');
  submitButton.textContent = actualMode === 'audio' ? 'Generate audio' : '▶ Generate video';
  const currentEngine = document.getElementById('studioVideoEngine')?.value;
  document.getElementById('studioSubmitHint').textContent = actualMode === 'audio'
    ? 'Creates and saves an approved voiceover before video generation.'
    : actualMode === 'v2v'
      ? 'Uses the Bloomies V2V workflow preset.'
      : getStudioEngineHint(currentEngine);
  if (actualMode !== 'i2v') {
    document.getElementById('studioVideoEngine').value = 'wan-comfy';
    setStudioVideoEngine('wan-comfy');
  } else {
    setStudioVideoEngine(document.getElementById('studioVideoEngine').value);
  }
  if (actualMode === 'audio' && ['upload', 'asset'].includes(document.getElementById('studioAudioProvider').value)) {
    setStudioAudio('vibevoice');
  }
}

function setStudioVideoEngine(engine) {
  const hint = document.getElementById('studioVideoEngineHint');
  const quality = document.getElementById('studioMeigenQualityGroup');
  const reference = document.getElementById('studioReferenceVideoGroup');
  const durationGroup = document.getElementById('studioDurationSecondsGroup');
  const qualitySelect = document.getElementById('studioMeigenSize');
  const qualityHint = document.getElementById('studioMeigenQualityHint');
  const usesLipSyncQuality = ['meigen', 'infinitetalk-hd', 'musetalk'].includes(engine);
  if (quality) quality.style.setProperty('display', usesLipSyncQuality ? 'block' : 'none', 'important');
  if (durationGroup) {
    const showDuration = engine === 'wan-comfy';
    durationGroup.style.display = showDuration ? '' : 'none';
    durationGroup.classList.toggle('comfy-visible', showDuration);
  }
  if (qualitySelect) {
    [...qualitySelect.options].forEach(option => {
      option.hidden = (engine === 'meigen' || engine === 'musetalk')
        ? option.value === '1080p'
        : engine === 'infinitetalk-hd'
          ? option.value === '480p'
          : false;
    });
    if ((engine === 'meigen' || engine === 'musetalk') && qualitySelect.value === '1080p') qualitySelect.value = '480p';
    if (engine === 'infinitetalk-hd' && qualitySelect.value === '480p') qualitySelect.value = '720p';
  }
  if (qualityHint) {
    qualityHint.textContent = engine === 'infinitetalk-hd'
      ? 'InfiniteTalk HD renders with CodeFormer and supports 720p or 1080p upscale.'
      : engine === 'musetalk'
        ? '480p is faster and more reliable. 720p takes longer but is sharper.'
        : '480p is best for testing on the public endpoint. 720p can take longer.';
  }
  if (reference) reference.style.display = engine === 'wan-animate' ? '' : 'none';
  if (hint) hint.textContent = getStudioEngineHint(engine);
  if (document.getElementById('studioMode').value === 'i2v') {
    document.getElementById('studioSubmitHint').textContent = getStudioEngineHint(engine);
  }
}

function getStudioEngineHint(engine) {
  if (engine === 'seedance2-fast') return 'Uses RunPod Seedance 1.5 Pro for image-to-video scene motion. No ComfyUI pod required.';
  if (engine === 'seedance2-standard') return 'Uses RunPod Seedance 1.5 Pro fixed camera mode for steadier product or creator scenes.';
  if (engine === 'infinitetalk-hd') return 'Uses your custom RunPod InfiniteTalk endpoint with CodeFormer and optional Real-ESRGAN upscale. Requires the network volume mounted at /runpod-volume.';
  if (engine === 'musetalk') return 'Uses your custom RunPod MuseTalk endpoint for fast face-region lip sync. No ComfyUI pod required, but the endpoint must be deployed from the MuseTalk worker.';
  if (engine === 'meigen') return 'Uses MeiGen-AI InfiniteTalk through the RunPod public endpoint. No ComfyUI pod required.';
  if (engine === 'wan22-serverless') return 'Uses the Wan 2.2 RunPod serverless endpoint for image-to-video. No ComfyUI pod required.';
  if (engine === 'wan-animate') return 'Uses Wan Animate serverless with a reference video to mimic motion. No ComfyUI pod required.';
  return 'Uses the installed WAN/ComfyUI workflow and RunPod pod.';
}

function initializeStudioDefaults() {
  const createType = document.getElementById('studioCreateType')?.value || 'shorts';
  if (typeof setCreateType === 'function') {
    setCreateType(createType, { preserveToast: true });
    return;
  }
  const engine = document.getElementById('studioVideoEngine')?.value || 'wan-comfy';
  setStudioVideoEngine(engine);
}

function setStudioAudio(provider, options = {}) {
  document.getElementById('studioAudioProvider').value = provider;
  const form = document.getElementById('studioForm');
  if (form) {
    form.classList.remove('voice-provider-upload', 'voice-provider-asset', 'voice-provider-elevenlabs', 'voice-provider-chatterbox', 'voice-provider-vibevoice', 'voice-provider-qwen');
    form.classList.add(`voice-provider-${provider}`);
  }
  document.getElementById('studioAudioGroup').style.display = provider === 'upload' ? '' : 'none';
  document.getElementById('studioAudioAssetGroup').style.display = provider === 'asset' ? '' : 'none';
  document.getElementById('studioVoiceGroup').style.display = provider === 'elevenlabs' ? '' : 'none';
  document.getElementById('studioChatterboxGroup').style.display = ['chatterbox', 'vibevoice'].includes(provider) ? '' : 'none';
  const configureButton = document.getElementById('studioConfigureVoiceButton');
  if (configureButton) configureButton.style.display = ['chatterbox', 'vibevoice', 'elevenlabs'].includes(provider) ? '' : 'none';
  document.getElementById('studioPreviewVoiceButton').style.display = ['chatterbox', 'vibevoice', 'elevenlabs'].includes(provider) ? '' : 'none';
  document.getElementById('studioPreviewVoiceButton').textContent = provider === 'elevenlabs' ? 'Preview script with ElevenLabs' : provider === 'vibevoice' ? 'Preview script with VibeVoice' : 'Preview script with Chatterbox';
  if (provider === 'elevenlabs') toggleVoiceDetails(true);
  if (options.preserveToast) return;
  if (provider === 'qwen') {
    toast('Qwen audio is visible but needs the third workflow API export before it can run.', 'info');
  }
  if (provider === 'elevenlabs') {
    toast('ElevenLabs will generate audio from the script before queuing the video.', 'info');
  }
  if (provider === 'vibevoice') {
    toast('VibeVoice will generate longform English narration from the script.', 'info');
  }
  if (provider === 'chatterbox') {
    toast('Legacy Chatterbox is best for short tests only. Use VibeVoice for longform.', 'info');
  }
}

function applyStudioTonePreset() {
  const tone = document.getElementById('studioVoiceTone')?.value || 'natural';
  const prompt = document.getElementById('studioPrompt');
  if (!prompt) return;
  const presets = {
    natural: 'Natural conversational delivery, relaxed pacing, clear speech.',
    happy: 'Happy upbeat delivery, smiling energy, bright friendly tone.',
    excited: 'Excited creator delivery, energetic but not shouty, quick confident pacing.',
    sincere: 'Sincere empathetic delivery, warm and grounded, thoughtful pauses.',
    training: 'Clear training delivery, teacher-like pacing, structured and easy to follow.',
    calm: 'Calm reassuring delivery, steady pacing, soft confidence.',
    urgent: 'Urgent focused delivery, direct and concise, serious but controlled.',
    sad: 'Soft reflective delivery, subdued emotion, slower pacing.',
    playful: 'Playful light delivery, fun and casual, expressive but natural.'
  };
  if (!prompt.value.trim() || Object.values(presets).includes(prompt.value.trim())) {
    prompt.value = presets[tone] || presets.natural;
  }
}

function showStudioFileName(inputId, targetId) {
  const input = document.getElementById(inputId);
  const target = document.getElementById(targetId);
  target.textContent = input.files?.[0]?.name || '';
}

function updatePreviewRatio() {
  const frame = document.getElementById('studioPreview');
  if (!frame) return;
  const ratio = document.getElementById('studioAspectRatio')?.value || '9:16';
  frame.classList.toggle('ratio-landscape', ratio === '16:9');
  frame.classList.toggle('ratio-portrait', ratio === '9:16');
  frame.classList.toggle('ratio-square', ratio === '1:1');
}

function setPreviewImage(src, title = 'Selected character') {
  const frame = document.getElementById('studioPreview');
  if (!frame || !src) return;
  const displaySrc = authenticatedMediaUrl(src);
  updatePreviewRatio();
  resetStudioCrop();
  frame.classList.remove('audio-preview-mode');
  frame.classList.add('has-media');
  frame.innerHTML = `<img src="${displaySrc}" alt="${title}">`;
  frame.onpointerdown = startPreviewDrag;
  document.getElementById('cropHint').style.display = '';
  applyStudioCrop();
}

function setPreviewVideo(src, title = 'Selected video') {
  const frame = document.getElementById('studioPreview');
  if (!frame || !src) return;
  updatePreviewRatio();
  frame.classList.add('has-media');
  frame.classList.remove('dragging', 'audio-preview-mode');
  frame.onpointerdown = null;
  frame.innerHTML = `<video src="${src}" controls muted playsinline aria-label="${title}"></video>`;
  document.getElementById('cropHint').style.display = 'none';
}

function showVideoProcessingPreview({
  imageUrl = '',
  aspectRatio = '9:16',
  title = 'Success! Your video is currently processing in background.',
  detail = 'You can navigate away from this page or keep using the app while your video is cooking. We will notify you when it is complete.'
} = {}) {
  const frame = document.getElementById('studioPreview');
  if (!frame) return;
  frame.classList.add('has-media');
  frame.classList.remove('dragging', 'audio-preview-mode');
  frame.classList.toggle('ratio-landscape', aspectRatio === '16:9');
  frame.classList.toggle('ratio-portrait', aspectRatio === '9:16');
  frame.classList.toggle('ratio-square', aspectRatio === '1:1');
  frame.onpointerdown = null;
  const cropHint = document.getElementById('cropHint');
  if (cropHint) cropHint.style.display = 'none';
  const displaySrc = imageUrl ? authenticatedMediaUrl(imageUrl) : '';
  frame.innerHTML = `
    <div class="processing-preview-frame">
      ${displaySrc ? `<img src="${displaySrc}" alt="Processing video preview">` : `<div class="processing-preview-empty"><div class="cooking-orb"></div><strong>Video processing</strong></div>`}
      <div class="processing-preview-overlay">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail)}</p>
        <div class="processing-bar"><span></span></div>
      </div>
    </div>`;
}

function resetPreview() {
  const frame = document.getElementById('studioPreview');
  if (!frame) return;
  updatePreviewRatio();
  frame.classList.remove('has-media');
  frame.classList.remove('dragging', 'audio-preview-mode');
  frame.onpointerdown = null;
  resetStudioCrop();
  document.getElementById('cropHint').style.display = 'none';
  frame.innerHTML = `<div><div style="font-size:34px;margin-bottom:10px">▶</div><strong id="previewTitle">Your video preview appears here</strong><p id="previewHint" style="font-size:13px;margin-top:6px;color:rgba(255,255,255,.45)">Select a character or upload an image to preview the frame.</p></div>`;
}

function setAudioPreviewMode() {
  const frame = document.getElementById('studioPreview');
  if (!frame) return;
  frame.classList.remove('has-media', 'dragging', 'ratio-landscape', 'ratio-square');
  frame.classList.add('audio-preview-mode');
  frame.onpointerdown = null;
  document.getElementById('cropHint').style.display = 'none';
  frame.innerHTML = `<div><strong id="previewTitle">Audio preview appears here</strong><p id="previewHint" style="font-size:13px;margin-top:6px;color:rgba(255,255,255,.45)">Generate from script with VibeVoice or ElevenLabs v3, then play it here.</p></div>`;
}

function resetStudioCrop() {
  studioCrop = { x: 50, y: 50 };
  applyStudioCrop();
}

function applyStudioCrop() {
  const frame = document.getElementById('studioPreview');
  if (frame) {
    frame.style.setProperty('--crop-x', `${studioCrop.x}%`);
    frame.style.setProperty('--crop-y', `${studioCrop.y}%`);
  }
  const cropX = document.getElementById('studioCropX');
  const cropY = document.getElementById('studioCropY');
  if (cropX) cropX.value = Math.round(studioCrop.x);
  if (cropY) cropY.value = Math.round(studioCrop.y);
}

function startPreviewDrag(event) {
  const frame = document.getElementById('studioPreview');
  if (!frame?.classList.contains('has-media')) return;
  cropDrag = {
    startX: event.clientX,
    startY: event.clientY,
    cropX: studioCrop.x,
    cropY: studioCrop.y
  };
  frame.classList.add('dragging');
}

function handlePreviewDragMove(event) {
  if (!cropDrag) return;
  const frame = document.getElementById('studioPreview');
  if (!frame) return;
  const rect = frame.getBoundingClientRect();
  const deltaX = ((event.clientX - cropDrag.startX) / Math.max(rect.width, 1)) * 100;
  const deltaY = ((event.clientY - cropDrag.startY) / Math.max(rect.height, 1)) * 100;
  studioCrop.x = Math.max(0, Math.min(100, cropDrag.cropX - deltaX));
  studioCrop.y = Math.max(0, Math.min(100, cropDrag.cropY - deltaY));
  applyStudioCrop();
}

function endPreviewDrag() {
  if (!cropDrag) return;
  cropDrag = null;
  document.getElementById('studioPreview')?.classList.remove('dragging');
}

function previewUploadedImage(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById('studioImageAssetId').value = '';
  document.getElementById('studioImageUrl').value = '';
  document.getElementById('selectedCharacter').classList.remove('active');
  setPreviewImage(url, file.name);
}

function previewUploadedVideo(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  setPreviewVideo(url, file.name);
}

function resetStudioForm() {
  document.getElementById('studioForm').reset();
  document.getElementById('studioImageName').textContent = '';
  document.getElementById('studioVideoName').textContent = '';
  document.getElementById('studioAudioName').textContent = '';
  const voiceSampleName = document.getElementById('studioVoiceSampleName');
  if (voiceSampleName) voiceSampleName.textContent = '';
  previewAudioAsset = null;
  document.getElementById('studioVoicePreview').style.display = 'none';
  setVoicePreviewLoading(false);
  clearSelectedCharacter();
  resetPreview();
  setCreateType('shorts');
}

function setVoicePreviewLoading(isLoading, provider = 'voice') {
  const panel = document.getElementById('studioVoicePreview');
  const loader = document.getElementById('studioVoicePreviewLoading');
  const audio = document.getElementById('studioVoicePreviewAudio');
  const title = document.getElementById('studioVoicePreviewTitle');
  const loadingTitle = document.getElementById('studioVoiceLoadingTitle');
  const loadingHint = document.getElementById('studioVoiceLoadingHint');
  const timer = document.getElementById('studioVoiceLoadingTimer');
  if (!panel || !loader || !audio) return;
  clearInterval(voicePreviewTimer);
  voicePreviewTimer = null;
  if (!isLoading) {
    loader.style.display = 'none';
    audio.style.display = '';
    return;
  }
  panel.style.display = '';
  title.textContent = 'Creating preview';
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  audio.style.display = 'none';
  loader.style.display = '';
  loadingTitle.textContent = `Generating ${provider} voice preview`;
  loadingHint.textContent = 'This can take a little bit while the voice endpoint starts and renders the audio.';
  const started = Date.now();
  timer.textContent = '0s elapsed';
  voicePreviewTimer = setInterval(() => {
    timer.textContent = `${Math.max(1, Math.round((Date.now() - started) / 1000))}s elapsed`;
  }, 1000);
}

async function startRunPod() {
  try {
    toast('Starting RunPod...', 'info');
    setChip('runpodStatus', 'Starting', 'warn');
    document.getElementById('migratePodButton').style.display = 'none';
    await api('/api/studio/runpod/start', { method: 'POST' });
    toast('RunPod start requested. It may take a few minutes to become ready.', 'success');
    setTimeout(loadStudioStatus, 8000);
  } catch (error) {
    if (/not enough free GPUs|host machine/i.test(error.message || '')) {
      document.getElementById('migratePodButton').style.display = '';
      setChip('runpodStatus', 'Migrate needed', 'red');
      toast('RunPod cannot restart on that host. Use Migrate pod, then update the Comfy URL if RunPod assigns a new pod URL.', 'error');
      return;
    }
    toast(error.message, 'error');
  }
}

async function stopRunPod() {
  if (!confirm('Stop the RunPod now? Any active generation may fail.')) return;
  try {
    toast('Stopping RunPod...', 'info');
    setChip('runpodStatus', 'Stopping', 'warn');
    await api('/api/studio/runpod/stop', { method: 'POST' });
    toast('RunPod stop requested.', 'success');
    setTimeout(loadStudioStatus, 8000);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function submitStudioVideo(e) {
  e.preventDefault();
  const form = document.getElementById('studioForm');
  const mode = document.getElementById('studioMode').value;
  if (mode === 'audio') return submitAudioOnly(form);

  const data = new FormData(form);
  data.append('clientJobId', crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const videoEngine = document.getElementById('studioVideoEngine')?.value || 'wan-comfy';

  if (mode === 'i2v' && !document.getElementById('studioImage').files[0] && !document.getElementById('studioImageAssetId').value && !document.getElementById('studioImageUrl').value) return toast('Upload a portrait image or select a saved character first.', 'error');
  if (mode === 'v2v' && !document.getElementById('studioVideo').files[0]) return toast('Upload a source video first.', 'error');
  const serverlessVideoEngines = ['meigen', 'infinitetalk-hd', 'musetalk', 'wan22-serverless', 'wan-animate', 'seedance2-fast', 'seedance2-standard'];
  const engineNeedsAudio = !['wan22-serverless', 'wan-animate', 'seedance2-fast', 'seedance2-standard'].includes(videoEngine);
  if (engineNeedsAudio && document.getElementById('studioAudioProvider').value === 'upload' && !document.getElementById('studioAudio').files[0]) return toast('Upload an audio file first.', 'error');
  if (engineNeedsAudio && document.getElementById('studioAudioProvider').value === 'asset' && !document.getElementById('studioAudioAssetId').value) return toast('Choose saved audio first.', 'error');
  if (engineNeedsAudio && document.getElementById('studioAudioProvider').value === 'elevenlabs' && !document.getElementById('studioScript').value.trim()) return toast('Paste a script for ElevenLabs audio.', 'error');
  if (engineNeedsAudio && document.getElementById('studioAudioProvider').value === 'vibevoice' && !document.getElementById('studioScript').value.trim()) return toast('Paste a script for VibeVoice audio.', 'error');
  if (engineNeedsAudio && document.getElementById('studioAudioProvider').value === 'chatterbox' && !document.getElementById('studioScript').value.trim()) return toast('Paste a script for Chatterbox audio.', 'error');
  if (serverlessVideoEngines.includes(videoEngine) && mode !== 'i2v') return toast('Serverless video engines are available in Image to video mode right now.', 'error');
  if (videoEngine === 'wan-animate' && !document.getElementById('studioReferenceVideo').files[0] && !document.getElementById('studioReferenceVideoUrl').value.trim() && !document.getElementById('studioRemixSourceUrl').value.trim()) {
    return toast('Wan Animate needs a reference motion video upload or URL.', 'error');
  }
  if (!confirm('Video generation starts immediately and uses processing time. Make sure your audio and visual are final before continuing.')) return;

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Queuing video...';
  startGenerationOverlay({ engine: videoEngine, mode });
  try {
    toast(serverlessVideoEngines.includes(videoEngine) ? `Generating with ${getStudioEngineName(videoEngine)}...` : 'Queuing video. If the RunPod is asleep, Bloom Studio will wake it first.', 'info');
    toast('You can navigate away from this page or keep using the app. I will notify you with a popup and sound when it finishes.', 'info');
    const result = await api('/api/studio/generate', { method: 'POST', body: data });
    studioJobs.unshift(result.job);
    await loadAssets();
    await loadVideos();
    if (result.background) {
      toast(`${getStudioEngineName(videoEngine)} started. A processing card is in Library now.`, 'info');
      const jobKey = result.job?.requestId || result.job?.jobId || '';
      setBackgroundGenerationOverlay({ engine: videoEngine, mode, jobKey });
    } else {
      toast(serverlessVideoEngines.includes(videoEngine) ? `${getStudioEngineName(videoEngine)} video generated and saved to Library.` : 'Video job queued.', 'success');
      stopGenerationOverlay({ success: true });
    }
  } catch (err) {
    stopGenerationOverlay();
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '▶ Generate video';
  }
}

function getStudioEngineName(engine) {
  if (engine === 'seedance2-fast') return 'Seedance 1.5';
  if (engine === 'seedance2-standard') return 'Seedance fixed camera';
  if (engine === 'infinitetalk-hd') return 'InfiniteTalk HD';
  if (engine === 'musetalk') return 'MuseTalk';
  if (engine === 'meigen') return 'Meigen';
  if (engine === 'wan22-serverless') return 'Wan 2.2 Serverless';
  if (engine === 'wan-animate') return 'Wan Animate';
  return 'WAN ComfyUI';
}

async function submitAudioOnly(form) {
  const provider = document.getElementById('studioAudioProvider').value;
  if (provider === 'qwen') return toast('Qwen audio is not wired yet. Use VibeVoice or ElevenLabs for now.', 'error');
  if (!['vibevoice', 'chatterbox', 'elevenlabs'].includes(provider)) return toast('Choose VibeVoice or ElevenLabs to generate audio from script.', 'error');
  if (!document.getElementById('studioScript').value.trim()) return toast('Paste a script first.', 'error');
  if (provider === 'vibevoice') return previewVibeVoice(true);
  return provider === 'elevenlabs' ? previewElevenLabsVoice(true) : previewChatterboxVoice(true);
}

function previewCurrentVoice() {
  const provider = document.getElementById('studioAudioProvider').value;
  if (provider === 'elevenlabs') return previewElevenLabsVoice(false);
  if (provider === 'vibevoice') return previewVibeVoice(false);
  if (provider === 'chatterbox') return previewChatterboxVoice(false);
  return toast('Choose VibeVoice or ElevenLabs to preview a generated voice.', 'error');
}

function selectedChatterboxVoice() {
  return document.getElementById('studioChatterboxVoice')?.value || 'default';
}

function updateChatterboxVoiceLabel() {
  const voice = selectedChatterboxVoice();
  const label = `${voice[0].toUpperCase()}${voice.slice(1)}`;
  const name = document.getElementById('chatterboxVoiceName');
  if (name) name.textContent = label;
  const hint = document.getElementById('chatterboxSampleHint');
  if (hint) hint.textContent = `${label} is selected. Play the cached sample if you want to audition it.`;
}

async function playCachedChatterboxVoiceSample() {
  if (document.getElementById('studioAudioProvider')?.value === 'vibevoice') {
    return toast('VibeVoice samples come from the configured endpoint. Use Preview script with VibeVoice.', 'info');
  }
  const voice = selectedChatterboxVoice();
  const hint = document.getElementById('chatterboxSampleHint');
  const audio = document.getElementById('chatterboxSampleAudio');
  if (!audio) return;
  const url = `/api/tts/chatterbox/sample/${encodeURIComponent(voice)}`;
  const label = `${voice[0].toUpperCase()}${voice.slice(1)}`;
  const name = document.getElementById('chatterboxVoiceName');
  if (name) name.textContent = label;
  try {
    audio.src = await playableMediaUrl(url);
    audio.style.display = '';
    await audio.play().catch(() => {});
    if (hint) hint.textContent = `Playing cached ${label} sample. No RunPod call used.`;
  } catch (error) {
    if (hint) hint.textContent = 'Could not play cached sample.';
    toast(`Could not play sample: ${error.message}`, 'error');
  }
}

function nextChatterboxVoice() {
  const select = document.getElementById('studioChatterboxVoice');
  if (!select?.options?.length) return;
  select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
  updateChatterboxVoiceLabel();
  if (document.getElementById('studioAudioProvider')?.value === 'chatterbox') playCachedChatterboxVoiceSample();
}

async function previewVibeVoice(saveOnly = false) {
  const writtenScript = document.getElementById('studioScript').value.trim();
  const script = writtenScript || 'Hi, I am previewing VibeVoice so you can hear the tone before choosing it for your video.';
  const button = document.getElementById('studioPreviewVoiceButton');
  if (button) {
    button.disabled = true;
    button.textContent = 'Creating preview...';
  }
  setVoicePreviewLoading(true, 'VibeVoice');
  try {
    const data = new FormData();
    data.append('script', script);
    data.append('voice', document.getElementById('studioChatterboxVoice').value);
    data.append('format', document.getElementById('studioChatterboxFormat').value);
    data.append('voiceUrl', document.getElementById('studioChatterboxVoiceUrl').value.trim());
    data.append('name', `${writtenScript ? 'VibeVoice voiceover' : 'VibeVoice sample'} ${new Date().toLocaleString()}`);
    const sample = document.getElementById('studioVoiceSample')?.files?.[0];
    if (sample) data.append('voiceSample', sample);
    const response = await api('/api/tts/vibevoice', { method: 'POST', body: data });
    previewAudioAsset = response.result?.asset || null;
    const url = response.result?.asset?.files?.[0]?.path || response.result?.audioUrl;
    if (!url) throw new Error('VibeVoice did not return audio.');
    setVoicePreviewLoading(false);
    document.getElementById('studioVoicePreview').style.display = '';
    document.getElementById('studioVoicePreviewTitle').textContent = saveOnly ? 'Audio generated and saved' : writtenScript ? 'VibeVoice preview saved' : 'VibeVoice sample saved';
    document.getElementById('studioVoicePreviewAudio').src = await playableMediaUrl(url);
    toast('VibeVoice generated and saved to audio Library.', 'success');
    await loadAssets();
  } catch (error) {
    setVoicePreviewLoading(false);
    toast(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Preview script with VibeVoice';
    }
  }
}

async function previewChatterboxVoice(saveOnly = false) {
  const writtenScript = document.getElementById('studioScript').value.trim();
  const script = writtenScript || 'Hi, I am previewing this voice so you can hear the tone before choosing it for your video.';
  const button = document.getElementById('studioPreviewVoiceButton');
  if (button) {
    button.disabled = true;
    button.textContent = 'Creating preview...';
  }
  setVoicePreviewLoading(true, 'Chatterbox');
  try {
    const data = new FormData();
    data.append('script', script);
    data.append('voice', document.getElementById('studioChatterboxVoice').value);
    data.append('format', document.getElementById('studioChatterboxFormat').value);
    data.append('voiceUrl', document.getElementById('studioChatterboxVoiceUrl').value.trim());
    data.append('name', `${writtenScript ? 'Voiceover' : 'Voice sample'} ${new Date().toLocaleString()}`);
    const sample = document.getElementById('studioVoiceSample')?.files?.[0];
    if (sample) data.append('voiceSample', sample);
    const response = await api('/api/tts/chatterbox', { method: 'POST', body: data });
    previewAudioAsset = response.result?.asset || null;
    const url = response.result?.asset?.files?.[0]?.path || response.result?.audioUrl;
    if (!url) throw new Error('Chatterbox did not return audio.');
    setVoicePreviewLoading(false);
    document.getElementById('studioVoicePreview').style.display = '';
    document.getElementById('studioVoicePreviewTitle').textContent = saveOnly ? 'Audio generated and saved' : writtenScript ? 'Voice preview saved' : 'Voice sample preview saved';
    document.getElementById('studioVoicePreviewAudio').src = await playableMediaUrl(url);
    toast('Voiceover generated and saved to audio Library.', 'success');
    await loadAssets();
  } catch (error) {
    setVoicePreviewLoading(false);
    toast(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Preview script with Chatterbox';
    }
  }
}

async function previewElevenLabsVoice(saveOnly = false) {
  const writtenScript = document.getElementById('studioScript').value.trim();
  const script = writtenScript || 'Hi, I am previewing this voice so you can hear the tone before choosing it for your video.';
  const button = document.getElementById('studioPreviewVoiceButton');
  if (button) {
    button.disabled = true;
    button.textContent = 'Creating preview...';
  }
  setVoicePreviewLoading(true, 'ElevenLabs');
  try {
    const response = await api('/api/tts/elevenlabs', {
      method: 'POST',
      body: JSON.stringify({
        script,
        voiceId: document.getElementById('studioVoiceId').value.trim(),
        name: `${writtenScript ? 'Voiceover' : 'Voice sample'} ${new Date().toLocaleString()}`
      })
    });
    previewAudioAsset = response.result?.asset || null;
    const url = response.result?.asset?.files?.[0]?.path;
    if (!url) throw new Error('ElevenLabs did not return saved audio.');
    setVoicePreviewLoading(false);
    document.getElementById('studioVoicePreview').style.display = '';
    document.getElementById('studioVoicePreviewTitle').textContent = saveOnly ? 'Audio generated and saved' : writtenScript ? 'Voice preview saved' : 'Voice sample preview saved';
    document.getElementById('studioVoicePreviewAudio').src = await playableMediaUrl(url);
    toast('Voiceover generated and saved to audio Library.', 'success');
    await loadAssets();
  } catch (error) {
    setVoicePreviewLoading(false);
    toast(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Preview script with ElevenLabs';
    }
  }
}

function usePreviewAudioForVideo() {
  if (!previewAudioAsset?.slug) return toast('Generate a voice preview first.', 'error');
  document.getElementById('studioAudioProvider').value = 'asset';
  setStudioAudio('asset');
  document.getElementById('studioAudioAssetId').value = previewAudioAsset.slug;
  if (document.getElementById('studioMode').value === 'audio') setStudioMode('i2v');
  toast('Preview audio selected for video.', 'success');
}

async function loadAssets() {
  const [data, ugcData] = await Promise.all([
    api('/api/assets'),
    api('/api/characters').catch(() => ({ characters: [] }))
  ]);
  assetsCache = data;
  // Map Supabase ugc_characters into the same shape as subjects
  ugcCharactersCache = (ugcData.characters || []).map(c => ({
    slug: c.slug,
    name: c.name,
    imageUrl: c.image_url,
    role: [c.age_group, c.gender].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' · '),
    _isUgc: true,
    _ageGroup: c.age_group,
    _gender: c.gender
  }));
  renderAssetGrid('productGrid', data.products || [], 'products');
  renderAssetGrid('generatedImageGrid', data.outputs || [], 'outputs');
  setLibraryImageRatio(currentLibraryImageRatio);
  renderAgentLibrary();
  renderMyAgents(data.subjects || []);
  renderAssetGrid('audioGrid', data.audio || [], 'audio');
  const studioAudioSelect = document.getElementById('studioAudioAssetId');
  if (studioAudioSelect) {
    const current = studioAudioSelect.value;
    studioAudioSelect.innerHTML = '<option value="">Choose saved audio</option>' + (data.audio || []).map(a => `<option value="${a.slug}">${a.name}</option>`).join('');
    studioAudioSelect.value = current;
  }
  renderProductPlacementPickers(data);
  if (document.getElementById('tab-studio')?.dataset.createTool === 'campaign') {
    renderCampaignBuilder(data);
  }
}

function setCharacterTab(tab) {
  currentCharacterTab = tab;
  document.querySelectorAll('[data-character-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.characterTab === tab));
  const library = document.getElementById('agentLibraryGrid');
  const mine = document.getElementById('myAgentsGrid');
  if (library) library.style.display = tab === 'library' ? '' : 'none';
  if (mine) mine.style.display = tab === 'mine' ? '' : 'none';
}

function setCharacterRatio(ratio) {
  currentCharacterRatio = ratio;
  document.querySelectorAll('[data-character-ratio]').forEach(btn => btn.classList.toggle('active', btn.dataset.characterRatio === ratio));
  document.querySelectorAll('.character-grid').forEach(grid => grid.classList.toggle('landscape', ratio === 'landscape'));
}

function setLibraryVideoRatio(ratio) {
  currentLibraryVideoRatio = ratio;
  document.querySelectorAll('[data-video-ratio]').forEach(btn => btn.classList.toggle('active', btn.dataset.videoRatio === ratio));
  const grid = document.getElementById('videoGrid');
  if (grid) grid.classList.toggle('landscape', ratio === 'landscape');
}

function setLibraryImageRatio(ratio) {
  currentLibraryImageRatio = ratio;
  document.querySelectorAll('[data-image-ratio]').forEach(btn => btn.classList.toggle('active', btn.dataset.imageRatio === ratio));
  const grid = document.getElementById('generatedImageGrid');
  if (grid) grid.classList.toggle('landscape', ratio === 'landscape');
}

function renderAgentLibrary() {
  const grid = document.getElementById('agentLibraryGrid');
  if (!grid) return;
  grid.classList.toggle('landscape', currentCharacterRatio === 'landscape');
  // Character library = hardcoded professional personas + global Supabase UGC characters
  const starterSlugs = new Set(starterCharacters.map(c => c.slug));
  const ugcToShow = ugcCharactersCache.filter(c => !starterSlugs.has(c.slug));
  const allLibrary = [...starterCharacters.map(c => ({ ...c, _isLibrary: true })), ...ugcToShow];
  grid.innerHTML = allLibrary.map(character => renderCharacterCard(character, !character._isUgc)).join('');
}

function renderMyAgents(characters) {
  const grid = document.getElementById('myAgentsGrid');
  if (!grid) return;
  grid.classList.toggle('landscape', currentCharacterRatio === 'landscape');
  // My characters = only this user's own uploaded subjects (no global UGC merge)
  const mine = characters || [];
  if (!mine.length) {
    grid.innerHTML = '<div class="character-empty">No personal characters yet. Click + New character to upload your own spokesperson portrait.</div>';
    return;
  }
  grid.innerHTML = mine.map(character => renderCharacterCard(character, false)).join('');
}

function openCharacterPickerModal(context = 'video') {
  characterPickerContext = context;
  const modal = document.getElementById('characterPickerModal');
  if (!modal) return showAgentModal();
  currentCharacterPickerTab = currentCharacterPickerTab || 'all';
  renderCharacterPickerModal();
  modal.classList.add('active');
}

function openProductCharacterPickerModal() {
  openCharacterPickerModal('productPlacement');
}

function closeCharacterPickerModal() {
  document.getElementById('characterPickerModal')?.classList.remove('active');
}

function setCharacterPickerTab(tab = 'all') {
  currentCharacterPickerTab = tab;
  document.querySelectorAll('[data-picker-character-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pickerCharacterTab === tab);
  });
  renderCharacterPickerModal();
}

function renderCharacterPickerModal() {
  const grid = document.getElementById('characterPickerGrid');
  if (!grid) return;
  grid.classList.toggle('landscape', currentCharacterRatio === 'landscape');
  // Library = professional personas + global UGC characters
  const starterSlugs = new Set(starterCharacters.map(c => c.slug));
  const ugcLibrary = ugcCharactersCache.filter(c => !starterSlugs.has(c.slug));
  const libraryCharacters = [
    ...starterCharacters.map(c => ({ ...c, _isLibrary: true })),
    ...ugcLibrary
  ];
  // My characters = only personally uploaded subjects
  const myCharacters = (assetsCache.subjects || []).map(c => ({ ...c, _isLibrary: false }));
  const characters = currentCharacterPickerTab === 'library'
    ? libraryCharacters
    : currentCharacterPickerTab === 'mine'
      ? myCharacters
      : [...libraryCharacters, ...myCharacters];
  if (!characters.length) {
    grid.innerHTML = '<div class="character-empty">No characters yet. Upload a character or use one from the library.</div>';
    return;
  }
  // In picker modal, UGC chars select directly (don't open drawer)
  grid.innerHTML = characters.map(character => renderCharacterCard(character, character._isLibrary !== false, true)).join('');
}

// Global slug→character map so onclick handlers never embed serialized JSON.
// Slugs are alphanumeric+hyphen so safe in HTML attribute values.
const __charMap = {};

function renderCharacterCard(character, isLibrary, pickerMode = false) {
  const slug = character.slug || '';
  __charMap[slug] = character; // register / update

  const file = character.files?.[0];
  const imageUrl = character.imageUrl || file?.path || '';
  const displayUrl = authenticatedMediaUrl(imageUrl);
  const voice = getCharacterVoiceId(character) || character.voiceSampleAssetId ? 'Voice saved' : isLibrary ? character.role : (character._isUgc ? character.role : 'No default voice');
  const ugcBadge = character._isUgc ? '<div class="character-ugc-badge">UGC</div>' : '';
  const looksCount = (character._looks || []).length + 1;
  const looksBadge = `<div class="character-looks-badge">${looksCount} look${looksCount !== 1 ? 's' : ''}</div>`;
  const manage = isLibrary || character._isUgc
    ? ''
    : `<button class="btn btn-secondary" onclick="event.stopPropagation();editCharacterVoice('${slug}', '${(character.voiceId || '').replace(/'/g, "\\'")}')">Voice</button>
       <button class="btn btn-secondary" onclick="event.stopPropagation();deleteAsset('subjects','${slug}')">Delete</button>`;

  // Library-page UGC chars open the detail drawer; picker modal + starter chars select directly
  const openDrawer = !pickerMode && !!character._isUgc;
  const cardClick  = openDrawer ? `openCharDrawerBySlug('${slug}')` : `selectCharacterBySlug('${slug}')`;
  const useClick   = openDrawer ? `openCharDrawerBySlug('${slug}')` : `selectCharacterBySlug('${slug}')`;

  return `<div class="character-card" data-char-slug="${slug}" onclick="${cardClick}">
    <img src="${displayUrl}" alt="${escapeHtml(character.name)}" loading="lazy">
    ${ugcBadge}
    ${looksBadge}
    <div class="character-menu">&#8943;</div>
    <div class="character-overlay">
      <div class="character-title">${escapeHtml(character.name)}</div>
      <div class="character-meta">${escapeHtml(character.role || voice)}</div>
      <div class="character-actions">
        <button class="btn btn-primary" onclick="event.stopPropagation();${useClick}">Use</button>
        ${manage}
      </div>
    </div>
  </div>`;
}

function selectCharacterBySlug(slug) {
  const character = __charMap[slug];
  if (!character) return;
  if (characterPickerContext === 'productPlacement') {
    selectProductPlacementCharacter(character);
    closeCharacterPickerModal();
    characterPickerContext = 'video';
  } else if (characterPickerContext === 'addLook') {
    confirmAddLookToCharacter(character);
    closeCharacterPickerModal();
    characterPickerContext = 'video';
  } else {
    selectCharacter(character);
  }
}

function openCharDrawerBySlug(slug) {
  const character = __charMap[slug];
  if (character) openCharDrawer(character);
}

function getCharacterVoiceId(character = {}) {
  if (character.voiceId) return character.voiceId;
  const name = `${character.name || ''} ${character.slug || ''}`.toLowerCase();
  if (/\bsarah\b/.test(name)) return defaultCharacterVoiceIds.sarah;
  if (/\bmarcus\b/.test(name)) return defaultCharacterVoiceIds.marcus;
  return '';
}

function applyCharacterAudioDefaults(character = {}) {
  const voiceId = getCharacterVoiceId(character);
  const voiceIdInput = document.getElementById('studioVoiceId');
  const chatterboxUrlInput = document.getElementById('studioChatterboxVoiceUrl');
  const currentProvider = document.getElementById('studioAudioProvider')?.value || '';
  const existingVoiceId = voiceIdInput?.value.trim() || '';
  if (existingVoiceId && currentProvider === 'elevenlabs') {
    setStudioAudio('elevenlabs', { preserveToast: true });
    return 'elevenlabs';
  }
  if (voiceIdInput) voiceIdInput.value = voiceId || '';
  if (chatterboxUrlInput && !character.voiceSampleAssetId) chatterboxUrlInput.value = '';

  if (voiceId) {
    setStudioAudio('elevenlabs', { preserveToast: true });
    return 'elevenlabs';
  }
  if (character.voiceSampleAssetId) {
    setStudioAudio('vibevoice', { preserveToast: true });
    hydrateChatterboxVoiceUrl(character.voiceSampleAssetId);
    return 'vibevoice';
  }
  setStudioAudio('upload', { preserveToast: true });
  return 'upload';
}

// Show create-type picker only when not already inside a specific Create tool
function selectCharacter(character) {
  selectedCharacter = character;
  const studioTab = document.getElementById('tab-studio');
  const isStudioActive = studioTab?.classList.contains('active');
  const currentTool = studioTab?.dataset.createTool;
  if (isStudioActive && currentTool === 'video') {
    _applyCharacterToCreate(character, 'video');
    return;
  }
  if (isStudioActive && currentTool === 'image') {
    _applyCharacterToCreate(character, 'image');
    return;
  }
  const overlay = document.getElementById('charCreatePickerOverlay');
  if (overlay) {
    overlay.classList.add('active');
  } else {
    _applyCharacterToCreate(character, 'video');
  }
}

function closeCharCreatePicker() {
  document.getElementById('charCreatePickerOverlay')?.classList.remove('active');
}

function confirmCharCreate(type) {
  closeCharCreatePicker();
  closeCharDrawer();
  _applyCharacterToCreate(selectedCharacter, type);
}

function _applyCharacterToCreate(character, type) {
  if (!character) return;
  const file = character.files?.[0];
  const imageUrl = character.imageUrl || file?.path || '';
  const isLibrary = character.slug?.startsWith('library-') || !!character._isUgc;
  document.getElementById('studioImageAssetId').value = isLibrary ? '' : character.slug;
  document.getElementById('studioImageUrl').value = isLibrary ? imageUrl : '';
  document.getElementById('studioImage').value = '';
  document.getElementById('studioImageName').textContent = '';
  const selectedName = document.getElementById('selectedCharacterName');
  const selectedImg = document.getElementById('selectedCharacterImg');
  const selectedCard = document.getElementById('selectedCharacter');
  if (selectedName) selectedName.textContent = character.name;
  if (selectedImg) {
    selectedImg.src = authenticatedMediaUrl(imageUrl);
    selectedImg.alt = character.name || 'Selected character';
  }
  selectedCard?.classList.add('active');
  closeCharacterPickerModal();
  if (type === 'image') {
    switchTab('studio');
    setCreateTool('image');
    selectProductPlacementCharacter(character);
    toast(`${character.name} ready — pick a product and generate a composite image.`, 'success');
  } else {
    setStudioMode('i2v');
    applyCharacterAudioDefaults(character);
    switchTab('studio');
    setCreateTool('video');
    toast(`${character.name} loaded into Create.`, 'success');
  }
  setPreviewImage(imageUrl, character.name);
}

async function hydrateChatterboxVoiceUrl(audioAssetId) {
  try {
    const data = await api(`/api/assets/audio/${audioAssetId}/temp-url`, { method: 'POST' });
    const input = document.getElementById('studioChatterboxVoiceUrl');
    if (input) input.value = data.url;
    toast('Default VibeVoice reference URL loaded for this character.', 'success');
  } catch (error) {
    toast(`Could not load character voice sample: ${error.message}`, 'error');
  }
}

function renderProductPlacementPickers(data = {}) {
  renderProductCharacterPicker([...(starterCharacters || []), ...(data.subjects || [])]);
  renderProductAssetPicker(data.products || []);
}

function renderProductCharacterPicker(characters) {
  const grid = document.getElementById('productCharacterGrid');
  if (!grid) return;
  grid.innerHTML = characters.map(character => {
    const file = character.files?.[0];
    const imageUrl = character.imageUrl || file?.path || '';
    const displayUrl = authenticatedMediaUrl(imageUrl);
    const payload = JSON.stringify({ ...character, imageUrl }).replace(/'/g, '&apos;');
    return `<div class="mini-pick" onclick='selectProductPlacementCharacter(${payload})'>
      <img src="${displayUrl}" alt="${character.name}" loading="lazy">
      <span>${character.name}</span>
    </div>`;
  }).join('');
}

function renderProductAssetPicker(products) {
  const grid = document.getElementById('productAssetGrid');
  if (!grid) return;
  if (!products.length) {
    grid.innerHTML = '<div class="character-empty">No product assets yet. Upload a product image to use it here.</div>';
    return;
  }
  grid.innerHTML = products.map(product => {
    const file = product.files?.[0];
    const imageUrl = file?.path || '';
    const displayUrl = authenticatedMediaUrl(imageUrl);
    const payload = JSON.stringify({ ...product, imageUrl }).replace(/'/g, '&apos;');
    return `<div class="mini-pick" onclick='selectProductPlacementProduct(${payload})'>
      <img src="${displayUrl}" alt="${product.name}" loading="lazy">
      <span>${product.name}</span>
    </div>`;
  }).join('');
}

function selectProductPlacementCharacter(character) {
  const file = character.files?.[0];
  const imageUrl = character.imageUrl || file?.path || '';
  const isLibrary = character.slug?.startsWith('library-') || !!character._isUgc;
  productPlacementCharacter = {
    slug: character.slug,
    name: character.name,
    imageUrl,
    assetId: isLibrary ? '' : character.slug,
    file: null
  };
  document.getElementById('productCharacterName').textContent = character.name;
  document.getElementById('productCharacterPreview').innerHTML = `<img src="${authenticatedMediaUrl(imageUrl)}" alt="${character.name}">`;
}

function selectProductPlacementProduct(product) {
  const file = product.files?.[0];
  const imageUrl = product.imageUrl || file?.path || '';
  addProductPlacementReference({
    slug: product.slug,
    name: product.name,
    imageUrl,
    assetId: product.slug,
    file: null
  });
}

function previewProductPlacementUpload(type, file) {
  if (!file) return;
  if (type === 'character') {
    const url = URL.createObjectURL(file);
    productPlacementCharacter = { name: file.name, imageUrl: url, assetId: '', file };
    document.getElementById('productCharacterName').textContent = file.name;
    document.getElementById('productCharacterPreview').innerHTML = `<img src="${url}" alt="${file.name}">`;
  } else {
    const files = Array.from(file instanceof FileList ? file : [file]).slice(0, 5 - productPlacementReferences.length);
    files.forEach(item => addProductPlacementReference({
      name: item.name,
      imageUrl: URL.createObjectURL(item),
      assetId: '',
      file: item
    }));
  }
}

function addProductPlacementReference(reference) {
  if (!reference?.imageUrl && !reference?.file && !reference?.assetId) return;
  if (productPlacementReferences.length >= 5) {
    toast('You can use up to 5 reference images for one composite.', 'error');
    return;
  }
  const key = reference.assetId || reference.imageUrl || reference.name;
  if (key && productPlacementReferences.some(item => (item.assetId || item.imageUrl || item.name) === key)) {
    toast('That reference is already selected.', 'info');
    return;
  }
  productPlacementReferences.push(reference);
  productPlacementProduct = productPlacementReferences[0] || null;
  renderProductPlacementReferences();
}

function removeProductPlacementReference(index) {
  productPlacementReferences.splice(index, 1);
  productPlacementProduct = productPlacementReferences[0] || null;
  renderProductPlacementReferences();
}

function renderProductPlacementReferences() {
  const strip = document.getElementById('productReferenceStrip');
  const name = document.getElementById('productImageName');
  const preview = document.getElementById('productImagePreview');
  if (name) name.textContent = `${productPlacementReferences.length} reference image${productPlacementReferences.length === 1 ? '' : 's'} selected`;
  if (preview) {
    preview.innerHTML = productPlacementReferences[0]
      ? `<img src="${authenticatedMediaUrl(productPlacementReferences[0].imageUrl)}" alt="${productPlacementReferences[0].name || 'Reference image'}">`
      : 'Optional references';
  }
  if (!strip) return;
  strip.innerHTML = productPlacementReferences.map((reference, index) => `
    <div class="reference-chip">
      <img src="${authenticatedMediaUrl(reference.imageUrl)}" alt="${reference.name || `Reference ${index + 1}`}">
      <button type="button" onclick="removeProductPlacementReference(${index})" aria-label="Remove reference">×</button>
    </div>
  `).join('');
}

async function loadProductPlacementStatus() {
  try {
    const status = await api('/api/product-placement/status');
    setChip('nanoStatus', status.configured ? 'Image ready' : 'Needs key', status.configured ? 'green' : 'warn');
    const note = document.getElementById('nanoEndpointNote');
    if (note) note.textContent = status.configured
      ? `Image generation is configured. RunPod endpoint: ${status.endpointId || 'not shown'}. OpenRouter models use OPENROUTER_API_KEY.`
      : 'Add the image generation keys/endpoints on Railway before generation.';
    updateProductPlacementModelCopy();
  } catch (error) {
    setChip('nanoStatus', 'Endpoint error', 'red');
  }
}

function getProductPlacementModelLabel() {
  const select = document.getElementById('productPlacementModel');
  const selected = select?.selectedOptions?.[0];
  return (selected?.textContent || 'selected image model').replace(/\s+-\s+/g, ' ').trim();
}

function updateProductPlacementModelCopy() {
  const button = document.getElementById('productGenerateButton');
  if (button && !button.disabled) button.textContent = 'Generate image';
  const note = document.getElementById('nanoEndpointNote');
  if (note) note.dataset.selectedModel = getProductPlacementModelLabel();
}

function resetProductPlacement() {
  if (productPlacementRequest) {
    productPlacementRequest.abort();
    productPlacementRequest = null;
    productPlacementTimedOut = false;
  }
  productPlacementCharacter = null;
  productPlacementProduct = null;
  productPlacementReferences = [];
  latestProductPlacementImage = '';
  latestProductPlacementPrompt = '';
  latestProductPlacementAspectRatio = '9:16';
  latestProductPlacementSize = '1k';
  document.getElementById('productCharacterName').textContent = 'No primary image selected';
  document.getElementById('productImageName').textContent = '0 reference images selected';
  document.getElementById('productCharacterPreview').textContent = 'Optional primary image';
  document.getElementById('productImagePreview').textContent = 'Optional references';
  renderProductPlacementReferences();
  document.getElementById('productCharacterUpload').value = '';
  document.getElementById('productImageUpload').value = '';
  document.getElementById('productPlacementResult').innerHTML = '<div><strong>Preview idle</strong><p class="hint">Enter a prompt, then optionally attach references.</p></div>';
  document.getElementById('productResultActions').style.display = 'none';
  const editInstruction = document.getElementById('productPlacementEditInstruction');
  if (editInstruction) editInstruction.value = '';
  const button = document.getElementById('productGenerateButton');
  if (button) {
    button.disabled = false;
    button.textContent = 'Generate image';
  }
}

async function generateProductPlacement() {
  const prompt = document.getElementById('productPlacementPrompt').value.trim();
  if (!prompt && !productPlacementCharacter && !productPlacementReferences.length) return toast('Add a prompt or at least one reference image first.', 'error');
  const button = document.getElementById('productGenerateButton');
  const resultFrame = document.getElementById('productPlacementResult');
  const aspectRatio = document.getElementById('productPlacementAspect').value;
  const size = document.getElementById('productPlacementSize').value;
  const imageModel = document.getElementById('productPlacementModel')?.value || 'runpod:nano-banana';
  const imageModelLabel = getProductPlacementModelLabel();
  resultFrame.style.setProperty('--result-ratio', aspectRatioToCssValue(aspectRatio));
  resultFrame.classList.toggle('ratio-portrait', aspectRatioKind(aspectRatio) === 'portrait');
  if (productPlacementRequest) productPlacementRequest.abort();
  productPlacementTimedOut = false;
  const controller = new AbortController();
  productPlacementRequest = controller;
  const timeoutId = setTimeout(() => {
    productPlacementTimedOut = true;
    controller.abort();
  }, 300000);
  button.disabled = true;
  button.textContent = 'Generating...';
  resultFrame.innerHTML = `<div class="cooking-state"><div class="cooking-orb"></div><strong>Generating with ${escapeHtml(imageModelLabel)}</strong><p class="hint">Uploading public references and waiting for the image result.</p><div class="cooking-steps">Large edits can take several minutes.</div></div>`;
  try {
    const data = new FormData();
    data.append('prompt', prompt);
    data.append('aspectRatio', aspectRatio);
    data.append('size', size);
    data.append('imageModel', imageModel);
    if (productPlacementCharacter?.file) data.append('character', productPlacementCharacter.file);
    else if (productPlacementCharacter?.assetId) data.append('characterAssetId', productPlacementCharacter.assetId);
    else if (productPlacementCharacter?.imageUrl) data.append('characterUrl', productPlacementCharacter.imageUrl);
    productPlacementReferences.forEach(reference => {
      if (reference.file) data.append('references', reference.file);
      else if (reference.assetId) data.append('referenceAssetIds', reference.assetId);
      else if (reference.imageUrl) data.append('referenceUrls', reference.imageUrl);
    });

    const response = await api('/api/product-placement/generate', { method: 'POST', body: data, signal: controller.signal });
    const image = response.result?.image;
    if (image) {
      latestProductPlacementImage = image;
      latestProductPlacementPrompt = prompt;
      latestProductPlacementAspectRatio = aspectRatio;
      latestProductPlacementSize = size;
      resultFrame.innerHTML = `<img src="${image}" alt="Generated product placement">`;
      const link = document.getElementById('productResultDownload');
      link.href = image;
      document.getElementById('productResultActions').style.display = '';
      saveGeneratedImageToLibrary(image, {
        source: response.result?.provider || (imageModel.startsWith('openrouter:') ? 'openrouter' : 'runpod'),
        model: response.result?.model || imageModel.replace(/^openrouter:/, '').replace(/^runpod:/, ''),
        label: imageModelLabel,
        aspectRatio
      });
      toast('Composite image generated.', 'success');
    } else {
      resultFrame.innerHTML = `<div><strong>No image returned</strong><p class="hint">${escapeHtml(imageModelLabel)} completed but the response did not include an image URL.</p></div>`;
      toast(`${imageModelLabel} did not return an image URL.`, 'error');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      resultFrame.innerHTML = productPlacementTimedOut
        ? `<div><strong>Request timed out</strong><p class="hint">${escapeHtml(imageModelLabel)} did not return within 5 minutes. Check the endpoint logs or try again.</p></div>`
        : `<div><strong>Generation stopped</strong><p class="hint">The ${escapeHtml(imageModelLabel)} request was cancelled.</p></div>`;
      toast(productPlacementTimedOut ? `${imageModelLabel} timed out after 5 minutes.` : `${imageModelLabel} generation cancelled.`, productPlacementTimedOut ? 'error' : 'info');
    } else {
      resultFrame.innerHTML = `<div><strong>Generation failed</strong><p class="hint">${escapeHtml(error.message || 'Check endpoint settings or prompt inputs.')}</p></div>`;
      toast(error.message, 'error');
    }
  } finally {
    clearTimeout(timeoutId);
    if (productPlacementRequest === controller) productPlacementRequest = null;
    productPlacementTimedOut = false;
    button.disabled = false;
    button.textContent = 'Generate image';
  }
}

function appendProductPlacementReferences(data, maxCount = 4) {
  let count = 0;
  productPlacementReferences.forEach(reference => {
    if (count >= maxCount) return;
    if (reference.file) data.append('references', reference.file);
    else if (reference.assetId) data.append('referenceAssetIds', reference.assetId);
    else if (reference.imageUrl) data.append('referenceUrls', reference.imageUrl);
    else return;
    count += 1;
  });
}

async function editProductPlacementResult() {
  if (!latestProductPlacementImage) return toast('Generate an image first, then edit that result.', 'error');
  if (!/^https?:\/\//i.test(latestProductPlacementImage)) {
    return toast('This generated image needs a public URL before it can be edited or sent to video.', 'error');
  }
  const instruction = document.getElementById('productPlacementEditInstruction')?.value.trim();
  if (!instruction) return toast('Tell me the small change you want first.', 'error');

  const button = document.getElementById('productPlacementEditButton');
  const resultFrame = document.getElementById('productPlacementResult');
  const originalText = button?.textContent || 'Apply edit';
  const basePrompt = latestProductPlacementPrompt || document.getElementById('productPlacementPrompt').value.trim() || 'Create a polished production-ready image.';
  const aspectRatio = latestProductPlacementAspectRatio || document.getElementById('productPlacementAspect').value || '9:16';
  const size = latestProductPlacementSize || document.getElementById('productPlacementSize').value || '1k';
  const editPrompt = [
    'Edit the provided generated image. Preserve the same identity, composition, lighting, style, framing, and aspect ratio.',
    `Make only this change: ${instruction}`,
    `Original prompt: ${basePrompt}`
  ].join('\n');

  if (button) {
    button.disabled = true;
    button.textContent = 'Applying edit...';
  }
  resultFrame.innerHTML = '<div class="cooking-state"><div class="cooking-orb"></div><strong>Editing current image</strong><p class="hint">Using the generated image as the reference and changing only what you asked for.</p></div>';

  try {
    const data = new FormData();
    data.append('prompt', editPrompt);
    data.append('aspectRatio', aspectRatio);
    data.append('size', size);
    data.append('characterUrl', latestProductPlacementImage);
    appendProductPlacementReferences(data, 4);

    const response = await api('/api/product-placement/generate', { method: 'POST', body: data });
    const image = response.result?.image;
    if (!image) throw new Error('The image endpoint completed but did not return an edited image URL.');

    latestProductPlacementImage = image;
    latestProductPlacementPrompt = `${basePrompt}\nEdit: ${instruction}`;
    latestProductPlacementAspectRatio = aspectRatio;
    latestProductPlacementSize = size;
    resultFrame.innerHTML = `<img src="${image}" alt="Edited product placement">`;
    const link = document.getElementById('productResultDownload');
    link.href = image;
    document.getElementById('productResultActions').style.display = '';
    const editInstruction = document.getElementById('productPlacementEditInstruction');
    if (editInstruction) editInstruction.value = '';
    saveGeneratedImageToLibrary(image, {
      source: response.result?.provider || 'image-model',
      model: response.result?.model || '',
      label: response.result?.model || 'Edited image'
    });
    toast('Image edit applied.', 'success');
  } catch (error) {
    resultFrame.innerHTML = `<div><strong>Edit failed</strong><p class="hint">${escapeHtml(error.message || 'Try a smaller edit or check the image endpoint.')}</p></div>`;
    toast(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function sendLatestImageToVideo() {
  if (!latestProductPlacementImage) return toast('Generate an image first.', 'error');
  if (!/^https?:\/\//i.test(latestProductPlacementImage)) {
    return toast('Image-to-video needs a public image URL. Save this image to Library first, then select it as a character.', 'error');
  }
  switchTab('studio');
  setCreateTool('video');
  setCreateType('scenes', { preserveToast: true });
  setStudioMode('i2v');
  const preferredAspect = latestProductPlacementAspectRatio || document.getElementById('productPlacementAspect')?.value || '9:16';
  const aspectSelect = document.getElementById('studioAspectRatio');
  const engineSelect = document.getElementById('studioVideoEngine');
  if (aspectSelect && [...aspectSelect.options].some(option => option.value === preferredAspect)) {
    aspectSelect.value = preferredAspect;
  }
  if (engineSelect) {
    engineSelect.value = 'seedance2-fast';
    setStudioVideoEngine('seedance2-fast');
  }
  document.getElementById('studioImageAssetId').value = '';
  document.getElementById('studioImageUrl').value = latestProductPlacementImage;
  document.getElementById('studioImage').value = '';
  document.getElementById('studioImageName').textContent = 'Generated image from Create Image';
  document.getElementById('selectedCharacter')?.classList.remove('active');
  setPreviewImage(latestProductPlacementImage, 'Generated image');
  updatePreviewRatio();
  toast('Image moved into B-roll / Scenes. Choose ratio and video model, then generate.', 'success');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function copyFullVideoError(errorKey) {
  const error = videoErrorDetails[errorKey] || '';
  if (!error) return toast('No error details available.', 'error');
  await navigator.clipboard.writeText(error);
  toast('Full error copied.', 'success');
}

async function checkVideoStatus(statusKey) {
  const existing = videoStatusDetails[statusKey];
  if (!existing) return toast('Status details are not available for this card yet.', 'error');
  try {
    await loadVideos({ notify: true });
    const latest = videoStatusDetails[statusKey] || existing;
    const label = latest.status === 'completed'
      ? 'completed and ready'
      : latest.status === 'failed'
        ? 'failed'
        : 'still processing';
    toast(`${getStudioEngineName(latest.provider || latest.presetId)} is ${label}. ${formatElapsedTime(latest.createdAt)}.`, latest.status === 'failed' ? 'error' : latest.status === 'completed' ? 'success' : 'info');
  } catch (error) {
    toast(`Could not refresh status: ${error.message}`, 'error');
  }
}

function handleVideoPreviewError(img, status = 'processing') {
  const wrap = img.closest('.video-thumb-wrap') || img.parentElement;
  if (!wrap) return;
  const failed = status === 'failed';
  wrap.classList.add('failed');
  wrap.innerHTML = `
    <div class="video-player" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px;text-align:center;color:${failed ? 'var(--red)' : '#777'}">
      <strong>${failed ? 'Generation failed' : 'Preview unavailable'}</strong>
      <span style="font-size:12px;line-height:1.35;color:rgba(24,33,45,.72)">The status below is still current. Refresh or check status for the latest result.</span>
    </div>`;
}

function formatElapsedTime(value) {
  const started = value ? new Date(value).getTime() : 0;
  if (!started || Number.isNaN(started)) return 'Just started';
  const seconds = Math.max(0, Math.round((Date.now() - started) / 1000));
  if (seconds < 90) return `${seconds}s elapsed`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m elapsed`;
}

async function saveGeneratedImageToLibrary(imageUrl, metadata = {}) {
  try {
    const prompt = document.getElementById('productPlacementPrompt').value.trim();
    const modelLabel = metadata.label || getProductPlacementModelLabel();
    const source = metadata.model ? `${metadata.source || 'image-model'}:${metadata.model}` : metadata.source || modelLabel;
    await api('/api/assets/generated-image', {
      method: 'POST',
      body: JSON.stringify({
        imageUrl,
        name: `${modelLabel} ${new Date().toLocaleString()}`,
        prompt,
        source,
        aspectRatio: metadata.aspectRatio || latestProductPlacementAspectRatio || document.getElementById('productPlacementAspect')?.value || '9:16'
      })
    });
    loadAssets();
  } catch (error) {
    toast(`Generated image saved for preview, but not Library: ${error.message}`, 'error');
  }
}

async function addLatestImageAsCharacter() {
  if (!latestProductPlacementImage) return toast('Generate an image first.', 'error');
  const name = prompt('Name this new agent:', 'New generated agent');
  if (!name) return;
  const actionButtons = [...document.querySelectorAll('[onclick*="addLatestImageAsCharacter"],[onclick*="addImageUrlAsCharacter"]')];
  actionButtons.forEach(button => {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = 'Adding...';
  });
  try {
    await api('/api/assets/subjects/from-image-url', {
      method: 'POST',
      body: JSON.stringify({ imageUrl: latestProductPlacementImage, name })
    });
    toast('Generated image added to My agents.', 'success');
    await loadAssets();
    returnToCharactersTab();
  } catch (error) {
    toast(`Could not add character: ${error.message}`, 'error');
  } finally {
    actionButtons.forEach(button => {
      button.disabled = false;
      button.textContent = button.dataset.originalText || 'Add as character';
      delete button.dataset.originalText;
    });
  }
}

async function addLatestImageToCharacter() {
  if (!latestProductPlacementImage) return toast('Generate an image first.', 'error');
  openCharacterPickerModal('addLook');
}

async function confirmAddLookToCharacter(character) {
  if (!latestProductPlacementImage) return toast('Generate an image first.', 'error');
  const lookName = prompt(`Name this look for ${character.name}:`, 'Custom look');
  if (!lookName) return;
  try {
    await api('/api/assets/subjects/from-image-url', {
      method: 'POST',
      body: JSON.stringify({
        imageUrl: latestProductPlacementImage,
        name: `${character.name} — ${lookName}`,
        parentCharacterSlug: character.slug
      })
    });
    toast(`Look added to ${character.name}.`, 'success');
    await loadAssets();
  } catch (error) {
    toast(`Could not add look: ${error.message}`, 'error');
  }
}

function clearSelectedCharacter() {
  selectedCharacter = null;
  document.getElementById('studioImageAssetId').value = '';
  document.getElementById('studioImageUrl').value = '';
  document.getElementById('studioVoiceId').value = '';
  const chatterboxUrlInput = document.getElementById('studioChatterboxVoiceUrl');
  if (chatterboxUrlInput) chatterboxUrlInput.value = '';
  document.getElementById('selectedCharacter')?.classList.remove('active');
  setStudioAudio('upload', { preserveToast: true });
  resetPreview();
}

async function editCharacterVoice(slug, currentVoiceId = '') {
  const voiceId = prompt('Default ElevenLabs voice ID for this character:', currentVoiceId || '');
  if (voiceId === null) return;
  await api(`/api/assets/subjects/${slug}`, {
    method: 'PATCH',
    body: JSON.stringify({ voiceId: voiceId.trim() })
  });
  toast('Character voice saved.', 'success');
  loadAssets();
}

function renderAssetGrid(containerId, assets, type) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  assetLightboxItems[type] = assets
    .map(asset => {
      const file = asset.files?.[0];
      if (!file || !/\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)) return null;
      return {
        type: 'image',
        name: asset.name,
        url: authenticatedMediaUrl(file.path),
        rawUrl: file.path,
        prompt: asset.aiContext?.prompt || asset.aiContext?.source || '',
        aspectRatio: asset.aiContext?.aspectRatio || ''
      };
    })
    .filter(Boolean);
  if (type === 'outputs') libraryImageItems = assetLightboxItems[type];
  if (assets.length === 0) {
    grid.innerHTML = `<div class="empty-state">No ${type} uploaded yet</div>`;
    return;
  }

  let imageIndex = -1;
  grid.innerHTML = assets.map(asset => {
    const file = asset.files[0];
    const isImage = file && /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);
    const isAudio = file && /\.(mp3|wav|m4a|ogg|aac)$/i.test(file.name);
    const filePath = file?.path ? authenticatedMediaUrl(file.path) : '';
    const openAttr = isImage ? `onclick="openAssetImageLightbox('${type}',${++imageIndex})"` : '';
    const thumb = isImage
      ? `<div class="asset-thumb"><img src="${filePath}" alt="${asset.name}" loading="lazy"></div>`
      : `<div class="asset-thumb">${isAudio ? 'Audio' : 'File'}</div>`;

    return `<div class="asset-card" ${openAttr}>
      ${thumb}
      <div class="asset-info">
        <div class="asset-name">${asset.name}</div>
        <div class="asset-meta">${file ? formatBytes(file.size) : 'Empty'}</div>
      </div>
      <div class="asset-actions">
        <button class="btn btn-secondary" onclick="event.stopPropagation();viewContext('${type}','${asset.slug}')">Info</button>
        ${type === 'audio' ? `<button class="btn btn-secondary" onclick="event.stopPropagation();copyAudioTempUrl('${asset.slug}')">Voice URL</button>` : ''}
        ${type === 'outputs' && file?.path ? `<button class="btn btn-secondary" onclick="event.stopPropagation();addImageUrlAsCharacter('${file.path.replace(/'/g, "\\'")}')">Agent</button><button class="btn btn-primary" onclick="event.stopPropagation();openPublishModal('${filePath.replace(/'/g, "\\'")}','image')">Post</button>` : ''}
        <button class="btn btn-secondary" onclick="event.stopPropagation();deleteAsset('${type}','${asset.slug}')">Del</button>
      </div>
    </div>`;
  }).join('');
}

async function addImageUrlAsCharacter(imageUrl) {
  latestProductPlacementImage = imageUrl;
  return addLatestImageAsCharacter();
}

function showUploadModal(type) {
  document.getElementById('uploadType').value = type;
  document.getElementById('uploadName').value = '';
  document.getElementById('uploadFile').value = '';
  document.getElementById('uploadVoiceId').value = '';
  const sampleSelect = document.getElementById('uploadVoiceSampleAssetId');
  if (sampleSelect) {
    sampleSelect.innerHTML = '<option value="">None</option>' + (assetsCache.audio || []).map(a => `<option value="${a.slug}">${a.name}</option>`).join('');
    sampleSelect.value = '';
  }
  document.getElementById('uploadFileName').textContent = '';
  document.getElementById('characterVoiceFields').style.display = type === 'subjects' ? '' : 'none';
  document.getElementById('uploadModal').classList.add('active');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('active');
}

function handleFileSelect(input) {
  const files = Array.from(input.files || []);
  document.getElementById('uploadFileName').textContent = files.length > 1
    ? `${files.length} files selected`
    : files[0]?.name || '';
}

function showAgentModal() {
  const modal = document.getElementById('agentModal');
  if (!modal) return showUploadModal('subjects');
  document.getElementById('agentUploadName').value = '';
  document.getElementById('agentUploadFile').value = '';
  document.getElementById('agentUploadFileName').textContent = '';
  document.getElementById('agentUploadVoiceId').value = '';
  document.getElementById('agentBuildName').value = '';
  document.getElementById('agentBuildVoiceId').value = '';
  document.getElementById('agentBuildGender').value = 'woman';
  document.getElementById('agentBuildEthnicity').value = 'Black';
  document.getElementById('agentBuildAge').value = '30s';
  document.querySelector('input[name="agentBuildBody"][value="average build"]').checked = true;
  document.getElementById('agentBuildLook').value = '';
  document.getElementById('agentBuildBackground').value = '';
  document.getElementById('agentBuildDetails').value = '';
  latestBuiltAgentImage = '';
  currentAgentBuildPreviewRatio = 'portrait';
  const sampleSelect = document.getElementById('agentUploadVoiceSampleAssetId');
  if (sampleSelect) {
    sampleSelect.innerHTML = '<option value="">None</option>' + (assetsCache.audio || []).map(a => `<option value="${a.slug}">${escapeHtml(a.name)}</option>`).join('');
    sampleSelect.value = '';
  }
  const buildSampleSelect = document.getElementById('agentBuildVoiceSampleAssetId');
  if (buildSampleSelect) {
    buildSampleSelect.innerHTML = '<option value="">None</option>' + (assetsCache.audio || []).map(a => `<option value="${a.slug}">${escapeHtml(a.name)}</option>`).join('');
    buildSampleSelect.value = '';
  }
  resetAgentUploadPreview();
  resetAgentBuildPreview();
  setAgentModalMode('upload');
  modal.classList.add('active');
}

function closeAgentModal() {
  document.getElementById('agentModal')?.classList.remove('active');
}

function setAgentModalMode(mode) {
  document.querySelectorAll('[data-agent-mode]').forEach(tab => tab.classList.toggle('active', tab.dataset.agentMode === mode));
  document.getElementById('agentPaneUpload')?.classList.toggle('active', mode === 'upload');
  document.getElementById('agentPaneBuild')?.classList.toggle('active', mode === 'build');
}

function resetAgentUploadPreview() {
  const preview = document.getElementById('agentUploadPreview');
  if (!preview) return;
  preview.innerHTML = `<div>
    <div class="agent-builder-icon"><svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><path d="m8 16 3-4 2 2 2-3 2 5H8Z"/><circle cx="9" cy="9" r="1.4"/></svg></div>
    <strong>Portrait preview</strong>
    <p>Your uploaded agent image appears here before saving.</p>
  </div>`;
}

function resetAgentBuildPreview() {
  const preview = document.getElementById('agentBuildPreview');
  if (!preview) return;
  setAgentBuildPreviewRatio(currentAgentBuildPreviewRatio || 'portrait');
  preview.innerHTML = `<div class="agent-preview-placeholder">
    <div>
      <div class="agent-builder-icon"><svg viewBox="0 0 24 24"><path d="M12 3 14 8l5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/><path d="m18 15 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/></svg></div>
      <strong>${currentAgentBuildPreviewRatio === 'landscape' ? '16:9 source preview' : '9:16 crop preview'}</strong>
      <p>Generate a centered 16:9 source image, then check the shorts crop.</p>
    </div>
  </div>`;
  document.getElementById('agentBuildProgress')?.classList.remove('active');
  document.getElementById('agentBuildResultActions')?.classList.remove('active');
}

function setAgentBuildPreviewRatio(ratio) {
  currentAgentBuildPreviewRatio = ratio === 'landscape' ? 'landscape' : 'portrait';
  document.querySelectorAll('[data-agent-preview-ratio]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.agentPreviewRatio === currentAgentBuildPreviewRatio);
  });
  const preview = document.getElementById('agentBuildPreview');
  if (!preview) return;
  preview.classList.toggle('agent-preview-landscape', currentAgentBuildPreviewRatio === 'landscape');
  preview.classList.toggle('agent-preview-portrait', currentAgentBuildPreviewRatio !== 'landscape');
}

function handleAgentUploadFile(input) {
  const file = input.files?.[0];
  document.getElementById('agentUploadFileName').textContent = file?.name || '';
  if (!file) return resetAgentUploadPreview();
  const url = URL.createObjectURL(file);
  document.getElementById('agentUploadPreview').innerHTML = `<img src="${url}" alt="Agent upload preview">`;
}

async function uploadAgentFromModal(event) {
  event.preventDefault();
  if (window.location.protocol === 'file:') {
    return toast('Open the live app URL before uploading. Files cannot persist from a file:// preview.', 'error');
  }
  const file = document.getElementById('agentUploadFile').files?.[0];
  if (!file) return toast('Choose a character image first.', 'error');
  const button = document.getElementById('agentUploadButton');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Uploading...';
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', document.getElementById('agentUploadName').value.trim() || file.name.replace(/\.[^.]+$/, ''));
    formData.append('voiceId', document.getElementById('agentUploadVoiceId').value.trim());
    formData.append('voiceSampleAssetId', document.getElementById('agentUploadVoiceSampleAssetId').value);
    await api('/api/assets/subjects', { method: 'POST', body: formData });
    toast('Agent uploaded to My agents.', 'success');
    closeAgentModal();
    await loadAssets();
    returnToCharactersTab();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function getAgentBuildBody() {
  return document.querySelector('input[name="agentBuildBody"]:checked')?.value || 'average build';
}

function buildAgentImagePrompt() {
  const gender = document.getElementById('agentBuildGender').value;
  const ethnicity = document.getElementById('agentBuildEthnicity').value;
  const age = document.getElementById('agentBuildAge').value;
  const body = getAgentBuildBody();
  const look = document.getElementById('agentBuildLook').value.trim() || 'friendly polished creator, natural expression, modern professional outfit';
  const background = document.getElementById('agentBuildBackground').value.trim() || 'modern creator studio with warm subtle lighting';
  const details = document.getElementById('agentBuildDetails').value.trim();
  return [
    `Create a realistic 16:9 source portrait for a UGC video agent.`,
    `Subject: ${ethnicity} ${gender}, approximate age ${age}, ${body}.`,
    `Look: ${look}.`,
    `Background: ${background}.`,
    `Frame mid-chest up, subject centered with enough room for a clean 9:16 center crop, direct eye contact, natural hands if visible, premium creator lighting, subtle Bloom brand warmth with soft orange-pink accents.`,
    `No text, no watermark, no distorted fingers, no exaggerated beauty filter, no cartoon style.`,
    details ? `Additional details: ${details}.` : ''
  ].filter(Boolean).join(' ');
}

async function generateBuiltAgent() {
  const button = document.getElementById('agentBuildButton');
  const progress = document.getElementById('agentBuildProgress');
  const preview = document.getElementById('agentBuildPreview');
  const actions = document.getElementById('agentBuildResultActions');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Generating...';
  progress?.classList.add('active');
  actions?.classList.remove('active');
  setAgentBuildPreviewRatio(currentAgentBuildPreviewRatio || 'portrait');
  preview.innerHTML = '<div class="cooking-state"><div class="cooking-orb"></div><strong>Building character</strong><p class="hint">Creating a centered 16:9 source image.</p></div>';
  try {
    const data = new FormData();
    data.append('prompt', buildAgentImagePrompt());
    data.append('aspectRatio', '16:9');
    data.append('size', '1k');
    const response = await api('/api/product-placement/generate', { method: 'POST', body: data });
    const image = response.result?.image;
    if (!image) throw new Error('The image endpoint completed but did not return an image.');
    latestBuiltAgentImage = image;
    setAgentBuildPreviewRatio(currentAgentBuildPreviewRatio || 'portrait');
    preview.innerHTML = `<img src="${image}" alt="Generated agent preview">`;
    actions?.classList.add('active');
    toast('Agent preview generated.', 'success');
  } catch (error) {
    resetAgentBuildPreview();
    toast(error.message, 'error');
  } finally {
    progress?.classList.remove('active');
    button.disabled = false;
    button.textContent = original;
  }
}

async function saveBuiltAgent() {
  if (!latestBuiltAgentImage) return toast('Generate a character preview first.', 'error');
  const name = document.getElementById('agentBuildName').value.trim() || 'Generated agent';
  const button = document.querySelector('#agentBuildResultActions .btn-primary');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Adding...';
	try {
	  const voiceId = document.getElementById('agentBuildVoiceId')?.value.trim() || '';
	  const voiceSampleAssetId = document.getElementById('agentBuildVoiceSampleAssetId')?.value || '';
	  await api('/api/assets/subjects/from-image-url', {
	    method: 'POST',
	    body: JSON.stringify({ imageUrl: latestBuiltAgentImage, name, voiceId, voiceSampleAssetId })
	  });
    toast('Generated character added to My agents.', 'success');
    closeAgentModal();
    await loadAssets();
    returnToCharactersTab();
  } catch (error) {
    toast(`Could not add character: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function uploadAsset(e) {
  e.preventDefault();
  if (window.location.protocol === 'file:') {
    return toast('Open the live app URL before uploading. Files cannot persist from a file:// preview.', 'error');
  }
  const type = document.getElementById('uploadType').value;
  const name = document.getElementById('uploadName').value;
  const files = Array.from(document.getElementById('uploadFile').files || []);
  if (!files.length) return toast('Please select a file', 'error');
  const button = document.querySelector('#uploadForm button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Uploading...';

  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', files.length > 1 ? `${name} ${index + 1}` : name);
      if (type === 'subjects') {
        formData.append('voiceId', document.getElementById('uploadVoiceId').value.trim());
        formData.append('voiceSampleAssetId', document.getElementById('uploadVoiceSampleAssetId').value);
      }
      await api(`/api/assets/${type}`, { method: 'POST', body: formData });
    }
    toast(`${files.length} ${files.length === 1 ? 'file' : 'files'} uploaded`, 'success');
    closeUploadModal();
    loadAssets();
    if (type === 'subjects') returnToCharactersTab();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Upload';
  }
}

async function copyAudioTempUrl(slug) {
  try {
    const data = await api(`/api/assets/audio/${slug}/temp-url`, { method: 'POST' });
    await navigator.clipboard.writeText(data.url);
    toast('Temporary voice URL copied. Paste it into the VibeVoice reference voice URL.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteAsset(type, slug) {
  if (!confirm(`Delete ${slug}?`)) return;
  await api(`/api/assets/${type}/${slug}`, { method: 'DELETE' });
  toast('Asset deleted', 'success');
  loadAssets();
}

async function viewContext(type, slug) {
  const data = await api('/api/assets');
  const asset = (data[type] || []).find(a => a.slug === slug);
  if (asset?.aiContext) alert(JSON.stringify(asset.aiContext, null, 2));
  else toast('No AI context yet.', 'info');
}

async function analyzeAssets() {
  const data = await api('/api/analyze/assets', { method: 'POST' });
  toast(`Analyzed ${data.totalAnalyzed} assets`, 'success');
}

async function loadBrands() {
  const brands = await api('/api/brands');
  const container = document.getElementById('brandsList');
  if (!brands.length) {
    container.innerHTML = '<div class="empty-state">No brands saved yet</div>';
    return;
  }

  container.innerHTML = brands.map(b => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:14px">
        <div>
          <div class="card-title">${b.name}</div>
          <div class="card-subtitle">${b.category || ''}</div>
          ${b.sellingPoints?.length ? `<ul class="selling-points-list">${b.sellingPoints.map(s => `<li>${s}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="actions"><button class="btn btn-secondary" onclick="editBrand('${b.slug}')">Edit</button><button class="btn btn-secondary" onclick="deleteBrand('${b.slug}')">Delete</button></div>
      </div>
    </div>
  `).join('');
}

async function saveBrand(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    name: form.name.value,
    category: form.category.value,
    description: form.description.value,
    pricePoint: form.pricePoint.value,
    sellingPoints: form.sellingPoints.value.split('\n').map(s => s.trim()).filter(Boolean),
    targetAudience: form.targetAudience.value,
    platforms: form.platforms.value.split(',').map(s => s.trim()).filter(Boolean),
    tone: form.tone.value,
    discountCode: form.discountCode.value,
    cta: form.cta.value
  };

  const result = await api('/api/brands', { method: 'POST', body: JSON.stringify(data) });
  if (result.success) {
    toast('Brand saved', 'success');
    form.reset();
    loadBrands();
  }
}

async function editBrand(slug) {
  const brand = await api(`/api/brands/${slug}`);
  const form = document.getElementById('brandForm');
  form.name.value = brand.name || '';
  form.category.value = brand.category || '';
  form.description.value = brand.description || '';
  form.pricePoint.value = brand.pricePoint || '';
  form.sellingPoints.value = (brand.sellingPoints || []).join('\n');
  form.targetAudience.value = brand.targetAudience || '';
  form.platforms.value = (brand.platforms || []).join(', ');
  form.tone.value = brand.tone || 'natural';
  form.discountCode.value = brand.discountCode || '';
  form.cta.value = brand.cta || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteBrand(slug) {
  if (!confirm(`Delete brand ${slug}?`)) return;
  await api(`/api/brands/${slug}`, { method: 'DELETE' });
  toast('Brand deleted', 'success');
  loadBrands();
}

async function loadGenerateOptions() {
  const [brands, assets] = await Promise.all([api('/api/brands'), api('/api/assets')]);
  const brandSelect = document.getElementById('genBrand');
  if (!brandSelect) return;
  brandSelect.innerHTML = '<option value="">Select brand...</option>' + brands.map(b => `<option value="${b.slug}">${b.name}</option>`).join('');
  document.getElementById('genSubject').innerHTML = '<option value="">None</option>' + (assets.subjects || []).map(s => `<option value="${s.slug}">${s.name}</option>`).join('');
  document.getElementById('genAudio').innerHTML = '<option value="">None</option>' + (assets.audio || []).map(a => `<option value="${a.slug}">${a.name}</option>`).join('');
}

function getSelectedFormats() {
  return Array.from(document.querySelectorAll('.format-checkbox:checked')).map(cb => cb.value);
}

function getAdvancedDuration() {
  const value = document.getElementById('genDuration').value;
  const seconds = value === 'custom'
    ? Number(document.getElementById('genCustomDuration').value)
    : Number(value);
  return Math.max(1, Math.min(300, Math.round(seconds || 30)));
}

async function estimateCost() {
  const formats = getSelectedFormats();
  const data = await api('/api/generate/estimate', {
    method: 'POST',
    body: JSON.stringify({
      variants: formats.length * 2,
      duration: getAdvancedDuration(),
      resolution: document.getElementById('genResolution').value,
      model: document.getElementById('genModel').value
    })
  });
  toast(`Estimated cost: $${data.total} for ${data.count} videos`, 'info');
}

async function previewVariants() {
  const brandSlug = document.getElementById('genBrand').value;
  if (!brandSlug) return toast('Select a brand first', 'error');

  const data = await api('/api/generate/ab-test', {
    method: 'POST',
    body: JSON.stringify({
      brandSlug,
      subjectSlug: document.getElementById('genSubject').value || undefined,
      audioSlug: document.getElementById('genAudio').value || undefined,
      formats: getSelectedFormats(),
      duration: getAdvancedDuration(),
      resolution: document.getElementById('genResolution').value,
      model: document.getElementById('genModel').value,
      aspectRatio: document.getElementById('genAspect').value
    })
  });

  currentVariants = data;
  currentBatchId = data.batchId;
  document.getElementById('variantPreviewCard').style.display = 'block';
  document.getElementById('costEstimate').innerHTML = `<span class="chip chip-warn">${data.estimatedTotalCost}</span>`;
  document.getElementById('variantList').innerHTML = data.variants.map(v => `
    <div class="variant-item"><strong>Variant ${v.variantNum} · ${v.format}</strong><p class="video-prompt">${v.script}</p><span class="chip chip-soft">$${v.estimatedCost.toFixed(2)}</span></div>
  `).join('');
}

async function submitVariants() {
  if (!currentVariants) return;
  const btn = document.getElementById('submitBtn');
  const status = document.getElementById('submitStatus');
  btn.disabled = true;
  status.textContent = 'Submitting...';
  try {
    const result = await api('/api/generate/submit', {
      method: 'POST',
      body: JSON.stringify({
        batchId: currentBatchId,
        variants: currentVariants.variants.map(v => ({
          variantNum: v.variantNum,
          format: v.format,
          prompt: v.prompt,
          estimatedCost: v.estimatedCost,
          brandSlug: currentVariants.brandSlug,
          payload: v.payload
        }))
      })
    });
    toast(`${result.submitted} variants submitted`, 'success');
    switchTab('videos');
  } finally {
    btn.disabled = false;
    status.textContent = '';
  }
}

function authenticatedMediaUrl(path) {
  if (!path || !path.startsWith('/api/')) return path;
  const url = new URL(path, window.location.origin);
  if (authToken) url.searchParams.set('token', authToken);
  if (currentTenant?.slug || currentTenant?.id) url.searchParams.set('tenant', currentTenant.slug || currentTenant.id);
  return url.pathname + url.search;
}

function getVideoSelectionKey(video = {}) {
  return video.assetId || video.localPath || video.requestId || video.jobId || '';
}

function updateVideoBulkBar() {
  const selected = renderedVideoItems.filter(video => selectedVideoKeys.has(getVideoSelectionKey(video)));
  const bar = document.getElementById('videoBulkBar');
  const count = document.getElementById('videoBulkCount');
  if (!bar || !count) return;
  bar.style.display = selected.length ? 'flex' : 'none';
  count.textContent = `${selected.length} selected`;
  document.querySelectorAll('[data-video-key]').forEach(card => {
    card.classList.toggle('selected', selectedVideoKeys.has(card.dataset.videoKey));
  });
  document.querySelectorAll('[data-video-select-key]').forEach(input => {
    input.checked = selectedVideoKeys.has(input.dataset.videoSelectKey);
  });
}

function selectVideoItem(index, checked, event) {
  const video = renderedVideoItems[index];
  const key = getVideoSelectionKey(video);
  if (!video || !key) return;
  if (event?.shiftKey && lastSelectedVideoIndex >= 0) {
    const start = Math.min(lastSelectedVideoIndex, index);
    const end = Math.max(lastSelectedVideoIndex, index);
    for (let i = start; i <= end; i++) {
      const rangeKey = getVideoSelectionKey(renderedVideoItems[i]);
      if (rangeKey) checked ? selectedVideoKeys.add(rangeKey) : selectedVideoKeys.delete(rangeKey);
    }
  } else {
    checked ? selectedVideoKeys.add(key) : selectedVideoKeys.delete(key);
  }
  lastSelectedVideoIndex = index;
  updateVideoBulkBar();
}

function clearVideoSelection() {
  selectedVideoKeys.clear();
  lastSelectedVideoIndex = -1;
  document.querySelectorAll('.video-select-control input').forEach(input => { input.checked = false; });
  updateVideoBulkBar();
}

function selectedDownloadName(video = {}, index = 0) {
  const clean = String(video.prompt || video.format || video.provider || `video-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `video-${index + 1}`;
  return `${String(index + 1).padStart(2, '0')}-${clean}.mp4`;
}

async function downloadSelectedVideos() {
  const selected = renderedVideoItems.filter(video => selectedVideoKeys.has(getVideoSelectionKey(video)) && video.status === 'completed' && video.localPath);
  if (!selected.length) return toast('Select completed videos to download.', 'error');
  selected.forEach((video, index) => {
    setTimeout(() => {
      const link = document.createElement('a');
      link.href = authenticatedMediaUrl(video.localPath);
      link.download = selectedDownloadName(video, index);
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }, index * 350);
  });
  toast(`Downloading ${selected.length} video${selected.length === 1 ? '' : 's'}...`, 'success');
}

async function deleteSelectedVideos() {
  const selected = renderedVideoItems.filter(video => selectedVideoKeys.has(getVideoSelectionKey(video)) && video.assetId);
  if (!selected.length) return toast('Select saved Library videos to delete.', 'error');
  if (!confirm(`Delete ${selected.length} selected video${selected.length === 1 ? '' : 's'}?`)) return;
  let deleted = 0;
  for (const video of selected) {
    await api(`/api/assets/videos/${video.assetId}`, { method: 'DELETE' });
    selectedVideoKeys.delete(getVideoSelectionKey(video));
    deleted++;
  }
  toast(`Deleted ${deleted} video${deleted === 1 ? '' : 's'}.`, 'success');
  await loadAssets();
  await loadVideos();
}

async function loadVideos(options = {}) {
  const notify = typeof options === 'object' && options.notify === true;
  let seedance = { videos: [], total: 0, completed: 0, pending: 0, failed: 0 };
  let studio = { jobs: [] };
  let assets = assetsCache;
  const grid = document.getElementById('videoGrid');
  if (grid) grid.classList.toggle('landscape', currentLibraryVideoRatio === 'landscape');
  try { seedance = await api('/api/videos'); } catch (e) {}
  try { studio = await api('/api/studio/jobs'); } catch (e) {}
  try {
    assets = await api(`/api/assets?ts=${Date.now()}`);
    assetsCache = assets;
  } catch (e) {
    if (grid) grid.innerHTML = `<div class="empty-state">Could not load generated videos: ${escapeHtml(e.message)}</div>`;
    toast(`Could not load Library assets: ${e.message}`, 'error');
    return;
  }
  studioJobs = studio.jobs || studioJobs;
  const libraryVideos = (assets.videos || []).map(asset => ({
    requestId: asset.slug,
    jobId: asset.slug,
    assetId: asset.slug,
    provider: asset.aiContext?.provider || 'library',
    presetId: asset.aiContext?.source || 'saved-video',
    mode: 'i2v',
    status: 'completed',
    prompt: asset.aiContext?.prompt || asset.name,
    localPath: asset.files?.[0]?.path,
    createdAt: asset.createdAt,
    format: asset.aiContext?.provider || 'saved'
  }));

  const total = seedance.total + studioJobs.length + libraryVideos.length;
  if (total > 0) {
    const completed = seedance.completed + studioJobs.filter(j => j.status === 'completed').length + libraryVideos.length;
    const pct = Math.round((completed / total) * 100);
    document.getElementById('videoProgress').style.display = 'block';
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent = `${completed}/${total} completed`;
  } else {
    document.getElementById('videoProgress').style.display = 'none';
  }

  const combinedRaw = [
    ...libraryVideos,
    ...studioJobs.map(j => ({ ...j, format: j.presetId || 'studio', prompt: j.script || j.prompt })),
    ...(seedance.videos || [])
  ];
  const seenVideos = new Set();
  const combined = combinedRaw.filter(item => {
    const key = item.localPath || item.assetId || item.requestId || item.jobId;
    if (!key) return true;
    if (seenVideos.has(key)) return false;
    seenVideos.add(key);
    return true;
  });
  renderedVideoItems = combined;
  const visibleKeys = new Set(renderedVideoItems.map(getVideoSelectionKey).filter(Boolean));
  selectedVideoKeys = new Set([...selectedVideoKeys].filter(key => visibleKeys.has(key)));
  const nextStatuses = {};
  combined.forEach(item => {
    const key = item.requestId || item.jobId || item.localPath || item.assetId;
    if (!key) return;
    const currentStatus = item.status || 'unknown';
    const previousStatus = knownVideoStatuses[key];
    nextStatuses[key] = currentStatus;
    if (notify && previousStatus && previousStatus !== currentStatus) {
      if (currentStatus === 'completed') {
        toast('Video complete — check your Library to see the completed video.', 'success');
        if (activeBackgroundVideoKey && key === activeBackgroundVideoKey) stopGenerationOverlay({ success: true });
      }
      if (currentStatus === 'failed') toast('Video generation failed. Open Library and expand the full error.', 'error');
    }
  });
  knownVideoStatuses = nextStatuses;
  libraryVideoItems = combined
    .filter(v => v.status === 'completed' && (v.localPath || '').trim())
    .map(v => ({
      type: 'video',
      name: v.prompt || v.format || 'Generated video',
      url: authenticatedMediaUrl(v.localPath || ''),
      prompt: v.prompt || '',
      aspectRatio: v.aspectRatio || (currentLibraryVideoRatio === 'landscape' ? '16:9' : '9:16'),
      sourceTrendUrl: v.sourceTrendUrl || '',
      sourceTrendTitle: v.sourceTrendTitle || v.sourceTrendHook || '',
      sourceTrendId: v.sourceTrendId || ''
    }));

  if (!combined.length) {
    grid.innerHTML = '<div class="empty-state">No videos generated yet. Create your first clip from the Create tab.</div>';
    return;
  }

  let videoIndex = -1;
  videoErrorDetails = {};
  videoStatusDetails = {};
  grid.innerHTML = combined.map((v, itemIndex) => {
    const mediaUrl = authenticatedMediaUrl(v.localPath || '');
    const selectionKey = getVideoSelectionKey(v);
    const isSelected = selectionKey && selectedVideoKeys.has(selectionKey);
    const isPlayableComplete = v.status === 'completed' && mediaUrl;
    const displayStatus = v.status === 'completed' && !mediaUrl ? 'finalizing' : v.status;
    const statusChip = isPlayableComplete ? '<span class="chip chip-green">Completed</span>' : v.status === 'failed' ? '<span class="chip chip-red">Failed</span>' : displayStatus === 'finalizing' ? '<span class="chip chip-warn">Finalizing</span>' : '<span class="chip chip-warn">Processing</span>';
    const lightboxIndex = v.status === 'completed' && mediaUrl ? ++videoIndex : -1;
    const errorText = String(v.error || '').trim();
    const errorKey = `err-${String(v.requestId || v.jobId || Math.random()).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const statusKey = `status-${String(v.requestId || v.jobId || Math.random()).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const aspect = String(v.aspectRatio || '').includes('16:9') ? 'landscape' : String(v.aspectRatio || '').includes('1:1') ? 'square' : 'portrait';
    if (errorText) videoErrorDetails[errorKey] = errorText;
    videoStatusDetails[statusKey] = v;
    const trendTitle = v.sourceTrendTitle || v.sourceTrendHook || (v.sourceTrendId ? `Trend ${v.sourceTrendId}` : '');
    const trendUrl = v.sourceTrendUrl || '';
    const trendBlock = trendTitle || trendUrl
      ? `<div class="video-prompt trend-source-line">Trend source: ${escapeHtml(trendTitle || 'Original trend')}${trendUrl ? ` · <button class="link-button" type="button" onclick="event.stopPropagation();window.open('${trendUrl.replace(/'/g, "\\'")}','_blank','noopener')">Open source</button>` : ''}</div>`
      : '';
    const audioBlock = v.audioStatus === 'silent'
      ? '<div class="video-prompt audio-source-line">No audio on this scene clip. Final assemblies use source audio when available.</div>'
      : v.audioStatus ? `<div class="video-prompt audio-source-line">Audio: ${escapeHtml(v.audioStatus)}</div>` : '';
    const errorBlock = errorText
      ? `<details class="video-error-detail" onclick="event.stopPropagation()" style="margin-top:8px;border:1px solid rgba(217,79,79,.32);border-radius:10px;background:rgba(217,79,79,.06);padding:8px">
          <summary style="cursor:pointer;font-size:12px;font-weight:900;color:var(--red)">View full error</summary>
          <pre style="white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;margin:8px 0 0;font-size:11px;line-height:1.35;color:var(--ink)">${escapeHtml(errorText)}</pre>
          <button class="btn btn-secondary" style="margin-top:8px;padding:6px 8px;font-size:11px" onclick="event.stopPropagation();copyFullVideoError('${errorKey}')">Copy error</button>
        </details>`
      : '';
    const activeBlock = v.status === 'processing' || displayStatus === 'finalizing'
      ? `<div class="video-prompt" style="color:rgba(255,255,255,.88);margin-top:7px">
          ${displayStatus === 'finalizing' ? 'Provider render finished. Bloom Studio is saving the playable video now.' : `${escapeHtml(getStudioEngineName(v.provider || v.presetId))} is running in the background.`} ${escapeHtml(formatElapsedTime(v.createdAt))}. Safe to leave this panel.
        </div>`
      : '';
    const posterId = `poster-${String(v.requestId || v.jobId || Math.random()).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const previewUrl = authenticatedMediaUrl(v.imagePreviewUrl || '');
    const videoPreviewUrl = mediaUrl ? `${mediaUrl}#t=0.1` : '';
    const videoEl = mediaUrl
      ? `<div class="video-thumb-wrap ${aspect}" onclick="openLibraryLightbox('videos',${lightboxIndex})">
          <img class="video-poster" id="${posterId}" alt="Video preview">
          <video class="video-player" preload="auto" muted playsinline onloadeddata="captureVideoPoster(this,'${posterId}')" onseeked="captureVideoPoster(this,'${posterId}')" onplay="markVideoPlaying(this,true)" onpause="markVideoPlaying(this,false)">
            <source src="${videoPreviewUrl}" type="video/mp4">
          </video>
          <div class="video-play-badge">▶ Preview</div>
        </div>`
      : previewUrl
        ? `<div class="video-thumb-wrap ${aspect} ${v.status === 'failed' ? 'failed' : ''}">
            <img class="video-player" src="${previewUrl}" alt="Attempted character preview" onerror="handleVideoPreviewError(this,'${escapeHtml(v.status || 'processing')}')">
            <div class="video-play-badge" style="background:${v.status === 'failed' ? 'rgba(217,79,79,.88)' : 'rgba(0,0,0,.66)'}">${v.status === 'failed' ? 'Failed' : displayStatus === 'finalizing' ? 'Finalizing' : 'Processing'}</div>
          </div>`
        : `<div class="video-player" style="display:flex;align-items:center;justify-content:center;color:${v.status === 'failed' ? 'var(--red)' : '#999'}">${v.status === 'failed' ? 'Failed' : displayStatus === 'finalizing' ? 'Finalizing' : 'Processing'}</div>`;
    const actions = v.status === 'completed' && mediaUrl
      ? `<div class="actions"><button class="btn btn-primary" onclick="event.stopPropagation();openPublishModal('${mediaUrl.replace(/'/g, "\\'")}','video')">Post</button><a class="btn btn-secondary" href="${mediaUrl}" download onclick="event.stopPropagation()">Save</a></div>`
      : v.status === 'processing' || displayStatus === 'finalizing'
        ? `<div class="actions" style="opacity:1;transform:none;margin-top:8px"><button class="btn btn-secondary" onclick="event.stopPropagation();checkVideoStatus('${statusKey}')">Check status</button><button class="btn btn-secondary" onclick="event.stopPropagation();loadVideos({ notify: true })">Refresh Library</button></div>`
        : '';
    const selectControl = selectionKey && isPlayableComplete
      ? `<label class="video-select-control" onclick="event.stopPropagation()">
          <input type="checkbox" data-video-select-key="${escapeHtml(selectionKey)}" ${isSelected ? 'checked' : ''} onclick="selectVideoItem(${itemIndex},this.checked,event)">
          Select
        </label>`
      : '';
    return `<div class="video-card ${aspect} ${isSelected ? 'selected' : ''}" data-video-key="${escapeHtml(selectionKey)}">${selectControl}${videoEl}<div class="video-info" onclick="${mediaUrl ? `openLibraryLightbox('videos',${lightboxIndex})` : ''}"><div style="display:flex;justify-content:space-between;gap:8px"><span class="chip chip-soft">${v.format || 'custom'}</span>${statusChip}</div><div class="video-prompt">${escapeHtml(v.prompt || v.localPath || '')}</div>${trendBlock}${audioBlock}${activeBlock}${errorBlock}${actions}</div></div>`;
  }).join('');
  updateVideoBulkBar();
}

function openPublishModal(mediaUrl, mediaType = 'video') {
  const input = document.getElementById('publishMediaUrl');
  input.value = new URL(mediaUrl, window.location.origin).href;
  input.dataset.mediaType = mediaType;
  document.getElementById('publishModal').classList.add('active');
}

function closePublishModal() {
  document.getElementById('publishModal').classList.remove('active');
}

async function copyPublishUrl() {
  const url = document.getElementById('publishMediaUrl').value;
  await navigator.clipboard.writeText(url);
  toast('Media URL copied.', 'success');
}

function openPlatformUpload(platform) {
  const urls = {
    youtube: 'https://studio.youtube.com/',
    tiktok: 'https://www.tiktok.com/upload',
    instagram: 'https://business.facebook.com/latest/reels_composer'
  };
  window.open(urls[platform], '_blank', 'noopener');
}

async function pollAllJobs() {
  const data = await api('/api/videos/poll-all', { method: 'POST' });
  toast(`Polled ${data.polled} Seedance jobs`, 'success');
  loadVideos();
}

async function loadBilling() {
  try {
    const config = await api('/api/billing/config');
    setChip('stripeSecretStatus', config.stripeConfigured ? 'Connected' : 'Needs key', config.stripeConfigured ? 'green' : 'warn');
    setChip('stripePriceStatus', `$${config.amountMonthly}/mo`, config.priceConfigured ? 'green' : 'soft');
    setChip('billingModeStatus', config.mode === 'test-ready' ? 'Test ready' : 'Setup mode', config.mode === 'test-ready' ? 'green' : 'warn');
    const button = document.getElementById('checkoutButton');
    const status = document.getElementById('billingStatus');
    if (button) button.disabled = !config.stripeConfigured;
    if (status) {
      status.textContent = config.stripeConfigured
        ? 'Stripe test checkout is ready.'
        : 'Add Stripe test keys before checkout can open.';
    }
  } catch (error) {
    setChip('stripeSecretStatus', 'Error', 'red');
    const status = document.getElementById('billingStatus');
    if (status) status.textContent = error.message;
  }
}

async function startCheckout() {
  const button = document.getElementById('checkoutButton');
  button.disabled = true;
  button.textContent = 'Opening checkout...';
  try {
    const result = await api('/api/billing/checkout', { method: 'POST' });
    window.location.href = result.url;
  } catch (error) {
    toast(error.message, 'error');
    loadBilling();
  } finally {
    button.disabled = false;
    button.textContent = 'Start checkout';
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

// ─── Character Detail Drawer ──────────────────────────────────────────────────

let charDrawerCharacter = null;

function openCharDrawer(character) {
  charDrawerCharacter = character;
  const overlay = document.getElementById('charDrawerOverlay');
  const img = document.getElementById('charDrawerImg');
  const name = document.getElementById('charDrawerName');
  const role = document.getElementById('charDrawerRole');
  const badges = document.getElementById('charDrawerBadges');
  const looks = document.getElementById('charDrawerLooks');
  const useBtn = document.getElementById('charDrawerUseBtn');
  const addLookBtn = document.getElementById('charDrawerAddLookBtn');
  if (!overlay) return selectCharacter(character);

  const imageUrl = character.imageUrl || character.image_url || '';
  const displayUrl = authenticatedMediaUrl(imageUrl);

  if (img) { img.src = displayUrl; img.alt = character.name || ''; }
  if (name) name.textContent = character.name || '';
  if (role) role.textContent = character.role || [character.age_group, character.gender].filter(Boolean).join(' · ') || '';

  // Build badges
  if (badges) {
    const parts = [];
    if (character._ageGroup || character.age_group) parts.push(`<span class="char-drawer-badge">${(character._ageGroup || character.age_group).replace('-', ' ')}</span>`);
    if (character._gender || character.gender) parts.push(`<span class="char-drawer-badge">${character._gender || character.gender}</span>`);
    if (character._isUgc) parts.push(`<span class="char-drawer-badge char-drawer-badge-ugc">UGC</span>`);
    badges.innerHTML = parts.join('');
  }

  // Render looks: main look + tenant-saved looks + any extras stored in character._looks
  if (looks) {
    const slug = character.slug || '';
    const tenantLooks = (assetsCache.subjects || [])
      .filter(s => (s.parentCharacterSlug || s.aiContext?.parentCharacterSlug) === slug && slug)
      .map(s => ({ imageUrl: authenticatedMediaUrl(s.files?.[0]?.path || ''), label: s.name || 'Look' }));
    const extraLooks = [...(character._looks || []), ...tenantLooks];
    const allLooks = [{ imageUrl: imageUrl, label: 'Main look' }, ...extraLooks];
    looks.innerHTML = allLooks.map((look, i) => `
      <div class="char-drawer-look ${i === 0 ? 'active' : ''}" onclick="selectDrawerLook(this, '${(look.imageUrl || '').replace(/'/g, "\\'")}')">
        <img src="${authenticatedMediaUrl(look.imageUrl || '')}" alt="${look.label || `Look ${i + 1}`}" loading="lazy">
        <div class="char-drawer-look-label">${look.label || `Look ${i + 1}`}</div>
      </div>
    `).join('');
  }

  if (useBtn) {
    useBtn.onclick = () => { selectCharacter(charDrawerCharacter); closeCharDrawer(); };
  }

  if (addLookBtn) {
    if (character._isUgc) {
      addLookBtn.style.display = '';
      addLookBtn.onclick = () => generateCharacterLook(character);
    } else {
      addLookBtn.style.display = 'none';
    }
  }

  overlay.classList.add('active');
}

function closeCharDrawer() {
  document.getElementById('charDrawerOverlay')?.classList.remove('active');
  charDrawerCharacter = null;
}

function selectDrawerLook(el, imageUrl) {
  el.closest('.char-drawer-looks')?.querySelectorAll('.char-drawer-look').forEach(l => l.classList.remove('active'));
  el.classList.add('active');
  if (charDrawerCharacter && imageUrl) {
    charDrawerCharacter = { ...charDrawerCharacter, imageUrl };
    const heroImg = document.getElementById('charDrawerImg');
    if (heroImg) heroImg.src = authenticatedMediaUrl(imageUrl);
  }
}

async function generateCharacterLook(character) {
  const btn = document.getElementById('charDrawerAddLookBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  try {
    const prompt = `Professional portrait photo of ${character.name}, ${character.role || ''}, different outfit and setting from their main look, ${(character._ageGroup || character.age_group || '').replace('-', ' ')}, photorealistic, studio lighting, clean background, 85mm lens`;
    const resp = await api('/api/images/generate', { method: 'POST', body: JSON.stringify({ prompt, model: 'soul_cast' }) });
    if (resp?.imageUrl) {
      const newLook = { imageUrl: resp.imageUrl, label: `Look ${((character._looks || []).length + 2)}` };
      charDrawerCharacter = { ...charDrawerCharacter, _looks: [...(charDrawerCharacter._looks || []), newLook] };
      openCharDrawer(charDrawerCharacter);
    } else {
      showToast('Could not generate look — check console', 'error');
    }
  } catch (e) {
    showToast('Error generating look: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ Generate new look'; }
  }
}

initAuth();
startVideoStatusWatcher();
initializeStudioResize();
initializeStudioPreviewResize();
mountStudioControlsUnderPreview();
mountImageWorkspaceInCreate();
initializeStudioDefaults();
updatePreviewRatio();
updateThemeButton();
switchTab('characters');
setInterval(() => {
  if (document.visibilityState === 'visible') loadDashboard();
}, 30000);
