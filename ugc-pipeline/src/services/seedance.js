// Seedance API client.
// Default route: RunPod public endpoint Seedance 1.5 Pro I2V.
// Docs: https://docs.runpod.io/public-endpoints/models/seedance-1-5-pro
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

const API_BASE = 'https://api.wavespeed.ai/api/v3';
const RUNPOD_API_BASE = 'https://api.runpod.ai/v2';
const RUNPOD_SEEDANCE_ENDPOINT_ID = process.env.RUNPOD_SEEDANCE_ENDPOINT_ID || 'seedance-v1-5-pro-i2v';

// Pricing per second. RunPod Seedance 1.5 Pro I2V pricing from public endpoint docs.
const PRICING = {
  'runpod-seedance-v1.5-i2v': { '480p': 0.024, '720p': 0.052 },
  'seedance2-fast':     { '480p': 0.024, '720p': 0.052 },
  'seedance2-standard': { '480p': 0.024, '720p': 0.052 },
  'wan25':              { '480p': 0.05, '720p': 0.10, '1080p': 0.15 }
};

// Model endpoint paths
const ENDPOINTS = {
  'seedance2-fast':     '/bytedance/seedance-2.0-fast/image-to-video',
  'seedance2-standard': '/bytedance/seedance-2.0/image-to-video',
  'seedance2-t2v':      '/bytedance/seedance-2.0/text-to-video',
  'wan25-i2v':          '/alibaba/wan-2.5/image-to-video',
  'wan25-t2v':          '/alibaba/wan-2.5/text-to-video'
};

function isUsableApiKey(value = '') {
  const key = String(value || '').trim();
  if (!key) return false;
  const lowered = key.toLowerCase();
  if (['your_api_key_here', 'seedance_api_key', 'wavespeed_api_key'].includes(lowered)) return false;
  if (key.length < 24) return false;
  return true;
}

function getApiKey() {
  const candidates = [
    process.env.RUNPOD_SEEDANCE_API_KEY,
    process.env.RUNPOD_PUBLIC_ENDPOINT_API_KEY,
    process.env.RUNPOD_API_KEY,
    process.env.WAVESPEED_API_KEY,
    process.env.SEEDANCE_API_KEY
  ];
  return candidates.find(isUsableApiKey) || '';
}

function getRunPodApiKey() {
  const candidates = [
    process.env.RUNPOD_SEEDANCE_API_KEY,
    process.env.RUNPOD_PUBLIC_ENDPOINT_API_KEY,
    process.env.RUNPOD_API_KEY
  ];
  return candidates.find(isUsableApiKey) || '';
}

function getWaveSpeedApiKey() {
  const candidates = [process.env.WAVESPEED_API_KEY, process.env.SEEDANCE_API_KEY];
  return candidates.find(isUsableApiKey) || '';
}

function estimateCost(model, resolution, durationSec) {
  if (isRunPodSeedanceModel(model)) {
    const res = normalizeRunPodResolution(resolution);
    const rate = PRICING['runpod-seedance-v1.5-i2v'][res] || PRICING['runpod-seedance-v1.5-i2v']['720p'];
    return +(rate * durationSec).toFixed(3);
  }
  if ((model || '').startsWith('wan25')) {
    const res = (resolution || '720p').toLowerCase();
    const rate = PRICING.wan25?.[res] || PRICING.wan25['720p'];
    return +(rate * durationSec).toFixed(3);
  }
  const tier = (model || '').includes('fast') ? 'seedance2-fast' : 'seedance2-standard';
  const res = (resolution || '720p').toLowerCase();
  const rate = PRICING[tier]?.[res] || PRICING[tier]['720p'];
  return +(rate * durationSec).toFixed(3);
}

function isRunPodSeedanceModel(model = '') {
  const key = String(model || '').toLowerCase();
  return !key || key === 'seedance2-fast' || key === 'seedance2-standard' || key === 'runpod-seedance-v1.5-i2v';
}

function normalizeRunPodDuration(value = 5) {
  const duration = Number(value || 5);
  return Math.min(12, Math.max(4, Math.round(duration)));
}

function normalizeRunPodResolution(value = '720p') {
  return String(value || '720p').toLowerCase() === '480p' ? '480p' : '720p';
}

function normalizeRunPodStatus(data = {}) {
  const output = data.output || {};
  const status = String(data.status || '').toUpperCase();
  const mappedStatus = status === 'COMPLETED'
    ? 'completed'
    : status === 'FAILED'
      ? 'failed'
      : status === 'CANCELLED'
        ? 'failed'
        : status === 'IN_PROGRESS'
          ? 'processing'
          : 'pending';
  return {
    status: mappedStatus,
    video_url: output.video_url || output.videoUrl || output.url || output.result || output.video || (Array.isArray(output.outputs) ? output.outputs[0] : null) || null,
    error: data.error || output.error || data.error_message || null,
    raw: data
  };
}

async function uploadToTempHost(filePath) {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: form,
      timeout: Number(process.env.TEMP_UPLOAD_TIMEOUT_MS || 30000)
    });

    const data = await res.json();
    if (data.status === 'success' && data.data?.url) {
      // Convert tmpfiles.org URL to direct download link
      const url = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      return url;
    }
    throw new Error('Upload failed: ' + JSON.stringify(data));
  } catch (err) {
    logger.error('Temp upload failed:', err.message);
    throw err;
  }
}

/**
 * Submit a generation to WaveSpeed Seedance 2.0
 * @param {object} payload - normalized payload (gets translated to WaveSpeed format)
 *   payload.model - 'seedance2-fast' | 'seedance2-standard' | 'seedance2-t2v'
 *   payload.prompt - string
 *   payload.image - primary image URL (for image-to-video)
 *   payload.last_image - optional final frame URL
 *   payload.reference_images - array (for text-to-video)
 *   payload.reference_audios - array
 *   payload.aspect_ratio - '9:16' etc
 *   payload.resolution - '480p' | '720p' | '1080p'
 *   payload.duration - 5 | 10 | 15
 */
async function submitGeneration(payload) {
  const modelKey = payload.model || 'seedance2-fast';
  if (isRunPodSeedanceModel(modelKey)) {
    return submitRunPodSeedanceGeneration(payload);
  }

  const apiKey = getWaveSpeedApiKey();
  if (!apiKey) throw new Error('WAVESPEED_API_KEY not configured for non-RunPod video models.');
  const endpoint = ENDPOINTS[modelKey] || ENDPOINTS['seedance2-fast'];

  let body;
  if (modelKey === 'wan25-i2v') {
    const duration = Number(payload.duration || 5);
    if (duration < 3 || duration > 10) throw new Error('Wan 2.5 image-to-video duration must be between 3 and 10 seconds.');
    if (!payload.image) throw new Error('image URL required for Wan 2.5 image-to-video');
    body = {
      image: payload.image,
      prompt: payload.prompt,
      negative_prompt: payload.negative_prompt || undefined,
      audio: payload.audio || payload.audioUrl || undefined,
      resolution: payload.resolution || '720p',
      duration,
      enable_prompt_expansion: payload.enable_prompt_expansion ?? false,
      seed: payload.seed ?? -1
    };
  } else if (modelKey === 'wan25-t2v') {
    const duration = Number(payload.duration || 5);
    if (![5, 10].includes(duration)) throw new Error('Wan 2.5 text-to-video duration must be 5 or 10 seconds.');
    body = {
      prompt: payload.prompt,
      negative_prompt: payload.negative_prompt || undefined,
      audio: payload.audio || payload.audioUrl || undefined,
      size: payload.size || aspectToWanSize(payload.aspect_ratio, payload.resolution),
      duration,
      enable_prompt_expansion: payload.enable_prompt_expansion ?? false,
      seed: payload.seed ?? -1
    };
  } else {
    // Build WaveSpeed-formatted body
    body = {
      prompt: payload.prompt,
      aspect_ratio: payload.aspect_ratio || '9:16',
      resolution: payload.resolution || '720p',
      duration: payload.duration || 5
    };
  }

  if (modelKey === 'seedance2-t2v') {
    if (payload.reference_images?.length) body.reference_images = payload.reference_images;
    if (payload.reference_videos?.length) body.reference_videos = payload.reference_videos;
    if (payload.reference_audios?.length) body.reference_audios = payload.reference_audios;
  } else if (!modelKey.startsWith('wan25')) {
    // image-to-video requires an image
    if (!payload.image) throw new Error('image URL required for image-to-video');
    body.image = payload.image;
    if (payload.last_image) body.last_image = payload.last_image;
  }

  if (payload.enable_web_search) body.enable_web_search = true;

  logger.info('Submitting to WaveSpeed Seedance 2.0', {
    endpoint,
    resolution: body.resolution,
    duration: body.duration
  });

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();

  if (!res.ok || json.code !== 200) {
    logger.error('WaveSpeed submission failed', { status: res.status, body: json });
    throw new Error(`WaveSpeed API error ${res.status}: ${json.message || JSON.stringify(json)}`);
  }

  const requestId = json.data?.id;
  if (!requestId) {
    throw new Error('No request ID in WaveSpeed response: ' + JSON.stringify(json));
  }

  logger.info('Generation submitted', { requestId });

  // Return in normalized format that poller expects
  return { request_id: requestId, status: json.data.status, raw: json.data };
}

async function submitRunPodSeedanceGeneration(payload) {
  const apiKey = getRunPodApiKey();
  if (!apiKey) throw new Error('RUNPOD_API_KEY not configured for RunPod Seedance.');
  if (!payload.image) throw new Error('RunPod Seedance 1.5 Pro I2V requires one source image URL.');

  const body = {
    input: {
      prompt: payload.prompt,
      image: payload.image,
      duration: normalizeRunPodDuration(payload.duration || 5),
      resolution: normalizeRunPodResolution(payload.resolution || '720p'),
      aspect_ratio: payload.aspect_ratio || '9:16',
      camera_fixed: payload.camera_fixed ?? false,
      generate_audio: payload.generate_audio ?? false,
      seed: payload.seed ?? -1
    }
  };
  if (payload.last_image) body.input.last_image = payload.last_image;

  logger.info('Submitting to RunPod Seedance 1.5 Pro I2V', {
    endpointId: RUNPOD_SEEDANCE_ENDPOINT_ID,
    resolution: body.input.resolution,
    duration: body.input.duration
  });

  const res = await fetch(`${RUNPOD_API_BASE}/${RUNPOD_SEEDANCE_ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('RunPod Seedance submission failed', { status: res.status, body: json });
    throw new Error(`RunPod Seedance API error ${res.status}: ${json.error || json.message || JSON.stringify(json)}`);
  }

  const requestId = json.id || json.request_id || json.job_id;
  if (!requestId) throw new Error('No job id in RunPod Seedance response: ' + JSON.stringify(json));
  return { request_id: `runpod_${requestId}`, status: json.status || 'IN_QUEUE', provider: 'runpod', raw: json };
}

function aspectToWanSize(aspectRatio = '16:9', resolution = '720p') {
  const key = `${resolution}:${aspectRatio}`;
  const sizes = {
    '480p:16:9': '832*480',
    '480p:9:16': '480*832',
    '720p:16:9': '1280*720',
    '720p:9:16': '720*1280',
    '1080p:16:9': '1920*1080',
    '1080p:9:16': '1080*1920'
  };
  return sizes[key] || '1280*720';
}

async function checkStatus(requestId) {
  if (String(requestId || '').startsWith('runpod_')) {
    const apiKey = getRunPodApiKey();
    if (!apiKey) throw new Error('RUNPOD_API_KEY not configured for RunPod Seedance.');
    const providerRequestId = String(requestId).replace(/^runpod_/, '');
    const res = await fetch(`${RUNPOD_API_BASE}/${RUNPOD_SEEDANCE_ENDPOINT_ID}/status/${providerRequestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`RunPod Seedance status error ${res.status}: ${json.error || json.message || JSON.stringify(json)}`);
    return normalizeRunPodStatus(json);
  }

  const apiKey = getWaveSpeedApiKey();
  if (!apiKey) throw new Error('WAVESPEED_API_KEY not configured');

  const res = await fetch(`${API_BASE}/predictions/${requestId}/result`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  const json = await res.json();
  const data = json.data || {};

  // Normalize to format poller expects
  return {
    status: data.status,
    video_url: data.outputs?.[0] || null,
    error: data.error || null,
    raw: data
  };
}

async function downloadVideo(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const buffer = await res.buffer();
  fs.writeFileSync(outputPath, buffer);
  logger.info('Video downloaded', { path: outputPath, size: buffer.length });
  return outputPath;
}

module.exports = {
  PRICING,
  ENDPOINTS,
  estimateCost,
  getApiKey,
  uploadToTempHost,
  submitGeneration,
  checkStatus,
  downloadVideo,
  getApiKey,
  aspectToWanSize
};
