// UGC Pipeline - Control Center JS
const API = '';

// State
let currentVariants = null;
let currentBatchId = null;

// ── Navigation ──
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
  if (tabId === 'generate') loadGenerateOptions();
  if (tabId === 'videos') loadVideos();
}

// ── Toast Notifications ──
function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── API Helpers ──
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  return res.json();
}

// ── Dashboard ──
async function loadDashboard() {
  try {
    const status = await api('/api/status');
    const assets = await api('/api/assets');
    const videos = await api('/api/videos');

    const totalAssets = (assets.products?.length || 0) + (assets.subjects?.length || 0) + (assets.audio?.length || 0);

    document.getElementById('metricBrands').textContent = status.brands || 0;
    document.getElementById('metricAssets').textContent = totalAssets;
    document.getElementById('metricVideos').textContent = videos.completed || 0;
    document.getElementById('metricPending').textContent = videos.pending || 0;

    const chip = document.getElementById('apiKeyChip');
    if (status.apiKeyConfigured) {
      chip.className = 'chip chip-green';
      chip.textContent = 'Connected';
      document.getElementById('statusDot').style.background = 'var(--gr)';
      document.getElementById('statusText').textContent = 'API Connected';
    } else {
      chip.className = 'chip chip-red';
      chip.textContent = 'Not Set';
      document.getElementById('statusDot').style.background = 'var(--err)';
      document.getElementById('statusText').textContent = 'API Key Missing';
    }
  } catch (e) {
    document.getElementById('statusDot').style.background = 'var(--err)';
    document.getElementById('statusText').textContent = 'Connection Error';
  }
}

// ── Assets ──
async function loadAssets() {
  const data = await api('/api/assets');
  renderAssetGrid('productGrid', data.products || [], 'products');
  renderAssetGrid('subjectGrid', data.subjects || [], 'subjects');
  renderAssetGrid('audioGrid', data.audio || [], 'audio');
}

function renderAssetGrid(containerId, assets, type) {
  const grid = document.getElementById(containerId);
  if (assets.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">+</div><div class="empty-state-text">No ${type} uploaded yet</div></div>`;
    return;
  }

  grid.innerHTML = assets.map(asset => {
    const file = asset.files[0];
    const isImage = file && /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);
    const isAudio = file && /\.(mp3|wav|m4a|ogg|aac)$/i.test(file.name);

    const thumb = isImage
      ? `<div class="asset-thumb"><img src="${file.path}" alt="${asset.name}"></div>`
      : isAudio
        ? `<div class="asset-thumb" style="font-size:24px">&#9835;</div>`
        : `<div class="asset-thumb">&#128193;</div>`;

    const context = asset.aiContext
      ? `<div style="margin-top:4px"><span class="chip chip-purple" style="font-size:10px">AI Analyzed</span></div>`
      : '';

    return `<div class="asset-card">
      ${thumb}
      <div class="asset-info">
        <div class="asset-name">${asset.name}</div>
        <div class="asset-meta">${file ? formatBytes(file.size) : 'Empty'}</div>
        ${context}
      </div>
      <div class="asset-actions">
        <button class="btn btn-secondary btn-sm" onclick="viewContext('${type}','${asset.slug}')">Context</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAsset('${type}','${asset.slug}')">Delete</button>
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
  if (input.files[0]) {
    document.getElementById('uploadFileName').textContent = input.files[0].name;
  }
}

async function uploadAsset(e) {
  e.preventDefault();
  const type = document.getElementById('uploadType').value;
  const name = document.getElementById('uploadName').value;
  const file = document.getElementById('uploadFile').files[0];

  if (!file) { toast('Please select a file', 'error'); return; }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);

  try {
    const res = await fetch(`${API}/api/assets/${type}`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      toast(`${name} uploaded successfully`, 'success');
      closeUploadModal();
      loadAssets();
    } else {
      toast(data.error || 'Upload failed', 'error');
    }
  } catch (err) {
    toast('Upload failed: ' + err.message, 'error');
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
  const assets = data[type] || [];
  const asset = assets.find(a => a.slug === slug);
  if (asset?.aiContext) {
    alert(JSON.stringify(asset.aiContext, null, 2));
  } else {
    toast('No AI context yet. Run "Analyze Assets" first.', 'info');
  }
}

async function analyzeAssets() {
  toast('Analyzing assets...', 'info');
  const data = await api('/api/analyze/assets', { method: 'POST' });
  toast(`Analyzed ${data.totalAnalyzed} assets`, 'success');
}

// ── Brands ──
async function loadBrands() {
  const brands = await api('/api/brands');
  const container = document.getElementById('brandsList');

  if (brands.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No brands configured yet</div></div>';
    return;
  }

  container.innerHTML = brands.map(b => `
    <div class="card" style="margin-bottom:12px;background:var(--bg)">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <div style="font-size:15px;font-weight:700">${b.name}</div>
          <div style="font-size:12px;color:var(--so);margin-top:2px">${b.category || ''} ${b.pricePoint ? '&middot; ' + b.pricePoint : ''}</div>
          ${b.sellingPoints?.length ? `<ul class="selling-points-list" style="margin-top:8px">${b.sellingPoints.map(s => `<li>${s}</li>`).join('')}</ul>` : ''}
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            ${b.discountCode ? `<span class="chip chip-accent">${b.discountCode}</span>` : ''}
            ${b.tone ? `<span class="chip chip-purple">${b.tone}</span>` : ''}
            ${(b.platforms || []).map(p => `<span class="chip chip-blue">${p}</span>`).join('')}
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="editBrand('${b.slug}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBrand('${b.slug}')">Delete</button>
        </div>
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
    sellingPoints: form.sellingPoints.value.split('\n').filter(s => s.trim()),
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
  } else {
    toast(result.error || 'Save failed', 'error');
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
  form.tone.value = brand.tone || 'energetic';
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

// ── Generate ──
async function loadGenerateOptions() {
  const [brands, assets] = await Promise.all([api('/api/brands'), api('/api/assets')]);

  const brandSelect = document.getElementById('genBrand');
  brandSelect.innerHTML = '<option value="">Select brand...</option>' +
    brands.map(b => `<option value="${b.slug}">${b.name}</option>`).join('');

  const subjectSelect = document.getElementById('genSubject');
  subjectSelect.innerHTML = '<option value="">None</option>' +
    (assets.subjects || []).map(s => `<option value="${s.slug}">${s.name}</option>`).join('');

  const audioSelect = document.getElementById('genAudio');
  audioSelect.innerHTML = '<option value="">None</option>' +
    (assets.audio || []).map(a => `<option value="${a.slug}">${a.name}</option>`).join('');
}

function getSelectedFormats() {
  return Array.from(document.querySelectorAll('.format-checkbox:checked')).map(cb => cb.value);
}

async function estimateCost() {
  const formats = getSelectedFormats();
  const variants = formats.length * 2;
  const data = await api('/api/generate/estimate', {
    method: 'POST',
    body: JSON.stringify({
      variants,
      duration: parseInt(document.getElementById('genDuration').value),
      resolution: document.getElementById('genResolution').value,
      model: document.getElementById('genModel').value
    })
  });

  toast(`Estimated cost: $${data.total} for ${data.count} videos`, 'info');
}

async function previewVariants() {
  const brandSlug = document.getElementById('genBrand').value;
  if (!brandSlug) { toast('Select a brand first', 'error'); return; }

  toast('Generating variant previews...', 'info');

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

  if (data.error) { toast(data.error, 'error'); return; }

  currentVariants = data;
  currentBatchId = data.batchId;

  document.getElementById('variantPreviewCard').style.display = 'block';
  document.getElementById('costEstimate').innerHTML =
    `<div class="cost-summary" style="padding:12px 20px"><div class="cost-total" style="font-size:24px">${data.estimatedTotalCost}</div><div class="cost-detail">${data.totalVariants} variants</div></div>`;

  document.getElementById('variantList').innerHTML = data.variants.map(v => `
    <div class="variant-item">
      <div class="variant-header">
        <span class="variant-num">Variant ${v.variantNum}</span>
        <span class="variant-format">${v.format}</span>
      </div>
      <div class="variant-script">${v.script}</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="variant-cost">$${v.estimatedCost.toFixed(2)}</div>
        <span class="chip chip-green" style="font-size:10px">${data.variants[0]?.payload?.resolution || '720p'}</span>
      </div>
    </div>
  `).join('');

  toast(`${data.totalVariants} variants ready for review`, 'success');
}

async function submitVariants() {
  if (!currentVariants) return;

  const btn = document.getElementById('submitBtn');
  const status = document.getElementById('submitStatus');
  btn.disabled = true;
  status.innerHTML = '<span class="spinner"></span> Submitting to Seedance 2 API...';

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

    status.innerHTML = '';
    btn.disabled = false;

    if (result.submitted > 0) {
      toast(`${result.submitted} variants submitted! Polling will check status automatically.`, 'success');
      switchTab('videos');
    }
    if (result.failed > 0) {
      toast(`${result.failed} variants failed to submit`, 'error');
    }
  } catch (err) {
    status.innerHTML = '';
    btn.disabled = false;
    toast('Submission failed: ' + err.message, 'error');
  }
}

// ── Videos ──
async function loadVideos() {
  const data = await api('/api/videos');

  if (data.total > 0) {
    const pct = Math.round((data.completed / data.total) * 100);
    document.getElementById('videoProgress').style.display = 'block';
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent =
      `${data.completed}/${data.total} completed, ${data.pending} pending, ${data.failed} failed`;
  } else {
    document.getElementById('videoProgress').style.display = 'none';
  }

  const grid = document.getElementById('videoGrid');
  const videos = data.videos || [];

  if (videos.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#127909;</div><div class="empty-state-text">No videos generated yet</div><div class="empty-state-hint">Go to Generate tab to create A/B test variants</div></div>';
    return;
  }

  grid.innerHTML = videos.map(v => {
    const statusChip = v.status === 'completed'
      ? '<span class="chip chip-green">Completed</span>'
      : v.status === 'failed'
        ? '<span class="chip chip-red">Failed</span>'
        : '<span class="chip chip-accent">Processing</span>';

    const videoEl = v.localPath
      ? `<video class="video-player" controls preload="metadata"><source src="${v.localPath}" type="video/mp4"></video>`
      : `<div class="video-player" style="display:flex;align-items:center;justify-content:center;color:var(--fa)">
          ${v.status === 'failed' ? 'Generation Failed' : '<span class="spinner"></span>'}
        </div>`;

    return `<div class="video-card">
      ${videoEl}
      <div class="video-info">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="video-format chip chip-purple">${v.format || 'custom'}</span>
          ${statusChip}
        </div>
        <div class="video-prompt">${v.prompt || ''}</div>
        <div class="video-cost">${v.estimatedCost ? '$' + v.estimatedCost.toFixed(2) : ''}</div>
        ${v.error ? `<div style="font-size:12px;color:var(--err);margin-top:4px">${v.error}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function pollAllJobs() {
  toast('Polling all pending jobs...', 'info');
  const data = await api('/api/videos/poll-all', { method: 'POST' });
  toast(`Polled ${data.polled} jobs`, 'success');
  loadVideos();
}

// ── Utilities ──
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── Drag & Drop on Upload Zone ──
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('uploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const input = document.getElementById('uploadFile');
      input.files = e.dataTransfer.files;
      handleFileSelect(input);
    });
  }
});

// ── Init ──
loadDashboard();
setInterval(loadDashboard, 30000);
