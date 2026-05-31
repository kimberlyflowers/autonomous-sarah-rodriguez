require('dotenv').config();
// Polyfill WebSocket for Node.js 20 (required by @supabase/supabase-js Realtime)
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}
const express = require('express');
const cors = require('cors');
const path = require('path');
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
  if ((req.header('Authorization') || '').startsWith('Bearer ')) return next();
  const allowed = (process.env.UGC_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0) return next();
  const provided = req.header('X-API-Key') || req.query.api_key;
  if (!provided || !allowed.includes(provided)) {
    return res.status(401).json({ error: 'Invalid or missing X-API-Key' });
  }
  next();
};

// Webhook is unauthenticated (called by Seedance/WaveSpeed)
app.use('/api/webhook', webhookRouter);
app.use('/api/auth', authRouter);

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

// Health check
app.get('/health', (req, res) => {
  const hasApiKey = !!getSeedanceApiKey();
  res.json({
    status: 'ok',
    service: 'ugc-pipeline',
    version: '1.0.0',
    provider: 'runpod-public-endpoints+comfyui',
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
    provider: 'runpod-public-endpoints+comfyui',
    brands: brandCount,
    videosGenerated: videoCount,
    pricing: {
      'runpod-seedance-1.5-i2v-480p': '$0.024/sec',
      'runpod-seedance-1.5-i2v-720p': '$0.052/sec'
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
