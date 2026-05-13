const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const {
  getBaseUrl,
  getPresets,
  uploadInput,
  submitStudioJob,
  pollStudioJob,
  getStudioJobs
} = require('../services/comfyui');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'assets', 'studio-uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = cleanSlug(req.body.tenantId || 'default');
    const dir = path.join(UPLOAD_DIR, tenantId, req.body.clientJobId || uuidv4());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = cleanSlug(path.basename(file.originalname, ext)) || file.fieldname;
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

function cleanSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

router.get('/status', (req, res) => {
  res.json({
    provider: 'comfyui',
    configured: !!getBaseUrl(),
    baseUrlConfigured: !!getBaseUrl(),
    presets: getPresets(),
    audioProviders: [
      { id: 'upload', label: 'Uploaded audio', available: true },
      { id: 'elevenlabs', label: 'ElevenLabs', available: !!process.env.ELEVENLABS_API_KEY },
      { id: 'qwen', label: 'Qwen audio workflow', available: false, note: 'Waiting on Qwen workflow API export' }
    ]
  });
});

async function createElevenLabsAudio({ script, voiceId, tenantId }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const selectedVoice = voiceId || process.env.ELEVENLABS_SARAH_VOICE_ID || process.env.ELEVENLABS_DEFAULT_VOICE_ID;

  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured.');
  if (!selectedVoice) throw new Error('Set a voice ID or ELEVENLABS_SARAH_VOICE_ID before using ElevenLabs audio.');
  if (!script || script.trim().length < 3) throw new Error('Paste a script before using ElevenLabs audio.');

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text: script,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_v3',
      voice_settings: {
        stability: Number(process.env.ELEVENLABS_STABILITY || 0.45),
        similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY || 0.85)
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ElevenLabs audio failed: ${response.status} ${text}`);
  }

  const dir = path.join(UPLOAD_DIR, cleanSlug(tenantId || 'default'), 'elevenlabs');
  fs.mkdirSync(dir, { recursive: true });
  const outputPath = path.join(dir, `voice-${Date.now()}.mp3`);

  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(outputPath);
    response.body.pipe(dest);
    response.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });

  return outputPath;
}

router.get('/jobs', (req, res) => {
  res.json({ jobs: getStudioJobs() });
});

router.get('/jobs/:requestId', async (req, res) => {
  try {
    const job = await pollStudioJob(req.params.requestId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!getBaseUrl()) {
      return res.status(400).json({
        error: 'COMFYUI_BASE_URL is not configured on Railway yet.',
        detail: 'The studio UI is ready, but the service needs the public RunPod/ComfyUI API URL before it can queue jobs.'
      });
    }

    const presetId = req.body.presetId || (req.body.mode === 'v2v' ? 'bloomies-v2v' : 'sarah-i2v-lipsync');
    const audioProvider = req.body.audioProvider || 'upload';
    const mode = req.body.mode || 'i2v';

    if (audioProvider === 'qwen') {
      return res.status(400).json({
        error: 'Qwen audio workflow is not installed yet.',
        detail: 'Send the Qwen audio workflow API export and this option can queue that preset too.'
      });
    }

    const files = req.files || {};
    if (mode === 'i2v' && !files.image?.[0]) {
      return res.status(400).json({ error: 'Upload a starting image for I2V.' });
    }
    if (mode === 'v2v' && !files.video?.[0]) {
      return res.status(400).json({ error: 'Upload a source video for V2V.' });
    }
    if (audioProvider === 'upload' && !files.audio?.[0]) {
      return res.status(400).json({ error: 'Upload an audio file.' });
    }

    const imageName = files.image?.[0] ? await uploadInput(files.image[0].path) : null;
    const videoName = files.video?.[0] ? await uploadInput(files.video[0].path) : null;
    let audioPath = files.audio?.[0]?.path || null;
    if (audioProvider === 'elevenlabs') {
      audioPath = await createElevenLabsAudio({
        script: req.body.script,
        voiceId: req.body.voiceId,
        tenantId: req.body.tenantId
      });
    }
    const audioName = audioPath ? await uploadInput(audioPath) : null;

    const job = await submitStudioJob({
      presetId,
      mode,
      audioProvider,
      tenantId: cleanSlug(req.body.tenantId || 'kimberly'),
      script: req.body.script || '',
      prompt: req.body.prompt || '',
      negativePrompt: req.body.negativePrompt || '',
      imageName,
      videoName,
      audioName
    });

    res.json({ success: true, job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
