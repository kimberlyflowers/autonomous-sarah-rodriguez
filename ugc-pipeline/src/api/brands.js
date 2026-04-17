const express = require('express');
const path = require('path');
const fs = require('fs');
const { logger } = require('../services/logger');

const router = express.Router();
const BRANDS_DIR = path.join(__dirname, '..', '..', 'config', 'brands');

function ensureDir() {
  if (!fs.existsSync(BRANDS_DIR)) fs.mkdirSync(BRANDS_DIR, { recursive: true });
}

// List all brands
router.get('/', (req, res) => {
  ensureDir();
  const brands = fs.readdirSync(BRANDS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(BRANDS_DIR, f), 'utf-8'));
      return { slug: f.replace('.json', ''), ...data };
    });
  res.json(brands);
});

// Get single brand
router.get('/:slug', (req, res) => {
  const filePath = path.join(BRANDS_DIR, `${req.params.slug}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Brand not found' });
  res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
});

// Create or update brand
router.post('/', (req, res) => {
  ensureDir();
  const { name, category, description, pricePoint, sellingPoints, targetAudience, adObjective,
    platforms, tone, discountCode, cta, customNotes } = req.body;

  if (!name) return res.status(400).json({ error: 'Brand name is required' });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const brand = {
    name,
    slug,
    category: category || '',
    description: description || '',
    pricePoint: pricePoint || '',
    sellingPoints: sellingPoints || [],
    targetAudience: targetAudience || '',
    adObjective: adObjective || 'conversion',
    platforms: platforms || ['tiktok', 'instagram'],
    tone: tone || 'energetic',
    discountCode: discountCode || '',
    cta: cta || '',
    customNotes: customNotes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const filePath = path.join(BRANDS_DIR, `${slug}.json`);
  const isNew = !fs.existsSync(filePath);
  if (!isNew) {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    brand.createdAt = existing.createdAt;
  }

  fs.writeFileSync(filePath, JSON.stringify(brand, null, 2));
  logger.info(`Brand ${isNew ? 'created' : 'updated'}`, { slug });
  res.json({ success: true, brand });
});

// Update brand field
router.patch('/:slug', (req, res) => {
  const filePath = path.join(BRANDS_DIR, `${req.params.slug}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Brand not found' });

  const brand = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  Object.assign(brand, req.body, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(filePath, JSON.stringify(brand, null, 2));
  logger.info('Brand updated', { slug: req.params.slug, fields: Object.keys(req.body) });
  res.json({ success: true, brand });
});

// Delete brand
router.delete('/:slug', (req, res) => {
  const filePath = path.join(BRANDS_DIR, `${req.params.slug}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Brand not found' });
  fs.unlinkSync(filePath);
  logger.info('Brand deleted', { slug: req.params.slug });
  res.json({ success: true });
});

module.exports = router;
