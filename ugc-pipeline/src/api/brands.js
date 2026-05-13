const express = require('express');
const path = require('path');
const fs = require('fs');
const { logger } = require('../services/logger');

const router = express.Router();
const BRANDS_DIR = path.join(__dirname, '..', '..', 'config', 'brands');

function toDbPayload(body) {
  const metadata = {};
  ['pricePoint', 'adObjective', 'platforms', 'discountCode', 'cta', 'customNotes'].forEach((key) => {
    if (body[key] !== undefined) metadata[key] = body[key];
  });
  const payload = {};
  if (body.name !== undefined) payload.name = body.name;
  if (body.category !== undefined) payload.category = body.category;
  if (body.description !== undefined) payload.description = body.description;
  if (body.sellingPoints !== undefined) payload.selling_points = body.sellingPoints;
  if (body.targetAudience !== undefined) payload.target_audience = body.targetAudience;
  if (body.tone !== undefined) payload.tone = body.tone;
  if (Object.keys(metadata).length) payload.metadata = metadata;
  return payload;
}

function tenantBrandsDir(req) {
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  return path.join(BRANDS_DIR, tenantSlug);
}

function ensureDir(req) {
  const dir = tenantBrandsDir(req);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// List all brands
router.get('/', async (req, res) => {
  if (req.supabase) {
    const { data, error } = await req.supabase
      .from('ugc_brands')
      .select('*')
      .eq('tenant_id', req.tenant.id)
      .order('updated_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json((data || []).map(row => ({
      slug: row.slug,
      name: row.name,
      category: row.category || '',
      description: row.description || '',
      sellingPoints: row.selling_points || [],
      targetAudience: row.target_audience || '',
      tone: row.tone || '',
      ...row.metadata
    })));
  }

  const dir = ensureDir(req);
  const brands = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      return { slug: f.replace('.json', ''), ...data };
    });
  res.json(brands);
});

// Get single brand
router.get('/:slug', async (req, res) => {
  if (req.supabase) {
    const { data, error } = await req.supabase
      .from('ugc_brands')
      .select('*')
      .eq('tenant_id', req.tenant.id)
      .eq('slug', req.params.slug)
      .single();
    if (error) return res.status(404).json({ error: 'Brand not found' });
    return res.json({
      slug: data.slug,
      name: data.name,
      category: data.category || '',
      description: data.description || '',
      sellingPoints: data.selling_points || [],
      targetAudience: data.target_audience || '',
      tone: data.tone || '',
      ...data.metadata
    });
  }
  const filePath = path.join(tenantBrandsDir(req), `${req.params.slug}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Brand not found' });
  res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
});

// Create or update brand
router.post('/', async (req, res) => {
  const dir = ensureDir(req);
  const { name, category, description, pricePoint, sellingPoints, targetAudience, adObjective,
    platforms, tone, discountCode, cta, customNotes } = req.body;

  if (!name) return res.status(400).json({ error: 'Brand name is required' });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (req.supabase) {
    const payload = {
      tenant_id: req.tenant.id,
      created_by: req.user.id,
      slug,
      name,
      category: category || '',
      description: description || '',
      selling_points: sellingPoints || [],
      target_audience: targetAudience || '',
      tone: tone || 'natural',
      metadata: { pricePoint, adObjective, platforms, discountCode, cta, customNotes },
      updated_at: new Date().toISOString()
    };
    const { data, error } = await req.supabase
      .from('ugc_brands')
      .upsert(payload, { onConflict: 'tenant_id,slug' })
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, brand: data });
  }

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

  const filePath = path.join(dir, `${slug}.json`);
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
router.patch('/:slug', async (req, res) => {
  if (req.supabase) {
    const updatePayload = toDbPayload(req.body);
    const { data, error } = await req.supabase
      .from('ugc_brands')
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq('tenant_id', req.tenant.id)
      .eq('slug', req.params.slug)
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, brand: data });
  }

  const filePath = path.join(tenantBrandsDir(req), `${req.params.slug}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Brand not found' });

  const brand = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  Object.assign(brand, req.body, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(filePath, JSON.stringify(brand, null, 2));
  logger.info('Brand updated', { slug: req.params.slug, fields: Object.keys(req.body) });
  res.json({ success: true, brand });
});

// Delete brand
router.delete('/:slug', async (req, res) => {
  if (req.supabase) {
    const { error } = await req.supabase
      .from('ugc_brands')
      .delete()
      .eq('tenant_id', req.tenant.id)
      .eq('slug', req.params.slug);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  const filePath = path.join(tenantBrandsDir(req), `${req.params.slug}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Brand not found' });
  fs.unlinkSync(filePath);
  logger.info('Brand deleted', { slug: req.params.slug });
  res.json({ success: true });
});

module.exports = router;
