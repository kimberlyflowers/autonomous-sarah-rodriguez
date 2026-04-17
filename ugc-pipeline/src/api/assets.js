const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../services/logger');
const { uploadToTempHost } = require('../services/seedance');

const router = express.Router();

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

// Configure multer for each asset type
function createStorage(subdir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const name = req.body.name || 'unnamed';
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const dir = path.join(ASSETS_DIR, subdir, slug);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}${ext}`);
    }
  });
}

const uploadProduct = multer({ storage: createStorage('products'), limits: { fileSize: 50 * 1024 * 1024 } });
const uploadSubject = multer({ storage: createStorage('subjects'), limits: { fileSize: 50 * 1024 * 1024 } });
const uploadAudio = multer({ storage: createStorage('audio'), limits: { fileSize: 50 * 1024 * 1024 } });

// List all assets
router.get('/', (req, res) => {
  const result = { products: [], subjects: [], audio: [] };

  ['products', 'subjects', 'audio'].forEach(type => {
    const dir = path.join(ASSETS_DIR, type);
    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir).forEach(folder => {
      const folderPath = path.join(dir, folder);
      if (!fs.statSync(folderPath).isDirectory()) return;

      const files = fs.readdirSync(folderPath).map(f => ({
        name: f,
        path: `/assets/${type}/${folder}/${f}`,
        fullPath: path.join(folderPath, f),
        size: fs.statSync(path.join(folderPath, f)).size
      }));

      // Check for AI context
      const contextPath = path.join(folderPath, 'ai-context.json');
      const aiContext = fs.existsSync(contextPath)
        ? JSON.parse(fs.readFileSync(contextPath, 'utf-8'))
        : null;

      result[type].push({
        slug: folder,
        name: folder.replace(/-/g, ' '),
        files: files.filter(f => !f.name.endsWith('.json')),
        aiContext
      });
    });
  });

  res.json(result);
});

// Upload product image
router.post('/products', uploadProduct.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const slug = (req.body.name || 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  logger.info('Product uploaded', { name: req.body.name, slug });
  res.json({
    success: true,
    asset: { type: 'product', slug, name: req.body.name, path: `/assets/products/${slug}/${req.file.filename}` }
  });
});

// Upload subject image
router.post('/subjects', uploadSubject.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const slug = (req.body.name || 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  logger.info('Subject uploaded', { name: req.body.name, slug });
  res.json({
    success: true,
    asset: { type: 'subject', slug, name: req.body.name, path: `/assets/subjects/${slug}/${req.file.filename}` }
  });
});

// Upload audio clip
router.post('/audio', uploadAudio.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const slug = (req.body.name || 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  logger.info('Audio uploaded', { name: req.body.name, slug });
  res.json({
    success: true,
    asset: { type: 'audio', slug, name: req.body.name, path: `/assets/audio/${slug}/${req.file.filename}` }
  });
});

// Delete an asset folder
router.delete('/:type/:slug', (req, res) => {
  const { type, slug } = req.params;
  if (!['products', 'subjects', 'audio'].includes(type)) {
    return res.status(400).json({ error: 'Invalid asset type' });
  }
  const dir = path.join(ASSETS_DIR, type, slug);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' });

  fs.rmSync(dir, { recursive: true });
  logger.info('Asset deleted', { type, slug });
  res.json({ success: true });
});

// Get temporary hosted URL for an asset
router.post('/host/:type/:slug', async (req, res) => {
  try {
    const { type, slug } = req.params;
    const dir = path.join(ASSETS_DIR, type, slug);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' });

    const files = fs.readdirSync(dir).filter(f => !f.endsWith('.json'));
    if (files.length === 0) return res.status(404).json({ error: 'No files in asset' });

    const filePath = path.join(dir, files[0]);
    const url = await uploadToTempHost(filePath);
    res.json({ success: true, url, expiresIn: '10 minutes' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
