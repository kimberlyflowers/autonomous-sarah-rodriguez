const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { getAssetFile, hasDatabase } = require('../services/postgres');
const { uploadToTempHost } = require('../services/seedance');

const router = express.Router();
const ROOT_DIR = path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.join(ROOT_DIR, 'assets', 'product-placement-uploads');

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }
});

function getConfig() {
  return {
    endpointId: process.env.RUNPOD_NANO_BANANA_ENDPOINT_ID || process.env.NANO_BANANA_ENDPOINT_ID || 'google-nano-banana-2-edit',
    endpointUrl: process.env.RUNPOD_NANO_BANANA_ENDPOINT_URL || process.env.NANO_BANANA_ENDPOINT_URL || '',
    apiKey: process.env.RUNPOD_NANO_BANANA_API_KEY || process.env.RUNPOD_API_KEY || '',
    timeoutMs: Number(process.env.NANO_BANANA_TIMEOUT_MS || 180000)
  };
}

function publicFileFromUrl(url) {
  if (!url || !url.startsWith('/')) return null;
  const filePath = path.join(ROOT_DIR, 'public', url.replace(/^\/+/, ''));
  return filePath.startsWith(path.join(ROOT_DIR, 'public')) && fs.existsSync(filePath) ? filePath : null;
}

function absolutePublicUrl(req, url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith('/')) return '';
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${protocol}://${req.get('host')}${url}`;
}

async function assetToTempUrl(req, assetId, type) {
  if (!assetId) return '';
  if (hasDatabase()) {
    const asset = await getAssetFile(req.tenant.slug || req.tenant.id, assetId, type);
    if (!asset) throw new Error(`Saved ${type} asset was not found.`);
    const dir = path.join(UPLOAD_DIR, 'asset-temp');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}-${asset.file_name.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
    fs.writeFileSync(filePath, asset.file_data);
    return uploadToTempHost(filePath);
  }
  throw new Error('Persistent asset lookup is not configured for product placement.');
}

async function resolveImageUrl(req, files, field, type) {
  if (files?.[field]?.[0]) return uploadToTempHost(files[field][0].path);

  const assetId = req.body[`${field}AssetId`];
  if (assetId) return assetToTempUrl(req, assetId, type);

  const publicUrl = req.body[`${field}Url`];
  if (/^https?:\/\//i.test(publicUrl || '')) return publicUrl;
  if (publicFileFromUrl(publicUrl)) return absolutePublicUrl(req, publicUrl);

  throw new Error(`Choose or upload a ${field === 'character' ? 'character' : 'product'} image first.`);
}

function normalizeRunPodResult(data) {
  const output = data?.output || data;
  const image =
    output?.image ||
    output?.image_url ||
    output?.url ||
    (typeof output?.result === 'string' ? output.result : '') ||
    output?.images?.[0] ||
    output?.result?.image ||
    output?.result?.url ||
    '';
  return {
    id: data?.id || data?.requestId || uuidv4(),
    status: data?.status || 'queued',
    image,
    raw: data
  };
}

async function waitForRunPod(endpointId, apiKey, jobId, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `RunPod status failed: ${response.status}`);
    if (data.status === 'COMPLETED') return normalizeRunPodResult(data);
    if (data.status === 'FAILED' || data.status === 'CANCELLED') throw new Error(data.error || `Nano Banana job ${data.status.toLowerCase()}.`);
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  return { id: jobId, status: 'processing', image: '', raw: { id: jobId } };
}

router.get('/status', (req, res) => {
  const config = getConfig();
  res.json({
    configured: !!(config.endpointId && config.apiKey),
    endpointConfigured: !!config.endpointId,
    apiKeyConfigured: !!config.apiKey,
    endpointId: config.endpointId
  });
});

router.post('/generate', upload.fields([
  { name: 'character', maxCount: 1 },
  { name: 'product', maxCount: 1 }
]), async (req, res) => {
  try {
    const config = getConfig();
    if (!config.endpointId) {
      return res.status(400).json({
        error: 'Nano Banana endpoint ID is not configured.',
        detail: 'Set RUNPOD_NANO_BANANA_ENDPOINT_ID on Railway so Bloom Studio knows which RunPod serverless endpoint to call.'
      });
    }
    if (!config.apiKey) {
      return res.status(400).json({
        error: 'Nano Banana API key is not configured.',
        detail: 'Set RUNPOD_NANO_BANANA_API_KEY or RUNPOD_API_KEY on Railway.'
      });
    }

    const characterImage = await resolveImageUrl(req, req.files, 'character', 'subject');
    const productImage = await resolveImageUrl(req, req.files, 'product', 'product');
    const prompt = req.body.prompt || 'Place the product naturally with the character in a realistic UGC creator scene. Preserve the character identity and make the product look authentic, correctly scaled, and clearly visible.';
    const aspectRatio = req.body.aspectRatio || '9:16';
    const size = req.body.size || '1k';
    const endpointUrl = config.endpointUrl || `https://api.runpod.ai/v2/${config.endpointId}/runsync`;

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: {
          prompt,
          images: [characterImage, productImage],
          image_urls: [characterImage, productImage],
          reference_images: [characterImage, productImage],
          aspect_ratio: aspectRatio,
          resolution: size,
          output_format: 'png',
          tenant: req.tenant.slug || req.tenant.id
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.detail || `RunPod request failed: ${response.status}`);
    const jobId = data.id || data.requestId;
    const result = data.status === 'COMPLETED' || !jobId
      ? normalizeRunPodResult(data)
      : await waitForRunPod(config.endpointId, config.apiKey, jobId, config.timeoutMs);

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    for (const fileGroup of Object.values(req.files || {})) {
      for (const file of fileGroup) fs.unlink(file.path, () => {});
    }
  }
});

module.exports = router;
