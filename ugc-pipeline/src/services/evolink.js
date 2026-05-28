// Evolink Seedance 2.0 API client
// Primary provider for the Video Clone feature.
// Docs: https://api.evolink.ai / model: seedance-2.0-fast-reference-to-video
// Fallback: WaveSpeed (WAVESPEED_API_KEY)
// Never RunPod for Seedance 2.0 — RunPod only has 1.5.

const fetch = require('node-fetch');
const { logger } = require('./logger');

const EVOLINK_BASE = 'https://api.evolink.ai';
const WAVESPEED_BASE = 'https://api.wavespeed.ai/api/v3';

// Pricing per second at 720p (Evolink rate)
const EVOLINK_PRICE_PER_SEC_720P = 0.132; // $1.98 / 15s

function getEvolinkKey() {
  return process.env.EVOLINK_API_KEY || '';
}

function getWaveSpeedKey() {
  return process.env.WAVESPEED_API_KEY || process.env.SEEDANCE_API_KEY || '';
}

function isUsable(key = '') {
  const k = String(key || '').trim();
  return k.length >= 24 && !['your_api_key_here'].includes(k.toLowerCase());
}

/**
 * Estimate cost for display to user.
 * @param {number} durationSec
 * @param {string} quality '480p'|'720p'|'1080p'
 */
function estimateCost(durationSec = 15, quality = '720p') {
  const rates = { '480p': 0.069, '720p': 0.132, '1080p': 0.331 };
  const rate = rates[quality] || rates['720p'];
  return +(rate * durationSec).toFixed(2);
}

/**
 * Submit a Seedance 2.0 generation via Evolink (primary) or WaveSpeed (fallback).
 *
 * payload:
 *   prompt        string   — Seedance clone prompt
 *   imageUrls     string[] — product image + optional avatar (1–2 URLs)
 *   videoUrls     string[] — reference video URL(s) for v2v cloning
 *   duration      number   — 4–15 seconds
 *   quality       string   — '480p' | '720p' | '1080p'
 *   aspectRatio   string   — '9:16' | '16:9' | '1:1'
 *   generateAudio boolean
 */
async function submitCloneGeneration(payload = {}) {
  const evolinkKey = getEvolinkKey();

  if (isUsable(evolinkKey)) {
    return submitViaEvolink(payload, evolinkKey);
  }

  // Fallback to WaveSpeed
  const waveKey = getWaveSpeedKey();
  if (isUsable(waveKey)) {
    logger.warn('EVOLINK_API_KEY not set — falling back to WaveSpeed for Seedance 2.0');
    return submitViaWaveSpeed(payload, waveKey);
  }

  throw new Error('No video generation API key configured. Set EVOLINK_API_KEY (primary) or WAVESPEED_API_KEY (fallback).');
}

async function submitViaEvolink(payload, apiKey) {
  const {
    prompt,
    imageUrls = [],
    videoUrls = [],
    audioUrls = [],
    duration = 15,
    quality = '720p',
    aspectRatio = '9:16',
    generateAudio = true
  } = payload;

  // Choose model based on what inputs we have
  // reference-to-video = v2v with optional image anchors (the clone model)
  // image-to-video = i2v only (fallback when no reference video)
  const hasVideo = videoUrls.length > 0;
  const model = hasVideo
    ? 'seedance-2.0-fast-reference-to-video'
    : 'seedance-2.0-fast-image-to-video';

  const body = {
    model,
    prompt,
    duration: Math.min(15, Math.max(4, Number(duration) || 15)),
    quality,
    aspect_ratio: aspectRatio,
    generate_audio: generateAudio
  };

  if (imageUrls.length) body.image_urls = imageUrls.filter(u => u && u.startsWith('http'));
  if (videoUrls.length) body.video_urls = videoUrls.filter(u => u && u.startsWith('http'));
  if (audioUrls.length) body.audio_urls = audioUrls.filter(u => u && u.startsWith('http'));

  logger.info('Submitting to Evolink Seedance 2.0', { model, quality, duration: body.duration, hasVideo });

  const res = await fetch(`${EVOLINK_BASE}/v1/videos/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('Evolink submission failed', { status: res.status, body: json });
    throw new Error(`Evolink API error ${res.status}: ${json.message || json.error || JSON.stringify(json)}`);
  }

  const taskId = json.id || json.task_id;
  if (!taskId) throw new Error('No task ID in Evolink response: ' + JSON.stringify(json));

  logger.info('Evolink generation submitted', { taskId });
  return {
    provider: 'evolink',
    request_id: `evolink_${taskId}`,
    status: json.status || 'pending',
    raw: json
  };
}

async function submitViaWaveSpeed(payload, apiKey) {
  const {
    prompt,
    imageUrls = [],
    videoUrls = [],
    duration = 15,
    quality = '720p',
    aspectRatio = '9:16',
    generateAudio = true
  } = payload;

  const hasVideo = videoUrls.length > 0;
  // WaveSpeed doesn't have a clean v2v model — use i2v with image anchor
  const endpoint = '/bytedance/seedance-2.0-fast/image-to-video';

  if (!imageUrls[0]) throw new Error('WaveSpeed Seedance 2.0 i2v requires an image URL. No reference video support on this fallback.');

  const body = {
    prompt,
    image: imageUrls[0],
    duration: Math.min(15, Math.max(4, Number(duration) || 15)),
    resolution: quality,
    aspect_ratio: aspectRatio,
    generate_audio: generateAudio
  };
  if (imageUrls[1]) body.last_image = imageUrls[1];

  logger.info('Submitting to WaveSpeed Seedance 2.0 (fallback)', { endpoint, quality });

  const res = await fetch(`${WAVESPEED_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 200) {
    throw new Error(`WaveSpeed API error ${res.status}: ${json.message || JSON.stringify(json)}`);
  }

  const taskId = json.data?.id;
  if (!taskId) throw new Error('No task ID in WaveSpeed response: ' + JSON.stringify(json));

  return {
    provider: 'wavespeed',
    request_id: `wavespeed_${taskId}`,
    status: json.data?.status || 'pending',
    raw: json.data
  };
}

/**
 * Poll for status of a clone generation.
 * requestId format: 'evolink_{taskId}' or 'wavespeed_{taskId}'
 */
async function checkCloneStatus(requestId) {
  const id = String(requestId || '');

  if (id.startsWith('evolink_')) {
    return checkEvolinkStatus(id.replace('evolink_', ''));
  }
  if (id.startsWith('wavespeed_')) {
    return checkWaveSpeedStatus(id.replace('wavespeed_', ''));
  }

  throw new Error(`Unknown provider prefix in requestId: ${id}`);
}

async function checkEvolinkStatus(taskId) {
  const apiKey = getEvolinkKey();
  if (!isUsable(apiKey)) throw new Error('EVOLINK_API_KEY not configured');

  const res = await fetch(`${EVOLINK_BASE}/v1/tasks/${taskId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Evolink status error ${res.status}: ${json.message || JSON.stringify(json)}`);

  const status = String(json.status || '').toLowerCase();
  const isDone = status === 'completed' || status === 'succeeded' || status === 'success';
  const isFailed = status === 'failed' || status === 'error' || status === 'cancelled';

  // Extract video URL from result — Evolink returns it in result.videos or result.url
  const videoUrl = json.result?.videos?.[0]
    || json.result?.video_url
    || json.result?.url
    || json.outputs?.[0]
    || null;

  return {
    provider: 'evolink',
    status: isDone ? 'completed' : isFailed ? 'failed' : 'processing',
    video_url: videoUrl,
    progress: json.progress || 0,
    error: json.error || null,
    raw: json
  };
}

async function checkWaveSpeedStatus(taskId) {
  const apiKey = getWaveSpeedKey();
  if (!isUsable(apiKey)) throw new Error('WAVESPEED_API_KEY not configured');

  const res = await fetch(`${WAVESPEED_BASE}/predictions/${taskId}/result`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  const json = await res.json().catch(() => ({}));
  const data = json.data || {};
  return {
    provider: 'wavespeed',
    status: data.status || 'processing',
    video_url: data.outputs?.[0] || null,
    error: data.error || null,
    raw: data
  };
}

module.exports = {
  estimateCost,
  submitCloneGeneration,
  checkCloneStatus
};
