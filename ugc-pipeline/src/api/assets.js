const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../services/logger');
const { uploadToTempHost } = require('../services/seedance');
const { getSignedUrl } = require('../services/supabase');
const { getAssetFile, hasDatabase, initUgcStore, query } = require('../services/postgres');
const fetch = require('node-fetch');

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

function singularType(type) {
  return type === 'products' ? 'product' : type === 'subjects' ? 'subject' : type === 'videos' ? 'video' : type;
}

function pluralType(type) {
  return type === 'product' ? 'products' : type === 'subject' ? 'subjects' : type === 'output' ? 'outputs' : type === 'video' ? 'videos' : type;
}

function mimeToExt(mimeType = '') {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  if (mimeType.includes('avif')) return '.avif';
  return '.png';
}

function fileToAsset(row) {
  const filePath = `/api/assets/file/${row.id}`;
  return {
    slug: row.id,
    name: row.name,
    type: row.type,
    // imageUrl is always set so every frontend component can use character.imageUrl directly
    // without needing to know about files[0].path or storage backend differences
    imageUrl: filePath,
    image_url: filePath,
    files: [{
      name: row.file_name,
      path: filePath,
      size: Number(row.size_bytes || 0),
      mimeType: row.mime_type
    }],
    voiceId: row.metadata?.voiceId || '',
    voiceSampleAssetId: row.metadata?.voiceSampleAssetId || '',
    parentSubjectId: row.metadata?.parentSubjectId || '',
    parentCharacterSlug: row.metadata?.parentCharacterSlug || '',
    isLook: Boolean(row.metadata?.isLook),
    lookName: row.metadata?.lookName || '',
    aiContext: row.metadata?.aiContext || row.metadata || null,
    createdAt: row.created_at
  };
}

async function uploadToDatabase(req, file, type, slug) {
  await initUgcStore();
  const bytes = fs.readFileSync(file.path);
  const metadata = {
    voiceId: req.body.voiceId || '',
    voiceSampleAssetId: req.body.voiceSampleAssetId || '',
    parentSubjectId: req.body.parentSubjectId || '',
    parentCharacterSlug: req.body.parentCharacterSlug || '',
    isLook: req.body.isLook === 'true' || req.body.isLook === true,
    lookName: req.body.lookName || ''
  };
  const { rows } = await query(`
    insert into public.ugc_asset_files
      (tenant_slug, type, name, file_name, mime_type, size_bytes, file_data, metadata)
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    returning *
  `, [
    req.tenant.slug || req.tenant.id,
    type,
    req.body.name || slug,
    file.originalname,
    file.mimetype,
    file.size,
    bytes,
    JSON.stringify(metadata)
  ]);
  return rows[0];
}

// List all assets
router.get('/', async (req, res) => {
  if (!req.supabase && hasDatabase()) {
    try {
      await initUgcStore();
      // Exclude file_data — binary blobs can be tens of MB each.
      // File content is served on demand via /api/assets/file/:id.
      const { rows } = await query(
        `select id, tenant_slug, type, name, file_name, mime_type, size_bytes, metadata, created_at
         from public.ugc_asset_files
         where tenant_slug = $1
         order by created_at desc`,
        [req.tenant.slug || req.tenant.id]
      );
      const result = { products: [], subjects: [], audio: [], outputs: [], videos: [] };
      for (const row of rows) {
        const key = pluralType(row.type);
        if (result[key]) result[key].push(fileToAsset(row));
      }
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.supabase) {
    try {
      const { data, error } = await req.supabase
        .from('ugc_assets')
        .select('*')
        .eq('tenant_id', req.tenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const result = { products: [], subjects: [], audio: [], outputs: [], videos: [] };
      for (const asset of data || []) {
        const typeKey = pluralType(asset.type);
        if (!result[typeKey]) continue;
        // Use the permanent proxy URL so cached URLs never go stale.
        // The /api/assets/supabase/:id route generates a fresh signed URL on demand.
        const proxyUrl = `/api/assets/supabase/${asset.id}`;
        result[typeKey].push({
          slug: asset.id,
          name: asset.name,
          type: asset.type,
          files: [{
            name: path.basename(asset.storage_path),
            path: proxyUrl,
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

  const result = { products: [], subjects: [], audio: [], outputs: [], videos: [] };
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';

  ['products', 'subjects', 'audio', 'outputs', 'videos'].forEach(type => {
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
        type: singularType(type),
        files: files.filter(f => !f.name.endsWith('.json')),
        voiceId: aiContext?.voiceId || '',
        voiceSampleAssetId: aiContext?.voiceSampleAssetId || '',
        aiContext
      });
    });
  });

  res.json(result);
});

router.get('/file/:id', async (req, res) => {
  if (!hasDatabase()) return res.status(404).send('Not found');
  try {
    const asset = await getAssetFile(req.tenant.slug || req.tenant.id, req.params.id);
    if (!asset) return res.status(404).send('Not found');
    res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(asset.file_data);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Permanent proxy for Supabase Storage assets — generates a fresh signed URL on every
// request and redirects, so cached URLs in the frontend never go stale.
router.get('/supabase/:id', async (req, res) => {
  if (!req.supabase) return res.status(404).send('Not found');
  try {
    const { data: asset, error } = await req.supabase
      .from('ugc_assets')
      .select('storage_path, mime_type')
      .eq('tenant_id', req.tenant.id)
      .eq('id', req.params.id)
      .single();
    if (error || !asset) return res.status(404).send('Asset not found');
    const signedUrl = await getSignedUrl(req.supabase, asset.storage_path, 60 * 60);
    res.redirect(302, signedUrl);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/audio/:slug/temp-url', async (req, res) => {
  try {
    let filePath = '';
    if (!req.supabase && hasDatabase()) {
      const asset = await getAssetFile(req.tenant.slug || req.tenant.id, req.params.slug, 'audio');
      if (!asset) return res.status(404).json({ error: 'Audio asset not found.' });
      const dir = path.join(ASSETS_DIR, 'temp-voice-url', req.tenant.slug || req.tenant.id);
      fs.mkdirSync(dir, { recursive: true });
      filePath = path.join(dir, `${Date.now()}-${asset.file_name.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
      fs.writeFileSync(filePath, asset.file_data);
    } else if (req.supabase) {
      const { data: asset, error } = await req.supabase
        .from('ugc_assets')
        .select('*')
        .eq('tenant_id', req.tenant.id)
        .eq('id', req.params.slug)
        .eq('type', 'audio')
        .single();
      if (error) throw error;
      const signedUrl = await getSignedUrl(req.supabase, asset.storage_path, 10 * 60);
      return res.json({ success: true, url: signedUrl, expiresIn: '10 minutes' });
    } else {
      filePath = getLocalAudioFile(req, req.params.slug);
    }
    const url = await uploadToTempHost(filePath);
    res.json({ success: true, url, expiresIn: 'temporary' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generated-image', async (req, res) => {
  try {
    const { imageUrl, name, prompt, source, aspectRatio } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'A generated image URL is required.' });
    const file = await downloadRemoteImage(req, imageUrl, name || 'Generated image');
    const slug = cleanSlug(name || 'generated-image') || `generated-${Date.now()}`;

    if (!req.supabase && hasDatabase()) {
      const asset = await uploadToDatabase(req, {
        ...file,
        path: file.path,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      }, 'output', slug);
      return res.json({ success: true, asset: fileToAsset(asset) });
    }

    if (req.supabase) {
      const asset = await uploadToSupabase(req, file, 'output', slug);
      const signedUrl = await getSignedUrl(req.supabase, asset.storage_path);
      return res.json({ success: true, asset: { type: 'output', slug: asset.id, name: asset.name, files: [{ name: path.basename(asset.storage_path), path: signedUrl, size: asset.size_bytes || 0 }] } });
    }

    const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
    const outDir = path.join(ASSETS_DIR, 'tenants', tenantSlug, 'outputs', slug);
    fs.mkdirSync(outDir, { recursive: true });
    const finalPath = path.join(outDir, file.originalname);
    fs.copyFileSync(file.path, finalPath);
    fs.writeFileSync(path.join(outDir, 'ai-context.json'), JSON.stringify({ prompt: prompt || '', source: source || 'image-model', aspectRatio: aspectRatio || '' }, null, 2));
    res.json({ success: true, asset: { type: 'output', slug, name: name || 'Generated image', files: [{ name: file.originalname, path: `/assets/tenants/${tenantSlug}/outputs/${slug}/${file.originalname}`, size: file.size }] } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/subjects/from-image-url', async (req, res) => {
  try {
    const { imageUrl, name, voiceId, voiceSampleAssetId } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'Image URL is required.' });
    const file = await downloadRemoteImage(req, imageUrl, name || 'New agent');
    const slug = cleanSlug(name || 'new-agent') || `agent-${Date.now()}`;
    req.body.voiceId = voiceId || '';
    req.body.voiceSampleAssetId = voiceSampleAssetId || '';

    if (!req.supabase && hasDatabase()) {
      const asset = await uploadToDatabase(req, file, 'subject', slug);
      return res.json({ success: true, asset: fileToAsset(asset) });
    }
    if (req.supabase) {
      const asset = await uploadToSupabase(req, file, 'subject', slug);
      const signedUrl = await getSignedUrl(req.supabase, asset.storage_path);
      return res.json({ success: true, asset: { type: 'subject', slug: asset.id, name: asset.name, path: signedUrl } });
    }

    const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
    const outDir = path.join(ASSETS_DIR, 'tenants', tenantSlug, 'subjects', slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(file.path, path.join(outDir, file.originalname));
    fs.writeFileSync(path.join(outDir, 'ai-context.json'), JSON.stringify({ voiceId: voiceId || '', voiceSampleAssetId: voiceSampleAssetId || '', parentCharacterSlug: req.body.parentCharacterSlug || '' }, null, 2));
    res.json({ success: true, asset: { type: 'subject', slug, name: name || 'New agent', path: `/assets/tenants/${tenantSlug}/subjects/${slug}/${file.originalname}` } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function downloadRemoteImage(req, imageUrl, name) {
  if (/^data:image\//i.test(imageUrl || '')) {
    return imageDataUrlToFile(req, imageUrl, name);
  }
  if (String(imageUrl || '').startsWith('/api/assets/file/')) {
    const id = String(imageUrl).split('/api/assets/file/')[1]?.split(/[?#]/)[0];
    const asset = await getAssetFile(req.tenant.slug || req.tenant.id, id);
    if (!asset) throw new Error('Saved image asset was not found.');
    const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
    const dir = path.join(ASSETS_DIR, 'remote-downloads', tenantSlug);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(asset.file_name) || mimeToExt(asset.mime_type);
    const originalname = `${cleanSlug(name) || 'generated'}-${Date.now()}${ext}`;
    const filePath = path.join(dir, originalname);
    fs.writeFileSync(filePath, asset.file_data);
    return { path: filePath, originalname, mimetype: asset.mime_type || 'image/png', size: Number(asset.size_bytes || asset.file_data.length) };
  }
  if (!/^https?:\/\//i.test(imageUrl || '')) throw new Error('Image URL must be a public URL, data image, or saved Bloom Studio asset.');
  const response = await fetch(imageUrl, { timeout: 45000 });
  if (!response.ok) throw new Error(`Could not download generated image: ${response.status}`);
  const contentType = response.headers.get('content-type') || 'image/png';
  if (!contentType.startsWith('image/')) throw new Error('Generated URL did not return an image.');
  const ext = contentType.includes('jpeg') ? '.jpg' : contentType.includes('webp') ? '.webp' : '.png';
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  const dir = path.join(ASSETS_DIR, 'remote-downloads', tenantSlug);
  fs.mkdirSync(dir, { recursive: true });
  const originalname = `${cleanSlug(name) || 'generated'}-${Date.now()}${ext}`;
  const filePath = path.join(dir, originalname);
  const buffer = await response.buffer();
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, originalname, mimetype: contentType, size: buffer.length };
}

function imageDataUrlToFile(req, dataUrl, name) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Generated data image is invalid.');
  const mimetype = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  const dir = path.join(ASSETS_DIR, 'remote-downloads', tenantSlug);
  fs.mkdirSync(dir, { recursive: true });
  const originalname = `${cleanSlug(name) || 'generated'}-${Date.now()}${mimeToExt(mimetype)}`;
  const filePath = path.join(dir, originalname);
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, originalname, mimetype, size: buffer.length };
}

function cleanSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getLocalAudioFile(req, slug) {
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  const dir = path.join(ASSETS_DIR, 'tenants', tenantSlug, 'audio', slug);
  if (!fs.existsSync(dir)) throw new Error('Audio asset not found.');
  const file = fs.readdirSync(dir).find(name => !name.endsWith('.json'));
  if (!file) throw new Error('Audio asset has no file.');
  return path.join(dir, file);
}

function getLocalAssetFile(req, type, slug) {
  const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
  const dir = path.join(ASSETS_DIR, 'tenants', tenantSlug, type, slug);
  if (!fs.existsSync(dir)) throw new Error('Asset not found.');
  const file = fs.readdirSync(dir).find(name => !name.endsWith('.json'));
  if (!file) throw new Error('Asset has no file.');
  return path.join(dir, file);
}

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
        voiceSampleAssetId: req.body.voiceSampleAssetId || '',
        parentCharacterSlug: req.body.parentCharacterSlug || ''
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
  if (!req.supabase && hasDatabase()) {
    try {
      const asset = await uploadToDatabase(req, req.file, 'product', slug);
      return res.json({ success: true, asset: fileToAsset(asset) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
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
  if (!req.supabase && hasDatabase()) {
    try {
      const asset = await uploadToDatabase(req, req.file, 'subject', slug);
      return res.json({ success: true, asset: fileToAsset(asset) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
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
  if (!req.supabase && hasDatabase()) {
    try {
      const asset = await uploadToDatabase(req, req.file, 'audio', slug);
      return res.json({ success: true, asset: fileToAsset(asset) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
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

router.post('/:type/:slug/temp-url', async (req, res) => {
  try {
    const { type, slug } = req.params;
    if (!['products', 'subjects', 'audio', 'outputs', 'videos'].includes(type)) {
      return res.status(400).json({ error: 'Invalid asset type' });
    }

    let filePath = '';
    if (!req.supabase && hasDatabase()) {
      const asset = await getAssetFile(req.tenant.slug || req.tenant.id, slug, singularType(type));
      if (!asset) return res.status(404).json({ error: 'Asset not found.' });
      const tenantSlug = req.tenant?.slug || req.tenant?.id || 'default';
      const dir = path.join(ASSETS_DIR, 'temp-asset-url', tenantSlug, type);
      fs.mkdirSync(dir, { recursive: true });
      filePath = path.join(dir, `${Date.now()}-${asset.file_name.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
      fs.writeFileSync(filePath, asset.file_data);
    } else if (req.supabase) {
      const { data: asset, error } = await req.supabase
        .from('ugc_assets')
        .select('*')
        .eq('tenant_id', req.tenant.id)
        .eq('id', slug)
        .eq('type', singularType(type))
        .single();
      if (error) throw error;
      const signedUrl = await getSignedUrl(req.supabase, asset.storage_path, 10 * 60);
      return res.json({ success: true, url: signedUrl, expiresIn: '10 minutes' });
    } else {
      filePath = type === 'audio' ? getLocalAudioFile(req, slug) : getLocalAssetFile(req, type, slug);
    }

    const url = await uploadToTempHost(filePath);
    res.json({ success: true, url, expiresIn: 'temporary' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an asset folder
router.delete('/:type/:slug', async (req, res) => {
  const { type, slug } = req.params;
  if (!['products', 'subjects', 'audio', 'outputs', 'videos'].includes(type)) {
    return res.status(400).json({ error: 'Invalid asset type' });
  }
  if (!req.supabase && hasDatabase()) {
    try {
      await initUgcStore();
      const { rowCount } = await query(
        'delete from public.ugc_asset_files where tenant_slug = $1 and type = $2 and id::text = $3',
        [req.tenant.slug || req.tenant.id, singularType(type), slug]
      );
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      if (type === 'videos') {
        await query(
          `delete from public.ugc_video_jobs
           where tenant_slug = $1
             and (
               metadata->>'assetId' = $2
               or metadata->>'localPath' = $3
             )`,
          [req.tenant.slug || req.tenant.id, slug, `/api/assets/file/${slug}`]
        );
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
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
    if (!req.supabase && hasDatabase()) {
      const asset = await getAssetFile(req.tenant.slug || req.tenant.id, slug, singularType(type));
      if (!asset) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true, url: `/api/assets/file/${asset.id}`, expiresIn: 'session' });
    }
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
  if (!req.supabase && hasDatabase()) {
    try {
      await initUgcStore();
      // Read only metadata — no need to pull file_data bytea
      const { rows: existingRows } = await query(
        `select id, tenant_slug, type, name, file_name, mime_type, size_bytes, metadata, created_at
         from public.ugc_asset_files
         where tenant_slug = $1 and id::text = $2 and type = 'subject' limit 1`,
        [req.tenant.slug || req.tenant.id, slug]
      );
      if (!existingRows[0]) return res.status(404).json({ error: 'Character not found' });
      const existing = existingRows[0];
      const metadata = {
        ...(existing.metadata || {}),
        voiceId: req.body.voiceId || '',
        voiceSampleAssetId: req.body.voiceSampleAssetId || ''
      };
      // Update and return without file_data
      const { rows } = await query(
        `update public.ugc_asset_files
         set metadata = $1::jsonb, updated_at = now()
         where tenant_slug = $2 and id::text = $3 and type = 'subject'
         returning id, tenant_slug, type, name, file_name, mime_type, size_bytes, metadata, created_at`,
        [JSON.stringify(metadata), req.tenant.slug || req.tenant.id, slug]
      );
      return res.json({ success: true, asset: fileToAsset(rows[0]) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
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
