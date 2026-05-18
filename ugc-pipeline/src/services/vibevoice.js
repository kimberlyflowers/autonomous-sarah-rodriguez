const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { uploadToTempHost } = require('./seedance');

function getVibeVoiceConfig() {
  return {
    endpointId: process.env.RUNPOD_VIBEVOICE_ENDPOINT_ID || '',
    endpointUrl: process.env.RUNPOD_VIBEVOICE_ENDPOINT_URL || process.env.VIBEVOICE_ENDPOINT_URL || '',
    apiKey: process.env.RUNPOD_VIBEVOICE_API_KEY || process.env.VIBEVOICE_API_KEY || process.env.RUNPOD_API_KEY || '',
    timeoutMs: Number(process.env.VIBEVOICE_RUNSYNC_TIMEOUT_MS || 900000)
  };
}

function buildRunSyncUrl(config) {
  if (config.endpointUrl) {
    const url = new URL(config.endpointUrl);
    if (!/\/runsync$/i.test(url.pathname) && !/\/run$/i.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/runsync`;
    }
    if (!url.searchParams.has('wait')) url.searchParams.set('wait', String(config.timeoutMs));
    return url.toString();
  }
  if (!config.endpointId) return '';
  const url = new URL(`https://api.runpod.ai/v2/${config.endpointId}/runsync`);
  url.searchParams.set('wait', String(config.timeoutMs));
  return url.toString();
}

function cleanFormat(format = 'wav') {
  return ['wav', 'mp3', 'flac', 'ogg'].includes(format) ? format : 'wav';
}

function sanitizeScript(script) {
  return String(script || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\[(?:confident|warmly|short pause|pause|beat|calm|excited|sincere|urgent|playful|thoughtful|serious|smiling|friendly|slowly|softly|firmly)[^\]]*\]/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function resolveVoiceUrl({ voiceUrl, voiceSamplePath }) {
  if (/^https?:\/\//i.test(voiceUrl || '')) return voiceUrl;
  if (voiceSamplePath) return uploadToTempHost(voiceSamplePath);
  return '';
}

function normalizeResult(data) {
  const output = data?.output || data || {};
  const audioUrl = output.audio_url || output.audio || output.url || output.result_url || (typeof output.result === 'string' ? output.result : '');
  const audioBase64 = output.audio_base64 || output.audioBase64 || output.wav_base64 || output.mp3_base64 || '';
  return {
    id: data?.id || data?.requestId || '',
    status: data?.status || 'unknown',
    audioUrl,
    audioBase64,
    cost: output.cost || null,
    raw: data
  };
}

async function downloadAudio(url, outputPath) {
  const response = await fetch(url, { timeout: 120000 });
  if (!response.ok) throw new Error(`Could not download VibeVoice audio: ${response.status}`);
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

function writeAudioBase64(audioBase64, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(audioBase64, 'base64'));
  return outputPath;
}

function validateAudioOutput(filePath) {
  const stats = fs.statSync(filePath);
  if (stats.size < 24000) {
    throw new Error(`VibeVoice returned unusable audio (${stats.size} bytes).`);
  }
  return { size: stats.size };
}

async function createVibeVoiceAudio({ script, voice, voiceUrl, voiceSamplePath, format, outputDir }) {
  const config = getVibeVoiceConfig();
  const text = sanitizeScript(script);
  if (!config.apiKey) throw new Error('RUNPOD_VIBEVOICE_API_KEY, VIBEVOICE_API_KEY, or RUNPOD_API_KEY is not configured.');
  if (!config.endpointId && !config.endpointUrl) throw new Error('RUNPOD_VIBEVOICE_ENDPOINT_ID or VIBEVOICE_ENDPOINT_URL is not configured.');
  if (!text || text.length < 3) throw new Error('Paste a script before using VibeVoice audio.');

  const audioFormat = cleanFormat(format);
  const resolvedVoiceUrl = await resolveVoiceUrl({ voiceUrl, voiceSamplePath });
  const input = {
    text,
    prompt: text,
    script: text,
    voice: voice || 'default',
    speaker: voice || 'default',
    language: 'en',
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
    timeout: Math.min(config.timeoutMs + 5000, 905000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `VibeVoice request failed: ${response.status}`);
  if (data.status && data.status !== 'COMPLETED') {
    throw new Error(`VibeVoice returned ${data.status}. The endpoint did not return completed audio.`);
  }

  const result = normalizeResult(data);
  if (!result.audioUrl && !result.audioBase64) {
    throw new Error('VibeVoice completed but did not return audio_url or audio_base64.');
  }

  const localPath = path.join(outputDir, `vibevoice-${Date.now()}.${audioFormat}`);
  if (result.audioBase64) {
    writeAudioBase64(result.audioBase64, localPath);
  } else {
    await downloadAudio(result.audioUrl, localPath);
  }
  validateAudioOutput(localPath);
  return { ...result, localPath, format: audioFormat, voice: voice || 'default' };
}

module.exports = {
  getVibeVoiceConfig,
  createVibeVoiceAudio
};
