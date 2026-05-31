const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Kokoro-82M voices — 54 voices across 8 languages.
// Voice IDs follow the pattern: {accent_prefix}_{name}
// af_ = American English Female, am_ = American English Male
// bf_ = British English Female, bm_ = British English Male
// ff_ = French Female, fm_ = French Male
// jf_ = Japanese Female, jm_ = Japanese Male
// kf_ = Korean Female, km_ = Korean Male
// ef_ = Spanish Female, em_ = Spanish Male
// zf_ = Mandarin Chinese Female, zm_ = Mandarin Chinese Male
// pf_ = Brazilian Portuguese Female, pm_ = Brazilian Portuguese Male
const KOKORO_VOICES = [
  // American English — Female
  { id: 'af_heart',    name: 'Heart',      gender: 'Female', accent: 'American English', tags: ['Warm', 'Expressive'] },
  { id: 'af_sarah',    name: 'Sarah',      gender: 'Female', accent: 'American English', tags: ['Natural', 'Clear'] },
  { id: 'af_bella',    name: 'Bella',      gender: 'Female', accent: 'American English', tags: ['Friendly', 'Bright'] },
  { id: 'af_nicole',   name: 'Nicole',     gender: 'Female', accent: 'American English', tags: ['Calm', 'Professional'] },
  { id: 'af_sky',      name: 'Sky',        gender: 'Female', accent: 'American English', tags: ['Upbeat', 'Young'] },
  { id: 'af_nova',     name: 'Nova',       gender: 'Female', accent: 'American English', tags: ['Smooth', 'Confident'] },
  { id: 'af_alloy',    name: 'Alloy',      gender: 'Female', accent: 'American English', tags: ['Versatile', 'Clear'] },
  { id: 'af_jessica',  name: 'Jessica',    gender: 'Female', accent: 'American English', tags: ['Warm', 'Engaging'] },
  { id: 'af_river',    name: 'River',      gender: 'Female', accent: 'American English', tags: ['Soothing', 'Natural'] },
  { id: 'af_kore',     name: 'Kore',       gender: 'Female', accent: 'American English', tags: ['Crisp', 'Modern'] },
  { id: 'af_aoede',    name: 'Aoede',      gender: 'Female', accent: 'American English', tags: ['Melodic', 'Smooth'] },
  // American English — Male
  { id: 'am_michael',  name: 'Michael',    gender: 'Male',   accent: 'American English', tags: ['Deep', 'Authoritative'] },
  { id: 'am_adam',     name: 'Adam',       gender: 'Male',   accent: 'American English', tags: ['Strong', 'Clear'] },
  { id: 'am_echo',     name: 'Echo',       gender: 'Male',   accent: 'American English', tags: ['Smooth', 'Confident'] },
  { id: 'am_liam',     name: 'Liam',       gender: 'Male',   accent: 'American English', tags: ['Friendly', 'Natural'] },
  { id: 'am_onyx',     name: 'Onyx',       gender: 'Male',   accent: 'American English', tags: ['Deep', 'Rich'] },
  { id: 'am_orion',    name: 'Orion',      gender: 'Male',   accent: 'American English', tags: ['Bold', 'Expressive'] },
  { id: 'am_eric',     name: 'Eric',       gender: 'Male',   accent: 'American English', tags: ['Calm', 'Professional'] },
  { id: 'am_fenrir',   name: 'Fenrir',     gender: 'Male',   accent: 'American English', tags: ['Powerful', 'Dynamic'] },
  { id: 'am_puck',     name: 'Puck',       gender: 'Male',   accent: 'American English', tags: ['Playful', 'Upbeat'] },
  { id: 'am_santa',    name: 'Santa',      gender: 'Male',   accent: 'American English', tags: ['Warm', 'Jolly'] },
  // British English — Female
  { id: 'bf_emma',     name: 'Emma',       gender: 'Female', accent: 'British English',  tags: ['Polished', 'Elegant'] },
  { id: 'bf_alice',    name: 'Alice',      gender: 'Female', accent: 'British English',  tags: ['Clear', 'Professional'] },
  { id: 'bf_isabella', name: 'Isabella',   gender: 'Female', accent: 'British English',  tags: ['Warm', 'Sophisticated'] },
  { id: 'bf_lily',     name: 'Lily',       gender: 'Female', accent: 'British English',  tags: ['Soft', 'Natural'] },
  // British English — Male
  { id: 'bm_george',   name: 'George',     gender: 'Male',   accent: 'British English',  tags: ['Authoritative', 'Crisp'] },
  { id: 'bm_daniel',   name: 'Daniel',     gender: 'Male',   accent: 'British English',  tags: ['Deep', 'Smooth'] },
  { id: 'bm_lewis',    name: 'Lewis',      gender: 'Male',   accent: 'British English',  tags: ['Confident', 'Clear'] },
  { id: 'bm_fable',    name: 'Fable',      gender: 'Male',   accent: 'British English',  tags: ['Storytelling', 'Rich'] },
  // French
  { id: 'ff_siwis',   name: 'Siwis',      gender: 'Female', accent: 'French',           tags: ['Elegant', 'Smooth'] },
  { id: 'fm_gaston',  name: 'Gaston',     gender: 'Male',   accent: 'French',           tags: ['Warm', 'Deep'] },
  // Japanese
  { id: 'jf_nezuko',  name: 'Nezuko',     gender: 'Female', accent: 'Japanese',         tags: ['Soft', 'Natural'] },
  { id: 'jf_alpha',   name: 'Alpha',      gender: 'Female', accent: 'Japanese',         tags: ['Clear', 'Calm'] },
  { id: 'jf_gongitsune', name: 'Gongitsune', gender: 'Female', accent: 'Japanese',      tags: ['Gentle', 'Smooth'] },
  { id: 'jf_tebukuro', name: 'Tebukuro',  gender: 'Female', accent: 'Japanese',         tags: ['Warm', 'Natural'] },
  { id: 'jm_kumo',    name: 'Kumo',       gender: 'Male',   accent: 'Japanese',         tags: ['Deep', 'Calm'] },
  // Korean
  { id: 'kf_alpha',   name: 'Alpha (F)',  gender: 'Female', accent: 'Korean',           tags: ['Clear', 'Natural'] },
  { id: 'km_alpha',   name: 'Alpha (M)',  gender: 'Male',   accent: 'Korean',           tags: ['Calm', 'Deep'] },
  // Spanish
  { id: 'ef_dora',    name: 'Dora',       gender: 'Female', accent: 'Spanish',          tags: ['Warm', 'Expressive'] },
  { id: 'em_alex',    name: 'Alex',       gender: 'Male',   accent: 'Spanish',          tags: ['Confident', 'Clear'] },
  { id: 'em_santa',   name: 'Santa',      gender: 'Male',   accent: 'Spanish',          tags: ['Warm', 'Friendly'] },
  // Mandarin Chinese
  { id: 'zf_xiaoxiao', name: 'Xiaoxiao',  gender: 'Female', accent: 'Mandarin Chinese', tags: ['Natural', 'Bright'] },
  { id: 'zf_xiaoni',  name: 'Xiaoni',     gender: 'Female', accent: 'Mandarin Chinese', tags: ['Soft', 'Warm'] },
  { id: 'zf_xiaobei', name: 'Xiaobei',    gender: 'Female', accent: 'Mandarin Chinese', tags: ['Clear', 'Young'] },
  { id: 'zf_xiaoyi',  name: 'Xiaoyi',     gender: 'Female', accent: 'Mandarin Chinese', tags: ['Calm', 'Smooth'] },
  { id: 'zm_yunxi',   name: 'Yunxi',      gender: 'Male',   accent: 'Mandarin Chinese', tags: ['Clear', 'Professional'] },
  { id: 'zm_yunjian', name: 'Yunjian',    gender: 'Male',   accent: 'Mandarin Chinese', tags: ['Deep', 'Strong'] },
  { id: 'zm_yunxia',  name: 'Yunxia',     gender: 'Male',   accent: 'Mandarin Chinese', tags: ['Smooth', 'Natural'] },
  { id: 'zm_yunyang', name: 'Yunyang',    gender: 'Male',   accent: 'Mandarin Chinese', tags: ['Confident', 'Clear'] },
  // Brazilian Portuguese
  { id: 'pf_dora',    name: 'Dora',       gender: 'Female', accent: 'Brazilian Portuguese', tags: ['Warm', 'Expressive'] },
  { id: 'pm_alex',    name: 'Alex',       gender: 'Male',   accent: 'Brazilian Portuguese', tags: ['Clear', 'Natural'] },
  { id: 'pm_santa',   name: 'Santa',      gender: 'Male',   accent: 'Brazilian Portuguese', tags: ['Warm', 'Friendly'] },
];

const KOKORO_VOICE_IDS = new Set(KOKORO_VOICES.map(v => v.id));

function getKokoroConfig() {
  return {
    endpointId:  process.env.RUNPOD_KOKORO_ENDPOINT_ID  || '',
    endpointUrl: process.env.RUNPOD_KOKORO_ENDPOINT_URL || process.env.KOKORO_ENDPOINT_URL || '',
    apiKey:      process.env.RUNPOD_KOKORO_API_KEY       || process.env.RUNPOD_API_KEY || '',
    timeoutMs:   Number(process.env.KOKORO_RUNSYNC_TIMEOUT_MS || 120000)
  };
}

// RunPod runsync ?wait= must be between 1000 and 300000 ms.
const RUNPOD_MAX_WAIT_MS = 300000;

function buildRunSyncUrl(config) {
  const waitMs = Math.min(Math.max(config.timeoutMs, 1000), RUNPOD_MAX_WAIT_MS);
  if (config.endpointUrl) {
    const url = new URL(config.endpointUrl);
    if (!/\/runsync$/i.test(url.pathname) && !/\/run$/i.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/runsync`;
    }
    if (!url.searchParams.has('wait')) url.searchParams.set('wait', String(waitMs));
    return url.toString();
  }
  if (!config.endpointId) return '';
  const url = new URL(`https://api.runpod.ai/v2/${config.endpointId}/runsync`);
  url.searchParams.set('wait', String(waitMs));
  return url.toString();
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

function normalizeResult(data) {
  const output = data?.output || data || {};
  const audioUrl = output.audio_url || output.audio || output.url || output.result_url ||
    (typeof output.result === 'string' ? output.result : '');
  const audioBase64 = output.audio_base64 || output.audioBase64 || output.wav_base64 || output.mp3_base64 || '';
  return {
    id:           data?.id || data?.requestId || '',
    status:       data?.status || 'unknown',
    audioUrl,
    audioBase64,
    raw: data
  };
}

async function downloadAudio(url, outputPath) {
  const response = await fetch(url, { timeout: 120000 });
  if (!response.ok) throw new Error(`Could not download Kokoro audio: ${response.status}`);
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
  // Kokoro produces small files for short samples; 4 KB is a safe minimum
  if (stats.size < 4000) {
    throw new Error(`Kokoro returned unusable audio (${stats.size} bytes).`);
  }
  return { size: stats.size };
}

/**
 * Generate speech with Kokoro via RunPod serverless.
 *
 * Deploy once on RunPod:
 *   Docker image: lucataco/kokoro-82m:latest
 *   GPU: RTX 3090 or T4 (82M params — any modern GPU)
 *   Set env var: RUNPOD_KOKORO_ENDPOINT_ID=<your endpoint id>
 *
 * RunPod worker input format:
 *   { input: { text, voice, speed } }
 * Output:
 *   { status: "COMPLETED", output: { audio_base64 | audio_url } }
 */
async function createKokoroAudio({ script, voice, speed, format, outputDir }) {
  const config = getKokoroConfig();
  const text = sanitizeScript(script);

  if (!config.apiKey) {
    throw new Error('RUNPOD_KOKORO_API_KEY or RUNPOD_API_KEY is not configured.');
  }
  if (!config.endpointId && !config.endpointUrl) {
    throw new Error(
      'RUNPOD_KOKORO_ENDPOINT_ID is not set. ' +
      'Deploy Kokoro on RunPod (lucataco/kokoro-82m:latest) and set the env var in Railway.'
    );
  }
  if (!text || text.length < 3) {
    throw new Error('Paste a script before generating Kokoro audio.');
  }

  const resolvedVoice  = KOKORO_VOICE_IDS.has(voice) ? voice : 'af_heart';
  const resolvedSpeed  = Number(speed) > 0 ? Number(speed) : 1.0;
  const audioFormat    = ['wav', 'mp3'].includes(format) ? format : 'wav';

  const response = await fetch(buildRunSyncUrl(config), {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: {
        text,
        voice: resolvedVoice,
        speed: resolvedSpeed
      }
    }),
    timeout: RUNPOD_MAX_WAIT_MS + 5000
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.detail || `Kokoro request failed: ${response.status}`);
  }
  if (data.status && data.status !== 'COMPLETED') {
    const workerErr = data.error ||
      (data.output && (data.output.error || data.output.message)) ||
      JSON.stringify(data).slice(0, 300);
    throw new Error(`Kokoro returned ${data.status}: ${workerErr}`);
  }

  const result = normalizeResult(data);
  if (!result.audioUrl && !result.audioBase64) {
    throw new Error('Kokoro completed but did not return audio_url or audio_base64.');
  }

  const localPath = path.join(outputDir, `kokoro-${Date.now()}.${audioFormat}`);
  if (result.audioBase64) {
    writeAudioBase64(result.audioBase64, localPath);
  } else {
    await downloadAudio(result.audioUrl, localPath);
  }
  validateAudioOutput(localPath);
  return { ...result, localPath, format: audioFormat, voice: resolvedVoice };
}

module.exports = {
  KOKORO_VOICES,
  KOKORO_VOICE_IDS,
  getKokoroConfig,
  createKokoroAudio
};
