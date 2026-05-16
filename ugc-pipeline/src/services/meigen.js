const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { uploadToTempHost } = require('./seedance');

function getMeigenConfig() {
  return {
    endpointId: process.env.RUNPOD_MEIGEN_ENDPOINT_ID || process.env.RUNPOD_INFINITETALK_ENDPOINT_ID || 'infinitetalk',
    endpointUrl: process.env.RUNPOD_MEIGEN_ENDPOINT_URL || process.env.RUNPOD_INFINITETALK_ENDPOINT_URL || '',
    apiKey: process.env.RUNPOD_MEIGEN_API_KEY || process.env.RUNPOD_INFINITETALK_API_KEY || '',
    timeoutMs: Number(process.env.MEIGEN_TIMEOUT_MS || 14400000),
    pollIntervalMs: Number(process.env.MEIGEN_POLL_INTERVAL_MS || 5000)
  };
}

function getEndpointRoot(config) {
  if (!config.endpointUrl) return `https://api.runpod.ai/v2/${config.endpointId}`;
  return config.endpointUrl
    .replace(/\/runsync(?:\?.*)?$/i, '')
    .replace(/\/run(?:\?.*)?$/i, '')
    .replace(/\/status\/?[^/?]*(?:\?.*)?$/i, '')
    .replace(/\/$/, '');
}

function getRunSyncUrl(config) {
  if (config.endpointUrl) {
    const normalized = config.endpointUrl.replace(/\/$/, '');
    if (/\/runsync(?:\?.*)?$/i.test(normalized)) return normalized;
    if (/\/run(?:\?.*)?$/i.test(normalized)) return normalized.replace(/\/run(?:\?.*)?$/i, '/runsync');
    return `${normalized}/runsync`;
  }
  return `https://api.runpod.ai/v2/${config.endpointId}/runsync`;
}

function getRunUrl(config) {
  return `${getEndpointRoot(config)}/run`;
}

function normalizeSize(value = '480p') {
  return value === '720p' ? '720p' : '480p';
}

function normalizeResult(data) {
  const output = data?.output || {};
  return {
    id: data?.id || '',
    status: data?.status || 'unknown',
    videoUrl: output.video_url || output.video || output.url || (typeof output.result === 'string' ? output.result : ''),
    cost: output.cost || null,
    raw: data
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runEndpoint(config, body) {
  const response = await fetch(getRunSyncUrl(config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    timeout: config.timeoutMs
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `Meigen runsync request failed: ${response.status}`);
  if (data.status === 'COMPLETED') return data;
  if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(data.status)) {
    throw new Error(data.error || data.detail || `Meigen job ended with ${data.status}`);
  }
  if (!data.id) throw new Error(`Meigen /runsync did not return a completed result or job id: ${JSON.stringify(data)}`);
  return data;
}

async function submitEndpoint(config, body) {
  const response = await fetch(getRunUrl(config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    timeout: 45000
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `Meigen run request failed: ${response.status}`);
  if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(data.status)) {
    throw new Error(data.error || data.detail || `Meigen job ended with ${data.status}`);
  }
  if (!data.id && data.status !== 'COMPLETED') throw new Error(`Meigen /run did not return a job id: ${JSON.stringify(data)}`);
  return data;
}

async function getEndpointStatus(config, jobId) {
  const root = getEndpointRoot(config);
  const response = await fetch(`${root}/status/${jobId}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    timeout: 45000
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `Meigen status request failed: ${response.status}`);
  return data;
}

async function pollEndpoint(config, jobId) {
  const root = getEndpointRoot(config);
  const startedAt = Date.now();
  let lastStatus = 'IN_QUEUE';

  while (Date.now() - startedAt < config.timeoutMs) {
    const data = await getEndpointStatus(config, jobId);

    lastStatus = data.status || lastStatus;
    if (lastStatus === 'COMPLETED') return data;
    if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(lastStatus)) {
      throw new Error(data.error || data.detail || `Meigen job ${jobId} ended with ${lastStatus}`);
    }
    await sleep(config.pollIntervalMs);
  }

  throw new Error(`Meigen job ${jobId} timed out after ${Math.round(config.timeoutMs / 1000)}s. Last status: ${lastStatus}`);
}

async function resolvePublicUrl(value, filePath) {
  if (/^https?:\/\//i.test(value || '')) return value;
  if (!filePath) return '';
  return uploadToTempHost(filePath);
}

async function downloadVideo(url, outputPath) {
  const response = await fetch(url, { timeout: 120000 });
  if (!response.ok) throw new Error(`Could not download Meigen video: ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/(video|octet-stream|binary)/i.test(contentType)) {
    const preview = await response.text().catch(() => '');
    throw new Error(`Meigen video URL did not return video content (${contentType}). Preview: ${preview.slice(0, 180)}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(outputPath);
    response.body.pipe(dest);
    response.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
  return outputPath;
}

async function createMeigenVideo({ imagePath, audioPath, imageUrl, audioUrl, prompt, size, outputDir }) {
  const submitted = await submitMeigenVideoJob({ imagePath, audioPath, imageUrl, audioUrl, prompt, size });
  const data = submitted.status === 'COMPLETED' ? submitted.raw : await pollEndpoint(getMeigenConfig(), submitted.id);
  return finalizeMeigenVideoResult(data, { outputDir, submittedId: submitted.id });
}

async function submitMeigenVideoJob({ imagePath, audioPath, imageUrl, audioUrl, prompt, size }) {
  const config = getMeigenConfig();
  if (!config.apiKey) throw new Error('RUNPOD_MEIGEN_API_KEY is not configured.');

  const resolvedImage = await resolvePublicUrl(imageUrl, imagePath);
  const resolvedAudio = await resolvePublicUrl(audioUrl, audioPath);
  if (!resolvedImage) throw new Error('Meigen needs a public image URL or uploaded image file.');
  if (!resolvedAudio) throw new Error('Meigen needs a public audio URL or uploaded audio file.');

  const body = {
    input: {
      prompt: String(prompt || 'Professional talking head video, natural lip sync, steady camera.').trim(),
      image: resolvedImage,
      audio: resolvedAudio,
      size: normalizeSize(size),
      enable_safety_checker: true
    }
  };

  const run = await submitEndpoint(config, body);
  return {
    id: run.id || '',
    status: run.status || 'IN_QUEUE',
    raw: run,
    provider: 'meigen'
  };
}

async function checkMeigenVideoJob(jobId, { outputDir } = {}) {
  const config = getMeigenConfig();
  if (!config.apiKey) throw new Error('RUNPOD_MEIGEN_API_KEY is not configured.');
  const data = await getEndpointStatus(config, jobId);
  const status = data.status || 'unknown';
  if (status === 'COMPLETED') return finalizeMeigenVideoResult(data, { outputDir, submittedId: jobId });
  if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(status)) {
    throw new Error(data.error || data.detail || `Meigen job ${jobId} ended with ${status}`);
  }
  return { id: jobId, status, raw: data, provider: 'meigen' };
}

async function finalizeMeigenVideoResult(data, { outputDir, submittedId } = {}) {
  const result = normalizeResult(data);
  if (!result.videoUrl) throw new Error(`Meigen completed but did not return a video URL. Job id: ${submittedId || result.id}`);

  const localPath = outputDir
    ? await downloadVideo(result.videoUrl, path.join(outputDir, `meigen-${Date.now()}.mp4`))
    : '';

  return { ...result, id: submittedId || result.id, localPath, provider: 'meigen', status: 'COMPLETED' };
}

module.exports = {
  createMeigenVideo,
  checkMeigenVideoJob,
  submitMeigenVideoJob,
  getMeigenConfig
};
