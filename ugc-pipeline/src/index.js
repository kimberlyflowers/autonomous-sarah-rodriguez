require('dotenv').config();
// Polyfill WebSocket for Node.js 20 (required by @supabase/supabase-js Realtime)
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getAssetFile } = require('./services/postgres');
const { verifyPublicVideoSignature, parseByteRange } = require('./services/public-video');
const fs = require('fs');
const { logger } = require('./services/logger');
const assetsRouter = require('./api/assets');
const brandsRouter = require('./api/brands');
const generateRouter = require('./api/generate');
const videosRouter = require('./api/videos');
const webhookRouter = require('./api/webhook');
const analyzeRouter = require('./api/analyze');
const studioRouter = require('./api/studio');
const authRouter = require('./api/auth');
const billingRouter = require('./api/billing');
const productPlacementRouter = require('./api/product-placement');
const ttsRouter = require('./api/tts');
const trendsRouter = require('./api/trends');
const cloneRouter = require('./api/clone');
const charactersRouter = require('./api/characters');
const settingsRouter = require('./api/settings');
const { requireTenant } = require('./services/auth');
const { getSupabaseConfig } = require('./services/supabase');
const { getRunPodConfig } = require('./services/runpod');
const { hasDatabase, initUgcStore } = require('./services/postgres');
const { getApiKey: getSeedanceApiKey } = require('./services/seedance');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve uploaded assets
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// Serve reference docs publicly (read by MCP connector + agents at runtime)
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));

// Optional API key auth for backend/Bloomie calls. Browser workspace access uses
// requireTenant below.
const apiKeyAuth = (req, res, next) => {
  // Browser media elements cannot attach an Authorization header. The Studio
  // app therefore sends its signed tenant session through the query string (or
  // X-UGC-Token), and requireTenant performs the actual signature and tenant
  // validation immediately after this guard.
  if (
    (req.header('Authorization') || '').startsWith('Bearer ')
    || req.query.token
    || req.header('X-UGC-Token')
  ) return next();
  const allowed = (process.env.UGC_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0) return next();
  const provided = req.header('X-API-Key') || req.query.api_key;
  if (!provided || !allowed.includes(provided)) {
    return res.status(401).json({ error: 'Invalid or missing X-API-Key' });
  }
  // Trusted internal callers must still identify the authenticated Bloomie
  // organization. requireTenant validates and applies that boundary next.
  req.internalTenantAuth = true;
  next();
};

// Webhook is unauthenticated (called by Seedance/WaveSpeed)
app.use('/api/webhook', webhookRouter);
app.use('/api/auth', authRouter);
app.use('/api/public/trends', (req, res, next) => {
  if (req.method !== 'GET') return res.status(404).json({ error: 'Not found' });
  return next();
}, trendsRouter);

app.get('/api/public/video/:tenant/:id/:signature', async (req, res) => {
  const { tenant, id, signature } = req.params;
  if (!verifyPublicVideoSignature(tenant, id, signature)) {
    return res.status(403).json({ error: 'Invalid video link' });
  }
  try {
    const asset = await getAssetFile(tenant, id, 'video');
    if (!asset) return res.status(404).json({ error: 'Video not found' });
    const video = Buffer.isBuffer(asset.file_data) ? asset.file_data : Buffer.from(asset.file_data);
    const size = video.length;
    const range = parseByteRange(req.headers.range, size);
    res.setHeader('Content-Type', asset.mime_type || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (range?.invalid) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }
    if (range) {
      const chunk = video.subarray(range.start, range.end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      res.setHeader('Content-Length', String(chunk.length));
      return res.end(chunk);
    }
    res.setHeader('Content-Length', String(size));
    return res.end(video);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Tenant-scoped routes require a logged-in user/workspace.
app.use('/api/assets', apiKeyAuth, requireTenant, assetsRouter);
app.use('/api/brands', apiKeyAuth, requireTenant, brandsRouter);
app.use('/api/generate', apiKeyAuth, requireTenant, generateRouter);
app.use('/api/videos', apiKeyAuth, requireTenant, videosRouter);
app.use('/api/analyze', apiKeyAuth, requireTenant, analyzeRouter);
app.use('/api/studio', apiKeyAuth, requireTenant, studioRouter);
app.use('/api/billing', apiKeyAuth, requireTenant, billingRouter);
app.use('/api/product-placement', apiKeyAuth, requireTenant, productPlacementRouter);
app.use('/api/tts', apiKeyAuth, requireTenant, ttsRouter);
app.use('/api/trends', apiKeyAuth, requireTenant, trendsRouter);
// Public read-only alias — no auth required so videoclone-ai and external tools
// can fetch the trends feed without a workspace token.
app.use('/api/public/trends', trendsRouter);
// Video clone — Evolink Seedance 2.0 (primary) + WaveSpeed fallback. No RunPod.
app.use('/api/clone', apiKeyAuth, requireTenant, cloneRouter);
// Global character roster — public read (no tenant required)
app.use('/api/characters', charactersRouter);
// Tenant settings (ElevenLabs key, etc.)
app.use('/api/settings', apiKeyAuth, requireTenant, settingsRouter);

// Health check
app.get('/health', (req, res) => {
  const hasApiKey = !!getSeedanceApiKey();
  res.json({
    status: 'ok',
    service: 'ugc-pipeline',
    version: '1.0.0',
    provider: 'seedance2api+wavespeed-fallback+comfyui',
    apiKeyConfigured: hasApiKey,
    comfyuiConfigured: !!(process.env.COMFYUI_BASE_URL || process.env.RUNPOD_COMFYUI_URL),
    runpodAutoStartConfigured: getRunPodConfig().autoStartConfigured,
    databaseConfigured: hasDatabase(),
    supabaseConfigured: getSupabaseConfig().configured,
    supabaseAvailable: getSupabaseConfig().available,
    uptime: process.uptime()
  });
});

// API status
app.get('/api/status', (req, res) => {
  const configDir = path.join(__dirname, '..', 'config');
  const brandsDir = path.join(configDir, 'brands');
  const generatedDir = path.join(__dirname, '..', 'assets', 'generated');

  let brandCount = 0;
  let videoCount = 0;

  try {
    if (fs.existsSync(brandsDir)) {
      brandCount = fs.readdirSync(brandsDir).filter(f => f.endsWith('.json')).length;
    }
    if (fs.existsSync(generatedDir)) {
      videoCount = fs.readdirSync(generatedDir).filter(f => f.endsWith('.mp4')).length;
    }
  } catch (e) { /* ignore */ }

  res.json({
    apiKeyConfigured: !!getSeedanceApiKey(),
    comfyuiConfigured: !!(process.env.COMFYUI_BASE_URL || process.env.RUNPOD_COMFYUI_URL),
    runpodAutoStartConfigured: getRunPodConfig().autoStartConfigured,
    databaseConfigured: hasDatabase(),
    supabaseConfigured: getSupabaseConfig().configured,
    provider: 'seedance2api+wavespeed-fallback+comfyui',
    brands: brandCount,
    videosGenerated: videoCount,
    pricing: {
      'seedance2api-720p': '$0.13/sec',
      'wavespeed-fallback-720p': '$0.20/sec',
      'runpod-seedance-1.5-i2v-720p': '$0.052/sec when explicitly selected'
    }
  });
});

// Ensure directories exist
const dirs = [
  'assets/products', 'assets/subjects', 'assets/audio', 'assets/generated',
  'assets/studio-uploads', 'config', 'config/brands', 'config/workflows'
];
dirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

initUgcStore()
  .then((ready) => {
    if (ready) {
      logger.info('UGC database-backed asset storage ready');
      if (typeof studioRouter.resumePendingServerlessVideoJobs === 'function') {
        studioRouter.resumePendingServerlessVideoJobs()
          .catch((error) => logger.warn(`Could not resume serverless video jobs: ${error.message}`));
      }
    }
  })
  .catch((error) => logger.warn(`UGC database storage unavailable: ${error.message}`));

app.listen(PORT, () => {
  logger.info(`UGC Pipeline running on port ${PORT}`);
  logger.info(`Control Center: http://localhost:${PORT}`);
  logger.info(`API Key configured: ${!!process.env.SEEDANCE_API_KEY}`);
  // Pre-warm all voice samples in the background so the voice picker
  // plays instantly for every voice when the dialog opens.
  prewarmVoiceSamples();
});

async function prewarmVoiceSamples() {
  // Kokoro samples are generated on demand via GET /api/tts/kokoro/sample/:voice
  // and cached permanently under assets/tts/kokoro-samples/.
  // No startup pre-warm needed — the first play press triggers generation.
  logger.info('Voice samples: on-demand Kokoro caching enabled (no startup pre-warm needed).');
}
