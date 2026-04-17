// WaveSpeed AI - Seedance 2.0 API client
// Docs: docs/wavespeed-api.md
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

const API_BASE = 'https://api.wavespeed.ai/api/v3';

// Pricing per second by model and resolution (WaveSpeed Seedance 2.0)
const PRICING = {
  'seedance2-fast':     { '480p': 0.10, '720p': 0.20, '1080p': 0.30 },
  'seedance2-standard': { '480p': 0.12, '720p': 0.24, '1080p': 0.36 }
};

// Model endpoint paths
const ENDPOINTS = {
  'seedance2-fast':     '/bytedance/seedance-2.0-fast/image-to-video',
  'seedance2-standard': '/bytedance/seedance-2.0/image-to-video',
  'seedance2-t2v':      '/bytedance/seedance-2.0/text-to-video'
};

function getApiKey() {
  return process.env.WAVESPEED_API_KEY || process.env.SEEDANCE_API_KEY;
}

function estimateCost(model, resolution, durationSec) {
  const tier = (model || '').includes('fast') ? 'seedance2-fast' : 'seedance2-standard';
  const res = (resolution || '720p').toLowerCase();
  const rate = PRICING[tier]?.[res] || PRICING[tier]['720p'];
  return +(rate * durationSec).toFixed(3);
}

async function uploadToTempHost(filePath) {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: form
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
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('WAVESPEED_API_KEY not configured');

  const modelKey = payload.model || 'seedance2-fast';
  const endpoint = ENDPOINTS[modelKey] || ENDPOINTS['seedance2-fast'];

  // Build WaveSpeed-formatted body
  const body = {
    prompt: payload.prompt,
    aspect_ratio: payload.aspect_ratio || '9:16',
    resolution: payload.resolution || '720p',
    duration: payload.duration || 5
  };

  if (modelKey === 'seedance2-t2v') {
    if (payload.reference_images?.length) body.reference_images = payload.reference_images;
    if (payload.reference_videos?.length) body.reference_videos = payload.reference_videos;
    if (payload.reference_audios?.length) body.reference_audios = payload.reference_audios;
  } else {
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

async function checkStatus(requestId) {
  const apiKey = getApiKey();
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
  uploadToTempHost,
  submitGeneration,
  checkStatus,
  downloadVideo,
  getApiKey
};
