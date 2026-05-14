const API = '';

let currentVariants = null;
let currentBatchId = null;
let studioJobs = [];
let authConfig = null;
let supabaseClient = null;
let authToken = localStorage.getItem('bloomStudioToken') || '';
let currentTenant = JSON.parse(localStorage.getItem('bloomStudioTenant') || 'null');
let selectedCharacter = null;
let currentCharacterTab = 'library';
let currentCharacterRatio = 'portrait';
let productPlacementCharacter = null;
let productPlacementProduct = null;
let productPlacementRequest = null;
let productPlacementTimedOut = false;
let studioCrop = { x: 50, y: 50 };
let cropDrag = null;

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
}

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4800);
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
    setChip('qwenStatus', qwen?.available ? 'Ready' : 'Needs workflow', qwen?.available ? 'soft' : 'warn');
    const qwenNote = document.getElementById('qwenNote');
    if (qwenNote) qwenNote.textContent = qwen?.available ? 'Qwen TTS workflow is ready.' : qwen?.note || 'Waiting for Qwen TTS API workflow export.';
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
  updatePreviewRatio();
  resetStudioCrop();
  frame.classList.add('has-media');
  frame.innerHTML = `<img src="${src}" alt="${title}">`;
  frame.onpointerdown = startPreviewDrag;
  document.getElementById('cropHint').style.display = '';
  applyStudioCrop();
}

function setPreviewVideo(src, title = 'Selected video') {
  const frame = document.getElementById('studioPreview');
  if (!frame || !src) return;
  updatePreviewRatio();
  frame.classList.add('has-media');
  frame.classList.remove('dragging');
  frame.onpointerdown = null;
  frame.innerHTML = `<video src="${src}" controls muted playsinline aria-label="${title}"></video>`;
  document.getElementById('cropHint').style.display = 'none';
}

function resetPreview() {
  const frame = document.getElementById('studioPreview');
  if (!frame) return;
  updatePreviewRatio();
  frame.classList.remove('has-media');
  frame.classList.remove('dragging');
  frame.onpointerdown = null;
  resetStudioCrop();
  document.getElementById('cropHint').style.display = 'none';
  frame.innerHTML = `<div><div style="font-size:34px;margin-bottom:10px">▶</div><strong id="previewTitle">Your video preview appears here</strong><p id="previewHint" style="font-size:13px;margin-top:6px;color:rgba(255,255,255,.45)">Select a character or upload an image to preview the frame.</p></div>`;
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
  clearSelectedCharacter();
  resetPreview();
  setStudioMode('i2v');
  setStudioAudio('upload');
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
  const data = new FormData(form);
  data.append('clientJobId', crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

  const mode = document.getElementById('studioMode').value;
  if (mode === 'i2v' && !document.getElementById('studioImage').files[0] && !document.getElementById('studioImageAssetId').value && !document.getElementById('studioImageUrl').value) return toast('Upload a portrait image or select a saved character first.', 'error');
  if (mode === 'v2v' && !document.getElementById('studioVideo').files[0]) return toast('Upload a source video first.', 'error');
  if (document.getElementById('studioAudioProvider').value === 'upload' && !document.getElementById('studioAudio').files[0]) return toast('Upload an audio file first.', 'error');
  if (document.getElementById('studioAudioProvider').value === 'elevenlabs' && !document.getElementById('studioScript').value.trim()) return toast('Paste a script for ElevenLabs audio.', 'error');

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Queuing video...';
  try {
    toast('Queuing video. If the RunPod is asleep, Bloom Studio will wake it first.', 'info');
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
  renderAgentLibrary();
  renderMyAgents(data.subjects || []);
  renderAssetGrid('audioGrid', data.audio || [], 'audio');
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
  const payload = JSON.stringify({ ...character, imageUrl }).replace(/'/g, '&apos;');
  const voice = character.voiceId ? 'Voice saved' : isLibrary ? character.role : 'No default voice';
  const manage = isLibrary
    ? ''
    : `<button class="btn btn-secondary" onclick="event.stopPropagation();editCharacterVoice('${character.slug}', '${(character.voiceId || '').replace(/'/g, "\\'")}')">Voice</button>
       <button class="btn btn-secondary" onclick="event.stopPropagation();deleteAsset('subjects','${character.slug}')">Delete</button>`;
  return `<div class="character-card" onclick='selectCharacter(${payload})'>
    <img src="${imageUrl}" alt="${character.name}" loading="lazy">
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
  document.getElementById('selectedCharacterImg').src = imageUrl;
  document.getElementById('selectedCharacter').classList.add('active');
  setPreviewImage(imageUrl, character.name);
  if (character.voiceId) {
    document.getElementById('studioVoiceId').value = character.voiceId;
  }
  setStudioMode('i2v');
  switchTab('studio');
  toast(`${character.name} loaded into Create.`, 'success');
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
    const payload = JSON.stringify({ ...character, imageUrl }).replace(/'/g, '&apos;');
    return `<div class="mini-pick" onclick='selectProductPlacementCharacter(${payload})'>
      <img src="${imageUrl}" alt="${character.name}" loading="lazy">
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
    const payload = JSON.stringify({ ...product, imageUrl }).replace(/'/g, '&apos;');
    return `<div class="mini-pick" onclick='selectProductPlacementProduct(${payload})'>
      <img src="${imageUrl}" alt="${product.name}" loading="lazy">
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
  document.getElementById('productCharacterPreview').innerHTML = `<img src="${imageUrl}" alt="${character.name}">`;
}

function selectProductPlacementProduct(product) {
  const file = product.files?.[0];
  const imageUrl = product.imageUrl || file?.path || '';
  productPlacementProduct = {
    slug: product.slug,
    name: product.name,
    imageUrl,
    assetId: product.slug,
    file: null
  };
  document.getElementById('productImageName').textContent = product.name;
  document.getElementById('productImagePreview').innerHTML = `<img src="${imageUrl}" alt="${product.name}">`;
}

function previewProductPlacementUpload(type, file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  if (type === 'character') {
    productPlacementCharacter = { name: file.name, imageUrl: url, assetId: '', file };
    document.getElementById('productCharacterName').textContent = file.name;
    document.getElementById('productCharacterPreview').innerHTML = `<img src="${url}" alt="${file.name}">`;
  } else {
    productPlacementProduct = { name: file.name, imageUrl: url, assetId: '', file };
    document.getElementById('productImageName').textContent = file.name;
    document.getElementById('productImagePreview').innerHTML = `<img src="${url}" alt="${file.name}">`;
  }
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
  document.getElementById('productCharacterName').textContent = 'No character selected';
  document.getElementById('productImageName').textContent = 'No product selected';
  document.getElementById('productCharacterPreview').textContent = 'Choose a character';
  document.getElementById('productImagePreview').textContent = 'Choose a product';
  document.getElementById('productCharacterUpload').value = '';
  document.getElementById('productImageUpload').value = '';
  document.getElementById('productPlacementResult').innerHTML = '<div><strong>Preview idle</strong><p class="hint">Choose a character, product, and prompt.</p></div>';
  document.getElementById('productResultActions').style.display = 'none';
  const button = document.getElementById('productGenerateButton');
  if (button) {
    button.disabled = false;
    button.textContent = 'Run Nano Banana';
  }
}

async function generateProductPlacement() {
  if (!productPlacementCharacter) return toast('Choose or upload a character first.', 'error');
  if (!productPlacementProduct) return toast('Choose or upload a product first.', 'error');
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
  }, 90000);
  button.disabled = true;
  button.textContent = 'Running Nano...';
  resultFrame.innerHTML = '<div class="cooking-state"><div class="cooking-orb"></div><strong>Generating with Nano Banana</strong><p class="hint">Uploading public references and waiting for the /runsync result.</p><div class="cooking-steps">This usually finishes in under a minute.</div></div>';
  try {
    const data = new FormData();
    data.append('prompt', document.getElementById('productPlacementPrompt').value.trim());
    data.append('aspectRatio', aspectRatio);
    data.append('size', document.getElementById('productPlacementSize').value);
    if (productPlacementCharacter.file) data.append('character', productPlacementCharacter.file);
    else if (productPlacementCharacter.assetId) data.append('characterAssetId', productPlacementCharacter.assetId);
    else data.append('characterUrl', productPlacementCharacter.imageUrl);
    if (productPlacementProduct.file) data.append('product', productPlacementProduct.file);
    else if (productPlacementProduct.assetId) data.append('productAssetId', productPlacementProduct.assetId);
    else data.append('productUrl', productPlacementProduct.imageUrl);

    const response = await api('/api/product-placement/generate', { method: 'POST', body: data, signal: controller.signal });
    const image = response.result?.image;
    if (image) {
      resultFrame.innerHTML = `<img src="${image}" alt="Generated product placement">`;
      const link = document.getElementById('productResultDownload');
      link.href = image;
      document.getElementById('productResultActions').style.display = '';
      toast('Product image generated.', 'success');
    } else {
      resultFrame.innerHTML = '<div><strong>No image returned</strong><p class="hint">Nano Banana completed but the response did not include an image URL.</p></div>';
      toast('Nano Banana did not return an image URL.', 'error');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      resultFrame.innerHTML = productPlacementTimedOut
        ? '<div><strong>Request timed out</strong><p class="hint">Nano Banana did not return within 90 seconds. Check the public endpoint logs or try again.</p></div>'
        : '<div><strong>Generation stopped</strong><p class="hint">The Nano Banana request was cancelled.</p></div>';
      toast(productPlacementTimedOut ? 'Nano Banana timed out after 90 seconds.' : 'Nano Banana generation cancelled.', productPlacementTimedOut ? 'error' : 'info');
    } else {
      resultFrame.innerHTML = '<div><strong>Generation failed</strong><p class="hint">Check endpoint settings or prompt inputs.</p></div>';
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
  document.getElementById('uploadVoiceId').value = '';
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
