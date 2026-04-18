require('dotenv').config();
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

// Optional API key auth — when UGC_API_KEYS is set (comma-separated), all
// /api/* routes (except webhooks) require X-API-Key header. Unset = open.
const apiKeyAuth = (req, res, next) => {
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

// All other API routes use optional auth
app.use('/api/assets', apiKeyAuth, assetsRouter);
app.use('/api/brands', apiKeyAuth, brandsRouter);
app.use('/api/generate', apiKeyAuth, generateRouter);
app.use('/api/videos', apiKeyAuth, videosRouter);
app.use('/api/analyze', apiKeyAuth, analyzeRouter);

// Health check
app.get('/health', (req, res) => {
  const hasApiKey = !!(process.env.WAVESPEED_API_KEY || process.env.SEEDANCE_API_KEY);
  res.json({
    status: 'ok',
    service: 'ugc-pipeline',
    version: '1.0.0',
    provider: 'wavespeed',
    apiKeyConfigured: hasApiKey,
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
    apiKeyConfigured: !!(process.env.WAVESPEED_API_KEY || process.env.SEEDANCE_API_KEY),
    provider: 'wavespeed',
    brands: brandCount,
    videosGenerated: videoCount,
    pricing: {
      'seedance2-fast-480p': '$0.10/sec',
      'seedance2-fast-720p': '$0.20/sec',
      'seedance2-fast-1080p': '$0.30/sec',
      'seedance2-standard-480p': '$0.12/sec',
      'seedance2-standard-720p': '$0.24/sec',
      'seedance2-standard-1080p': '$0.36/sec'
    }
  });
});

// Ensure directories exist
const dirs = [
  'assets/products', 'assets/subjects', 'assets/audio', 'assets/generated',
  'config', 'config/brands'
];
dirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

app.listen(PORT, () => {
  logger.info(`UGC Pipeline running on port ${PORT}`);
  logger.info(`Control Center: http://localhost:${PORT}`);
  logger.info(`API Key configured: ${!!process.env.SEEDANCE_API_KEY}`);
});
