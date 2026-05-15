const API = '';

let currentVariants = null;
let currentBatchId = null;
let studioJobs = [];
let authConfig = null;
let supabaseClient = null;
let authToken = localStorage.getItem('bloomStudioToken') || '';
let currentTenant = JSON.parse(localStorage.getItem('bloomStudioTenant') || 'null');
let assetsCache = { products: [], subjects: [], audio: [], outputs: [], videos: [] };
let selectedCharacter = null;
let currentCharacterTab = 'library';
let currentCharacterRatio = 'portrait';
let currentLibraryImageRatio = 'portrait';
let libraryImageItems = [];
let libraryVideoItems = [];
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
let latestBuiltAgentImage = '';
let currentAgentBuildPreviewRatio = 'portrait';
let studioCrop = { x: 50, y: 50 };
let cropDrag = null;
let previewAudioAsset = null;
let voicePreviewTimer = null;
let generationTimer = null;
let generationStartedAt = 0;
let studioStatusCache = null;

const starterCharacters = [
  { slug: 'library-financial-advisor', name: 'Financial Advisor', role: 'Advisor specialist', imageUrl: '/agent-library/financial-advisor.png' },
  { slug: 'library-real-estate-agent', name: 'Real Estate Agent', role: 'Listing specialist', imageUrl: '/agent-library/real-estate-agent.png' },
  { slug: 'library-small-business', name: 'Small Business Owner', role: 'Founder presenter', imageUrl: '/agent-library/small-business-owner.png' },
  { slug: 'library-ecommerce-founder', name: 'Ecommerce Founder', role: 'Product seller', imageUrl: '/agent-library/ecommerce-founder.png' },
  { slug: 'library-sarah-studio', name: 'Sarah Studio', role: 'Bloomie narrator', imageUrl: '/agent-library/sarah-studio.png' },
  { slug: 'library-rebecca-advisor', name: 'Rebecca Advisor', role: 'Finance narrator', imageUrl: '/agent-library/rebecca-advisor.jpg' },
  { slug: 'library-janelle-real-estate', name: 'Janelle Real Estate', role: 'Market narrator', imageUrl: '/agent-library/janelle-real-estate.jpg' },
  { slug: 'library-andre-founder', name: 'Andre Founder', role: 'Business owner', imageUrl: '/agent-library/andre-founder.jpg' },
  { slug: 'library-studio-presenter', name: 'Studio Presenter', role: 'Podcast host', imageUrl: '/agent-library/studio-presenter.png' },
  { slug: 'library-coach-presenter', name: 'Coach Presenter', role: 'Training coach', imageUrl: '/agent-library/coach-presenter.png' }
];

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
});

document.addEventListener('pointermove', handlePreviewDragMove);
document.addEventListener('pointerup', endPreviewDrag);
document.addEventListener('pointercancel', endPreviewDrag);

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
  document.getElementById(`tab-${tabId}`)?.classList.add('active');

  if (tabId === 'assets' || tabId === 'characters' || tabId === 'products') loadAssets();
  if (tabId === 'brands') loadBrands();
  if (tabId === 'billing') loadBilling();
  if (tabId === 'advanced') loadGenerateOptions();
  if (tabId === 'videos') loadVideos();
  if (tabId === 'studio') loadStudioStatus();
  if (tabId === 'products') loadProductPlacementStatus();
  if (tabId === 'trends') loadTrends();
}

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4800);
}

function startGenerationOverlay({ engine = 'wan-comfy', mode = 'i2v' } = {}) {
  const overlay = document.getElementById('generationOverlay');
  if (!overlay) return;
  generationStartedAt = Date.now();
  overlay.classList.add('active');
  document.getElementById('generationSuccessActions').style.display = 'none';
  document.getElementById('generationDismissButton').textContent = 'Hide';
  document.getElementById('generationNote').textContent = 'Progress is estimated while the video endpoint renders.';
  const label = engine === 'meigen'
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

function updateGenerationOverlay(engine = 'wan-comfy', mode = 'i2v') {
  const elapsed = Math.max(0, Math.round((Date.now() - generationStartedAt) / 1000));
  const estimate = engine === 'meigen' ? 180 : engine === 'wan22-serverless' ? 260 : engine === 'wan-animate' ? 420 : mode === 'v2v' ? 300 : 240;
  const progress = Math.min(96, Math.max(3, Math.round((elapsed / estimate) * 92)));
  const stages = engine === 'meigen'
    ? [
        [10, 'Uploading references', 'Sending your selected image and voiceover to the lip sync endpoint.'],
        [35, 'Building the face track', 'Matching the speaker motion to the audio.'],
        [70, 'Rendering video', 'Generating the final talking-head clip.'],
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

function stopGenerationOverlay({ success = false } = {}) {
  clearInterval(generationTimer);
  generationTimer = null;
  const overlay = document.getElementById('generationOverlay');
  if (!overlay) return;
  if (success) {
    document.getElementById('generationTitle').textContent = 'Video ready';
    document.getElementById('generationDetail').textContent = 'Your generation was saved. Open the Library tab to preview, download, or post it.';
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

function openLibraryLightbox(kind, index) {
  lightboxCollection = kind === 'videos' ? libraryVideoItems : libraryImageItems;
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
  body.className = 'lightbox-body';
  const media = item.type === 'video'
    ? `<video class="lightbox-media" controls autoplay playsinline src="${item.url}"></video>`
    : `<img class="lightbox-media" src="${item.url}" alt="${escapeHtml(item.name || 'Library image')}">`;
  body.innerHTML = `
    <button class="lightbox-nav lightbox-prev" type="button" onclick="moveLibraryLightbox(-1)">‹</button>
    ${media}
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
  setCreateType(document.getElementById('studioCreateType')?.value || 'shorts');
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
    const meigen = data.videoEngines?.find(p => p.id === 'meigen');
    const wan22 = data.videoEngines?.find(p => p.id === 'wan22-serverless');
    const wanAnimate = data.videoEngines?.find(p => p.id === 'wan-animate');
    setChip('qwenStatus', qwen?.available ? 'Ready' : 'Needs workflow', qwen?.available ? 'soft' : 'warn');
    const serverlessReady = [meigen, wan22, wanAnimate].filter(Boolean).filter(engine => engine.available).length;
    setChip('meigenStatus', serverlessReady ? `${serverlessReady} ready` : 'Needs keys', serverlessReady ? 'green' : 'warn');
    const qwenNote = document.getElementById('qwenNote');
    if (qwenNote) qwenNote.textContent = chatterbox?.available
      ? 'Chatterbox Turbo is ready for preset voices and custom voice_url samples.'
      : qwen?.note || 'Waiting for Qwen TTS API workflow export.';
    const currentCreateType = document.getElementById('studioCreateType')?.value;
    if (currentCreateType) setCreateType(currentCreateType, { preserveToast: true });
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
      flowStatusChip('Meigen', engine('meigen')?.available, engine('meigen')?.note),
      flowStatusChip('Chatterbox', audio('chatterbox')?.available, audio('chatterbox')?.note)
    ],
    remix: [
      flowStatusChip('Wan Animate', engine('wan-animate')?.available, engine('wan-animate')?.note),
      flowStatusChip('Faster Whisper', tool('faster-whisper')?.available, tool('faster-whisper')?.note),
      flowStatusChip('Downloader', tool('downloader')?.available, tool('downloader')?.note)
    ],
    'long-form': [
      flowStatusChip('Wan 2.2', engine('wan22-serverless')?.available, engine('wan22-serverless')?.note),
      flowStatusChip('Chatterbox', audio('chatterbox')?.available, audio('chatterbox')?.note)
    ],
    webinar: [
      flowStatusChip('WAN/ComfyUI', engine('wan-comfy')?.available, engine('wan-comfy')?.note),
      flowStatusChip('Uploaded audio', true, 'Upload final webinar audio or source video.')
    ],
    course: [
      flowStatusChip('Wan 2.2', engine('wan22-serverless')?.available, engine('wan22-serverless')?.note),
      flowStatusChip('Chatterbox', audio('chatterbox')?.available, audio('chatterbox')?.note)
    ]
  };
  return `<div class="create-flow-status-row">${(statusSets[selected] || statusSets.shorts).join('')}</div>`;
}

function setCreateTool(tool = 'video') {
  const selected = tool || 'video';
  const studioTab = document.getElementById('tab-studio');
  studioTab?.classList.toggle('create-tool-audio', selected === 'audio');
  document.querySelectorAll('[data-create-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.createTool === selected);
  });

  const title = document.querySelector('#tab-studio .panel-title');
  const note = document.querySelector('#tab-studio .panel-note');
  if (selected === 'audio') {
    if (title) title.textContent = 'Create voice-over';
    if (note) note.textContent = 'Write or paste a script, choose Chatterbox or ElevenLabs v3, preview it, then save the approved audio.';
    const scriptLabel = document.getElementById('studioScriptLabel');
    const script = document.getElementById('studioScript');
    if (scriptLabel) scriptLabel.textContent = 'Voiceover script';
    if (script) script.placeholder = 'Paste the exact narration script for Chatterbox or ElevenLabs v3.';
    setAudioPreviewMode();
    setStudioMode('audio');
    setStudioAudio(document.getElementById('studioAudioProvider')?.value || 'chatterbox', { preserveToast: true });
    return;
  }

  if (title) title.textContent = 'Create video';
  if (note) note.textContent = 'Choose a video type, load a character, add voice, then generate.';
  const scriptLabel = document.getElementById('studioScriptLabel');
  const script = document.getElementById('studioScript');
  if (scriptLabel) scriptLabel.textContent = 'Script or notes';
  if (script) script.placeholder = 'Paste the narration script here so the job record keeps the creative direction with the video.';
  resetPreview();
  setCreateType(document.getElementById('studioCreateType')?.value || 'shorts');
}

function openCreateCharacterBuilder() {
  setCreateTool('video');
  showAgentModal();
  setAgentModalMode('build');
}

function setCreateType(type, options = {}) {
  const selected = type || 'shorts';
  document.getElementById('tab-studio')?.classList.remove('create-tool-audio');
  document.querySelectorAll('[data-create-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.createTool === 'video');
  });
  const flows = {
    shorts: {
      title: 'Shorts workflow',
      badge: 'Talking-head',
      desc: 'Create a short creator video from a character, script or approved audio, then save it to Library for posting.',
      mode: 'i2v',
      engine: 'meigen',
      audio: 'chatterbox',
      aspect: '9:16',
      steps: [
        ['Choose character', 'Select an influencer or upload a portrait.'],
        ['Create audio', 'Upload audio or generate a voice preview.'],
        ['Lip sync', 'Use Meigen for fast talking-head output.'],
        ['Save + post', 'Review in Library, then publish.']
      ]
    },
    remix: {
      title: 'Remix videos workflow',
      badge: 'Motion mimic',
      desc: 'Start from a viral source, extract the script, choose your character/product/voice, then use Wan Animate to mimic the reference movement.',
      mode: 'i2v',
      engine: 'wan-animate',
      audio: 'chatterbox',
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
      engine: 'wan22-serverless',
      audio: 'chatterbox',
      aspect: '16:9',
      steps: [
        ['Write script', 'Paste the full script or outline.'],
        ['Approve audio', 'Upload or generate voiceover before rendering.'],
        ['Generate sections', 'Use Wan 2.2 by segment for steadier output.'],
        ['Assemble', 'Save each section to Library for editing.']
      ]
    },
    webinar: {
      title: 'Webinar workflow',
      badge: 'Training',
      desc: 'Build webinar-style content from a teaching script, slides, or long source audio. Best for 16:9 output.',
      mode: 'v2v',
      engine: 'wan-comfy',
      audio: 'upload',
      aspect: '16:9',
      steps: [
        ['Upload source', 'Use a webinar clip, slide recording, or host video.'],
        ['Add narration', 'Upload final audio or use saved audio.'],
        ['Render V2V', 'Use the Bloomies video-to-video path.'],
        ['Review', 'Save finished sections to Library.']
      ]
    },
    course: {
      title: 'Course workflow',
      badge: 'Lessons',
      desc: 'Create lesson videos from structured scripts and approved narration. Works best as repeatable lesson modules.',
      mode: 'i2v',
      engine: 'wan22-serverless',
      audio: 'chatterbox',
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
  document.querySelectorAll('[data-create-type]').forEach(btn => btn.classList.toggle('active', btn.dataset.createType === selected));
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

  if (selected === 'remix') {
    document.getElementById('studioRemixContext')?.classList.add('active');
  } else {
    document.getElementById('studioRemixContext')?.classList.remove('active');
  }

  setStudioMode(flow.mode);
  if (flow.mode === 'i2v') {
    document.getElementById('studioVideoEngine').value = flow.engine;
    setStudioVideoEngine(flow.engine);
  }
  setStudioAudio(flow.audio, { preserveToast: true });
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
    setStudioAudio('chatterbox');
  }
}

function setStudioVideoEngine(engine) {
  const hint = document.getElementById('studioVideoEngineHint');
  const quality = document.getElementById('studioMeigenQualityGroup');
  const reference = document.getElementById('studioReferenceVideoGroup');
  if (quality) quality.style.display = engine === 'meigen' ? '' : 'none';
  if (reference) reference.style.display = engine === 'wan-animate' ? '' : 'none';
  if (hint) hint.textContent = getStudioEngineHint(engine);
  if (document.getElementById('studioMode').value === 'i2v') {
    document.getElementById('studioSubmitHint').textContent = getStudioEngineHint(engine);
  }
}

function getStudioEngineHint(engine) {
  if (engine === 'meigen') return 'Uses MeiGen-AI InfiniteTalk through the RunPod public endpoint. No ComfyUI pod required.';
  if (engine === 'wan22-serverless') return 'Uses the Wan 2.2 RunPod serverless endpoint for image-to-video. No ComfyUI pod required.';
  if (engine === 'wan-animate') return 'Uses Wan Animate serverless with a reference video to mimic motion. No ComfyUI pod required.';
  return 'Uses the installed WAN/ComfyUI workflow and RunPod pod.';
}

function setStudioAudio(provider, options = {}) {
  document.getElementById('studioAudioProvider').value = provider;
  document.getElementById('studioAudioGroup').style.display = provider === 'upload' ? '' : 'none';
  document.getElementById('studioAudioAssetGroup').style.display = provider === 'asset' ? '' : 'none';
  document.getElementById('studioVoiceGroup').style.display = provider === 'elevenlabs' ? '' : 'none';
  document.getElementById('studioChatterboxGroup').style.display = provider === 'chatterbox' ? '' : 'none';
  document.getElementById('studioPreviewVoiceButton').style.display = ['chatterbox', 'elevenlabs'].includes(provider) ? '' : 'none';
  document.getElementById('studioPreviewVoiceButton').textContent = provider === 'elevenlabs' ? 'Preview ElevenLabs voice' : 'Preview Chatterbox voice';
  if (options.preserveToast) return;
  if (provider === 'qwen') {
    toast('Qwen audio is visible but needs the third workflow API export before it can run.', 'info');
  }
  if (provider === 'elevenlabs') {
    toast('ElevenLabs will generate audio from the script before queuing the video.', 'info');
  }
  if (provider === 'chatterbox') {
    toast('Chatterbox will generate audio from the script before queuing the video.', 'info');
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
  frame.innerHTML = `<div><strong id="previewTitle">Audio preview appears here</strong><p id="previewHint" style="font-size:13px;margin-top:6px;color:rgba(255,255,255,.45)">Generate from script with Chatterbox or ElevenLabs v3, then play it here.</p></div>`;
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
  const engineNeedsAudio = !['wan22-serverless', 'wan-animate'].includes(videoEngine);
  if (engineNeedsAudio && document.getElementById('studioAudioProvider').value === 'upload' && !document.getElementById('studioAudio').files[0]) return toast('Upload an audio file first.', 'error');
  if (engineNeedsAudio && document.getElementById('studioAudioProvider').value === 'asset' && !document.getElementById('studioAudioAssetId').value) return toast('Choose saved audio first.', 'error');
  if (engineNeedsAudio && document.getElementById('studioAudioProvider').value === 'elevenlabs' && !document.getElementById('studioScript').value.trim()) return toast('Paste a script for ElevenLabs audio.', 'error');
  if (engineNeedsAudio && document.getElementById('studioAudioProvider').value === 'chatterbox' && !document.getElementById('studioScript').value.trim()) return toast('Paste a script for Chatterbox audio.', 'error');
  if (['meigen', 'wan22-serverless', 'wan-animate'].includes(videoEngine) && mode !== 'i2v') return toast('Serverless video engines are available in Image to video mode right now.', 'error');
  if (videoEngine === 'wan-animate' && !document.getElementById('studioReferenceVideo').files[0] && !document.getElementById('studioReferenceVideoUrl').value.trim() && !document.getElementById('studioRemixSourceUrl').value.trim()) {
    return toast('Wan Animate needs a reference motion video upload or URL.', 'error');
  }
  if (!confirm('Video generation starts immediately and uses processing time. Make sure your audio and visual are final before continuing.')) return;

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Queuing video...';
  startGenerationOverlay({ engine: videoEngine, mode });
  try {
    toast(['meigen', 'wan22-serverless', 'wan-animate'].includes(videoEngine) ? `Generating with ${getStudioEngineName(videoEngine)}...` : 'Queuing video. If the RunPod is asleep, Bloom Studio will wake it first.', 'info');
    const result = await api('/api/studio/generate', { method: 'POST', body: data });
    toast(['meigen', 'wan22-serverless', 'wan-animate'].includes(videoEngine) ? `${getStudioEngineName(videoEngine)} video generated and saved to Library.` : 'Video job queued.', 'success');
    studioJobs.unshift(result.job);
    await loadAssets();
    await loadVideos();
    stopGenerationOverlay({ success: true });
  } catch (err) {
    stopGenerationOverlay();
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '▶ Generate video';
  }
}

function getStudioEngineName(engine) {
  if (engine === 'meigen') return 'Meigen';
  if (engine === 'wan22-serverless') return 'Wan 2.2 Serverless';
  if (engine === 'wan-animate') return 'Wan Animate';
  return 'WAN ComfyUI';
}

async function submitAudioOnly(form) {
  const provider = document.getElementById('studioAudioProvider').value;
  if (provider === 'qwen') return toast('Qwen audio is not wired yet. Use Chatterbox or ElevenLabs for now.', 'error');
  if (!['chatterbox', 'elevenlabs'].includes(provider)) return toast('Choose Chatterbox or ElevenLabs to generate audio from script.', 'error');
  if (!document.getElementById('studioScript').value.trim()) return toast('Paste a script first.', 'error');
  return provider === 'elevenlabs' ? previewElevenLabsVoice(true) : previewChatterboxVoice(true);
}

function previewCurrentVoice() {
  const provider = document.getElementById('studioAudioProvider').value;
  if (provider === 'elevenlabs') return previewElevenLabsVoice(false);
  if (provider === 'chatterbox') return previewChatterboxVoice(false);
  return toast('Choose Chatterbox or ElevenLabs to preview a generated voice.', 'error');
}

async function previewChatterboxVoice(saveOnly = false) {
  const script = document.getElementById('studioScript').value.trim();
  if (!script) return toast('Paste a script first.', 'error');
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
    data.append('name', `Voiceover ${new Date().toLocaleString()}`);
    const sample = document.getElementById('studioVoiceSample')?.files?.[0];
    if (sample) data.append('voiceSample', sample);
    const response = await api('/api/tts/chatterbox', { method: 'POST', body: data });
    previewAudioAsset = response.result?.asset || null;
    const url = response.result?.asset?.files?.[0]?.path || response.result?.audioUrl;
    if (!url) throw new Error('Chatterbox did not return audio.');
    setVoicePreviewLoading(false);
    document.getElementById('studioVoicePreview').style.display = '';
    document.getElementById('studioVoicePreviewTitle').textContent = saveOnly ? 'Audio generated and saved' : 'Voice preview saved';
    document.getElementById('studioVoicePreviewAudio').src = await playableMediaUrl(url);
    toast('Voiceover generated and saved to audio Library.', 'success');
    await loadAssets();
  } catch (error) {
    setVoicePreviewLoading(false);
    toast(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Preview Chatterbox voice';
    }
  }
}

async function previewElevenLabsVoice(saveOnly = false) {
  const script = document.getElementById('studioScript').value.trim();
  if (!script) return toast('Paste a script first.', 'error');
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
        name: `Voiceover ${new Date().toLocaleString()}`
      })
    });
    previewAudioAsset = response.result?.asset || null;
    const url = response.result?.asset?.files?.[0]?.path;
    if (!url) throw new Error('ElevenLabs did not return saved audio.');
    setVoicePreviewLoading(false);
    document.getElementById('studioVoicePreview').style.display = '';
    document.getElementById('studioVoicePreviewTitle').textContent = saveOnly ? 'Audio generated and saved' : 'Voice preview saved';
    document.getElementById('studioVoicePreviewAudio').src = await playableMediaUrl(url);
    toast('Voiceover generated and saved to audio Library.', 'success');
    await loadAssets();
  } catch (error) {
    setVoicePreviewLoading(false);
    toast(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Preview ElevenLabs voice';
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
  const data = await api('/api/assets');
  assetsCache = data;
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
  grid.innerHTML = starterCharacters.map(character => renderCharacterCard(character, true)).join('');
}

function renderMyAgents(characters) {
  const grid = document.getElementById('myAgentsGrid');
  if (!grid) return;
  grid.classList.toggle('landscape', currentCharacterRatio === 'landscape');
  if (!characters.length) {
    grid.innerHTML = '<div class="character-empty">No agents uploaded yet. Click + New agent to add Sarah, Marcus, or any spokesperson portrait.</div>';
    return;
  }

  grid.innerHTML = characters.map(character => renderCharacterCard(character, false)).join('');
}

function renderCharacterCard(character, isLibrary) {
  const file = character.files?.[0];
  const imageUrl = character.imageUrl || file?.path || '';
  const displayUrl = authenticatedMediaUrl(imageUrl);
  const payload = JSON.stringify({ ...character, imageUrl }).replace(/'/g, '&apos;');
  const voice = character.voiceId ? 'Voice saved' : isLibrary ? character.role : 'No default voice';
  const manage = isLibrary
    ? ''
    : `<button class="btn btn-secondary" onclick="event.stopPropagation();editCharacterVoice('${character.slug}', '${(character.voiceId || '').replace(/'/g, "\\'")}')">Voice</button>
       <button class="btn btn-secondary" onclick="event.stopPropagation();deleteAsset('subjects','${character.slug}')">Delete</button>`;
  return `<div class="character-card" onclick='selectCharacter(${payload})'>
    <img src="${displayUrl}" alt="${character.name}" loading="lazy">
    <div class="character-menu">⋮</div>
    <div class="character-overlay">
      <div class="character-title">${character.name}</div>
      <div class="character-meta">${voice}</div>
      <div class="character-actions">
        <button class="btn btn-primary" onclick='event.stopPropagation();selectCharacter(${payload})'>Use</button>
        ${manage}
      </div>
    </div>
  </div>`;
}

function selectCharacter(character) {
  selectedCharacter = character;
  const file = character.files?.[0];
  const imageUrl = character.imageUrl || file?.path || '';
  const isLibrary = character.slug?.startsWith('library-');
  document.getElementById('studioImageAssetId').value = isLibrary ? '' : character.slug;
  document.getElementById('studioImageUrl').value = isLibrary ? imageUrl : '';
  document.getElementById('studioImage').value = '';
  document.getElementById('studioImageName').textContent = '';
  document.getElementById('selectedCharacterName').textContent = character.name;
  document.getElementById('selectedCharacterImg').src = authenticatedMediaUrl(imageUrl);
  document.getElementById('selectedCharacter').classList.add('active');
  setPreviewImage(imageUrl, character.name);
  if (character.voiceId) {
    document.getElementById('studioVoiceId').value = character.voiceId;
  }
  if (character.voiceSampleAssetId) {
    hydrateChatterboxVoiceUrl(character.voiceSampleAssetId);
  }
  setStudioMode('i2v');
  switchTab('studio');
  toast(`${character.name} loaded into Create.`, 'success');
}

async function hydrateChatterboxVoiceUrl(audioAssetId) {
  try {
    const data = await api(`/api/assets/audio/${audioAssetId}/temp-url`, { method: 'POST' });
    const input = document.getElementById('studioChatterboxVoiceUrl');
    if (input) input.value = data.url;
    toast('Default Chatterbox voice URL loaded for this character.', 'success');
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
  const isLibrary = character.slug?.startsWith('library-');
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
    setChip('nanoStatus', status.configured ? 'Nano ready' : 'Needs key', status.configured ? 'green' : 'warn');
    const note = document.getElementById('nanoEndpointNote');
    if (note) note.textContent = status.configured
      ? `Connected to ${status.endpointId || 'Nano Banana endpoint'}.`
      : 'Add the RunPod API key/endpoint on Railway before generation.';
  } catch (error) {
    setChip('nanoStatus', 'Endpoint error', 'red');
  }
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
  document.getElementById('productCharacterName').textContent = 'No primary image selected';
  document.getElementById('productImageName').textContent = '0 reference images selected';
  document.getElementById('productCharacterPreview').textContent = 'Optional primary image';
  document.getElementById('productImagePreview').textContent = 'Optional references';
  renderProductPlacementReferences();
  document.getElementById('productCharacterUpload').value = '';
  document.getElementById('productImageUpload').value = '';
  document.getElementById('productPlacementResult').innerHTML = '<div><strong>Preview idle</strong><p class="hint">Enter a prompt, then optionally attach references.</p></div>';
  document.getElementById('productResultActions').style.display = 'none';
  const button = document.getElementById('productGenerateButton');
  if (button) {
    button.disabled = false;
    button.textContent = 'Run Nano Banana';
  }
}

async function generateProductPlacement() {
  const prompt = document.getElementById('productPlacementPrompt').value.trim();
  if (!prompt && !productPlacementCharacter && !productPlacementReferences.length) return toast('Add a prompt or at least one reference image first.', 'error');
  const button = document.getElementById('productGenerateButton');
  const resultFrame = document.getElementById('productPlacementResult');
  const aspectRatio = document.getElementById('productPlacementAspect').value;
  resultFrame.classList.toggle('ratio-portrait', aspectRatio === '9:16');
  if (productPlacementRequest) productPlacementRequest.abort();
  productPlacementTimedOut = false;
  const controller = new AbortController();
  productPlacementRequest = controller;
  const timeoutId = setTimeout(() => {
    productPlacementTimedOut = true;
    controller.abort();
  }, 300000);
  button.disabled = true;
  button.textContent = 'Running Nano...';
  resultFrame.innerHTML = '<div class="cooking-state"><div class="cooking-orb"></div><strong>Generating with Nano Banana</strong><p class="hint">Uploading public references and waiting for the /runsync result.</p><div class="cooking-steps">Large edits can take several minutes.</div></div>';
  try {
    const data = new FormData();
    data.append('prompt', prompt);
    data.append('aspectRatio', aspectRatio);
    data.append('size', document.getElementById('productPlacementSize').value);
    if (productPlacementCharacter.file) data.append('character', productPlacementCharacter.file);
    else if (productPlacementCharacter.assetId) data.append('characterAssetId', productPlacementCharacter.assetId);
    else data.append('characterUrl', productPlacementCharacter.imageUrl);
    productPlacementReferences.forEach(reference => {
      if (reference.file) data.append('references', reference.file);
      else if (reference.assetId) data.append('referenceAssetIds', reference.assetId);
      else if (reference.imageUrl) data.append('referenceUrls', reference.imageUrl);
    });

    const response = await api('/api/product-placement/generate', { method: 'POST', body: data, signal: controller.signal });
    const image = response.result?.image;
    if (image) {
      latestProductPlacementImage = image;
      resultFrame.innerHTML = `<img src="${image}" alt="Generated product placement">`;
      const link = document.getElementById('productResultDownload');
      link.href = image;
      document.getElementById('productResultActions').style.display = '';
      saveGeneratedImageToLibrary(image);
      toast('Composite image generated.', 'success');
    } else {
      resultFrame.innerHTML = '<div><strong>No image returned</strong><p class="hint">Nano Banana completed but the response did not include an image URL.</p></div>';
      toast('Nano Banana did not return an image URL.', 'error');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      resultFrame.innerHTML = productPlacementTimedOut
        ? '<div><strong>Request timed out</strong><p class="hint">Nano Banana did not return within 5 minutes. Check the public endpoint logs or try again.</p></div>'
        : '<div><strong>Generation stopped</strong><p class="hint">The Nano Banana request was cancelled.</p></div>';
      toast(productPlacementTimedOut ? 'Nano Banana timed out after 5 minutes.' : 'Nano Banana generation cancelled.', productPlacementTimedOut ? 'error' : 'info');
    } else {
      resultFrame.innerHTML = `<div><strong>Generation failed</strong><p class="hint">${escapeHtml(error.message || 'Check endpoint settings or prompt inputs.')}</p></div>`;
      toast(error.message, 'error');
    }
  } finally {
    clearTimeout(timeoutId);
    if (productPlacementRequest === controller) productPlacementRequest = null;
    productPlacementTimedOut = false;
    button.disabled = false;
    button.textContent = 'Run Nano Banana';
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function saveGeneratedImageToLibrary(imageUrl) {
  try {
    const prompt = document.getElementById('productPlacementPrompt').value.trim();
    await api('/api/assets/generated-image', {
      method: 'POST',
      body: JSON.stringify({
        imageUrl,
        name: `Nano Banana ${new Date().toLocaleString()}`,
        prompt
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
    switchTab('characters');
    setCharacterTab('mine');
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

function clearSelectedCharacter() {
  selectedCharacter = null;
  document.getElementById('studioImageAssetId').value = '';
  document.getElementById('studioImageUrl').value = '';
  document.getElementById('selectedCharacter').classList.remove('active');
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
  if (type === 'outputs') {
    libraryImageItems = assets
      .map(asset => {
        const file = asset.files?.[0];
        if (!file || !/\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)) return null;
        return {
          type: 'image',
          name: asset.name,
          url: authenticatedMediaUrl(file.path),
          rawUrl: file.path,
          prompt: asset.aiContext?.prompt || asset.aiContext?.source || '',
          aspectRatio: asset.aiContext?.aspectRatio || (currentLibraryImageRatio === 'landscape' ? '16:9' : '9:16')
        };
      })
      .filter(Boolean);
  }
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
    const openAttr = type === 'outputs' && isImage ? `onclick="openLibraryLightbox('images',${++imageIndex})"` : '';
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
    switchTab('characters');
    setCharacterTab('mine');
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
    await api('/api/assets/subjects/from-image-url', {
      method: 'POST',
      body: JSON.stringify({ imageUrl: latestBuiltAgentImage, name })
    });
    toast('Generated character added to My agents.', 'success');
    closeAgentModal();
    await loadAssets();
    switchTab('characters');
    setCharacterTab('mine');
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
    if (type === 'subjects') switchTab('characters');
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
    toast('Temporary voice URL copied. Paste it into Chatterbox custom voice URL.', 'success');
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

async function loadVideos() {
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
  libraryVideoItems = combined
    .filter(v => v.status === 'completed' && (v.localPath || '').trim())
    .map(v => ({
      type: 'video',
      name: v.prompt || v.format || 'Generated video',
      url: authenticatedMediaUrl(v.localPath || ''),
      prompt: v.prompt || '',
      aspectRatio: v.aspectRatio || (currentLibraryVideoRatio === 'landscape' ? '16:9' : '9:16')
    }));

  if (!combined.length) {
    grid.innerHTML = '<div class="empty-state">No videos generated yet. Create your first clip from the Create tab.</div>';
    return;
  }

  let videoIndex = -1;
  grid.innerHTML = combined.map(v => {
    const statusChip = v.status === 'completed' ? '<span class="chip chip-green">Completed</span>' : v.status === 'failed' ? '<span class="chip chip-red">Failed</span>' : '<span class="chip chip-warn">Processing</span>';
    const mediaUrl = authenticatedMediaUrl(v.localPath || '');
    const lightboxIndex = v.status === 'completed' && mediaUrl ? ++videoIndex : -1;
    const posterId = `poster-${String(v.requestId || v.jobId || Math.random()).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const videoPreviewUrl = mediaUrl ? `${mediaUrl}#t=0.1` : '';
    const videoEl = mediaUrl
      ? `<div class="video-thumb-wrap" onclick="openLibraryLightbox('videos',${lightboxIndex})">
          <img class="video-poster" id="${posterId}" alt="Video preview">
          <video class="video-player" preload="auto" muted playsinline onloadeddata="captureVideoPoster(this,'${posterId}')" onseeked="captureVideoPoster(this,'${posterId}')" onplay="markVideoPlaying(this,true)" onpause="markVideoPlaying(this,false)">
            <source src="${videoPreviewUrl}" type="video/mp4">
          </video>
          <div class="video-play-badge">▶ Preview</div>
        </div>`
      : `<div class="video-player" style="display:flex;align-items:center;justify-content:center;color:#999">Processing</div>`;
    const actions = v.status === 'completed' && mediaUrl
      ? `<div class="actions"><button class="btn btn-primary" onclick="event.stopPropagation();openPublishModal('${mediaUrl.replace(/'/g, "\\'")}','video')">Post</button><a class="btn btn-secondary" href="${mediaUrl}" download onclick="event.stopPropagation()">Save</a></div>`
      : '';
    return `<div class="video-card">${videoEl}<div class="video-info" onclick="${mediaUrl ? `openLibraryLightbox('videos',${lightboxIndex})` : ''}"><div style="display:flex;justify-content:space-between;gap:8px"><span class="chip chip-soft">${v.format || 'custom'}</span>${statusChip}</div><div class="video-prompt">${v.prompt || v.localPath || ''}</div>${v.error ? `<div class="video-prompt" style="color:var(--red)">${v.error}</div>` : ''}${actions}</div></div>`;
  }).join('');
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

initAuth();
updatePreviewRatio();
updateThemeButton();
setInterval(loadDashboard, 30000);
