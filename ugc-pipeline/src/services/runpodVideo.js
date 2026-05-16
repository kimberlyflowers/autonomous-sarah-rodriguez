const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { uploadToTempHost } = require('./seedance');

function endpointRoot(config) {
  if (config.endpointUrl) {
    return config.endpointUrl
      .replace(/\/runsync(?:\?.*)?$/i, '')
      .replace(/\/run(?:\?.*)?$/i, '')
      .replace(/\/status\/?[^/?]*(?:\?.*)?$/i, '')
      .replace(/\/$/, '');
  }
  return `https://api.runpod.ai/v2/${config.endpointId}`;
}

function getRunpodVideoConfig(kind) {
  const upper = kind.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const defaultEndpointId = upper === 'SEEDANCE' ? 'seedance-v1-5-pro-i2v' : '';
  return {
    endpointId: process.env[`RUNPOD_${upper}_ENDPOINT_ID`] || defaultEndpointId,
    endpointUrl: process.env[`RUNPOD_${upper}_ENDPOINT_URL`] || '',
    apiKey: process.env[`RUNPOD_${upper}_API_KEY`] || process.env.RUNPOD_API_KEY || '',
    timeoutMs: Number(process.env[`RUNPOD_${upper}_TIMEOUT_MS`] || process.env.RUNPOD_VIDEO_TIMEOUT_MS || 14400000),
    pollIntervalMs: Number(process.env[`RUNPOD_${upper}_POLL_INTERVAL_MS`] || process.env.RUNPOD_VIDEO_POLL_INTERVAL_MS || 5000)
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fileToDataUri(filePath, fallbackMime = 'application/octet-stream') {
  if (!filePath) return '';
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png'
    ? 'image/png'
    : ['.jpg', '.jpeg'].includes(ext)
      ? 'image/jpeg'
      : ['.mp4', '.m4v'].includes(ext)
        ? 'video/mp4'
        : fallbackMime;
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function toRawBase64(value = '') {
  const match = String(value).match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : String(value);
}

async function resolveInput({ url, filePath, preferBase64 = false, fallbackMime }) {
  if (/^data:/i.test(url || '')) return { url: '', dataUri: url };
  if (/^https?:\/\//i.test(url || '')) return { url, dataUri: '' };
  if (!filePath) return { url: '', dataUri: '' };
  if (preferBase64) return { url: '', dataUri: await fileToDataUri(filePath, fallbackMime) };
  return { url: await uploadToTempHost(filePath), dataUri: '' };
}

async function runServerless(config, body, label) {
  if (!config.apiKey) throw new Error(`RunPod API key is not configured for ${label}.`);
  if (!config.endpointId && !config.endpointUrl) throw new Error(`RunPod endpoint ID is not configured for ${label}.`);

  const root = endpointRoot(config);
  const response = await fetch(`${root}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    timeout: 45000
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `${label} run request failed: ${response.status}`);
  if (data.status === 'COMPLETED') return data;
  if (!data.id) throw new Error(`${label} /run did not return a job id: ${JSON.stringify(data)}`);
  return pollServerless(config, data.id, label);
}

async function submitServerless(config, body, label) {
  if (!config.apiKey) throw new Error(`RunPod API key is not configured for ${label}.`);
  if (!config.endpointId && !config.endpointUrl) throw new Error(`RunPod endpoint ID is not configured for ${label}.`);

  const root = endpointRoot(config);
  const response = await fetch(`${root}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    timeout: 45000
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `${label} run request failed: ${response.status}`);
  if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(data.status)) {
    throw new Error(data.error || data.detail || `${label} job ended with ${data.status}`);
  }
  if (!data.id && data.status !== 'COMPLETED') throw new Error(`${label} /run did not return a job id: ${JSON.stringify(data)}`);
  return data;
}

async function getServerlessStatus(config, jobId, label) {
  const root = endpointRoot(config);
  const response = await fetch(`${root}/status/${jobId}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    timeout: 45000
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `${label} status request failed: ${response.status}`);
  return data;
}

async function pollServerless(config, jobId, label) {
  const root = endpointRoot(config);
  const startedAt = Date.now();
  let lastStatus = 'IN_QUEUE';
  while (Date.now() - startedAt < config.timeoutMs) {
    const data = await getServerlessStatus(config, jobId, label);
    lastStatus = data.status || lastStatus;
    if (lastStatus === 'COMPLETED') return data;
    if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(lastStatus)) {
      throw new Error(data.error || data.detail || `${label} job ${jobId} ended with ${lastStatus}`);
    }
    await sleep(config.pollIntervalMs);
  }
  throw new Error(`${label} job ${jobId} timed out after ${Math.round(config.timeoutMs / 1000)}s. Last status: ${lastStatus}`);
}

function dataUriToBuffer(value = '') {
  const match = String(value).match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

function rawBase64VideoToBuffer(value = '') {
  const normalized = String(value || '').replace(/\s+/g, '');
  if (normalized.length < 128 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;
  try {
    const buffer = Buffer.from(normalized, 'base64');
    const hasMp4Signature = buffer.subarray(0, 256).includes(Buffer.from('ftyp'));
    const hasWebmSignature = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    return hasMp4Signature || hasWebmSignature ? buffer : null;
  } catch (error) {
    return null;
  }
}

function extractVideoBuffer(data) {
  const output = data?.output || data || {};
  const value = output.video || output.video_base64 || output.result || output.url || output.video_url;
  if (typeof value === 'string' && value.startsWith('data:video/')) return dataUriToBuffer(value);
  if (typeof value === 'string') return rawBase64VideoToBuffer(value);
  return null;
}

function extractVideoUrl(data) {
  const output = data?.output || data || {};
  const value = output.video_url || output.url || output.result || output.video;
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

async function downloadVideo(url, outputPath) {
  const response = await fetch(url, { timeout: 120000 });
  if (!response.ok) throw new Error(`Could not download generated video: ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/(video|octet-stream|binary)/i.test(contentType)) {
    const preview = await response.text().catch(() => '');
    throw new Error(`Generated video URL did not return video content (${contentType}). Preview: ${preview.slice(0, 180)}`);
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

async function writeGeneratedVideo(data, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const buffer = extractVideoBuffer(data);
  if (buffer) {
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }
  const url = extractVideoUrl(data);
  if (url) return downloadVideo(url, outputPath);
  throw new Error(`Endpoint completed but did not return a video. Raw response: ${JSON.stringify(data).slice(0, 500)}`);
}

function dimensionsForAspect(aspectRatio = '9:16', engine = 'wan22') {
  if (aspectRatio === '16:9') return { width: 832, height: 480 };
  if (aspectRatio === '1:1') return { width: 640, height: 640 };
  return engine === 'wan22' ? { width: 480, height: 832 } : { width: 480, height: 832 };
}

async function createWan22Video({ imagePath, imageUrl, prompt, negativePrompt, aspectRatio, outputDir, length, steps, seed, cfg, loraPairs }) {
  const submitted = await submitWan22VideoJob({ imagePath, imageUrl, prompt, negativePrompt, aspectRatio, length, steps, seed, cfg, loraPairs });
  const data = submitted.status === 'COMPLETED' ? submitted.raw : await pollServerless(getRunpodVideoConfig('WAN22'), submitted.id, 'Wan 2.2 Serverless');
  return finalizeRunpodVideoResult(data, {
    outputDir,
    filePrefix: 'wan22',
    provider: 'wan22-serverless',
    submittedId: submitted.id
  });
}

async function submitWan22VideoJob({ imagePath, imageUrl, prompt, negativePrompt, aspectRatio, length, steps, seed, cfg, loraPairs }) {
  const config = getRunpodVideoConfig('WAN22');
  const image = await resolveInput({ url: imageUrl, filePath: imagePath, preferBase64: true, fallbackMime: 'image/png' });
  if (!image.url && !image.dataUri) throw new Error('Wan 2.2 Serverless needs an image.');
  const dims = dimensionsForAspect(aspectRatio, 'wan22');
  const input = {
    prompt: String(prompt || 'Natural creator video, realistic movement, steady camera.').trim(),
    negative_prompt: negativePrompt || 'blurry, low quality, distorted, extra fingers, deformed hands, watermark, subtitles',
    seed: Number(seed || 42),
    cfg: Number(cfg || 2.0),
    width: dims.width,
    height: dims.height,
    length: Number(length || 81),
    steps: Number(steps || 10)
  };
  if (image.url) input.image_url = image.url;
  if (image.dataUri) input.image_base64 = toRawBase64(image.dataUri);
  if (Array.isArray(loraPairs) && loraPairs.length) input.lora_pairs = loraPairs.slice(0, 4);

  const data = await submitServerless(config, { input }, 'Wan 2.2 Serverless');
  return { id: data.id || '', status: data.status || 'IN_QUEUE', raw: data, provider: 'wan22-serverless' };
}

async function createWanAnimateVideo({ imagePath, imageUrl, videoPath, videoUrl, prompt, negativePrompt, aspectRatio, outputDir, seed, fps, cfg, steps }) {
  const submitted = await submitWanAnimateVideoJob({ imagePath, imageUrl, videoPath, videoUrl, prompt, negativePrompt, aspectRatio, seed, fps, cfg, steps });
  const data = submitted.status === 'COMPLETED' ? submitted.raw : await pollServerless(getRunpodVideoConfig('WAN_ANIMATE'), submitted.id, 'Wan Animate Serverless');
  return finalizeRunpodVideoResult(data, {
    outputDir,
    filePrefix: 'wan-animate',
    provider: 'wan-animate',
    submittedId: submitted.id
  });
}

async function submitWanAnimateVideoJob({ imagePath, imageUrl, videoPath, videoUrl, prompt, negativePrompt, aspectRatio, seed, fps, cfg, steps }) {
  const config = getRunpodVideoConfig('WAN_ANIMATE');
  const image = await resolveInput({ url: imageUrl, filePath: imagePath, preferBase64: true, fallbackMime: 'image/png' });
  const video = await resolveInput({ url: videoUrl, filePath: videoPath, preferBase64: false, fallbackMime: 'video/mp4' });
  if (!image.url && !image.dataUri) throw new Error('Wan Animate needs a character image.');
  if (!video.url && !video.dataUri) throw new Error('Wan Animate needs a reference video.');
  const dims = dimensionsForAspect(aspectRatio, 'wan-animate');
  const input = {
    prompt: String(prompt || 'A realistic creator video matching the reference performance.').trim(),
    negative_prompt: negativePrompt || 'blurry, low quality, distorted, bad hands, deformed face, watermark, subtitles',
    seed: Number(seed || 12345),
    width: dims.width,
    height: dims.height,
    fps: Number(fps || 16),
    cfg: Number(cfg || 1.0),
    steps: Number(steps || 6)
  };
  if (image.url) input.image_url = image.url;
  if (image.dataUri) input.image_base64 = toRawBase64(image.dataUri);
  if (video.url) input.video_url = video.url;
  if (video.dataUri) input.video_base64 = video.dataUri;

  const data = await submitServerless(config, { input }, 'Wan Animate Serverless');
  return { id: data.id || '', status: data.status || 'IN_QUEUE', raw: data, provider: 'wan-animate' };
}

async function checkRunpodVideoJob(kind, jobId, { outputDir, filePrefix, provider, label } = {}) {
  const config = getRunpodVideoConfig(kind);
  const statusLabel = label || kind;
  const data = await getServerlessStatus(config, jobId, statusLabel);
  const status = data.status || 'unknown';
  if (status === 'COMPLETED') {
    return finalizeRunpodVideoResult(data, {
      outputDir,
      filePrefix: filePrefix || kind.toLowerCase(),
      provider,
      submittedId: jobId
    });
  }
  if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(status)) {
    throw new Error(data.error || data.detail || `${statusLabel} job ${jobId} ended with ${status}`);
  }
  return { id: jobId, status, raw: data, provider };
}

async function finalizeRunpodVideoResult(data, { outputDir, filePrefix, provider, submittedId } = {}) {
  const localPath = outputDir ? path.join(outputDir, `${filePrefix || 'runpod-video'}-${Date.now()}.mp4`) : '';
  if (localPath) await writeGeneratedVideo(data, localPath);
  return { id: submittedId || data.id || data?.output?.id || '', localPath, raw: data, provider, status: 'COMPLETED' };
}

module.exports = {
  createWan22Video,
  createWanAnimateVideo,
  checkRunpodVideoJob,
  submitWan22VideoJob,
  submitWanAnimateVideoJob,
  getRunpodVideoConfig
};
