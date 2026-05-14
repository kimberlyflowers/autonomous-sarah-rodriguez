const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { parseFile } = require('music-metadata');
const sharp = require('sharp');
const {
  getBaseUrl,
  getPresets,
  uploadInput,
  submitStudioJob,
  pollStudioJob,
  getStudioJobs
} = require('../services/comfyui');
const { ensureComfyReady, getAccountBalance, getPodStatus, getRunPodConfig, isComfyReady, normalizePodState, startPod, stopPod } = require('../services/runpod');
const { getAssetFile, hasDatabase, initUgcStore, query } = require('../services/postgres');
const { CHATTERBOX_VOICES, createChatterboxAudio, getChatterboxConfig } = require('../services/chatterbox');
const { createMeigenVideo, getMeigenConfig } = require('../services/meigen');
const { createWan22Video, createWanAnimateVideo, getRunpodVideoConfig } = require('../services/runpodVideo');
const { downloadSourceVideo, getRunpodToolConfig } = require('../services/runpodTools');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'assets', 'studio-uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = req.tenant?.slug || req.tenant?.id || 'default';
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

async function getSupabaseAssetFile(req, assetId, type) {
  const { getSignedUrl } = require('../services/supabase');
  const { data: asset, error } = await req.supabase
    .from('ugc_assets')
    .select('*')
    .eq('tenant_id', req.tenant.id)
    .eq('id', assetId)
    .eq('type', type)
    .single();
  if (error) throw error;
  return {
    asset,
    url: await getSignedUrl(req.supabase, asset.storage_path, 10 * 60)
  };
}

function getLocalAssetFile(req, slug, folder) {
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  const dir = path.join(__dirname, '..', '..', 'assets', 'tenants', tenantSlug, folder, slug);
  if (!fs.existsSync(dir)) throw new Error(`Saved ${folder} asset was not found.`);
  const file = fs.readdirSync(dir).find(name => !name.endsWith('.json'));
  if (!file) throw new Error(`Saved ${folder} asset has no file.`);
  return path.join(dir, file);
}

async function downloadTempFile(url, tenantId, filename) {
  const dir = path.join(UPLOAD_DIR, cleanSlug(tenantId || 'default'), 'library-assets');
  fs.mkdirSync(dir, { recursive: true });
  const outputPath = path.join(dir, `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download saved asset: ${response.status}`);
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(outputPath);
    response.body.pipe(dest);
    response.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
  return outputPath;
}

function isDirectVideoUrl(value = '') {
  return /^https?:\/\/.+\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i.test(String(value));
}

async function prepareReferenceVideoUrl(sourceUrl, maxDuration = 180) {
  const url = String(sourceUrl || '').trim();
  if (!url) return '';
  if (/^data:video\//i.test(url) || isDirectVideoUrl(url)) return url;

  const downloaderConfig = getRunpodToolConfig('DOWNLOADER');
  const downloaderReady = !!downloaderConfig.apiKey && !!(downloaderConfig.endpointId || downloaderConfig.endpointUrl);
  if (!downloaderReady) return url;

  const downloaded = await downloadSourceVideo(url, {
    audioOnly: false,
    maxDuration: Number(maxDuration || 180)
  });
  return downloaded.url;
}

async function writeDatabaseAssetTemp(req, assetId, type) {
  const asset = await getAssetFile(req.tenant.slug || req.tenant.id, assetId, type);
  if (!asset) throw new Error(`Saved ${type} asset was not found.`);
  const dir = path.join(UPLOAD_DIR, cleanSlug(req.tenant.slug || req.tenant.id || 'default'), 'database-assets');
  fs.mkdirSync(dir, { recursive: true });
  const outputPath = path.join(dir, `${Date.now()}-${asset.file_name.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
  fs.writeFileSync(outputPath, asset.file_data);
  return outputPath;
}

function cleanSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseDurationSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(Math.max(seconds, 1), 4 * 60 * 60);
}

function parseCropPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 50;
  return Math.max(0, Math.min(100, percent));
}

function getOutputSize(aspectRatio = '9:16') {
  if (aspectRatio === '16:9') return { width: 1280, height: 720 };
  if (aspectRatio === '1:1') return { width: 1024, height: 1024 };
  return { width: 720, height: 1280 };
}

function getMeigenSize(value = '480p') {
  return value === '720p' ? '720p' : '480p';
}

async function frameImageForStudio(imagePath, aspectRatio, cropX, cropY) {
  if (!imagePath) return null;
  const target = getOutputSize(aspectRatio);
  const metadata = await sharp(imagePath).metadata();
  const sourceWidth = metadata.width;
  const sourceHeight = metadata.height;
  if (!sourceWidth || !sourceHeight) return imagePath;

  const targetRatio = target.width / target.height;
  const sourceRatio = sourceWidth / sourceHeight;
  let extractWidth = sourceWidth;
  let extractHeight = sourceHeight;

  if (sourceRatio > targetRatio) {
    extractWidth = Math.round(sourceHeight * targetRatio);
  } else if (sourceRatio < targetRatio) {
    extractHeight = Math.round(sourceWidth / targetRatio);
  }

  const maxLeft = Math.max(0, sourceWidth - extractWidth);
  const maxTop = Math.max(0, sourceHeight - extractHeight);
  const left = Math.round(maxLeft * (parseCropPercent(cropX) / 100));
  const top = Math.round(maxTop * (parseCropPercent(cropY) / 100));
  const outputPath = path.join(
    path.dirname(imagePath),
    `${path.basename(imagePath, path.extname(imagePath))}-framed-${target.width}x${target.height}.png`
  );

  await sharp(imagePath)
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .resize(target.width, target.height, { fit: 'cover', position: 'center' })
    .png()
    .toFile(outputPath);

  return outputPath;
}

async function getAudioDurationSeconds(filePath) {
  if (!filePath) return null;
  try {
    const metadata = await parseFile(filePath);
    return parseDurationSeconds(metadata?.format?.duration);
  } catch (error) {
    return null;
  }
}

function publicAssetPath(tenantSlug, folder, slug, fileName) {
  return `/assets/tenants/${tenantSlug}/${folder}/${slug}/${fileName}`;
}

async function saveGeneratedVideoAsset(req, localPath, metadata = {}) {
  const tenantSlug = cleanSlug(req.tenant?.slug || req.tenant?.id || 'default') || 'default';
  const slug = cleanSlug(metadata.name || `meigen-video-${Date.now()}`) || `meigen-video-${Date.now()}`;
  const fileName = `${slug}.mp4`;
  const bytes = fs.readFileSync(localPath);
  const assetMetadata = {
    provider: metadata.provider || 'meigen',
    source: metadata.source || 'infinitetalk',
    prompt: metadata.prompt || '',
    aspectRatio: metadata.aspectRatio || '9:16',
    cost: metadata.cost || null,
    rawRequestId: metadata.rawRequestId || ''
  };

  if (!req.supabase && hasDatabase()) {
    await initUgcStore();
    const { rows } = await query(`
      insert into public.ugc_asset_files
        (tenant_slug, type, name, file_name, mime_type, size_bytes, file_data, metadata)
      values ($1, 'video', $2, $3, 'video/mp4', $4, $5, $6::jsonb)
      returning *
    `, [
      req.tenant.slug || req.tenant.id,
      metadata.name || 'Meigen lip sync video',
      fileName,
      bytes.length,
      bytes,
      JSON.stringify(assetMetadata)
    ]);
    return {
      id: rows[0].id,
      slug: rows[0].id,
      path: `/api/assets/file/${rows[0].id}`,
      name: rows[0].name,
      size: bytes.length,
      metadata: assetMetadata
    };
  }

  const outDir = path.join(__dirname, '..', '..', 'assets', 'tenants', tenantSlug, 'videos', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const finalPath = path.join(outDir, fileName);
  fs.copyFileSync(localPath, finalPath);
  fs.writeFileSync(path.join(outDir, 'ai-context.json'), JSON.stringify(assetMetadata, null, 2));
  return {
    id: slug,
    slug,
    path: publicAssetPath(tenantSlug, 'videos', slug, fileName),
    name: metadata.name || 'Meigen lip sync video',
    size: bytes.length,
    metadata: assetMetadata
  };
}

function mapLocalVideoJob(row) {
  return {
    requestId: row.request_id,
    jobId: row.id,
    tenantId: row.tenant_slug,
    provider: row.provider,
    presetId: row.workflow_preset,
    mode: row.mode,
    audioProvider: row.audio_provider,
    status: row.status,
    prompt: row.prompt,
    aspectRatio: row.metadata?.aspectRatio || '9:16',
    script: row.script,
    localPath: row.metadata?.localPath || null,
    assetId: row.metadata?.assetId || null,
    cost: row.metadata?.cost || null,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

async function listLocalVideoJobs(req) {
  if (!hasDatabase()) return getStudioJobs().filter(job => job.tenantId === (req.tenant.slug || req.tenant.id));
  await initUgcStore();
  const { rows } = await query(
    'select * from public.ugc_video_jobs where tenant_slug = $1 order by created_at desc limit 100',
    [req.tenant.slug || req.tenant.id]
  );
  return rows.map(mapLocalVideoJob);
}

async function createLocalVideoJob(req, job) {
  if (!hasDatabase()) return null;
  await initUgcStore();
  const metadata = job.metadata || {};
  const { rows } = await query(`
    insert into public.ugc_video_jobs
      (tenant_slug, provider, workflow_preset, mode, audio_provider, status, request_id, script, prompt, negative_prompt, metadata)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    on conflict (tenant_slug, request_id) do update set
      status = excluded.status,
      metadata = excluded.metadata,
      updated_at = now()
    returning *
  `, [
    req.tenant.slug || req.tenant.id,
    job.provider,
    job.presetId || '',
    job.mode || '',
    job.audioProvider || '',
    job.status || 'processing',
    job.requestId,
    job.script || '',
    job.prompt || '',
    job.negativePrompt || '',
    JSON.stringify(metadata)
  ]);
  return rows[0] ? mapLocalVideoJob(rows[0]) : null;
}

async function updateLocalVideoJob(req, requestId, patch = {}) {
  if (!hasDatabase() || !requestId) return null;
  await initUgcStore();
  const metadata = patch.metadata || {};
  const { rows } = await query(`
    update public.ugc_video_jobs
    set status = coalesce($3, status),
        error = $4,
        completed_at = case when $3 = 'completed' then now() else completed_at end,
        metadata = metadata || $5::jsonb,
        updated_at = now()
    where tenant_slug = $1 and request_id = $2
    returning *
  `, [
    req.tenant.slug || req.tenant.id,
    requestId,
    patch.status || null,
    patch.error || null,
    JSON.stringify(metadata)
  ]);
  return rows[0] ? mapLocalVideoJob(rows[0]) : null;
}

router.get('/status', async (req, res) => {
  const runpod = getRunPodConfig();
  const comfyReady = await isComfyReady(getBaseUrl() || runpod.baseUrl);
  let podStatus = { configured: runpod.autoStartConfigured, desiredStatus: 'unknown' };
  if (runpod.autoStartConfigured) {
    try {
      podStatus = await getPodStatus();
    } catch (error) {
      podStatus = { configured: true, desiredStatus: 'status-error', error: error.message };
    }
  }
  const presets = getPresets().map((preset) => ({
    ...preset,
    ready: comfyReady && preset.available
  }));
  res.json({
    provider: 'comfyui',
    configured: !!getBaseUrl(),
    baseUrlConfigured: !!getBaseUrl(),
    comfyReady,
    runpod: {
      podIdConfigured: !!runpod.podId,
      autoStartConfigured: runpod.autoStartConfigured,
      port: runpod.port,
      state: normalizePodState(podStatus, comfyReady),
      desiredStatus: podStatus.desiredStatus,
      statusError: podStatus.error || null
    },
    presets,
    audioProviders: [
      { id: 'upload', label: 'Uploaded audio', available: true },
      { id: 'elevenlabs', label: 'ElevenLabs', available: !!process.env.ELEVENLABS_API_KEY },
      {
        id: 'chatterbox',
        label: 'Chatterbox Turbo',
        available: !!getChatterboxConfig().apiKey,
        voices: CHATTERBOX_VOICES,
        note: 'RunPod public Chatterbox Turbo endpoint. Preset voices or custom voice_url reference audio.'
      },
      { id: 'qwen', label: 'Qwen audio workflow', available: false, note: 'Install ComfyUI-Qwen-TTS on RunPod and export a Qwen API workflow preset before enabling.' }
    ],
    videoEngines: [
      {
        id: 'wan-comfy',
        label: 'WAN / ComfyUI',
        available: comfyReady,
        note: 'Uses the installed ComfyUI I2V workflow and the active RunPod pod.'
      },
      {
        id: 'wan22-serverless',
        label: 'Wan 2.2 Serverless',
        available: !!getRunpodVideoConfig('WAN22').apiKey && !!(getRunpodVideoConfig('WAN22').endpointId || getRunpodVideoConfig('WAN22').endpointUrl),
        note: 'RunPod serverless Wan 2.2 image-to-video. No ComfyUI pod required.'
      },
      {
        id: 'meigen',
        label: 'Meigen lip sync',
        available: !!getMeigenConfig().apiKey,
        note: 'Uses RunPod InfiniteTalk public endpoint; does not require the ComfyUI pod.'
      },
      {
        id: 'wan-animate',
        label: 'Wan Animate motion remix',
        available: !!getRunpodVideoConfig('WAN_ANIMATE').apiKey && !!(getRunpodVideoConfig('WAN_ANIMATE').endpointId || getRunpodVideoConfig('WAN_ANIMATE').endpointUrl),
        note: 'RunPod serverless character image + reference video motion transfer.'
      }
    ],
    remixTools: [
      {
        id: 'faster-whisper',
        label: 'Faster Whisper transcription',
        available: !!getRunpodToolConfig('FASTER_WHISPER').apiKey && !!(getRunpodToolConfig('FASTER_WHISPER').endpointId || getRunpodToolConfig('FASTER_WHISPER').endpointUrl),
        note: 'Extracts scripts from source audio/video for remix drafts.'
      },
      {
        id: 'downloader',
        label: 'Source video downloader',
        available: !!getRunpodToolConfig('DOWNLOADER').apiKey && !!(getRunpodToolConfig('DOWNLOADER').endpointId || getRunpodToolConfig('DOWNLOADER').endpointUrl),
        note: 'Turns Instagram/TikTok/YouTube links into media files for transcription and motion remix.'
      }
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
  if (!req.supabase) {
    return listLocalVideoJobs(req)
      .then(jobs => res.json({ jobs }))
      .catch(error => res.status(500).json({ error: error.message }));
  }

  req.supabase
    .from('ugc_video_jobs')
    .select('*')
    .eq('tenant_id', req.tenant.id)
    .order('created_at', { ascending: false })
    .then(({ data, error }) => {
      if (error) return res.status(500).json({ error: error.message });
      res.json({
        jobs: (data || []).map(job => ({
          requestId: job.request_id || job.id,
          jobId: job.id,
          tenantId: job.tenant_id,
          provider: job.provider,
          presetId: job.workflow_preset,
          mode: job.mode,
          audioProvider: job.audio_provider,
          status: job.status,
          prompt: job.prompt,
          aspectRatio: job.metadata?.aspectRatio || '16:9',
          script: job.script,
          localPath: job.metadata?.localPath || null,
          error: job.error,
          createdAt: job.created_at,
          completedAt: job.completed_at
        }))
      });
    });
});

router.post('/runpod/start', async (req, res) => {
  try {
    await startPod();
    res.json({ success: true, status: 'starting', message: 'RunPod start requested.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/runpod/stop', async (req, res) => {
  try {
    await stopPod();
    res.json({ success: true, status: 'stopping', message: 'RunPod stop requested.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/runpod/balance', async (req, res) => {
  try {
    const balance = await getAccountBalance();
    res.json({ success: true, balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/jobs/:requestId', async (req, res) => {
  try {
    const job = await pollStudioJob(req.params.requestId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (req.supabase) {
      await req.supabase
        .from('ugc_video_jobs')
        .update({
          status: job.status,
          error: job.error,
          completed_at: job.completedAt,
          updated_at: new Date().toISOString(),
          metadata: { localJobId: job.jobId, localPath: job.localPath }
        })
        .eq('tenant_id', req.tenant.id)
        .eq('request_id', req.params.requestId);
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'referenceVideo', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
  { name: 'voiceSample', maxCount: 1 }
]), async (req, res) => {
  try {
    const presetId = req.body.presetId || (req.body.mode === 'v2v' ? 'bloomies-v2v' : 'sarah-i2v-lipsync');
    const audioProvider = req.body.audioProvider || 'upload';
    const mode = req.body.mode || 'i2v';
    const videoEngine = req.body.videoEngine || 'wan-comfy';

    if (mode !== 'i2v' && ['meigen', 'wan22-serverless', 'wan-animate'].includes(videoEngine)) {
      return res.status(400).json({ error: `${videoEngine} is only available for image-to-video style generation right now.` });
    }

    const serverlessEngine = ['meigen', 'wan22-serverless', 'wan-animate'].includes(videoEngine);

    if (!serverlessEngine && !getBaseUrl()) {
      return res.status(400).json({
        error: 'COMFYUI_BASE_URL is not configured on Railway yet.',
        detail: 'The studio UI is ready, but the service needs the public RunPod/ComfyUI API URL before it can queue jobs.'
      });
    }

    if (!serverlessEngine) {
      await ensureComfyReady();
    }

    if (audioProvider === 'qwen') {
      return res.status(400).json({
        error: 'Qwen audio workflow preset is not installed yet.',
        detail: 'Install ComfyUI-Qwen-TTS on RunPod and export the Qwen TTS workflow in API format. Then this option can generate audio inside ComfyUI before video.'
      });
    }

    const files = req.files || {};
    if (mode === 'i2v' && !files.image?.[0] && !req.body.imageAssetId && !req.body.imageUrl) {
      return res.status(400).json({ error: 'Upload a starting image for I2V.' });
    }
    if (mode === 'v2v' && !files.video?.[0]) {
      return res.status(400).json({ error: 'Upload a source video for V2V.' });
    }
    const engineNeedsAudio = !['wan22-serverless', 'wan-animate'].includes(videoEngine);
    if (engineNeedsAudio && audioProvider === 'upload' && !files.audio?.[0]) {
      return res.status(400).json({ error: 'Upload an audio file.' });
    }
    if (engineNeedsAudio && audioProvider === 'asset' && !req.body.audioAssetId) {
      return res.status(400).json({ error: 'Choose a saved audio file.' });
    }

    let imagePath = files.image?.[0]?.path || null;
    if (!imagePath && req.body.imageAssetId) {
      if (req.supabase) {
        const saved = await getSupabaseAssetFile(req, req.body.imageAssetId, 'subject');
        imagePath = await downloadTempFile(saved.url, req.tenant.slug || req.tenant.id, path.basename(saved.asset.storage_path));
      } else if (hasDatabase()) {
        imagePath = await writeDatabaseAssetTemp(req, req.body.imageAssetId, 'subject');
      } else {
        imagePath = getLocalAssetFile(req, req.body.imageAssetId, 'subjects');
      }
    }
    if (!imagePath && req.body.imageUrl) {
      imagePath = await downloadTempFile(req.body.imageUrl, req.tenant.slug || req.tenant.id, 'library-character.png');
    }
    if (imagePath && mode === 'i2v') {
      imagePath = await frameImageForStudio(
        imagePath,
        req.body.aspectRatio || '9:16',
        req.body.cropX,
        req.body.cropY
      );
    }

    let audioPath = files.audio?.[0]?.path || null;
    if (engineNeedsAudio && audioProvider === 'asset') {
      if (req.supabase) {
        const saved = await getSupabaseAssetFile(req, req.body.audioAssetId, 'audio');
        audioPath = await downloadTempFile(saved.url, req.tenant.slug || req.tenant.id, path.basename(saved.asset.storage_path));
      } else if (hasDatabase()) {
        audioPath = await writeDatabaseAssetTemp(req, req.body.audioAssetId, 'audio');
      } else {
        audioPath = getLocalAssetFile(req, req.body.audioAssetId, 'audio');
      }
    }
    if (engineNeedsAudio && audioProvider === 'elevenlabs') {
      audioPath = await createElevenLabsAudio({
        script: req.body.script,
        voiceId: req.body.voiceId,
        tenantId: req.tenant.slug || req.tenant.id
      });
    }
    if (engineNeedsAudio && audioProvider === 'chatterbox') {
      const dir = path.join(UPLOAD_DIR, cleanSlug(req.tenant.slug || req.tenant.id || 'default'), 'chatterbox');
      const chatterbox = await createChatterboxAudio({
        script: req.body.script,
        voice: req.body.chatterboxVoice,
        voiceUrl: req.body.chatterboxVoiceUrl,
        voiceSamplePath: files.voiceSample?.[0]?.path || null,
        format: req.body.chatterboxFormat,
        outputDir: dir
      });
      audioPath = chatterbox.localPath;
    }
    const durationSeconds = parseDurationSeconds(req.body.durationSeconds) || await getAudioDurationSeconds(audioPath);
    const clientRequestId = req.body.clientJobId || uuidv4();
    if (!req.supabase && hasDatabase()) {
      await createLocalVideoJob(req, {
        requestId: clientRequestId,
        provider: serverlessEngine ? videoEngine : 'comfyui',
        presetId: serverlessEngine ? videoEngine : presetId,
        mode,
        audioProvider,
        status: 'processing',
        script: req.body.script || '',
        prompt: req.body.prompt || '',
        negativePrompt: req.body.negativePrompt || '',
        metadata: {
          aspectRatio: req.body.aspectRatio || '9:16',
          durationSeconds,
          imageAssetId: req.body.imageAssetId || null,
          audioAssetId: req.body.audioAssetId || null,
          videoEngine
        }
      });
    }

    if (videoEngine === 'wan22-serverless') {
      try {
        const dir = path.join(UPLOAD_DIR, cleanSlug(req.tenant.slug || req.tenant.id || 'default'), 'wan22');
        const wan22 = await createWan22Video({
          imagePath,
          imageUrl: '',
          prompt: req.body.prompt,
          negativePrompt: req.body.negativePrompt,
          aspectRatio: req.body.aspectRatio || '9:16',
          outputDir: dir,
          length: req.body.wanLength,
          steps: req.body.wanSteps,
          seed: req.body.wanSeed,
          cfg: req.body.wanCfg
        });
        const savedVideo = await saveGeneratedVideoAsset(req, wan22.localPath, {
          name: `Wan 2.2 video ${new Date().toLocaleString('en-US')}`,
          provider: 'wan22-serverless',
          source: 'wan22-lora-runpod',
          prompt: req.body.prompt || '',
          aspectRatio: req.body.aspectRatio || '9:16',
          rawRequestId: wan22.id
        });
        const job = {
          requestId: clientRequestId,
          jobId: clientRequestId,
          tenantId: req.tenant.slug || req.tenant.id,
          provider: 'wan22-serverless',
          presetId: 'wan22-serverless',
          mode,
          audioProvider,
          status: 'completed',
          prompt: req.body.prompt || '',
          aspectRatio: req.body.aspectRatio || '9:16',
          durationSeconds,
          localPath: savedVideo.path,
          asset: savedVideo,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        };
        if (!req.supabase && hasDatabase()) {
          await updateLocalVideoJob(req, clientRequestId, {
            status: 'completed',
            metadata: { localPath: savedVideo.path, assetId: savedVideo.id, rawRequestId: wan22.id }
          });
        }
        return res.json({ success: true, job });
      } catch (error) {
        if (!req.supabase && hasDatabase()) await updateLocalVideoJob(req, clientRequestId, { status: 'failed', error: error.message });
        throw error;
      }
    }

    if (videoEngine === 'wan-animate') {
      try {
        const referenceVideoPath = files.referenceVideo?.[0]?.path || files.video?.[0]?.path || null;
        const referenceVideoUrl = await prepareReferenceVideoUrl(
          req.body.referenceVideoUrl || req.body.remixSourceUrl || '',
          req.body.referenceMaxDuration || req.body.durationSeconds || 180
        );
        if (!referenceVideoPath && !referenceVideoUrl) {
          return res.status(400).json({ error: 'Wan Animate needs a source/reference video to mimic.' });
        }
        const dir = path.join(UPLOAD_DIR, cleanSlug(req.tenant.slug || req.tenant.id || 'default'), 'wan-animate');
        const motion = await createWanAnimateVideo({
          imagePath,
          imageUrl: '',
          videoPath: referenceVideoPath,
          videoUrl: referenceVideoUrl,
          prompt: req.body.prompt,
          negativePrompt: req.body.negativePrompt,
          aspectRatio: req.body.aspectRatio || '9:16',
          outputDir: dir,
          steps: req.body.wanSteps,
          seed: req.body.wanSeed,
          cfg: req.body.wanCfg
        });
        const savedVideo = await saveGeneratedVideoAsset(req, motion.localPath, {
          name: `Wan Animate remix ${new Date().toLocaleString('en-US')}`,
          provider: 'wan-animate',
          source: 'wan-animate-runpod',
          prompt: req.body.prompt || '',
          aspectRatio: req.body.aspectRatio || '9:16',
          rawRequestId: motion.id
        });
        const job = {
          requestId: clientRequestId,
          jobId: clientRequestId,
          tenantId: req.tenant.slug || req.tenant.id,
          provider: 'wan-animate',
          presetId: 'wan-animate',
          mode,
          audioProvider,
          status: 'completed',
          prompt: req.body.prompt || '',
          aspectRatio: req.body.aspectRatio || '9:16',
          durationSeconds,
          localPath: savedVideo.path,
          asset: savedVideo,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        };
        if (!req.supabase && hasDatabase()) {
          await updateLocalVideoJob(req, clientRequestId, {
            status: 'completed',
            metadata: { localPath: savedVideo.path, assetId: savedVideo.id, rawRequestId: motion.id, referenceVideoUrl }
          });
        }
        return res.json({ success: true, job });
      } catch (error) {
        if (!req.supabase && hasDatabase()) await updateLocalVideoJob(req, clientRequestId, { status: 'failed', error: error.message });
        throw error;
      }
    }

    if (videoEngine === 'meigen') {
      try {
        const dir = path.join(UPLOAD_DIR, cleanSlug(req.tenant.slug || req.tenant.id || 'default'), 'meigen');
        const meigen = await createMeigenVideo({
          imagePath,
          audioPath,
          imageUrl: '',
          audioUrl: '',
          prompt: req.body.prompt,
          size: getMeigenSize(req.body.meigenSize || '480p'),
          outputDir: dir
        });
        const savedVideo = await saveGeneratedVideoAsset(req, meigen.localPath, {
          name: `Meigen lip sync ${new Date().toLocaleString('en-US')}`,
          provider: 'meigen',
          source: 'infinitetalk',
          prompt: req.body.prompt || '',
          aspectRatio: req.body.aspectRatio || '9:16',
          meigenSize: getMeigenSize(req.body.meigenSize || '480p'),
          cost: meigen.cost,
          rawRequestId: meigen.id
        });
        const job = {
          requestId: clientRequestId,
          jobId: clientRequestId,
          tenantId: req.tenant.slug || req.tenant.id,
          provider: 'meigen',
          presetId: 'meigen-infinitetalk',
          mode,
          audioProvider,
          status: 'completed',
          prompt: req.body.prompt || '',
          aspectRatio: req.body.aspectRatio || '9:16',
          durationSeconds,
          localPath: savedVideo.path,
          asset: savedVideo,
          cost: meigen.cost,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        };
        if (!req.supabase && hasDatabase()) {
          await updateLocalVideoJob(req, clientRequestId, {
            status: 'completed',
            metadata: {
              localPath: savedVideo.path,
              assetId: savedVideo.id,
              cost: meigen.cost,
              rawRequestId: meigen.id,
              meigenSize: getMeigenSize(req.body.meigenSize || '480p')
            }
          });
        }
        return res.json({ success: true, job });
      } catch (error) {
        if (!req.supabase && hasDatabase()) {
          await updateLocalVideoJob(req, clientRequestId, { status: 'failed', error: error.message });
        }
        throw error;
      }
    }

    const imageName = imagePath ? await uploadInput(imagePath) : null;
    const videoName = files.video?.[0] ? await uploadInput(files.video[0].path) : null;
    const audioName = audioPath ? await uploadInput(audioPath) : null;

    const job = await submitStudioJob({
      presetId,
      mode,
      audioProvider,
      tenantId: req.tenant.slug || req.tenant.id,
      script: req.body.script || '',
      prompt: req.body.prompt || '',
      negativePrompt: req.body.negativePrompt || '',
      aspectRatio: req.body.aspectRatio || '16:9',
      durationSeconds,
      cropX: req.body.cropX || '',
      cropY: req.body.cropY || '',
      preFramedImage: !!imagePath && mode === 'i2v',
      imageName,
      videoName,
      audioName
    });
    if (!req.supabase && hasDatabase()) {
      await updateLocalVideoJob(req, clientRequestId, {
        status: job.status,
        metadata: { localJobId: job.jobId, comfyRequestId: job.requestId }
      });
    }

    if (req.supabase) {
      await req.supabase.from('ugc_video_jobs').insert({
        tenant_id: req.tenant.id,
        created_by: req.user.id,
        provider: 'comfyui',
        workflow_preset: presetId,
        mode,
        audio_provider: audioProvider,
        status: job.status,
        request_id: job.requestId,
        script: req.body.script || '',
        prompt: req.body.prompt || '',
        negative_prompt: req.body.negativePrompt || '',
        metadata: {
          localJobId: job.jobId,
          aspectRatio: req.body.aspectRatio || '16:9',
          durationSeconds,
          cropX: req.body.cropX || null,
          cropY: req.body.cropY || null,
          imageAssetId: req.body.imageAssetId || null,
          imageUrl: req.body.imageUrl || null
        }
      });
    }

    res.json({ success: true, job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
