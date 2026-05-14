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
const { ensureComfyReady, getAccountBalance, getPodStatus, getRunPodConfig, isComfyReady, normalizePodState, startPod, stopPod } = require('../services/runpod');

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

function cleanSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
      { id: 'qwen', label: 'Qwen audio workflow', available: false, note: 'Install ComfyUI-Qwen-TTS on RunPod and export a Qwen API workflow preset before enabling.' }
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
    return res.json({ jobs: getStudioJobs().filter(job => job.tenantId === (req.tenant.slug || req.tenant.id)) });
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
  { name: 'audio', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!getBaseUrl()) {
      return res.status(400).json({
        error: 'COMFYUI_BASE_URL is not configured on Railway yet.',
        detail: 'The studio UI is ready, but the service needs the public RunPod/ComfyUI API URL before it can queue jobs.'
      });
    }

    await ensureComfyReady();

    const presetId = req.body.presetId || (req.body.mode === 'v2v' ? 'bloomies-v2v' : 'sarah-i2v-lipsync');
    const audioProvider = req.body.audioProvider || 'upload';
    const mode = req.body.mode || 'i2v';

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
    if (audioProvider === 'upload' && !files.audio?.[0]) {
      return res.status(400).json({ error: 'Upload an audio file.' });
    }

    let imagePath = files.image?.[0]?.path || null;
    if (!imagePath && req.body.imageAssetId) {
      if (req.supabase) {
        const saved = await getSupabaseAssetFile(req, req.body.imageAssetId, 'subject');
        imagePath = await downloadTempFile(saved.url, req.tenant.slug || req.tenant.id, path.basename(saved.asset.storage_path));
      } else {
        imagePath = getLocalAssetFile(req, req.body.imageAssetId, 'subjects');
      }
    }
    if (!imagePath && req.body.imageUrl) {
      imagePath = await downloadTempFile(req.body.imageUrl, req.tenant.slug || req.tenant.id, 'library-character.png');
    }

    const imageName = imagePath ? await uploadInput(imagePath) : null;
    const videoName = files.video?.[0] ? await uploadInput(files.video[0].path) : null;
    let audioPath = files.audio?.[0]?.path || null;
    if (audioProvider === 'elevenlabs') {
      audioPath = await createElevenLabsAudio({
        script: req.body.script,
      voiceId: req.body.voiceId,
        tenantId: req.tenant.slug || req.tenant.id
      });
    }
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
        imageName,
      videoName,
      audioName
    });

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
