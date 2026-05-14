const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { uploadToTempHost } = require('./seedance');

const CHATTERBOX_VOICES = [
  'aaron', 'abigail', 'anaya', 'andy',
  'archer', 'brian', 'chloe', 'dylan',
  'emmanuel', 'ethan', 'evelyn', 'gavin',
  'gordon', 'ivan', 'laura', 'lucy',
  'madison', 'marisol', 'meera', 'walter'
];

function getChatterboxConfig() {
  return {
    endpointId: process.env.RUNPOD_CHATTERBOX_ENDPOINT_ID || 'chatterbox-turbo',
    endpointUrl: process.env.RUNPOD_CHATTERBOX_ENDPOINT_URL || '',
    apiKey: process.env.RUNPOD_CHATTERBOX_API_KEY || process.env.RUNPOD_API_KEY || '',
    timeoutMs: Number(process.env.CHATTERBOX_RUNSYNC_TIMEOUT_MS || 90000)
  };
}

function buildRunSyncUrl(config) {
  const baseUrl = config.endpointUrl || `https://api.runpod.ai/v2/${config.endpointId}/runsync`;
  const url = new URL(baseUrl);
  if (!url.searchParams.has('wait')) url.searchParams.set('wait', String(config.timeoutMs));
  return url.toString();
}

function cleanFormat(format = 'wav') {
  return ['wav', 'flac', 'ogg'].includes(format) ? format : 'wav';
}

function cleanVoice(voice = 'lucy') {
  return CHATTERBOX_VOICES.includes(voice) ? voice : 'lucy';
}

async function resolveVoiceUrl({ voiceUrl, voiceSamplePath }) {
  if (/^https?:\/\//i.test(voiceUrl || '')) {
    if (/drive\.google\.com/i.test(voiceUrl)) {
      const filePath = await downloadGoogleDriveAudio(voiceUrl);
      return uploadToTempHost(filePath);
    }
    return voiceUrl;
  }
  if (voiceSamplePath) return uploadToTempHost(voiceSamplePath);
  return '';
}

function getGoogleDriveFileId(url) {
  const match = String(url || '').match(/\/file\/d\/([^/]+)/) || String(url || '').match(/[?&]id=([^&]+)/);
  return match?.[1] || '';
}

async function downloadGoogleDriveAudio(url) {
  const id = getGoogleDriveFileId(url);
  if (!id) throw new Error('Google Drive voice URL is missing a file ID.');
  const response = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, {
    timeout: 45000,
    headers: { 'User-Agent': 'BloomStudio/1.0' }
  });
  if (!response.ok) throw new Error(`Could not download Google Drive voice sample: ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (/text\/html/i.test(contentType)) {
    throw new Error('Google Drive returned an HTML page instead of audio. Set the file sharing to anyone with the link, or upload the voice sample directly.');
  }
  const dir = path.join(__dirname, '..', '..', 'assets', 'tts', 'drive-voices');
  fs.mkdirSync(dir, { recursive: true });
  const outputPath = path.join(dir, `${Date.now()}-${id}.wav`);
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(outputPath);
    response.body.pipe(dest);
    response.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
  return outputPath;
}

function normalizeResult(data) {
  const output = data?.output || {};
  return {
    id: data?.id || data?.requestId || '',
    status: data?.status || 'unknown',
    audioUrl: output.audio_url || output.audio || output.url || (typeof output.result === 'string' ? output.result : ''),
    cost: output.cost || null,
    raw: data
  };
}

async function downloadAudio(url, outputPath) {
  const response = await fetch(url, { timeout: 45000 });
  if (!response.ok) throw new Error(`Could not download Chatterbox audio: ${response.status}`);
  await new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const dest = fs.createWriteStream(outputPath);
    response.body.pipe(dest);
    response.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
  return outputPath;
}

async function createChatterboxAudio({ script, voice, voiceUrl, voiceSamplePath, format, outputDir }) {
  const config = getChatterboxConfig();
  const prompt = String(script || '').trim();
  if (!config.apiKey) throw new Error('RUNPOD_CHATTERBOX_API_KEY or RUNPOD_API_KEY is not configured.');
  if (!prompt || prompt.length < 3) throw new Error('Paste a script before using Chatterbox audio.');

  const resolvedVoiceUrl = await resolveVoiceUrl({ voiceUrl, voiceSamplePath });
  const audioFormat = cleanFormat(format);
  const input = {
    prompt,
    voice: cleanVoice(voice),
    format: audioFormat
  };
  if (resolvedVoiceUrl) input.voice_url = resolvedVoiceUrl;

  const response = await fetch(buildRunSyncUrl(config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input }),
    timeout: config.timeoutMs
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `Chatterbox request failed: ${response.status}`);
  if (data.status && data.status !== 'COMPLETED') {
    throw new Error(`Chatterbox returned ${data.status}. The /runsync endpoint did not return completed audio.`);
  }

  const result = normalizeResult(data);
  if (!result.audioUrl) throw new Error('Chatterbox completed but did not return output.audio_url.');

  const localPath = outputDir
    ? await downloadAudio(result.audioUrl, path.join(outputDir, `chatterbox-${Date.now()}.${audioFormat}`))
    : '';

  return { ...result, localPath, format: audioFormat, voice: resolvedVoiceUrl ? 'custom' : input.voice };
}

module.exports = {
  CHATTERBOX_VOICES,
  getChatterboxConfig,
  createChatterboxAudio
};
