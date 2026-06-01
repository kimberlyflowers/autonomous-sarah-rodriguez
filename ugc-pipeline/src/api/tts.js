const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const { KOKORO_VOICES, KOKORO_VOICE_IDS, createKokoroAudio, getKokoroConfig } = require('../services/kokoro');
const { hasDatabase, initUgcStore, query, getTenantSetting } = require('../services/postgres');
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

// ── Kokoro sample persistence ─────────────────────────────────────────────────
// Samples are stored in Postgres so they survive Railway redeploys. Local disk
// is used as a fast secondary cache. Pre-generation runs in the background at
// startup so all voices are ready before any user opens the voice picker.

const KOKORO_SAMPLE_DIR     = path.join(UPLOAD_DIR, 'kokoro-samples');
const _kokoroSampleGenerating = new Set();
let   _samplesStoreReady    = false;

async function ensureSamplesStore() {
  if (_samplesStoreReady || !hasDatabase()) return;
  await initUgcStore();
  await query(`
    create table if not exists public.kokoro_voice_samples (
      voice_id   text        primary key,
      audio_data bytea       not null,
      mime_type  text        not null default 'audio/wav',
      created_at timestamptz not null default now()
    )
  `);
  _samplesStoreReady = true;
}

async function getSampleFromDb(voiceId) {
  if (!hasDatabase()) return null;
  try {
    await ensureSamplesStore();
    const { rows } = await query(
      'select audio_data, mime_type from public.kokoro_voice_samples where voice_id = $1',
      [voiceId]
    );
    return rows[0] || null;
  } catch (err) {
    logger.warn('Kokoro: failed to read sample from DB', { voiceId, error: err.message });
    return null;
  }
}

async function saveSampleToDb(voiceId, filePath) {
  if (!hasDatabase()) return;
  try {
    await ensureSamplesStore();
    const bytes = fs.readFileSync(filePath);
    await query(`
      insert into public.kokoro_voice_samples (voice_id, audio_data, mime_type)
      values ($1, $2, 'audio/wav')
      on conflict (voice_id) do nothing
    `, [voiceId, bytes]);
  } catch (err) {
    logger.warn('Kokoro: failed to save sample to DB', { voiceId, error: err.message });
  }
}

// Pre-generate all voice samples in the background so the voice picker is
// instant for every user. Runs non-blocking — never delays server startup.
// Skips voices already cached in DB. On cold endpoints, waits patiently and
// retries after failures so the whole batch completes over time.
async function preGenerateAllSamples() {
  if (!hasDatabase()) return;
  const cfg = getKokoroConfig();
  if (!cfg.apiKey || (!cfg.endpointId && !cfg.endpointUrl)) {
    logger.info('Kokoro pre-generation skipped — endpoint not configured');
    return;
  }

  logger.info('Kokoro voice sample pre-generation starting', { total: KOKORO_VOICES.length });
  fs.mkdirSync(KOKORO_SAMPLE_DIR, { recursive: true });
  const tmpDir = path.join(KOKORO_SAMPLE_DIR, '_tmp');

  let generated = 0, skipped = 0, failed = 0;

  for (const voice of KOKORO_VOICES) {
    const { id: voiceId } = voice;
    try {
      // Already in DB — nothing to do
      const existing = await getSampleFromDb(voiceId);
      if (existing) { skipped++; continue; }

      // Already on local disk — save to DB and skip generation
      const diskPath = path.join(KOKORO_SAMPLE_DIR, `${voiceId}.wav`);
      if (fs.existsSync(diskPath)) {
        await saveSampleToDb(voiceId, diskPath);
        skipped++;
        continue;
      }

      // Mark in-progress so on-demand requests know to retry
      _kokoroSampleGenerating.add(voiceId);
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
            setTimeout(() => reject(new Error('timeout')), 40000)
          )
        ]);

        // Persist to disk (local cache) and DB (survives redeploys)
        const finalPath = path.join(KOKORO_SAMPLE_DIR, `${voiceId}.wav`);
        try {
          if (result.localPath !== finalPath) fs.renameSync(result.localPath, finalPath);
        } catch {
          fs.copyFileSync(result.localPath, finalPath);
        }
        await saveSampleToDb(voiceId, finalPath);
        generated++;
        logger.info('Kokoro sample pre-generated', {
          voiceId,
          progress: `${generated + skipped + failed}/${KOKORO_VOICES.length}`
        });
      } finally {
        _kokoroSampleGenerating.delete(voiceId);
      }

      // Small gap so we don't hammer RunPod between voices
      await new Promise(r => setTimeout(r, 1200));

    } catch (err) {
      failed++;
      _kokoroSampleGenerating.delete(voiceId);
      logger.warn('Kokoro sample pre-generation failed', { voiceId, error: err.message });
      // Longer pause after failure — endpoint may still be cold-starting
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  logger.info('Kokoro voice sample pre-generation complete', { generated, skipped, failed });
}

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

// ── Kokoro sample status (how many are pre-generated) ────────────────────────
router.get('/kokoro/samples/status', async (req, res) => {
  try {
    let dbCount = 0;
    if (hasDatabase()) {
      await ensureSamplesStore();
      const { rows } = await query('select count(*)::int as n from public.kokoro_voice_samples');
      dbCount = rows[0]?.n || 0;
    }
    const diskCount = fs.existsSync(KOKORO_SAMPLE_DIR)
      ? fs.readdirSync(KOKORO_SAMPLE_DIR).filter(f => f.endsWith('.wav')).length
      : 0;
    res.json({
      total:      KOKORO_VOICES.length,
      inDatabase: dbCount,
      onDisk:     diskCount,
      generating: [..._kokoroSampleGenerating],
      ready:      dbCount >= KOKORO_VOICES.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single consistent sample text for every voice — identical script so users
// hear a true apples-to-apples comparison of tone, not different words.
const SAMPLE_TEXT = 'Welcome to Bloom Studio. This is my voice. Type your script to get started.';

function getSampleText(_voiceId) {
  return SAMPLE_TEXT;
}

// ── Wipe all cached samples (admin — call after changing SAMPLE_TEXT) ────────
router.delete('/kokoro/samples/all', async (req, res) => {
  try {
    let dbDeleted = 0;
    if (hasDatabase()) {
      await ensureSamplesStore();
      const { rowCount } = await query('delete from public.kokoro_voice_samples');
      dbDeleted = rowCount || 0;
    }
    // Wipe disk cache too
    if (fs.existsSync(KOKORO_SAMPLE_DIR)) {
      const files = fs.readdirSync(KOKORO_SAMPLE_DIR).filter(f => f.endsWith('.wav'));
      files.forEach(f => { try { fs.unlinkSync(path.join(KOKORO_SAMPLE_DIR, f)); } catch {} });
    }
    // Restart pre-generation with new text
    preGenerateAllSamples().catch(err => logger.warn('Re-gen after wipe failed', { error: err.message }));
    res.json({ deleted: dbDeleted, message: 'All samples wiped. Pre-generation restarted with new text.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kokoro voice sample ───────────────────────────────────────────────────────
// Lookup order:
//   1. Static bundled WAV  — committed to git, zero latency, survives every redeploy
//   2. Postgres DB         — persists across redeploys, populated by pre-gen job
//   3. Local disk cache    — fast, wiped on Railway redeploy
//   4. Generate on demand  — last resort; returns 202 immediately (background gen)
const STATIC_SAMPLES_DIR = path.join(__dirname, '../../public/audio/kokoro-samples');

router.get('/kokoro/sample/:voice', async (req, res) => {
  const voiceId = KOKORO_VOICE_IDS.has(req.params.voice) ? req.params.voice : '';
  if (!voiceId) return res.status(404).json({ error: 'Unknown Kokoro voice.' });

  // 1. Static bundled file — committed to git, instant forever
  const staticPath = path.join(STATIC_SAMPLES_DIR, `${voiceId}.wav`);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).size > 1000) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('audio/wav');
    return res.sendFile(staticPath);
  }

  // 2. DB — instant, survives redeploys
  const dbSample = await getSampleFromDb(voiceId);
  if (dbSample) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', dbSample.mime_type || 'audio/wav');
    return res.send(dbSample.audio_data);
  }

  // 3. Local disk — fast, may be absent after redeploy
  const samplePath = path.join(KOKORO_SAMPLE_DIR, `${voiceId}.wav`);
  if (fs.existsSync(samplePath)) {
    saveSampleToDb(voiceId, samplePath).catch(() => {}); // opportunistically persist
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('audio/wav');
    return res.sendFile(samplePath);
  }

  // 3. Fast-fail if endpoint not configured
  const kokoroCfg = getKokoroConfig();
  if (!kokoroCfg.apiKey || (!kokoroCfg.endpointId && !kokoroCfg.endpointUrl)) {
    return res.status(503).json({
      error: 'Kokoro endpoint not configured. Set RUNPOD_KOKORO_ENDPOINT_ID and RUNPOD_KOKORO_API_KEY.'
    });
  }

  // 4. If the background pre-gen is already working on this voice, tell client to retry
  if (_kokoroSampleGenerating.has(voiceId)) {
    return res.status(202).json({
      generating:   true,
      retryAfterMs: 8000,
      message:      `Sample for "${voiceId}" is being generated — try again in a moment.`
    });
  }

  // 5. Kick off background generation and return 202 immediately — never block
  //    the request on a cold RunPod start (was causing 25s wait + 503).
  _kokoroSampleGenerating.add(voiceId);
  const tmpDir = path.join(KOKORO_SAMPLE_DIR, '_tmp');

  // Respond immediately so the client can show a "generating…" state and retry
  res.status(202).json({
    generating:   true,
    retryAfterMs: 8000,
    message:      `Sample for "${voiceId}" is being generated — try again in ~8 seconds.`
  });

  // Generate in the background — result lands in DB so the next poll is instant
  createKokoroAudio({
    script:    getSampleText(voiceId),
    voice:     voiceId,
    speed:     1.0,
    format:    'wav',
    outputDir: tmpDir
  })
    .then(result => {
      fs.mkdirSync(KOKORO_SAMPLE_DIR, { recursive: true });
      try { fs.renameSync(result.localPath, samplePath); }
      catch { fs.copyFileSync(result.localPath, samplePath); }
      return saveSampleToDb(voiceId, samplePath);
    })
    .then(() => logger.info('Kokoro sample ready (background)', { voiceId }))
    .catch(err  => logger.error('Kokoro sample background generation failed', { voiceId, error: err.message }))
    .finally(() => _kokoroSampleGenerating.delete(voiceId));
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

// Helper — resolve EL API key for the current tenant (tenant key > env var)
async function resolveElevenLabsKey(req) {
  const tenantSlug = req.tenant?.id || req.tenant?.slug;
  if (tenantSlug && hasDatabase()) {
    const stored = await getTenantSetting(tenantSlug, 'elevenlabs_api_key').catch(() => null);
    if (stored) return stored;
  }
  return process.env.ELEVENLABS_API_KEY || null;
}

// ── ElevenLabs voice list (proxied from EL API — uses tenant key or server key) ─────────
router.get('/elevenlabs/voices', async (req, res) => {
  const apiKey = await resolveElevenLabsKey(req);
  if (!apiKey) return res.status(503).json({ error: 'ElevenLabs is not connected. Go to Settings to add your API key.' });

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
    const elKey = await resolveElevenLabsKey(req);
    const result = await createElevenLabsAudio({
      script:   req.body.script,
      voiceId:  req.body.voiceId,
      outputDir: dir,
      apiKey:   elKey
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

async function createElevenLabsAudio({ script, voiceId, outputDir, apiKey: callerKey }) {
  const apiKey       = callerKey || process.env.ELEVENLABS_API_KEY;
  const selectedVoice = voiceId || process.env.ELEVENLABS_SARAH_VOICE_ID || process.env.ELEVENLABS_DEFAULT_VOICE_ID;
  const text         = String(script || '').trim();
  if (!apiKey)          throw new Error('ElevenLabs is not connected. Go to Settings → Integrations to add your API key.');
  if (!selectedVoice)   throw new Error('Choose an ElevenLabs voice before generating audio.');
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

// ── Background pre-generation — starts 10s after server boots ─────────────────
// Gives the server time to fully initialize before hitting RunPod.
setTimeout(() => {
  preGenerateAllSamples().catch(err =>
    logger.warn('Kokoro background pre-generation exited early', { error: err.message })
  );
}, 10000);

module.exports = router;
