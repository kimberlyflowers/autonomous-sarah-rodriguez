const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

const ROOT_DIR = path.join(__dirname, '..', '..');
const WORKFLOW_DIR = path.join(ROOT_DIR, 'config', 'workflows');
const OUTPUT_DIR = path.join(ROOT_DIR, 'assets', 'generated');

const PRESETS = {
  'sarah-i2v-lipsync': {
    label: 'I2V Talking Avatar',
    mode: 'i2v',
    file: 'sarah-i2v-lipsync.api.json',
    imageNode: '284',
    audioNode: '125',
    textNode: '241',
    outputNode: '131'
  },
  'bloomies-v2v': {
    label: 'V2V Talking Avatar',
    mode: 'v2v',
    file: 'bloomies-v2v.api.json',
    videoNode: '228',
    audioNode: '125',
    textNode: '241',
    outputNode: '131'
  }
};

const jobs = new Map();

function getBaseUrl() {
  const configured = process.env.COMFYUI_BASE_URL || process.env.RUNPOD_COMFYUI_URL || '';
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.RUNPOD_POD_ID) {
    const port = process.env.RUNPOD_COMFYUI_PORT || '8188';
    return `https://${process.env.RUNPOD_POD_ID}-${port}.proxy.runpod.net`;
  }
  return '';
}

function getPresets() {
  return Object.entries(PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label,
    mode: preset.mode,
    available: fs.existsSync(path.join(WORKFLOW_DIR, preset.file))
  }));
}

function loadWorkflow(presetId) {
  const preset = PRESETS[presetId];
  if (!preset) throw new Error(`Unknown workflow preset: ${presetId}`);

  const workflowPath = path.join(WORKFLOW_DIR, preset.file);
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow file not found for ${presetId}`);
  }

  return {
    preset,
    workflow: JSON.parse(fs.readFileSync(workflowPath, 'utf8'))
  };
}

async function uploadInput(filePath) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('COMFYUI_BASE_URL is not configured');

  const form = new FormData();
  form.append('image', fs.createReadStream(filePath));
  form.append('type', 'input');
  form.append('overwrite', 'true');

  const response = await fetch(`${baseUrl}/upload/image`, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ComfyUI upload failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.name || path.basename(filePath);
}

function patchWorkflow(workflow, preset, input) {
  const next = JSON.parse(JSON.stringify(workflow));
  const positivePrompt = input.prompt || getDefaultPrompt(preset.mode);
  const negativePrompt = input.negativePrompt || getDefaultNegativePrompt(preset.mode);

  if (preset.imageNode && input.imageName && next[preset.imageNode]) {
    next[preset.imageNode].inputs.image = input.imageName;
  }

  if (preset.videoNode && input.videoName && next[preset.videoNode]) {
    next[preset.videoNode].inputs.video = input.videoName;
  }

  if (preset.audioNode && input.audioName && next[preset.audioNode]) {
    next[preset.audioNode].inputs.audio = input.audioName;
    delete next[preset.audioNode].inputs.audioUI;
  }

  if (preset.textNode && next[preset.textNode]) {
    next[preset.textNode].inputs.positive_prompt = input.aspectRatio
      ? `${positivePrompt}, ${input.aspectRatio} aspect ratio`
      : positivePrompt;
    next[preset.textNode].inputs.negative_prompt = negativePrompt;
  }

  const size = getOutputSize(input.aspectRatio);
  if (next['245']?.inputs && typeof next['245'].inputs.value !== 'undefined') {
    next['245'].inputs.value = size.width;
  }
  if (next['246']?.inputs && typeof next['246'].inputs.value !== 'undefined') {
    next['246'].inputs.value = size.height;
  }

  const frameCount = getFrameCount(input.durationSeconds);
  if (frameCount && next['270']?.inputs && typeof next['270'].inputs.value !== 'undefined') {
    next['270'].inputs.value = frameCount;
  }

  if (preset.outputNode && next[preset.outputNode]) {
    const prefix = `UGC/${input.tenantId || 'default'}/${input.jobId}`;
    next[preset.outputNode].inputs.filename_prefix = prefix;
    if (typeof next[preset.outputNode].inputs.trim_to_audio !== 'undefined') {
      next[preset.outputNode].inputs.trim_to_audio = true;
    }
  }

  return next;
}

function getOutputSize(aspectRatio = '9:16') {
  if (aspectRatio === '16:9') return { width: 1280, height: 720 };
  if (aspectRatio === '1:1') return { width: 1024, height: 1024 };
  return { width: 720, height: 1280 };
}

function getFrameCount(durationSeconds, fps = 25) {
  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.ceil((Math.min(seconds, 300) + 0.2) * fps);
}

function getDefaultPrompt(mode) {
  if (mode === 'v2v') {
    return 'professional talking head video, natural speech, stable face, realistic motion, subtle hand movement, clean studio lighting';
  }
  return 'professional talking head video, natural speech, stable face, realistic motion, clean studio lighting';
}

function getDefaultNegativePrompt(mode) {
  const shared = [
    'singing', 'dancing', 'music video', 'subtitles', 'text', 'watermark',
    'extra fingers', 'poorly drawn hands', 'poorly drawn faces', 'deformed',
    'disfigured', 'fused fingers', 'blue nails', 'changing nail color',
    'dramatic gestures', 'camera movement', 'zoom', 'pan', 'overexposed',
    'blurred details', 'low quality'
  ];
  if (mode === 'i2v') shared.push('frozen face', 'static image');
  return shared.join(', ');
}

async function queuePrompt(prompt, clientId) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('COMFYUI_BASE_URL is not configured');

  const response = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, client_id: clientId })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ComfyUI prompt failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function getHistory(promptId) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('COMFYUI_BASE_URL is not configured');

  const response = await fetch(`${baseUrl}/history/${promptId}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ComfyUI history failed: ${response.status} ${text}`);
  }
  return response.json();
}

function findVideoOutput(history, promptId) {
  const record = history[promptId];
  const outputs = record?.outputs || {};

  for (const output of Object.values(outputs)) {
    const videos = output.videos || output.gifs || [];
    if (videos.length > 0) return videos[0];

    const images = output.images || [];
    const videoLike = images.find((item) => /\.(mp4|mov|webm)$/i.test(item.filename || ''));
    if (videoLike) return videoLike;
  }

  return null;
}

async function downloadOutput(file, localName) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('COMFYUI_BASE_URL is not configured');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const params = new URLSearchParams({
    filename: file.filename,
    type: file.type || 'output',
    subfolder: file.subfolder || ''
  });

  const response = await fetch(`${baseUrl}/view?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ComfyUI output download failed: ${response.status} ${text}`);
  }

  const outputName = localName || `${Date.now()}-${file.filename}`;
  const outputPath = path.join(OUTPUT_DIR, outputName);
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(outputPath);
    response.body.pipe(dest);
    response.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });

  return `/assets/generated/${outputName}`;
}

async function submitStudioJob(input) {
  const { workflow, preset } = loadWorkflow(input.presetId);
  const jobId = input.jobId || uuidv4();
  const clientId = input.clientId || uuidv4();

  const patched = patchWorkflow(workflow, preset, { ...input, jobId });
  const result = await queuePrompt(patched, clientId);
  const requestId = result.prompt_id || jobId;

  const job = {
    requestId,
    jobId,
    tenantId: input.tenantId || 'default',
    provider: 'comfyui',
    presetId: input.presetId,
    mode: preset.mode,
    audioProvider: input.audioProvider,
    status: 'pending',
    prompt: input.prompt,
    aspectRatio: input.aspectRatio || '16:9',
    durationSeconds: input.durationSeconds || null,
    script: input.script,
    createdAt: new Date().toISOString(),
    completedAt: null,
    localPath: null,
    error: null
  };
  jobs.set(requestId, job);
  return job;
}

async function pollStudioJob(requestId) {
  const job = jobs.get(requestId);
  if (!job || job.status === 'completed' || job.status === 'failed') return job;

  try {
    const history = await getHistory(requestId);
    const output = findVideoOutput(history, requestId);
    if (!output) {
      job.status = 'processing';
      jobs.set(requestId, job);
      return job;
    }

    const localName = `${job.tenantId}-${job.presetId}-${requestId.slice(0, 8)}.mp4`;
    job.localPath = await downloadOutput(output, localName);
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    jobs.set(requestId, job);
    return job;
  } catch (error) {
    logger.error('ComfyUI poll failed', { requestId, error: error.message });
    job.error = error.message;
    job.status = 'failed';
    jobs.set(requestId, job);
    return job;
  }
}

function getStudioJobs() {
  return Array.from(jobs.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  getBaseUrl,
  getPresets,
  uploadInput,
  submitStudioJob,
  pollStudioJob,
  getStudioJobs
};
