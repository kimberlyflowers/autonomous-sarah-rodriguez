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
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || mimeToExt(file.mimetype);
      cb(null, `${file.fieldname}-${Date.now()}-${uuidv4()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

function mimeToExt(mimeType = '') {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.png';
}

function getConfig() {
  return {
    endpointId: process.env.RUNPOD_NANO_BANANA_ENDPOINT_ID || process.env.NANO_BANANA_ENDPOINT_ID || 'google-nano-banana-2-edit',
    endpointUrl: process.env.RUNPOD_NANO_BANANA_ENDPOINT_URL || process.env.NANO_BANANA_ENDPOINT_URL || '',
    apiKey: process.env.RUNPOD_NANO_BANANA_API_KEY || process.env.RUNPOD_API_KEY || '',
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    timeoutMs: Number(process.env.NANO_BANANA_RUNSYNC_TIMEOUT_MS || process.env.NANO_BANANA_TIMEOUT_MS || 300000)
  };
}

function normalizeImageProvider(value = '') {
  const raw = String(value || '').trim();
  if (raw.startsWith('openrouter:')) {
    return { provider: 'openrouter', model: raw.replace(/^openrouter:/, '') };
  }
  if (raw.startsWith('runpod:')) {
    return { provider: 'runpod', model: raw.replace(/^runpod:/, '') };
  }
  return { provider: raw === 'openrouter' ? 'openrouter' : 'runpod', model: '' };
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

async function resolveOptionalImageUrl(req, files, field, type) {
  if (files?.[field]?.[0]) return uploadToTempHost(files[field][0].path);

  const assetId = req.body[`${field}AssetId`];
  if (assetId) return assetToTempUrl(req, assetId, type);

  const publicUrl = req.body[`${field}Url`];
  if (/^https?:\/\//i.test(publicUrl || '')) return publicUrl;
  if (publicFileFromUrl(publicUrl)) return absolutePublicUrl(req, publicUrl);

  return '';
}

function normalizeToArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function resolveReferenceImages(req, files) {
  const images = [];
  const uploads = (files?.references || []).slice(0, 5);
  for (const file of uploads) images.push(await uploadToTempHost(file.path));

  const assetIds = normalizeToArray(req.body.referenceAssetIds).slice(0, 5 - images.length);
  for (const assetId of assetIds) images.push(await assetToTempUrl(req, assetId, 'product'));

  const urls = normalizeToArray(req.body.referenceUrls).slice(0, 5 - images.length);
  for (const url of urls) {
    if (/^https?:\/\//i.test(url || '')) images.push(url);
    else if (publicFileFromUrl(url)) images.push(absolutePublicUrl(req, url));
  }

  return images.slice(0, 5);
}

function normalizeRunPodResult(data) {
  const output = data?.output || data;
  const firstOutput = Array.isArray(output) ? output[0] : null;
  const image =
    firstOutput?.image ||
    firstOutput?.image_url ||
    firstOutput?.url ||
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

function endpointRoot(config) {
  if (config.endpointUrl) {
    return config.endpointUrl
      .replace(/\/runsync(?:\?.*)?$/i, '')
      .replace(/\/run(?:\?.*)?$/i, '')
      .replace(/\/status\/?[^/?]*(?:\?.*)?$/i, '')
      .replace(/\/$/, '');
  }
  return `https://api.runpod.ai/v2/${config.endpointId}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollRunPodImageJob(config, jobId) {
  const root = endpointRoot(config);
  const startedAt = Date.now();
  const pollIntervalMs = Number(process.env.NANO_BANANA_POLL_INTERVAL_MS || 3000);
  let lastStatus = 'IN_QUEUE';
  while (Date.now() - startedAt < config.timeoutMs) {
    const response = await fetch(`${root}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      timeout: 45000
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.detail || `RunPod status request failed: ${response.status}`);
    }
    lastStatus = data.status || lastStatus;
    if (lastStatus === 'COMPLETED') return data;
    if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(lastStatus)) {
      throw new Error(data.error || data.detail || `Nano Banana job ${jobId} ended with ${lastStatus}`);
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Nano Banana job ${jobId} timed out after ${Math.round(config.timeoutMs / 1000)}s. Last status: ${lastStatus}`);
}

function normalizeOpenRouterResult(data) {
  const message = data?.choices?.[0]?.message || {};
  const images = message.images || data?.images || [];
  const image =
    images?.[0]?.image_url?.url ||
    images?.[0]?.url ||
    message?.image_url?.url ||
    message?.image ||
    '';
  return {
    id: data?.id || uuidv4(),
    status: 'COMPLETED',
    image,
    text: message.content || '',
    raw: data
  };
}

function buildRunSyncUrl(config) {
  const baseUrl = config.endpointUrl || `https://api.runpod.ai/v2/${config.endpointId}/runsync`;
  const url = new URL(baseUrl);
  if (!url.searchParams.has('wait')) url.searchParams.set('wait', String(config.timeoutMs));
  return url.toString();
}

async function callOpenRouterImage({ config, prompt, images, aspectRatio, size, model }) {
  const selectedModel = model || 'openai/gpt-5-image-mini';
  const content = [
    { type: 'text', text: prompt },
    ...images.map(url => ({ type: 'image_url', image_url: { url } }))
  ];
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openRouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || 'https://lovely-wonder-production-3c61.up.railway.app',
      'X-OpenRouter-Title': 'Bloom Studio'
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [{ role: 'user', content }],
      modalities: selectedModel.startsWith('openai/') || selectedModel.startsWith('google/')
        ? ['image', 'text']
        : ['image'],
      image_config: {
        aspect_ratio: aspectRatio,
        size
      }
    }),
    timeout: config.timeoutMs
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('OpenRouter image request failed', { status: response.status, data });
    throw new Error(data.error?.message || data.error || data.detail || `OpenRouter image request failed: ${response.status}`);
  }
  const result = normalizeOpenRouterResult(data);
  if (!result.image) {
    console.error('OpenRouter image response missing image data', { id: result.id, raw: data });
    throw new Error('OpenRouter completed but did not return an image. Try a different image model.');
  }
  return result;
}

router.get('/status', (req, res) => {
  const config = getConfig();
  res.json({
    configured: !!(config.endpointId && config.apiKey),
    endpointConfigured: !!config.endpointId,
    apiKeyConfigured: !!config.apiKey,
    openRouterConfigured: !!config.openRouterApiKey,
    endpointId: config.endpointId
  });
});

router.post('/generate', upload.fields([
  { name: 'character', maxCount: 1 },
  { name: 'product', maxCount: 5 },
  { name: 'references', maxCount: 5 }
]), async (req, res) => {
  try {
    const config = getConfig();
    const requested = normalizeImageProvider(req.body.imageProvider || req.body.imageModel || '');
    const useOpenRouter = requested.provider === 'openrouter';
    if (!useOpenRouter && !config.endpointId) {
      return res.status(400).json({
        error: 'Nano Banana endpoint ID is not configured.',
        detail: 'Set RUNPOD_NANO_BANANA_ENDPOINT_ID on Railway so Bloom Studio knows which RunPod serverless endpoint to call.'
      });
    }
    if (!useOpenRouter && !config.apiKey) {
      return res.status(400).json({
        error: 'Nano Banana API key is not configured.',
        detail: 'Set RUNPOD_NANO_BANANA_API_KEY or RUNPOD_API_KEY on Railway.'
      });
    }
    if (useOpenRouter && !config.openRouterApiKey) {
      return res.status(400).json({
        error: 'OpenRouter API key is not configured.',
        detail: 'Set OPENROUTER_API_KEY on Railway before using OpenRouter image models.'
      });
    }

    const characterImage = await resolveOptionalImageUrl(req, req.files, 'character', 'subject');
    const productImage = await resolveOptionalImageUrl(req, req.files, 'product', 'product');
    const referenceImages = await resolveReferenceImages(req, req.files);
    const images = [characterImage, productImage, ...referenceImages].filter(Boolean).slice(0, 5);
    const prompt = req.body.prompt || (images.length
      ? 'Create a polished production-ready image using the provided references. Preserve the important identity, product, setting, or style details while improving lighting and composition.'
      : 'Create a polished production-ready UGC creator image from the prompt.');
    const aspectRatio = req.body.aspectRatio || '9:16';
    const size = req.body.size || '1k';
    if (useOpenRouter) {
      const result = await callOpenRouterImage({
        config,
        prompt,
        images,
        aspectRatio,
        size,
        model: requested.model
      });
      return res.json({ success: true, result: { ...result, provider: 'openrouter', model: requested.model || 'openai/gpt-5-image-mini' } });
    }

    const endpointUrl = buildRunSyncUrl(config);

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: {
          images, // always include — API requires this field even when no reference images
          prompt,
          resolution: size,
          aspect_ratio: aspectRatio,
          output_format: 'png'
        }
      }),
      timeout: config.timeoutMs
    });

    let data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Nano Banana request failed', { status: response.status, data });
      throw new Error(data.error || data.detail || `RunPod request failed: ${response.status}`);
    }
    if (data.status && data.status !== 'COMPLETED') {
      if (!data.id) {
        console.error('Nano Banana did not complete during runsync and returned no job id', { status: data.status, data });
        throw new Error(`Nano Banana returned ${data.status} without a job id, so Bloom Studio could not poll for the finished image.`);
      }
      console.log('Nano Banana runsync returned pending status; polling status endpoint', { status: data.status, id: data.id });
      data = await pollRunPodImageJob(config, data.id);
    }
    const result = normalizeRunPodResult(data);
    if (!result.image) {
      console.error('Nano Banana response missing image URL', { id: result.id, raw: data });
      throw new Error('Nano Banana completed but did not return an image URL. Check the RunPod response output field.');
    }

    res.json({ success: true, result: { ...result, provider: 'runpod', model: requested.model || 'nano-banana' } });
  } catch (error) {
    console.error('Product placement generation failed', { error: error.message });
    res.status(500).json({ error: error.message });
  } finally {
    for (const fileGroup of Object.values(req.files || {})) {
      for (const file of fileGroup) fs.unlink(file.path, () => {});
    }
  }
});

module.exports = router;
