const API = '';

let currentVariants = null;
let currentBatchId = null;
let studioJobs = [];

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
  document.getElementById(`tab-${tabId}`)?.classList.add('active');

  if (tabId === 'assets') loadAssets();
  if (tabId === 'brands') loadBrands();
  if (tabId === 'advanced') loadGenerateOptions();
  if (tabId === 'videos') loadVideos();
  if (tabId === 'studio') loadStudioStatus();
}

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4800);
}

async function api(path, opts = {}) {
  const headers = opts.body instanceof FormData
    ? (opts.headers || {})
    : { 'Content-Type': 'application/json', ...(opts.headers || {}) };

  const res = await fetch(`${API}${path}`, { headers, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `Request failed: ${res.status}`);
  return data;
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
    setChip('comfyStatus', data.configured ? 'Connected' : 'Needs URL', data.configured ? 'green' : 'warn');

    const i2v = data.presets.find(p => p.id === 'sarah-i2v-lipsync');
    const v2v = data.presets.find(p => p.id === 'bloomies-v2v');
    setChip('i2vStatus', i2v?.available ? 'Ready' : 'Missing', i2v?.available ? 'soft' : 'red');
    setChip('v2vStatus', v2v?.available ? 'Ready' : 'Missing', v2v?.available ? 'soft' : 'red');

    const qwen = data.audioProviders.find(p => p.id === 'qwen');
    setChip('qwenStatus', qwen?.available ? 'Ready' : 'Needs workflow', qwen?.available ? 'soft' : 'warn');
  } catch (e) {
    setChip('comfyStatus', 'Error', 'red');
  }
}

function setChip(id, label, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = label;
  el.className = `chip chip-${state}`;
}

function setStudioMode(mode) {
  const actualMode = mode === 'qwen' ? document.getElementById('studioMode').value : mode;
  if (mode === 'qwen') {
    setStudioAudio('qwen');
    return;
  }

  document.getElementById('studioMode').value = actualMode;
  document.getElementById('studioPreset').value = actualMode === 'v2v' ? 'bloomies-v2v' : 'sarah-i2v-lipsync';
  document.querySelectorAll('[data-mode-choice]').forEach(btn => btn.classList.toggle('active', btn.dataset.modeChoice === actualMode));
  document.getElementById('studioImageGroup').style.display = actualMode === 'i2v' ? '' : 'none';
  document.getElementById('studioVideoGroup').style.display = actualMode === 'v2v' ? '' : 'none';
  document.getElementById('studioSubmitHint').textContent = actualMode === 'v2v'
    ? 'Uses the Bloomies V2V workflow preset.'
    : 'Uses the Sarah I2V lip-sync workflow preset.';
}

function setStudioAudio(provider) {
  document.getElementById('studioAudioProvider').value = provider;
  document.getElementById('studioAudioGroup').style.display = provider === 'upload' ? '' : 'none';
  document.getElementById('studioVoiceGroup').style.display = provider === 'elevenlabs' ? '' : 'none';
  if (provider === 'qwen') {
    toast('Qwen audio is visible but needs the third workflow API export before it can run.', 'info');
  }
  if (provider === 'elevenlabs') {
    toast('ElevenLabs will generate audio from the script before queuing the video.', 'info');
  }
}

function showStudioFileName(inputId, targetId) {
  const input = document.getElementById(inputId);
  const target = document.getElementById(targetId);
  target.textContent = input.files?.[0]?.name || '';
}

function resetStudioForm() {
  document.getElementById('studioForm').reset();
  document.getElementById('studioImageName').textContent = '';
  document.getElementById('studioVideoName').textContent = '';
  document.getElementById('studioAudioName').textContent = '';
  setStudioMode('i2v');
  setStudioAudio('upload');
}

async function submitStudioVideo(e) {
  e.preventDefault();
  const form = document.getElementById('studioForm');
  const data = new FormData(form);
  data.append('clientJobId', crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

  const mode = document.getElementById('studioMode').value;
  if (mode === 'i2v' && !document.getElementById('studioImage').files[0]) return toast('Upload a portrait image first.', 'error');
  if (mode === 'v2v' && !document.getElementById('studioVideo').files[0]) return toast('Upload a source video first.', 'error');
  if (document.getElementById('studioAudioProvider').value === 'upload' && !document.getElementById('studioAudio').files[0]) return toast('Upload an audio file first.', 'error');
  if (document.getElementById('studioAudioProvider').value === 'elevenlabs' && !document.getElementById('studioScript').value.trim()) return toast('Paste a script for ElevenLabs audio.', 'error');

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Queuing video...';
  try {
    const result = await api('/api/studio/generate', { method: 'POST', body: data });
    toast('Video job queued.', 'success');
    studioJobs.unshift(result.job);
    switchTab('videos');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '▶ Generate video';
  }
}

async function loadAssets() {
  const data = await api('/api/assets');
  renderAssetGrid('productGrid', data.products || [], 'products');
  renderAssetGrid('subjectGrid', data.subjects || [], 'subjects');
  renderAssetGrid('audioGrid', data.audio || [], 'audio');
}

function renderAssetGrid(containerId, assets, type) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  if (assets.length === 0) {
    grid.innerHTML = `<div class="empty-state">No ${type} uploaded yet</div>`;
    return;
  }

  grid.innerHTML = assets.map(asset => {
    const file = asset.files[0];
    const isImage = file && /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);
    const isAudio = file && /\.(mp3|wav|m4a|ogg|aac)$/i.test(file.name);
    const thumb = isImage
      ? `<div class="asset-thumb"><img src="${file.path}" alt="${asset.name}"></div>`
      : `<div class="asset-thumb">${isAudio ? 'Audio' : 'File'}</div>`;

    return `<div class="asset-card">
      ${thumb}
      <div class="asset-info">
        <div class="asset-name">${asset.name}</div>
        <div class="asset-meta">${file ? formatBytes(file.size) : 'Empty'}</div>
      </div>
      <div class="asset-actions">
        <button class="btn btn-secondary" onclick="viewContext('${type}','${asset.slug}')">Context</button>
        <button class="btn btn-secondary" onclick="deleteAsset('${type}','${asset.slug}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function showUploadModal(type) {
  document.getElementById('uploadType').value = type;
  document.getElementById('uploadName').value = '';
  document.getElementById('uploadFile').value = '';
  document.getElementById('uploadFileName').textContent = '';
  document.getElementById('uploadModal').classList.add('active');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('active');
}

function handleFileSelect(input) {
  document.getElementById('uploadFileName').textContent = input.files[0]?.name || '';
}

async function uploadAsset(e) {
  e.preventDefault();
  const type = document.getElementById('uploadType').value;
  const name = document.getElementById('uploadName').value;
  const file = document.getElementById('uploadFile').files[0];
  if (!file) return toast('Please select a file', 'error');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);

  try {
    const data = await api(`/api/assets/${type}`, { method: 'POST', body: formData });
    if (data.success) {
      toast(`${name} uploaded`, 'success');
      closeUploadModal();
      loadAssets();
    }
  } catch (err) {
    toast(err.message, 'error');
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

async function estimateCost() {
  const formats = getSelectedFormats();
  const data = await api('/api/generate/estimate', {
    method: 'POST',
    body: JSON.stringify({
      variants: formats.length * 2,
      duration: parseInt(document.getElementById('genDuration').value),
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
      duration: parseInt(document.getElementById('genDuration').value),
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

async function loadVideos() {
  let seedance = { videos: [], total: 0, completed: 0, pending: 0, failed: 0 };
  let studio = { jobs: [] };
  try { seedance = await api('/api/videos'); } catch (e) {}
  try { studio = await api('/api/studio/jobs'); } catch (e) {}
  studioJobs = studio.jobs || studioJobs;

  const total = seedance.total + studioJobs.length;
  if (total > 0) {
    const completed = seedance.completed + studioJobs.filter(j => j.status === 'completed').length;
    const pct = Math.round((completed / total) * 100);
    document.getElementById('videoProgress').style.display = 'block';
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent = `${completed}/${total} completed`;
  } else {
    document.getElementById('videoProgress').style.display = 'none';
  }

  const combined = [
    ...studioJobs.map(j => ({ ...j, format: j.presetId || 'studio', prompt: j.script || j.prompt })),
    ...(seedance.videos || [])
  ];

  const grid = document.getElementById('videoGrid');
  if (!combined.length) {
    grid.innerHTML = '<div class="empty-state">No videos generated yet. Create your first clip from the Create tab.</div>';
    return;
  }

  grid.innerHTML = combined.map(v => {
    const statusChip = v.status === 'completed' ? '<span class="chip chip-green">Completed</span>' : v.status === 'failed' ? '<span class="chip chip-red">Failed</span>' : '<span class="chip chip-warn">Processing</span>';
    const videoEl = v.localPath
      ? `<video class="video-player" controls preload="metadata"><source src="${v.localPath}" type="video/mp4"></video>`
      : `<div class="video-player" style="display:flex;align-items:center;justify-content:center;color:#999">Processing</div>`;
    return `<div class="video-card">${videoEl}<div class="video-info"><div style="display:flex;justify-content:space-between;gap:8px"><span class="chip chip-soft">${v.format || 'custom'}</span>${statusChip}</div><div class="video-prompt">${v.prompt || ''}</div>${v.error ? `<div class="video-prompt" style="color:var(--red)">${v.error}</div>` : ''}</div></div>`;
  }).join('');
}

async function pollAllJobs() {
  const data = await api('/api/videos/poll-all', { method: 'POST' });
  toast(`Polled ${data.polled} Seedance jobs`, 'success');
  loadVideos();
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

loadDashboard();
loadStudioStatus();
setInterval(loadDashboard, 30000);
