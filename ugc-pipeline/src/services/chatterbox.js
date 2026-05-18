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
    timeoutMs: Number(process.env.CHATTERBOX_RUNSYNC_TIMEOUT_MS || 90000),
    maxCharsPerRequest: Number(process.env.CHATTERBOX_MAX_CHARS_PER_REQUEST || 850)
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

function sanitizePrompt(script) {
  return String(script || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*(HOOK|OUTRO|BINGE HOOK|END CARD|THE [A-Z\s]+|#[0-9]+\s*[-—].*)\s*$/gmi, '')
    .replace(/\[(?:confident|warmly|short pause|pause|beat|calm|excited|sincere|urgent|playful|thoughtful|serious|smiling|friendly|slowly|softly|firmly)[^\]]*\]/gi, '')
    .replace(/\((?:[^)]*pause[^)]*|[^)]*beat[^)]*|[^)]*setup[^)]*|[^)]*payoff[^)]*)\)/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitScript(script, maxChars) {
  const text = sanitizePrompt(script);
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  const addPiece = (piece) => {
    const clean = piece.trim();
    if (!clean) return;
    if ((current ? `${current}\n\n${clean}` : clean).length <= maxChars) {
      current = current ? `${current}\n\n${clean}` : clean;
      return;
    }
    pushCurrent();
    if (clean.length <= maxChars) {
      current = clean;
      return;
    }
    const sentences = clean.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [clean];
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      if ((current ? `${current} ${trimmed}` : trimmed).length <= maxChars) {
        current = current ? `${current} ${trimmed}` : trimmed;
        continue;
      }
      pushCurrent();
      if (trimmed.length <= maxChars) {
        current = trimmed;
        continue;
      }
      for (let i = 0; i < trimmed.length; i += maxChars) {
        chunks.push(trimmed.slice(i, i + maxChars).trim());
      }
    }
  };

  paragraphs.forEach(addPiece);
  pushCurrent();
  return chunks.filter(Boolean);
}

function parseWav(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Chatterbox returned a file that is not valid WAV audio.');
  }

  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = Math.min(start + size, buffer.length);
    if (id === 'fmt ') fmt = buffer.subarray(start, end);
    if (id === 'data') data = buffer.subarray(start, end);
    offset = start + size + (size % 2);
  }

  if (!fmt || !data) throw new Error('Chatterbox returned an incomplete WAV file.');
  const audioFormat = fmt.readUInt16LE(0);
  const channels = fmt.readUInt16LE(2);
  const sampleRate = fmt.readUInt32LE(4);
  const byteRate = fmt.readUInt32LE(8);
  const bitsPerSample = fmt.readUInt16LE(14);
  return { buffer, fmt, data, audioFormat, channels, sampleRate, byteRate, bitsPerSample };
}

function getWavDurationSeconds(filePath) {
  const wav = parseWav(filePath);
  return wav.byteRate ? wav.data.length / wav.byteRate : 0;
}

function writeCombinedWav(parts, outputPath) {
  if (!parts.length) throw new Error('No Chatterbox audio chunks were generated.');
  const parsed = parts.map(parseWav);
  const first = parsed[0];
  for (const wav of parsed.slice(1)) {
    const matches = wav.audioFormat === first.audioFormat
      && wav.channels === first.channels
      && wav.sampleRate === first.sampleRate
      && wav.bitsPerSample === first.bitsPerSample;
    if (!matches) throw new Error('Chatterbox chunks returned mismatched WAV formats and could not be stitched.');
  }

  const dataSize = parsed.reduce((total, wav) => total + wav.data.length, 0);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(first.audioFormat, 20);
  header.writeUInt16LE(first.channels, 22);
  header.writeUInt32LE(first.sampleRate, 24);
  header.writeUInt32LE(first.byteRate, 28);
  header.writeUInt16LE(first.channels * first.bitsPerSample / 8, 32);
  header.writeUInt16LE(first.bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.concat([header, ...parsed.map(wav => wav.data)]));
  return outputPath;
}

function validateAudioOutput(filePath, prompt) {
  const words = String(prompt || '').trim().split(/\s+/).filter(Boolean).length;
  const stats = fs.statSync(filePath);
  const duration = path.extname(filePath).toLowerCase() === '.wav' ? getWavDurationSeconds(filePath) : 0;
  const minimumDuration = Math.min(20, Math.max(1.5, words / 7));
  if (stats.size < 24000 || (duration && duration < minimumDuration)) {
    throw new Error(`Chatterbox returned unusable audio (${duration.toFixed(1)}s, ${stats.size} bytes). Try a shorter script or let Bloom split it into chunks.`);
  }
  return { duration, size: stats.size };
}

async function requestChatterboxChunk({ config, prompt, voice, voiceUrl, format, outputPath }) {
  const input = { prompt, voice, format };
  if (voiceUrl) input.voice_url = voiceUrl;

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
  const localPath = await downloadAudio(result.audioUrl, outputPath);
  validateAudioOutput(localPath, prompt);
  return { ...result, localPath };
}

async function createChatterboxAudio({ script, voice, voiceUrl, voiceSamplePath, format, outputDir }) {
  const config = getChatterboxConfig();
  const prompt = sanitizePrompt(script);
  if (!config.apiKey) throw new Error('RUNPOD_CHATTERBOX_API_KEY or RUNPOD_API_KEY is not configured.');
  if (!prompt || prompt.length < 3) throw new Error('Paste a script before using Chatterbox audio.');

  const resolvedVoiceUrl = await resolveVoiceUrl({ voiceUrl, voiceSamplePath });
  const selectedVoice = cleanVoice(voice);
  const chunks = splitScript(prompt, Math.max(250, config.maxCharsPerRequest));
  const audioFormat = chunks.length > 1 ? 'wav' : cleanFormat(format);
  const baseDir = outputDir || path.join(__dirname, '..', '..', 'assets', 'tts', 'generated');
  const runId = `chatterbox-${Date.now()}`;

  if (chunks.length === 1) {
    const result = await requestChatterboxChunk({
      config,
      prompt: chunks[0],
      voice: selectedVoice,
      voiceUrl: resolvedVoiceUrl,
      format: audioFormat,
      outputPath: path.join(baseDir, `${runId}.${audioFormat}`)
    });
    return { ...result, localPath: result.localPath, format: audioFormat, voice: resolvedVoiceUrl ? 'custom' : selectedVoice, chunks: 1 };
  }

  const chunkDir = path.join(baseDir, `${runId}-chunks`);
  fs.mkdirSync(chunkDir, { recursive: true });
  const results = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const result = await requestChatterboxChunk({
      config,
      prompt: chunks[index],
      voice: selectedVoice,
      voiceUrl: resolvedVoiceUrl,
      format: 'wav',
      outputPath: path.join(chunkDir, `${String(index + 1).padStart(2, '0')}.wav`)
    });
    results.push(result);
  }

  const localPath = writeCombinedWav(results.map(result => result.localPath), path.join(baseDir, `${runId}.wav`));
  validateAudioOutput(localPath, prompt);
  return {
    id: results.map(result => result.id).filter(Boolean).join(','),
    status: 'COMPLETED',
    audioUrl: '',
    cost: results.reduce((total, result) => total + Number(result.cost || 0), 0) || null,
    raw: { chunks: results.map(result => result.raw) },
    localPath,
    format: 'wav',
    voice: resolvedVoiceUrl ? 'custom' : selectedVoice,
    chunks: chunks.length
  };
}

module.exports = {
  CHATTERBOX_VOICES,
  getChatterboxConfig,
  createChatterboxAudio
};
