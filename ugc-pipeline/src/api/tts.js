const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { CHATTERBOX_VOICES, createChatterboxAudio, getChatterboxConfig } = require('../services/chatterbox');
const { hasDatabase, initUgcStore, query } = require('../services/postgres');
const fetch = require('node-fetch');
const { logger } = require('../services/logger');

const router = express.Router();
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

router.get('/providers', (req, res) => {
  const chatterbox = getChatterboxConfig();
  res.json({
    providers: [
      {
        id: 'chatterbox',
        label: 'Chatterbox Turbo',
        available: !!chatterbox.apiKey,
        endpointId: chatterbox.endpointId,
        voices: CHATTERBOX_VOICES,
        customVoice: {
          field: 'voice_url',
          note: 'Use a public URL to a short voice reference audio file, or upload a sample and Bloom Studio will host it before calling RunPod.'
        }
      }
    ]
  });
});

router.post('/chatterbox', upload.single('voiceSample'), async (req, res) => {
  const started = Date.now();
  try {
    const dir = path.join(UPLOAD_DIR, req.tenant?.slug || req.tenant?.id || 'default', 'generated');
    const result = await createChatterboxAudio({
      script: req.body.script,
      voice: req.body.voice,
      voiceUrl: req.body.voiceUrl,
      voiceSamplePath: req.file?.path || null,
      format: req.body.format,
      outputDir: dir
    });
    const asset = await saveGeneratedAudio(req, result.localPath, {
      name: req.body.name || `Chatterbox ${new Date().toLocaleString()}`,
      provider: 'chatterbox',
      voice: result.voice,
      script: req.body.script || ''
    });
    logger.info('Chatterbox preview generated', { tenant: req.tenant?.slug || req.tenant?.id, durationMs: Date.now() - started, voice: result.voice });
    res.json({ success: true, result: { ...result, asset } });
  } catch (error) {
    logger.error('Chatterbox preview failed', { tenant: req.tenant?.slug || req.tenant?.id, durationMs: Date.now() - started, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/elevenlabs', async (req, res) => {
  const started = Date.now();
  try {
    const dir = path.join(UPLOAD_DIR, req.tenant?.slug || req.tenant?.id || 'default', 'generated');
    const result = await createElevenLabsAudio({
      script: req.body.script,
      voiceId: req.body.voiceId,
      outputDir: dir
    });
    const asset = await saveGeneratedAudio(req, result.localPath, {
      name: req.body.name || `ElevenLabs ${new Date().toLocaleString()}`,
      provider: 'elevenlabs',
      voice: result.voice,
      script: req.body.script || ''
    });
    logger.info('ElevenLabs preview generated', { tenant: req.tenant?.slug || req.tenant?.id, durationMs: Date.now() - started, voice: result.voice });
    res.json({ success: true, result: { ...result, asset } });
  } catch (error) {
    logger.error('ElevenLabs preview failed', { tenant: req.tenant?.slug || req.tenant?.id, durationMs: Date.now() - started, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

async function createElevenLabsAudio({ script, voiceId, outputDir }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const selectedVoice = voiceId || process.env.ELEVENLABS_SARAH_VOICE_ID || process.env.ELEVENLABS_DEFAULT_VOICE_ID;
  const text = String(script || '').trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured.');
  if (!selectedVoice) throw new Error('Set an ElevenLabs voice ID or ELEVENLABS_DEFAULT_VOICE_ID.');
  if (!text || text.length < 3) throw new Error('Paste a script before using ElevenLabs audio.');

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_v3',
      voice_settings: {
        stability: Number(process.env.ELEVENLABS_STABILITY || 0.45),
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
  const fileName = path.basename(filePath);
  const bytes = fs.readFileSync(filePath);
  const mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg' : fileName.endsWith('.ogg') ? 'audio/ogg' : fileName.endsWith('.flac') ? 'audio/flac' : 'audio/wav';
  if (hasDatabase()) {
    await initUgcStore();
    const { rows } = await query(`
      insert into public.ugc_asset_files
        (tenant_slug, type, name, file_name, mime_type, size_bytes, file_data, metadata)
      values ($1, 'audio', $2, $3, $4, $5, $6, $7::jsonb)
      returning *
    `, [
      tenantSlug,
      metadata.name,
      fileName,
      mimeType,
      bytes.length,
      bytes,
      JSON.stringify(metadata)
    ]);
    return {
      slug: rows[0].id,
      name: rows[0].name,
      type: 'audio',
      files: [{ name: rows[0].file_name, path: `/api/assets/file/${rows[0].id}`, size: Number(rows[0].size_bytes || 0), mimeType }]
    };
  }

  const slug = cleanSlug(metadata.name) || `audio-${Date.now()}`;
  const dir = path.join(ROOT_DIR, 'assets', 'tenants', tenantSlug, 'audio', slug);
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, fileName);
  fs.copyFileSync(filePath, finalPath);
  fs.writeFileSync(path.join(dir, 'ai-context.json'), JSON.stringify(metadata, null, 2));
  return {
    slug,
    name: metadata.name,
    type: 'audio',
    files: [{ name: fileName, path: `/assets/tenants/${tenantSlug}/audio/${slug}/${fileName}`, size: bytes.length, mimeType }]
  };
}

function cleanSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

module.exports = router;
