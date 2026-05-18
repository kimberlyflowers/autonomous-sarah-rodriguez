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
const { createVibeVoiceAudio, getVibeVoiceConfig } = require('../services/vibevoice');
const { checkMeigenVideoJob, createMeigenVideo, getMeigenConfig, submitMeigenVideoJob } = require('../services/meigen');
const { checkInfiniteTalkHdJob, getInfiniteTalkHdConfig, submitInfiniteTalkHdJob } = require('../services/infinitetalkHd');
const {
  checkRunpodVideoJob,
  createWan22Video,
  createWanAnimateVideo,
  getRunpodVideoConfig,
  submitMuseTalkVideoJob,
  submitWan22VideoJob,
  submitWanAnimateVideoJob
} = require('../services/runpodVideo');
const { downloadSourceVideo, getRunpodToolConfig } = require('../services/runpodTools');
const { submitGeneration } = require('../services/seedance');
const { logger } = require('../services/logger');

const router = express.Router();
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
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

function resolveAppLocalMediaPath(value = '') {
  const cleanPath = String(value || '').split('?')[0].split('#')[0];
  if (!cleanPath.startsWith('/')) return '';
  const decoded = decodeURIComponent(cleanPath);
  const candidates = [];
  if (decoded.startsWith('/assets/')) candidates.push(path.join(ASSETS_DIR, decoded.slice('/assets/'.length)));
  candidates.push(path.join(PUBLIC_DIR, decoded.replace(/^\/+/, '')));
  return candidates
    .map(candidate => path.resolve(candidate))
    .find(candidate => (
      (candidate.startsWith(ASSETS_DIR) || candidate.startsWith(PUBLIC_DIR)) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    )) || '';
}

function absoluteRequestUrl(req, value = '') {
  if (/^https?:\/\//i.test(value || '')) return value;
  if (!String(value || '').startsWith('/')) return value;
  const configured = process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
  const origin = configured
    ? (/^https?:\/\//i.test(configured) ? configured.replace(/\/$/, '') : `https://${configured.replace(/\/$/, '')}`)
    : `${req?.protocol || 'https'}://${req?.get?.('host') || ''}`;
  return origin ? `${origin}${value}` : value;
}

async function downloadTempFile(url, tenantId, filename, req = null) {
  const dir = path.join(UPLOAD_DIR, cleanSlug(tenantId || 'default'), 'library-assets');
  fs.mkdirSync(dir, { recursive: true });
  const outputPath = path.join(dir, `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}`);

  const localPath = resolveAppLocalMediaPath(url);
  if (localPath) {
    fs.copyFileSync(localPath, outputPath);
    return outputPath;
  }

  const fetchUrl = absoluteRequestUrl(req, url);
  const response = await fetch(fetchUrl);
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
  if (aspectRatio === '21:9') return { width: 1344, height: 576 };
  if (aspectRatio === '16:9') return { width: 1280, height: 720 };
  if (aspectRatio === '4:3') return { width: 1024, height: 768 };
  if (aspectRatio === '3:2') return { width: 1152, height: 768 };
  if (aspectRatio === '1:1') return { width: 1024, height: 1024 };
  if (aspectRatio === '4:5') return { width: 1024, height: 1280 };
  if (aspectRatio === '3:4') return { width: 960, height: 1280 };
  if (aspectRatio === '2:3') return { width: 853, height: 1280 };
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

function publicPathForAssetFile(filePath) {
  if (!filePath) return '';
  const normalized = path.resolve(filePath);
  if (!normalized.startsWith(ASSETS_DIR)) return '';
  return `/assets/${path.relative(ASSETS_DIR, normalized).split(path.sep).join('/')}`;
}

function assertPlayableVideoFile(localPath, label = 'Generated video') {
  if (!localPath || !fs.existsSync(localPath)) throw new Error(`${label} did not produce a local video file.`);
  const stat = fs.statSync(localPath);
  if (stat.size < 1024) throw new Error(`${label} output is too small to be a playable video (${stat.size} bytes).`);
  const header = fs.readFileSync(localPath, { start: 0, end: 63 });
  const textHeader = header.toString('utf8');
  const hasMp4Signature = header.includes(Buffer.from('ftyp'));
  const hasWebmSignature = header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
  if (hasMp4Signature || hasWebmSignature) return;
  const preview = textHeader.replace(/[^\x20-\x7E]+/g, ' ').slice(0, 120);
  throw new Error(`${label} output was not a playable video file. First bytes: ${preview || header.toString('hex').slice(0, 80)}`);
}

async function saveGeneratedVideoAsset(req, localPath, metadata = {}) {
  assertPlayableVideoFile(localPath, metadata.name || 'Generated video');
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
    imagePreviewUrl: row.metadata?.imagePreviewUrl || null,
    providerJobId: row.metadata?.providerJobId || null,
    providerStatus: row.metadata?.providerStatus || null,
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeJobReq(tenantSlug) {
  return { tenant: { slug: tenantSlug, id: tenantSlug } };
}

async function getLocalVideoJobByRequest(tenantSlug, requestId) {
  if (!hasDatabase() || !requestId) return null;
  await initUgcStore();
  const { rows } = await query(
    'select * from public.ugc_video_jobs where tenant_slug = $1 and request_id = $2 limit 1',
    [tenantSlug, requestId]
  );
  return rows[0] || null;
}

function getServerlessOutputDir(tenantSlug, provider) {
  const folder = provider === 'infinitetalk-hd'
    ? 'infinitetalk-hd'
    : provider === 'meigen'
      ? 'meigen'
      : provider === 'musetalk'
        ? 'musetalk'
    : provider === 'wan-animate'
      ? 'wan-animate'
      : provider === 'seedance2-fast' || provider === 'seedance2-standard'
        ? 'seedance'
      : 'wan22';
  return path.join(UPLOAD_DIR, cleanSlug(tenantSlug || 'default'), folder);
}

function getProviderJobId(rowOrJob) {
  return rowOrJob?.metadata?.providerJobId || rowOrJob?.metadata?.rawRequestId || '';
}

function getProviderStatusKind(provider) {
  if (provider === 'wan22-serverless') return {
    kind: 'WAN22',
    filePrefix: 'wan22',
    label: 'Wan 2.2 Serverless',
    source: 'wan22-lora-runpod',
    name: 'Wan 2.2 video'
  };
  if (provider === 'wan-animate') return {
    kind: 'WAN_ANIMATE',
    filePrefix: 'wan-animate',
    label: 'Wan Animate Serverless',
    source: 'wan-animate-runpod',
    name: 'Wan Animate remix'
  };
  if (provider === 'infinitetalk-hd') return {
    kind: 'INFINITETALK_HD',
    filePrefix: 'infinitetalk-hd',
    label: 'InfiniteTalk HD',
    source: 'runpod-infinitetalk-hd',
    name: 'InfiniteTalk HD lip sync'
  };
  if (provider === 'musetalk') return {
    kind: 'MUSETALK',
    filePrefix: 'musetalk',
    label: 'MuseTalk Serverless',
    source: 'runpod-musetalk',
    name: 'MuseTalk lip sync'
  };
  if (provider === 'seedance2-fast' || provider === 'seedance2-standard') return {
    kind: 'SEEDANCE',
    filePrefix: provider === 'seedance2-standard' ? 'seedance-fixed' : 'seedance',
    label: provider === 'seedance2-standard' ? 'RunPod Seedance fixed camera' : 'RunPod Seedance 1.5',
    source: 'runpod-seedance',
    name: provider === 'seedance2-standard' ? 'Seedance fixed camera scene' : 'Seedance scene'
  };
  return {
    kind: 'MEIGEN',
    filePrefix: 'meigen',
    label: 'Meigen',
    source: 'infinitetalk',
    name: 'Meigen lip sync'
  };
}

async function sendVideoCompletionEmail(row, savedVideo) {
  const recipient = row.metadata?.notifyEmail || row.metadata?.userEmail || '';
  const apiKey = process.env.RESEND_API_KEY || process.env.UGC_RESEND_API_KEY || '';
  const from = process.env.UGC_NOTIFY_FROM || process.env.RESEND_FROM || '';
  if (!recipient || !apiKey || !from) return false;

  const appUrl = (process.env.PUBLIC_APP_URL || process.env.UGC_PUBLIC_URL || 'https://lovely-wonder-production-3c61.up.railway.app').replace(/\/$/, '');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: recipient,
      subject: 'Your Bloom Studio video is complete',
      text: `Video complete — check your Library to see the completed video.\n\nOpen Bloom Studio: ${appUrl}`,
      html: `<p><strong>Video complete.</strong></p><p>Check your Library to see the completed video.</p><p><a href="${appUrl}">Open Bloom Studio</a></p>`
    }),
    timeout: 30000
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Completion email failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return true;
}

async function checkPersistedServerlessJob(row) {
  const providerJobId = getProviderJobId(row);
  if (!providerJobId) throw new Error('Processing job has no provider job id saved yet.');
  const providerInfo = getProviderStatusKind(row.provider);
  const outputDir = getServerlessOutputDir(row.tenant_slug, row.provider);
  if (row.provider === 'infinitetalk-hd') {
    return checkInfiniteTalkHdJob(providerJobId, { outputDir });
  }
  if (row.provider === 'meigen') {
    return checkMeigenVideoJob(providerJobId, { outputDir });
  }
  return checkRunpodVideoJob(providerInfo.kind, providerJobId, {
    outputDir,
    filePrefix: providerInfo.filePrefix,
    provider: row.provider,
    label: providerInfo.label
  });
}

async function finalizePersistedServerlessJob(row, result) {
  const req = makeJobReq(row.tenant_slug);
  const providerInfo = getProviderStatusKind(row.provider);
  const metadata = row.metadata || {};
  const savedVideo = await saveGeneratedVideoAsset(req, result.localPath, {
    name: `${providerInfo.name} ${new Date().toLocaleString('en-US')}`,
    provider: row.provider,
    source: providerInfo.source,
    prompt: row.prompt || '',
    aspectRatio: metadata.aspectRatio || '9:16',
    meigenSize: metadata.meigenSize,
    cost: result.cost || metadata.cost || null,
    rawRequestId: result.id || getProviderJobId(row),
    quality: result.quality || metadata.quality || null,
    renderRes: result.renderRes || metadata.renderRes || null,
    fileSizeMb: result.fileSizeMb || metadata.fileSizeMb || null
  });
  await updateLocalVideoJob(req, row.request_id, {
    status: 'completed',
    metadata: {
      localPath: savedVideo.path,
      assetId: savedVideo.id,
      cost: result.cost || metadata.cost || null,
      rawRequestId: result.id || getProviderJobId(row),
      providerJobId: getProviderJobId(row),
      providerStatus: 'COMPLETED',
      meigenSize: metadata.meigenSize,
      quality: result.quality || metadata.quality || null,
      renderRes: result.renderRes || metadata.renderRes || null,
      fileSizeMb: result.fileSizeMb || metadata.fileSizeMb || null,
      imagePreviewUrl: metadata.imagePreviewUrl || ''
    }
  });
  sendVideoCompletionEmail(row, savedVideo)
    .then(sent => {
      if (sent) logger.info('Video completion email sent', { requestId: row.request_id, tenantSlug: row.tenant_slug });
    })
    .catch(error => logger.warn(`Video completion email skipped/failed: ${error.message}`));
}

async function pollPersistedServerlessJob(tenantSlug, requestId) {
  const startedAt = Date.now();
  const maxMs = Number(process.env.UGC_SERVERLESS_JOB_TIMEOUT_MS || 4 * 60 * 60 * 1000);
  const intervalMs = Number(process.env.UGC_SERVERLESS_JOB_POLL_INTERVAL_MS || 15000);

  while (Date.now() - startedAt < maxMs) {
    const row = await getLocalVideoJobByRequest(tenantSlug, requestId);
    if (!row || row.status !== 'processing') return;
    try {
      const result = await checkPersistedServerlessJob(row);
      if (result.status === 'COMPLETED') {
        await finalizePersistedServerlessJob(row, result);
        logger.info('Durable serverless video job completed', {
          requestId,
          provider: row.provider,
          providerJobId: getProviderJobId(row)
        });
        return;
      }
      await updateLocalVideoJob(makeJobReq(tenantSlug), requestId, {
        status: 'processing',
        metadata: {
          providerStatus: result.status,
          providerJobId: getProviderJobId(row),
          lastProviderCheckAt: new Date().toISOString()
        }
      });
    } catch (error) {
      await updateLocalVideoJob(makeJobReq(tenantSlug), requestId, {
        status: 'failed',
        error: error.message,
        metadata: { failedAt: new Date().toISOString() }
      });
      logger.error('Durable serverless video job failed', {
        error: error.message,
        requestId,
        tenantSlug
      });
      return;
    }
    await sleep(intervalMs);
  }

  await updateLocalVideoJob(makeJobReq(tenantSlug), requestId, {
    status: 'failed',
    error: `Generation timed out after ${Math.round(maxMs / 60000)} minutes while polling provider status.`,
    metadata: { failedAt: new Date().toISOString() }
  });
}

async function resumePendingServerlessVideoJobs() {
  if (!hasDatabase()) return;
  await initUgcStore();
  const { rows } = await query(`
    select *
    from public.ugc_video_jobs
    where status = 'processing'
      and provider in ('meigen', 'infinitetalk-hd', 'musetalk', 'wan22-serverless', 'wan-animate', 'seedance2-fast', 'seedance2-standard')
      and metadata ? 'providerJobId'
    order by updated_at asc
    limit 20
  `);
  rows.forEach(row => {
    logger.info('Resuming durable serverless video job', {
      requestId: row.request_id,
      provider: row.provider,
      providerJobId: getProviderJobId(row)
    });
    pollPersistedServerlessJob(row.tenant_slug, row.request_id)
      .catch(error => logger.error('Failed to resume serverless video job', {
        error: error.message,
        requestId: row.request_id
      }));
  });
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
        id: 'vibevoice',
        label: 'VibeVoice longform',
        available: !!getVibeVoiceConfig().apiKey && !!(getVibeVoiceConfig().endpointId || getVibeVoiceConfig().endpointUrl),
        note: 'Microsoft VibeVoice longform endpoint. Configure RUNPOD_VIBEVOICE_ENDPOINT_ID or VIBEVOICE_ENDPOINT_URL.'
      },
      {
        id: 'chatterbox',
        label: 'Chatterbox Turbo',
        available: !!getChatterboxConfig().apiKey,
        voices: CHATTERBOX_VOICES,
        note: 'Legacy short-clip fallback. Not recommended for longform narration.'
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
        id: 'seedance2-fast',
        label: 'RunPod Seedance 1.5 Pro I2V',
        available: !!getRunpodVideoConfig('SEEDANCE').apiKey && !!(process.env.RUNPOD_SEEDANCE_ENDPOINT_ID || process.env.RUNPOD_SEEDANCE_ENDPOINT_URL || 'seedance-v1-5-pro-i2v'),
        note: 'RunPod public Seedance 1.5 image-to-video endpoint for b-roll and scene motion.'
      },
      {
        id: 'seedance2-standard',
        label: 'RunPod Seedance fixed camera',
        available: !!getRunpodVideoConfig('SEEDANCE').apiKey && !!(process.env.RUNPOD_SEEDANCE_ENDPOINT_ID || process.env.RUNPOD_SEEDANCE_ENDPOINT_URL || 'seedance-v1-5-pro-i2v'),
        note: 'Same RunPod Seedance endpoint with fixed-camera prompting for steadier product scenes.'
      },
      {
        id: 'infinitetalk-hd',
        label: 'InfiniteTalk HD',
        available: !!getInfiniteTalkHdConfig().apiKey && !!(getInfiniteTalkHdConfig().endpointId || getInfiniteTalkHdConfig().endpointUrl),
        note: 'Custom RunPod InfiniteTalk endpoint with CodeFormer and optional Real-ESRGAN upscaling. Requires network volume mounted at /runpod-volume.'
      },
      {
        id: 'musetalk',
        label: 'MuseTalk lip sync',
        available: !!getRunpodVideoConfig('MUSETALK').apiKey && !!(getRunpodVideoConfig('MUSETALK').endpointId || getRunpodVideoConfig('MUSETALK').endpointUrl),
        note: 'Custom MuseTalk V1.5 RunPod endpoint based on PunithVT/ai-avatar-system. Accepts image_url/audio_url and returns MP4/base64 video.'
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
    let job = await pollStudioJob(req.params.requestId);
    if (!job && !req.supabase && hasDatabase()) {
      const row = await getLocalVideoJobByRequest(req.tenant.slug || req.tenant.id, req.params.requestId);
      if (row) job = mapLocalVideoJob(row);
    }
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

async function runServerlessVideoJob(req, files, context, options = {}) {
  const {
    audioProvider,
    clientRequestId,
    imagePath,
    imagePreviewUrl,
    mode,
    presetId,
    videoEngine
  } = context;
  const submitOnly = options.submitOnly === true;
  const engineNeedsAudio = !['wan22-serverless', 'wan-animate', 'seedance2-fast', 'seedance2-standard'].includes(videoEngine);

  try {
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
    if (engineNeedsAudio && audioProvider === 'vibevoice') {
      const dir = path.join(UPLOAD_DIR, cleanSlug(req.tenant.slug || req.tenant.id || 'default'), 'vibevoice');
      const vibevoice = await createVibeVoiceAudio({
        script: req.body.script,
        voice: req.body.chatterboxVoice || req.body.vibevoiceVoice,
        voiceUrl: req.body.chatterboxVoiceUrl || req.body.vibevoiceVoiceUrl,
        voiceSamplePath: files.voiceSample?.[0]?.path || null,
        format: req.body.chatterboxFormat || req.body.vibevoiceFormat,
        outputDir: dir
      });
      audioPath = vibevoice.localPath;
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
    if (!audioPath && req.body.audioUrl) {
      audioPath = await downloadTempFile(req.body.audioUrl, req.tenant.slug || req.tenant.id, 'voiceover.mp3', req);
    }

    const durationSeconds = parseDurationSeconds(req.body.durationSeconds) || await getAudioDurationSeconds(audioPath);
    if (!req.supabase && hasDatabase()) {
      await updateLocalVideoJob(req, clientRequestId, {
        status: 'processing',
        metadata: { durationSeconds, imagePreviewUrl }
      });
    }

    if (videoEngine === 'wan22-serverless') {
      const wan22 = await submitWan22VideoJob({
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
      if (!req.supabase && hasDatabase()) {
        await updateLocalVideoJob(req, clientRequestId, {
          status: 'processing',
          metadata: {
            providerJobId: wan22.id,
            rawRequestId: wan22.id,
            providerStatus: wan22.status,
            imagePreviewUrl,
            submittedAt: new Date().toISOString()
          }
        });
      }
      if (submitOnly) return;
      await pollPersistedServerlessJob(req.tenant.slug || req.tenant.id, clientRequestId);
      return;
    }

    if (videoEngine === 'wan-animate') {
      const referenceVideoPath = files.referenceVideo?.[0]?.path || files.video?.[0]?.path || null;
      const referenceVideoUrl = await prepareReferenceVideoUrl(
        req.body.referenceVideoUrl || req.body.remixSourceUrl || '',
        req.body.referenceMaxDuration || req.body.durationSeconds || 180
      );
      if (!referenceVideoPath && !referenceVideoUrl) throw new Error('Wan Animate needs a source/reference video to mimic.');
      const motion = await submitWanAnimateVideoJob({
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
      if (!req.supabase && hasDatabase()) {
        await updateLocalVideoJob(req, clientRequestId, {
          status: 'processing',
          metadata: {
            providerJobId: motion.id,
            rawRequestId: motion.id,
            providerStatus: motion.status,
            referenceVideoUrl,
            imagePreviewUrl,
            submittedAt: new Date().toISOString()
          }
        });
      }
      if (submitOnly) return;
      await pollPersistedServerlessJob(req.tenant.slug || req.tenant.id, clientRequestId);
      return;
    }

    if (['seedance2-fast', 'seedance2-standard'].includes(videoEngine)) {
      const seedanceImageUrl = absoluteRequestUrl(req, req.body.imageUrl || imagePreviewUrl);
      if (!/^https?:\/\//i.test(seedanceImageUrl || '')) {
        throw new Error('RunPod Seedance needs a public image URL. Select a saved Library/Asset image or upload after PUBLIC_APP_URL is configured.');
      }
      const seedance = await submitGeneration({
        model: videoEngine,
        image: seedanceImageUrl,
        prompt: req.body.prompt || 'Natural creator b-roll scene, realistic movement, steady camera.',
        negative_prompt: req.body.negativePrompt || '',
        duration: parseDurationSeconds(req.body.durationSeconds) || 5,
        resolution: req.body.seedanceResolution || req.body.resolution || '720p',
        aspect_ratio: req.body.aspectRatio || '9:16',
        camera_fixed: videoEngine === 'seedance2-standard',
        generate_audio: false
      });
      const providerJobId = String(seedance.request_id || '').replace(/^runpod_/, '');
      if (!req.supabase && hasDatabase()) {
        await updateLocalVideoJob(req, clientRequestId, {
          status: 'processing',
          metadata: {
            providerJobId,
            rawRequestId: providerJobId,
            providerStatus: seedance.status || 'IN_QUEUE',
            imagePreviewUrl,
            submittedAt: new Date().toISOString()
          }
        });
      }
      if (submitOnly) return;
      await pollPersistedServerlessJob(req.tenant.slug || req.tenant.id, clientRequestId);
      return;
    }

    if (videoEngine === 'infinitetalk-hd') {
      const custom = await submitInfiniteTalkHdJob({
        imagePath,
        audioPath,
        imageUrl: req.body.imageUrl || '',
        audioUrl: req.body.audioUrl || '',
        quality: req.body.meigenSize || '720p',
        steps: req.body.infinitetalkSteps || 40,
        seed: req.body.infinitetalkSeed || -1
      });
      if (!req.supabase && hasDatabase()) {
        await updateLocalVideoJob(req, clientRequestId, {
          status: 'processing',
          metadata: {
            providerJobId: custom.id,
            rawRequestId: custom.id,
            providerStatus: custom.status,
            quality: req.body.meigenSize || '720p',
            steps: Number(req.body.infinitetalkSteps || 40),
            seed: Number(req.body.infinitetalkSeed || -1),
            imagePreviewUrl,
            submittedAt: new Date().toISOString()
          }
        });
      }
      if (submitOnly) return;
      await pollPersistedServerlessJob(req.tenant.slug || req.tenant.id, clientRequestId);
      return;
    }

    if (videoEngine === 'musetalk') {
      const musetalk = await submitMuseTalkVideoJob({
        imagePath,
        audioPath,
        imageUrl: req.body.imageUrl || '',
        audioUrl: req.body.audioUrl || '',
        prompt: req.body.prompt,
        fps: req.body.musetalkFps || 25,
        bboxShift: req.body.musetalkBboxShift || 0
      });
      if (!req.supabase && hasDatabase()) {
        await updateLocalVideoJob(req, clientRequestId, {
          status: 'processing',
          metadata: {
            providerJobId: musetalk.id,
            rawRequestId: musetalk.id,
            providerStatus: musetalk.status,
            fps: Number(req.body.musetalkFps || 25),
            bboxShift: Number(req.body.musetalkBboxShift || 0),
            imagePreviewUrl,
            submittedAt: new Date().toISOString()
          }
        });
      }
      if (submitOnly) return;
      await pollPersistedServerlessJob(req.tenant.slug || req.tenant.id, clientRequestId);
      return;
    }

    if (videoEngine === 'meigen') {
      const meigen = await submitMeigenVideoJob({
        imagePath,
        audioPath,
        imageUrl: req.body.imageUrl || '',
        audioUrl: req.body.audioUrl || '',
        prompt: req.body.prompt,
        size: getMeigenSize(req.body.meigenSize || '480p'),
      });
      if (!req.supabase && hasDatabase()) {
        await updateLocalVideoJob(req, clientRequestId, {
          status: 'processing',
          metadata: {
            providerJobId: meigen.id,
            rawRequestId: meigen.id,
            providerStatus: meigen.status,
            meigenSize: getMeigenSize(req.body.meigenSize || '480p'),
            imagePreviewUrl,
            submittedAt: new Date().toISOString()
          }
        });
      }
      if (submitOnly) return;
      await pollPersistedServerlessJob(req.tenant.slug || req.tenant.id, clientRequestId);
    }
  } catch (error) {
    logger.error('Background serverless video generation failed', {
      error: error.message,
      mode,
      presetId,
      videoEngine,
      audioProvider,
      requestId: clientRequestId,
      tenantId: req.tenant?.slug || req.tenant?.id
    });
    if (!req.supabase && hasDatabase()) {
      await updateLocalVideoJob(req, clientRequestId, {
        status: 'failed',
        error: error.message,
        metadata: { imagePreviewUrl }
      });
    }
    if (submitOnly) throw error;
  }
}

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

    if (mode !== 'i2v' && ['meigen', 'infinitetalk-hd', 'musetalk', 'wan22-serverless', 'wan-animate', 'seedance2-fast', 'seedance2-standard'].includes(videoEngine)) {
      return res.status(400).json({ error: `${videoEngine} is only available for image-to-video style generation right now.` });
    }

    const serverlessEngine = ['meigen', 'infinitetalk-hd', 'musetalk', 'wan22-serverless', 'wan-animate', 'seedance2-fast', 'seedance2-standard'].includes(videoEngine);

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
    const engineNeedsAudio = !['wan22-serverless', 'wan-animate', 'seedance2-fast', 'seedance2-standard'].includes(videoEngine);
    if (engineNeedsAudio && audioProvider === 'upload' && !files.audio?.[0] && !req.body.audioUrl) {
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
      imagePath = await downloadTempFile(req.body.imageUrl, req.tenant.slug || req.tenant.id, 'library-character.png', req);
    }
    if (imagePath && mode === 'i2v') {
      imagePath = await frameImageForStudio(
        imagePath,
        req.body.aspectRatio || '9:16',
        req.body.cropX,
        req.body.cropY
      );
    }

    const clientRequestId = req.body.clientJobId || uuidv4();
    const imagePreviewUrl = req.body.imageUrl || publicPathForAssetFile(imagePath);
    if (serverlessEngine) {
      if (videoEngine === 'wan-animate') {
        const referenceVideoPath = files.referenceVideo?.[0]?.path || files.video?.[0]?.path || null;
        const referenceVideoUrl = req.body.referenceVideoUrl || req.body.remixSourceUrl || '';
        if (!referenceVideoPath && !referenceVideoUrl.trim()) {
          return res.status(400).json({ error: 'Wan Animate needs a source/reference video to mimic.' });
        }
      }
      const durationSeconds = parseDurationSeconds(req.body.durationSeconds) || null;
      const job = {
        requestId: clientRequestId,
        jobId: clientRequestId,
        tenantId: req.tenant.slug || req.tenant.id,
        provider: videoEngine,
        presetId: videoEngine,
        mode,
        audioProvider,
        status: 'processing',
        prompt: req.body.prompt || '',
        aspectRatio: req.body.aspectRatio || '9:16',
        durationSeconds,
        imagePreviewUrl,
        createdAt: new Date().toISOString()
      };
      if (!req.supabase && hasDatabase()) {
        await createLocalVideoJob(req, {
          ...job,
          script: req.body.script || '',
          negativePrompt: req.body.negativePrompt || '',
          metadata: {
            aspectRatio: req.body.aspectRatio || '9:16',
            durationSeconds,
            imageAssetId: req.body.imageAssetId || null,
            imagePreviewUrl,
            audioAssetId: req.body.audioAssetId || null,
            notifyEmail: req.user?.email || null,
            videoEngine
          }
        });
      }
      await runServerlessVideoJob(req, files, {
        audioProvider,
        clientRequestId,
        imagePath,
        imagePreviewUrl,
        mode,
        presetId,
        videoEngine
      }, { submitOnly: true });
      if (!req.supabase && hasDatabase()) {
        const submittedRow = await getLocalVideoJobByRequest(req.tenant.slug || req.tenant.id, clientRequestId);
        if (submittedRow) Object.assign(job, mapLocalVideoJob(submittedRow));
      }
      setImmediate(() => {
        pollPersistedServerlessJob(req.tenant.slug || req.tenant.id, clientRequestId)
          .catch(error => logger.error('Background serverless polling failed', {
            error: error.message,
            requestId: clientRequestId,
            videoEngine
          }));
      });
      return res.json({ success: true, background: true, job });
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
    if (engineNeedsAudio && audioProvider === 'vibevoice') {
      const dir = path.join(UPLOAD_DIR, cleanSlug(req.tenant.slug || req.tenant.id || 'default'), 'vibevoice');
      const vibevoice = await createVibeVoiceAudio({
        script: req.body.script,
        voice: req.body.chatterboxVoice || req.body.vibevoiceVoice,
        voiceUrl: req.body.chatterboxVoiceUrl || req.body.vibevoiceVoiceUrl,
        voiceSamplePath: files.voiceSample?.[0]?.path || null,
        format: req.body.chatterboxFormat || req.body.vibevoiceFormat,
        outputDir: dir
      });
      audioPath = vibevoice.localPath;
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
    if (!audioPath && req.body.audioUrl) {
      audioPath = await downloadTempFile(req.body.audioUrl, req.tenant.slug || req.tenant.id, 'voiceover.mp3', req);
    }
    const durationSeconds = parseDurationSeconds(req.body.durationSeconds) || await getAudioDurationSeconds(audioPath);
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
          imagePreviewUrl,
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
          imageUrl: req.body.imageUrl || '',
          audioUrl: req.body.audioUrl || '',
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
    logger.error('Studio generation failed', {
      error: error.message,
      mode: req.body?.mode,
      videoEngine: req.body?.videoEngine,
      audioProvider: req.body?.audioProvider,
      tenantId: req.tenant?.slug || req.tenant?.id
    });
    res.status(500).json({ error: error.message });
  }
});

router.resumePendingServerlessVideoJobs = resumePendingServerlessVideoJobs;

module.exports = router;
