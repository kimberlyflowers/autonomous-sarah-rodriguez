const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { uploadToTempHost } = require('./seedance');

function getInfiniteTalkHdConfig() {
  return {
    endpointId: process.env.RUNPOD_INFINITETALK_ENDPOINT_ID || '',
    endpointUrl: process.env.RUNPOD_INFINITETALK_ENDPOINT_URL || '',
    apiKey: process.env.RUNPOD_INFINITETALK_API_KEY || process.env.RUNPOD_API_KEY || '',
    timeoutMs: Number(process.env.INFINITETALK_TIMEOUT_MS || 14400000),
    pollIntervalMs: Number(process.env.INFINITETALK_POLL_INTERVAL_MS || 15000)
  };
}

function getEndpointRoot(config) {
  if (config.endpointUrl) {
    return config.endpointUrl
      .replace(/\/run(?:\?.*)?$/i, '')
      .replace(/\/runsync(?:\?.*)?$/i, '')
      .replace(/\/status\/?[^/?]*(?:\?.*)?$/i, '')
      .replace(/\/$/, '');
  }
  return `https://api.runpod.ai/v2/${config.endpointId}`;
}

function normalizeQuality(value = '720p') {
  return value === '1080p' ? '1080p' : '720p';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolvePublicUrl(value, filePath) {
  if (/^https?:\/\//i.test(value || '')) return value;
  if (!filePath) return '';
  return uploadToTempHost(filePath);
}

function videoB64ToBuffer(value = '') {
  const normalized = String(value || '').replace(/\s+/g, '');
  if (normalized.length < 128 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;
  const buffer = Buffer.from(normalized, 'base64');
  const hasMp4Signature = buffer.subarray(0, 256).includes(Buffer.from('ftyp'));
  if (!hasMp4Signature) return null;
  return buffer;
}

async function submitInfiniteTalkHdJob({ imagePath, audioPath, imageUrl, audioUrl, quality, steps, seed }) {
  const config = getInfiniteTalkHdConfig();
  if (!config.apiKey) throw new Error('RUNPOD_API_KEY is not configured for InfiniteTalk HD.');
  if (!config.endpointId && !config.endpointUrl) throw new Error('RUNPOD_INFINITETALK_ENDPOINT_ID is not configured.');

  const resolvedImage = await resolvePublicUrl(imageUrl, imagePath);
  const resolvedAudio = await resolvePublicUrl(audioUrl, audioPath);
  if (!resolvedAudio) throw new Error('InfiniteTalk HD needs a public audio URL or uploaded audio file.');

  const input = {
    audio_url: resolvedAudio,
    quality: normalizeQuality(quality),
    steps: Number(steps || 40),
    seed: Number(typeof seed === 'undefined' || seed === '' ? -1 : seed)
  };
  if (resolvedImage) input.image_url = resolvedImage;

  const response = await fetch(`${getEndpointRoot(config)}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input }),
    timeout: 45000
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `InfiniteTalk HD run request failed: ${response.status}`);
  if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(data.status)) {
    throw new Error(data.error || data.detail || `InfiniteTalk HD job ended with ${data.status}`);
  }
  if (!data.id && data.status !== 'COMPLETED') throw new Error(`InfiniteTalk HD /run did not return a job id: ${JSON.stringify(data)}`);
  return {
    id: data.id || '',
    status: data.status || 'IN_QUEUE',
    raw: data,
    provider: 'infinitetalk-hd'
  };
}

async function getInfiniteTalkHdStatus(jobId) {
  const config = getInfiniteTalkHdConfig();
  if (!config.apiKey) throw new Error('RUNPOD_API_KEY is not configured for InfiniteTalk HD.');
  const response = await fetch(`${getEndpointRoot(config)}/status/${jobId}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    timeout: 45000
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `InfiniteTalk HD status request failed: ${response.status}`);
  return data;
}

async function checkInfiniteTalkHdJob(jobId, { outputDir } = {}) {
  const data = await getInfiniteTalkHdStatus(jobId);
  const status = data.status || 'unknown';
  if (status === 'COMPLETED') return finalizeInfiniteTalkHdResult(data, { outputDir, submittedId: jobId });
  if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(status)) {
    throw new Error(data.error || data.detail || `InfiniteTalk HD job ${jobId} ended with ${status}`);
  }
  return { id: jobId, status, raw: data, provider: 'infinitetalk-hd' };
}

async function pollInfiniteTalkHdJob(jobId, options = {}) {
  const config = getInfiniteTalkHdConfig();
  const startedAt = Date.now();
  let lastStatus = 'IN_QUEUE';
  while (Date.now() - startedAt < config.timeoutMs) {
    const result = await checkInfiniteTalkHdJob(jobId, options);
    lastStatus = result.status || lastStatus;
    if (lastStatus === 'COMPLETED') return result;
    await sleep(config.pollIntervalMs);
  }
  throw new Error(`InfiniteTalk HD job ${jobId} timed out after ${Math.round(config.timeoutMs / 1000)}s. Last status: ${lastStatus}`);
}

async function finalizeInfiniteTalkHdResult(data, { outputDir, submittedId } = {}) {
  const output = data?.output || {};
  if (output.error) throw new Error(`InfiniteTalk HD completed with handler error: ${output.error}`);
  const buffer = videoB64ToBuffer(output.video_b64);
  if (!buffer) throw new Error(`InfiniteTalk HD completed but did not return valid video_b64. Job id: ${submittedId || data.id || ''}`);

  let localPath = '';
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    localPath = path.join(outputDir, `infinitetalk-hd-${Date.now()}.mp4`);
    fs.writeFileSync(localPath, buffer);
  }

  return {
    id: submittedId || data.id || '',
    status: 'COMPLETED',
    localPath,
    provider: 'infinitetalk-hd',
    quality: output.quality || null,
    renderRes: output.render_res || null,
    fileSizeMb: output.file_size_mb || null,
    raw: data
  };
}

async function createInfiniteTalkHdVideo({ imagePath, audioPath, imageUrl, audioUrl, quality, steps, seed, outputDir }) {
  const submitted = await submitInfiniteTalkHdJob({ imagePath, audioPath, imageUrl, audioUrl, quality, steps, seed });
  if (submitted.status === 'COMPLETED') return finalizeInfiniteTalkHdResult(submitted.raw, { outputDir, submittedId: submitted.id });
  return pollInfiniteTalkHdJob(submitted.id, { outputDir });
}

module.exports = {
  checkInfiniteTalkHdJob,
  createInfiniteTalkHdVideo,
  getInfiniteTalkHdConfig,
  submitInfiniteTalkHdJob
};
