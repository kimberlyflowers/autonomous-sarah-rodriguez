const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const { KOKORO_VOICES, KOKORO_VOICE_IDS, createKokoroAudio, getKokoroConfig } = require('../services/kokoro');
const { hasDatabase, initUgcStore, query } = require('../services/postgres');
const fetch   = require('node-fetch');
const { logger } = require('../services/logger');

const router   = express.Router();
const ROOT_DIR = path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.join(ROOT_DIR, 'assets', 'tts');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tenantId = req.tenant?.slug || req.tenant?.id || 'default';
      const dir = path.join(UPLOAD_DIR, tenantId, uuidv4());
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.wav';
      cb(null, `${file.fieldname}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ── Provider status (used by the UI health check) ────────────────────────────
router.get('/providers', (req, res) => {
  const kokoro = getKokoroConfig();
  res.json({
    providers: [
      {
        id:        'kokoro',
        label:     'Kokoro (54 voices)',
        available: !!kokoro.apiKey && !!(kokoro.endpointId || kokoro.endpointUrl),
        endpointId: kokoro.endpointId,
        note:      'Deploy lucataco/kokoro-82m on RunPod Serverless and set RUNPOD_KOKORO_ENDPOINT_ID.'
      },
      {
        id:        'elevenlabs',
        label:     'ElevenLabs',
        available: !!process.env.ELEVENLABS_API_KEY
      }
    ]
  });
});

// ── Kokoro voice list ─────────────────────────────────────────────────────────
router.get('/kokoro/voices', (req, res) => {
  res.json({ voices: KOKORO_VOICES });
});

// ── Kokoro sample audio (generated on demand, cached forever) ─────────────────
const KOKORO_SAMPLE_DIR  = path.join(UPLOAD_DIR, 'kokoro-samples');
const _kokoroSampleGenerating = new Set();

const SAMPLE_TEXTS = {
  'af_heart':    'Hi! I\'m Heart — warm, expressive, and ready to bring your video to life.',
  'af_sarah':    'Hi! I\'m Sarah — clear, natural, and here to help you sound your best.',
  'af_bella':    'Hi! I\'m Bella — bright, friendly, and built for engaging content.',
  'af_nicole':   'Hi! I\'m Nicole — calm, professional, and perfect for clear narration.',
  'af_sky':      'Hi! I\'m Sky — upbeat, young, and here to energize your content.',
  'af_nova':     'Hi! I\'m Nova — smooth, confident, and great for polished voiceovers.',
  'af_alloy':    'Hi! I\'m Alloy — versatile and clear, ready for any kind of content.',
  'af_jessica':  'Hi! I\'m Jessica — warm, engaging, and here to connect with your audience.',
  'af_river':    'Hi! I\'m River — soothing and natural, perfect for relaxed narration.',
  'af_kore':     'Hi! I\'m Kore — crisp, modern, and ready to deliver.',
  'af_aoede':    'Hi! I\'m Aoede — melodic and smooth, built for beautiful storytelling.',
  'am_michael':  'Hi! I\'m Michael — deep, authoritative, and here to command attention.',
  'am_adam':     'Hi! I\'m Adam — strong, clear, and built for confident delivery.',
  'am_echo':     'Hi! I\'m Echo — smooth, confident, and ready to narrate your vision.',
  'am_liam':     'Hi! I\'m Liam — friendly, natural, and here to sound just like you.',
  'am_onyx':     'Hi! I\'m Onyx — deep, rich, and made for powerful narration.',
  'am_orion':    'Hi! I\'m Orion — bold, expressive, and built to stand out.',
  'am_eric':     'Hi! I\'m Eric — calm, professional, and great for instructional content.',
  'am_fenrir':   'Hi! I\'m Fenrir — powerful and dynamic, built for high-energy scripts.',
  'am_puck':     'Hi! I\'m Puck — playful, upbeat, and here to bring the fun.',
  'am_santa':    'Hi! I\'m Santa — warm, jolly, and perfect for holiday cheer.',
  'bf_emma':     'Hi! I\'m Emma — polished, elegant, and built for premium British narration.',
  'bf_alice':    'Hi! I\'m Alice — clear, professional, and classically British.',
  'bf_isabella': 'Hi! I\'m Isabella — warm, sophisticated, and here to elevate your content.',
  'bf_lily':     'Hi! I\'m Lily — soft, natural, and perfectly balanced.',
  'bm_george':   'Hi! I\'m George — authoritative, crisp, and classically British.',
  'bm_daniel':   'Hi! I\'m Daniel — deep, smooth, and built for polished delivery.',
  'bm_lewis':    'Hi! I\'m Lewis — confident, clear, and perfect for premium voiceovers.',
  'bm_fable':    'Hi! I\'m Fable — rich and perfect for storytelling.',
};

function getSampleText(voiceId) {
  if (SAMPLE_TEXTS[voiceId]) return SAMPLE_TEXTS[voiceId];
  const voice = KOKORO_VOICES.find(v => v.id === voiceId);
  if (!voice) return 'Hi! This is a sample of the Kokoro voice — smooth, clear, and ready for your content.';
  return `Hi! I\'m ${voice.name} — a ${voice.gender.toLowerCase()} voice with a ${voice.accent} accent, built for Bloom UGC Studio.`;
}

router.get('/kokoro/sample/:voice', async (req, res) => {
  const voiceId = KOKORO_VOICE_IDS.has(req.params.voice) ? req.params.voice : '';
  if (!voiceId) return res.status(404).json({ error: 'Unknown Kokoro voice.' });

  // Fast-fail if endpoint not configured — don't hang the browser
  const kokoroCfg = getKokoroConfig();
  if (!kokoroCfg.apiKey || (!kokoroCfg.endpointId && !kokoroCfg.endpointUrl)) {
    return res.status(503).json({ error: 'Kokoro endpoint not configured. Set RUNPOD_KOKORO_ENDPOINT_ID and RUNPOD_API_KEY.' });
  }

  fs.mkdirSync(KOKORO_SAMPLE_DIR, { recursive: true });
  const samplePath = path.join(KOKORO_SAMPLE_DIR, `${voiceId}.wav`);

  // Serve cached sample immediately
  if (fs.existsSync(samplePath)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('audio/wav');
    return res.sendFile(samplePath);
  }

  // If already generating, tell the client to retry
  if (_kokoroSampleGenerating.has(voiceId)) {
    return res.status(202).json({
      generating: true,
      retryAfterMs: 8000,
      message: `Sample for "${voiceId}" is being generated — please try again in a moment.`
    });
  }

  _kokoroSampleGenerating.add(voiceId);
  const tmpDir = path.join(KOKORO_SAMPLE_DIR, '_tmp');

  // Use a 25s timeout for samples — never hang the voice picker
  const sampleTimeout = 25000;

  try {
    const result = await Promise.race([
      createKokoroAudio({
        script:    getSampleText(voiceId),
        voice:     voiceId,
        speed:     1.0,
        format:    'wav',
        outputDir: tmpDir
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Kokoro sample timeout — endpoint may be cold-starting. Try again in 30s.')), sampleTimeout)
      )
    ]);
    fs.mkdirSync(KOKORO_SAMPLE_DIR, { recursive: true });
    if (result.localPath !== samplePath) fs.renameSync(result.localPath, samplePath);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('audio/wav');
    res.sendFile(samplePath);
    logger.info('Kokoro sample generated and cached', { voiceId });
  } catch (err) {
    logger.error('Kokoro sample generation failed', { voiceId, error: err.message });
    const isColdStart = err.message.includes('timeout') || err.message.includes('cold');
    res.status(isColdStart ? 503 : 500).json({
      error: err.message,
      coldStart: isColdStart,
      retryAfterMs: isColdStart ? 30000 : null
    });
  } finally {
    _kokoroSampleGenerating.delete(voiceId);
  }
});

// ── Kokoro TTS (full generation, saved to asset library) ─────────────────────
router.post('/kokoro', upload.none(), async (req, res) => {
  const started = Date.now();
  try {
    const dir = path.join(UPLOAD_DIR, req.tenant?.slug || req.tenant?.id || 'default', 'generated');
    const result = await createKokoroAudio({
      script:    req.body.script,
      voice:     req.body.voice,
      speed:     req.body.speed,
      format:    req.body.format,
      outputDir: dir
    });
    const asset = await saveGeneratedAudio(req, result.localPath, {
      name:     req.body.name || `Kokoro ${new Date().toLocaleString()}`,
      provider: 'kokoro',
      voice:    result.voice,
      script:   req.body.script || ''
    });
    logger.info('Kokoro audio generated', {
      tenant:     req.tenant?.slug || req.tenant?.id,
      durationMs: Date.now() - started,
      voice:      result.voice
    });
    res.json({ success: true, result: { ...result, asset } });
  } catch (error) {
    logger.error('Kokoro generation failed', {
      tenant:     req.tenant?.slug || req.tenant?.id,
      durationMs: Date.now() - started,
      error:      error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// ── ElevenLabs voice list (proxied from EL API with the server's key) ─────────
router.get('/elevenlabs/voices', async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ELEVENLABS_API_KEY is not configured.' });

  try {
    const r = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', {
      headers: { 'xi-api-key': apiKey }
    });
    if (!r.ok) return res.status(r.status).json({ error: `ElevenLabs API returned ${r.status}` });
    const data = await r.json();
    res.json({
      voices: (data.voices || []).map(v => ({
        id:         v.voice_id,
        name:       v.name,
        previewUrl: v.preview_url || '',
        category:   v.category || 'generated',
        tags:       Object.values(v.labels || {}).filter(Boolean)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ElevenLabs TTS (full generation) ─────────────────────────────────────────
router.post('/elevenlabs', async (req, res) => {
  const started = Date.now();
  try {
    const dir = path.join(UPLOAD_DIR, req.tenant?.slug || req.tenant?.id || 'default', 'generated');
    const result = await createElevenLabsAudio({
      script:   req.body.script,
      voiceId:  req.body.voiceId,
      outputDir: dir
    });
    const asset = await saveGeneratedAudio(req, result.localPath, {
      name:     req.body.name || `ElevenLabs ${new Date().toLocaleString()}`,
      provider: 'elevenlabs',
      voice:    result.voice,
      script:   req.body.script || ''
    });
    logger.info('ElevenLabs audio generated', {
      tenant:     req.tenant?.slug || req.tenant?.id,
      durationMs: Date.now() - started,
      voice:      result.voice
    });
    res.json({ success: true, result: { ...result, asset } });
  } catch (error) {
    logger.error('ElevenLabs generation failed', {
      tenant:     req.tenant?.slug || req.tenant?.id,
      durationMs: Date.now() - started,
      error:      error.message
    });
    res.status(500).json({ error: error.message });
  }
});

async function createElevenLabsAudio({ script, voiceId, outputDir }) {
  const apiKey       = process.env.ELEVENLABS_API_KEY;
  const selectedVoice = voiceId || process.env.ELEVENLABS_SARAH_VOICE_ID || process.env.ELEVENLABS_DEFAULT_VOICE_ID;
  const text         = String(script || '').trim();
  if (!apiKey)          throw new Error('ELEVENLABS_API_KEY is not configured.');
  if (!selectedVoice)   throw new Error('Set an ElevenLabs voice ID or ELEVENLABS_DEFAULT_VOICE_ID.');
  if (!text || text.length < 3) throw new Error('Paste a script before using ElevenLabs audio.');

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`, {
    method:  'POST',
    headers: {
      'xi-api-key':   apiKey,
      'Content-Type': 'application/json',
      Accept:         'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_v3',
      voice_settings: {
        stability:        Number(process.env.ELEVENLABS_STABILITY  || 0.45),
        similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY || 0.85)
      }
    })
  });
  if (!response.ok) throw new Error(`ElevenLabs audio failed: ${response.status} ${await response.text()}`);

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `elevenlabs-${Date.now()}.mp3`);
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(outputPath);
    response.body.pipe(dest);
    response.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
  return { localPath: outputPath, audioUrl: '', voice: selectedVoice, format: 'mp3' };
}

async function saveGeneratedAudio(req, filePath, metadata) {
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  const fileName   = path.basename(filePath);
  const bytes      = fs.readFileSync(filePath);
  const mimeType   = fileName.endsWith('.mp3')  ? 'audio/mpeg'
                   : fileName.endsWith('.ogg')  ? 'audio/ogg'
                   : fileName.endsWith('.flac') ? 'audio/flac'
                   : 'audio/wav';
  if (hasDatabase()) {
    await initUgcStore();
    const { rows } = await query(`
      insert into public.ugc_asset_files
        (tenant_slug, type, name, file_name, mime_type, size_bytes, file_data, metadata)
      values ($1, 'audio', $2, $3, $4, $5, $6, $7::jsonb)
      returning *
    `, [tenantSlug, metadata.name, fileName, mimeType, bytes.length, bytes, JSON.stringify(metadata)]);
    return {
      slug:  rows[0].id,
      name:  rows[0].name,
      type:  'audio',
      files: [{ name: rows[0].file_name, path: `/api/assets/file/${rows[0].id}`, size: Number(rows[0].size_bytes || 0), mimeType }]
    };
  }

  const slug = cleanSlug(metadata.name) || `audio-${Date.now()}`;
  const dir  = path.join(ROOT_DIR, 'assets', 'tenants', tenantSlug, 'audio', slug);
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, fileName);
  fs.copyFileSync(filePath, finalPath);
  fs.writeFileSync(path.join(dir, 'ai-context.json'), JSON.stringify(metadata, null, 2));
  return {
    slug,
    name:  metadata.name,
    type:  'audio',
    files: [{ name: fileName, path: `/assets/tenants/${tenantSlug}/audio/${slug}/${fileName}`, size: bytes.length, mimeType }]
  };
}

function cleanSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

module.exports = router;
