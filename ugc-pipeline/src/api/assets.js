const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../services/logger');
const { uploadToTempHost } = require('../services/seedance');
const { getSignedUrl } = require('../services/supabase');

const router = express.Router();

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

// Configure multer for each asset type
function createStorage(subdir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const name = req.body.name || 'unnamed';
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
      const dir = path.join(ASSETS_DIR, 'tenants', tenantSlug, subdir, slug);
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
router.get('/', async (req, res) => {
  if (req.supabase) {
    try {
      const { data, error } = await req.supabase
        .from('ugc_assets')
        .select('*')
        .eq('tenant_id', req.tenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const result = { products: [], subjects: [], audio: [] };
      for (const asset of data || []) {
        const typeKey = asset.type === 'product' ? 'products' : asset.type === 'subject' ? 'subjects' : asset.type;
        if (!result[typeKey]) continue;
        const signedUrl = await getSignedUrl(req.supabase, asset.storage_path);
      result[typeKey].push({
          slug: asset.id,
          name: asset.name,
          type: asset.type,
          files: [{
            name: path.basename(asset.storage_path),
            path: signedUrl,
            size: asset.size_bytes || 0
          }],
          voiceId: asset.metadata?.voiceId || '',
          voiceSampleAssetId: asset.metadata?.voiceSampleAssetId || '',
          aiContext: asset.metadata?.aiContext || null
        });
      }
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  const result = { products: [], subjects: [], audio: [] };
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';

  ['products', 'subjects', 'audio'].forEach(type => {
    const dir = path.join(ASSETS_DIR, 'tenants', tenantSlug, type);
    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir).forEach(folder => {
      const folderPath = path.join(dir, folder);
      if (!fs.statSync(folderPath).isDirectory()) return;

      const files = fs.readdirSync(folderPath).map(f => ({
        name: f,
        path: `/assets/tenants/${tenantSlug}/${type}/${folder}/${f}`,
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
        type: type === 'subjects' ? 'subject' : type === 'products' ? 'product' : type,
        files: files.filter(f => !f.name.endsWith('.json')),
        voiceId: aiContext?.voiceId || '',
        voiceSampleAssetId: aiContext?.voiceSampleAssetId || '',
        aiContext
      });
    });
  });

  res.json(result);
});

async function uploadToSupabase(req, file, type, slug) {
  const tenantSlug = req.tenant.slug || req.tenant.id;
  const storagePath = `${tenantSlug}/${type}/${uuidv4()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
  const bytes = fs.readFileSync(file.path);
  const { error: uploadError } = await req.supabase.storage
    .from('ugc-assets')
    .upload(storagePath, bytes, {
      contentType: file.mimetype,
      upsert: false
    });
  if (uploadError) throw uploadError;

  const { data, error } = await req.supabase
    .from('ugc_assets')
    .insert({
      tenant_id: req.tenant.id,
      created_by: req.user.id,
      type,
      name: req.body.name || slug,
      storage_path: storagePath,
      mime_type: file.mimetype,
      size_bytes: file.size,
      metadata: {
        voiceId: req.body.voiceId || '',
        voiceSampleAssetId: req.body.voiceSampleAssetId || ''
      }
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// Upload product image
router.post('/products', uploadProduct.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const slug = (req.body.name || 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (req.supabase) {
    try {
      const asset = await uploadToSupabase(req, req.file, 'product', slug);
      const signedUrl = await getSignedUrl(req.supabase, asset.storage_path);
      return res.json({ success: true, asset: { type: 'product', slug: asset.id, name: asset.name, path: signedUrl } });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  logger.info('Product uploaded', { name: req.body.name, slug });
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  res.json({
    success: true,
    asset: { type: 'product', slug, name: req.body.name, path: `/assets/tenants/${tenantSlug}/products/${slug}/${req.file.filename}` }
  });
});

// Upload subject image
router.post('/subjects', uploadSubject.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const slug = (req.body.name || 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (req.supabase) {
    try {
      const asset = await uploadToSupabase(req, req.file, 'subject', slug);
      const signedUrl = await getSignedUrl(req.supabase, asset.storage_path);
      return res.json({ success: true, asset: { type: 'subject', slug: asset.id, name: asset.name, path: signedUrl } });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  logger.info('Subject uploaded', { name: req.body.name, slug });
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  res.json({
    success: true,
    asset: { type: 'subject', slug, name: req.body.name, path: `/assets/tenants/${tenantSlug}/subjects/${slug}/${req.file.filename}` }
  });
});

// Upload audio clip
router.post('/audio', uploadAudio.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const slug = (req.body.name || 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (req.supabase) {
    try {
      const asset = await uploadToSupabase(req, req.file, 'audio', slug);
      const signedUrl = await getSignedUrl(req.supabase, asset.storage_path);
      return res.json({ success: true, asset: { type: 'audio', slug: asset.id, name: asset.name, path: signedUrl } });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  logger.info('Audio uploaded', { name: req.body.name, slug });
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  res.json({
    success: true,
    asset: { type: 'audio', slug, name: req.body.name, path: `/assets/tenants/${tenantSlug}/audio/${slug}/${req.file.filename}` }
  });
});

// Delete an asset folder
router.delete('/:type/:slug', async (req, res) => {
  const { type, slug } = req.params;
  if (!['products', 'subjects', 'audio'].includes(type)) {
    return res.status(400).json({ error: 'Invalid asset type' });
  }
  if (req.supabase) {
    try {
      const { data: asset, error: getError } = await req.supabase
        .from('ugc_assets')
        .select('*')
        .eq('tenant_id', req.tenant.id)
        .eq('id', slug)
        .single();
      if (getError) throw getError;
      await req.supabase.storage.from('ugc-assets').remove([asset.storage_path]);
      const { error } = await req.supabase
        .from('ugc_assets')
        .delete()
        .eq('tenant_id', req.tenant.id)
        .eq('id', slug);
      if (error) throw error;
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  const dir = path.join(ASSETS_DIR, 'tenants', tenantSlug, type, slug);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' });

  fs.rmSync(dir, { recursive: true });
  logger.info('Asset deleted', { type, slug });
  res.json({ success: true });
});

// Get temporary hosted URL for an asset
router.post('/host/:type/:slug', async (req, res) => {
  try {
    const { type, slug } = req.params;
    if (req.supabase) {
      const { data: asset, error } = await req.supabase
        .from('ugc_assets')
        .select('*')
        .eq('tenant_id', req.tenant.id)
        .eq('id', slug)
        .single();
      if (error) throw error;
      const url = await getSignedUrl(req.supabase, asset.storage_path, 10 * 60);
      return res.json({ success: true, url, expiresIn: '10 minutes' });
    }
    const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
    const dir = path.join(ASSETS_DIR, 'tenants', tenantSlug, type, slug);
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

router.patch('/subjects/:slug', async (req, res) => {
  const { slug } = req.params;
  if (req.supabase) {
    try {
      const { data: existing, error: getError } = await req.supabase
        .from('ugc_assets')
        .select('metadata')
        .eq('tenant_id', req.tenant.id)
        .eq('id', slug)
        .eq('type', 'subject')
        .single();
      if (getError) throw getError;

      const metadata = {
        ...(existing?.metadata || {}),
        voiceId: req.body.voiceId || '',
        voiceSampleAssetId: req.body.voiceSampleAssetId || ''
      };
      const { data, error } = await req.supabase
        .from('ugc_assets')
        .update({ metadata })
        .eq('tenant_id', req.tenant.id)
        .eq('id', slug)
        .eq('type', 'subject')
        .select('*')
        .single();
      if (error) throw error;
      return res.json({ success: true, asset: data });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  const dir = path.join(ASSETS_DIR, 'tenants', tenantSlug, 'subjects', slug);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Character not found' });
  const contextPath = path.join(dir, 'ai-context.json');
  const existing = fs.existsSync(contextPath)
    ? JSON.parse(fs.readFileSync(contextPath, 'utf-8'))
    : {};
  const next = {
    ...existing,
    voiceId: req.body.voiceId || '',
    voiceSampleAssetId: req.body.voiceSampleAssetId || ''
  };
  fs.writeFileSync(contextPath, JSON.stringify(next, null, 2));
  res.json({ success: true, asset: { slug, metadata: next } });
});

module.exports = router;
