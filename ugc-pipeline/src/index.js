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

// API routes
app.use('/api/assets', assetsRouter);
app.use('/api/brands', brandsRouter);
app.use('/api/generate', generateRouter);
app.use('/api/videos', videosRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/analyze', analyzeRouter);

// Health check
app.get('/health', (req, res) => {
  const hasApiKey = !!process.env.SEEDANCE_API_KEY;
  res.json({
    status: 'ok',
    service: 'ugc-pipeline',
    version: '1.0.0',
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
    apiKeyConfigured: !!process.env.SEEDANCE_API_KEY,
    brands: brandCount,
    videosGenerated: videoCount,
    pricing: {
      'seedance2-fast-480p': '$0.073/sec',
      'seedance2-fast-720p': '$0.126/sec',
      'seedance2-standard-480p': '$0.10/sec',
      'seedance2-standard-720p': '$0.18/sec'
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
