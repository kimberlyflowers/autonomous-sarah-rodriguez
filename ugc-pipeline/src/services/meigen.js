const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { uploadToTempHost } = require('./seedance');

function getMeigenConfig() {
  return {
    endpointId: process.env.RUNPOD_MEIGEN_ENDPOINT_ID || process.env.RUNPOD_INFINITETALK_ENDPOINT_ID || 'infinitetalk',
    endpointUrl: process.env.RUNPOD_MEIGEN_ENDPOINT_URL || process.env.RUNPOD_INFINITETALK_ENDPOINT_URL || '',
    apiKey: process.env.RUNPOD_MEIGEN_API_KEY || process.env.RUNPOD_INFINITETALK_API_KEY || '',
    timeoutMs: Number(process.env.MEIGEN_RUNSYNC_TIMEOUT_MS || 360000)
  };
}

function buildRunSyncUrl(config) {
  const baseUrl = config.endpointUrl || `https://api.runpod.ai/v2/${config.endpointId}/runsync`;
  const url = new URL(baseUrl);
  if (!url.searchParams.has('wait')) url.searchParams.set('wait', String(config.timeoutMs));
  return url.toString();
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

async function resolvePublicUrl(value, filePath) {
  if (/^https?:\/\//i.test(value || '')) return value;
  if (!filePath) return '';
  return uploadToTempHost(filePath);
}

async function downloadVideo(url, outputPath) {
  const response = await fetch(url, { timeout: 120000 });
  if (!response.ok) throw new Error(`Could not download Meigen video: ${response.status}`);
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

  const response = await fetch(buildRunSyncUrl(config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    timeout: config.timeoutMs
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `Meigen request failed: ${response.status}`);
  if (data.status && data.status !== 'COMPLETED') {
    throw new Error(`Meigen returned ${data.status}. The /runsync endpoint did not return completed video.`);
  }

  const result = normalizeResult(data);
  if (!result.videoUrl) throw new Error('Meigen completed but did not return output.video_url.');

  const localPath = outputDir
    ? await downloadVideo(result.videoUrl, path.join(outputDir, `meigen-${Date.now()}.mp4`))
    : '';

  return { ...result, localPath, provider: 'meigen' };
}

module.exports = {
  createMeigenVideo,
  getMeigenConfig
};
