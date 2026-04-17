const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

const API_BASE = 'https://api.enhanceai.com/v1';

// Pricing per second by model and resolution
const PRICING = {
  'seedance2-fast': { '480p': 0.073, '720p': 0.126 },
  'seedance2-standard': { '480p': 0.10, '720p': 0.18 }
};

function getApiKey() {
  return process.env.SEEDANCE_API_KEY;
}

function estimateCost(model, resolution, durationSec) {
  const tier = model.includes('fast') ? 'seedance2-fast' : 'seedance2-standard';
  const res = resolution.includes('720') ? '720p' : '480p';
  const rate = PRICING[tier]?.[res] || 0.18;
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

async function submitGeneration(payload) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('SEEDANCE_API_KEY not configured');

  logger.info('Submitting generation to Seedance 2 API', {
    model: payload.model,
    duration: payload.duration,
    resolution: payload.resolution
  });

  const res = await fetch(`${API_BASE}/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    logger.error('Generation submission failed', { status: res.status, data });
    throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
  }

  logger.info('Generation submitted', { requestId: data.request_id });
  return data;
}

async function checkStatus(requestId) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('SEEDANCE_API_KEY not configured');

  const res = await fetch(`${API_BASE}/generations/${requestId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  return res.json();
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
  estimateCost,
  uploadToTempHost,
  submitGeneration,
  checkStatus,
  downloadVideo,
  getApiKey
};
