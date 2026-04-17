const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../services/logger');
const { estimateCost, uploadToTempHost, submitGeneration } = require('../services/seedance');
const { addJob } = require('../services/poller');
const templates = require('../templates');

const router = express.Router();
const BRANDS_DIR = path.join(__dirname, '..', '..', 'config', 'brands');
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

// Estimate cost for a batch
router.post('/estimate', (req, res) => {
  const { variants, duration, resolution, model } = req.body;
  const count = variants || 1;
  const dur = duration || 15;
  const mod = model || 'seedance2-fast';
  const rez = resolution || '720p';

  const perVideo = estimateCost(mod, rez, dur);
  const total = +(perVideo * count).toFixed(3);

  res.json({
    perVideo,
    total,
    count,
    duration: dur,
    resolution: rez,
    model: mod
  });
});

// Generate A/B test variants
router.post('/ab-test', async (req, res) => {
  try {
    const {
      brandSlug, formats, duration, resolution, model,
      aspectRatio, subjectSlug, audioSlug, customPrompts, webhookUrl
    } = req.body;

    if (!brandSlug) return res.status(400).json({ error: 'brandSlug required' });

    // Load brand
    const brandPath = path.join(BRANDS_DIR, `${brandSlug}.json`);
    if (!fs.existsSync(brandPath)) return res.status(404).json({ error: 'Brand not found' });
    const brand = JSON.parse(fs.readFileSync(brandPath, 'utf-8'));

    const dur = duration || 15;
    const rez = resolution || '720p';
    const mod = model || 'seedance2-fast';
    const ratio = aspectRatio || '9:16';
    const selectedFormats = formats || ['ugc', 'podcast', 'lifestyle', 'tiktok-greenscreen'];

    // Collect asset URLs (upload to temp host)
    const assetUrls = {};

    // Product image
    const productDir = path.join(ASSETS_DIR, 'products', brandSlug);
    if (fs.existsSync(productDir)) {
      const files = fs.readdirSync(productDir).filter(f => !f.endsWith('.json'));
      if (files.length > 0) {
        assetUrls.product = await uploadToTempHost(path.join(productDir, files[0]));
      }
    }

    // Subject image
    if (subjectSlug) {
      const subjectDir = path.join(ASSETS_DIR, 'subjects', subjectSlug);
      if (fs.existsSync(subjectDir)) {
        const files = fs.readdirSync(subjectDir).filter(f => !f.endsWith('.json'));
        if (files.length > 0) {
          assetUrls.subject = await uploadToTempHost(path.join(subjectDir, files[0]));
        }
      }
    }

    // Audio
    if (audioSlug) {
      const audioDir = path.join(ASSETS_DIR, 'audio', audioSlug);
      if (fs.existsSync(audioDir)) {
        const files = fs.readdirSync(audioDir).filter(f => !f.endsWith('.json'));
        if (files.length > 0) {
          assetUrls.audio = await uploadToTempHost(path.join(audioDir, files[0]));
        }
      }
    }

    // Generate variants from templates
    const batchId = uuidv4().slice(0, 8);
    const variants = [];
    let variantNum = 1;

    for (const format of selectedFormats) {
      const templateFn = templates[format];
      if (!templateFn) continue;

      // Generate 2 variants per format
      for (let i = 0; i < 2; i++) {
        const promptData = templateFn(brand, variantNum, i);
        // WaveSpeed-formatted payload
        // If we have a subject image -> image-to-video with subject as start frame
        // If no subject but have product -> image-to-video with product
        // Otherwise fall back to text-to-video with references
        const hasImage = assetUrls.subject || assetUrls.product;
        const payload = {
          model: mod, // 'seedance2-fast' | 'seedance2-standard'
          prompt: promptData.prompt,
          duration: dur,
          resolution: rez,
          aspect_ratio: ratio
        };

        if (hasImage) {
          payload.image = assetUrls.subject || assetUrls.product;
          // If we have BOTH, pass product as last_image so it appears in scene
          if (assetUrls.subject && assetUrls.product) {
            payload.last_image = assetUrls.product;
          }
        } else {
          // No images — use text-to-video
          payload.model = 'seedance2-t2v';
        }

        if (assetUrls.audio) {
          // Audio only supported on text-to-video as reference_audios
          payload.reference_audios = [assetUrls.audio];
        }

        const cost = estimateCost(mod, rez, dur);

        variants.push({
          variantNum,
          format,
          variation: i + 1,
          prompt: promptData.prompt,
          script: promptData.script,
          timeline: promptData.timeline,
          payload,
          estimatedCost: cost
        });
        variantNum++;
      }
    }

    const totalCost = variants.reduce((sum, v) => sum + v.estimatedCost, 0).toFixed(2);

    res.json({
      batchId,
      brandSlug,
      totalVariants: variants.length,
      estimatedTotalCost: `$${totalCost}`,
      assetUrls,
      variants,
      status: 'preview',
      message: 'Review variants and POST to /api/generate/submit to execute'
    });

  } catch (err) {
    logger.error('AB test generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submit approved variants for generation
router.post('/submit', async (req, res) => {
  try {
    const { batchId, variants } = req.body;
    if (!variants || !variants.length) return res.status(400).json({ error: 'No variants to submit' });

    const results = [];
    const delayMs = 5000; // 5 second delay between submissions

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];

      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      try {
        const result = await submitGeneration(variant.payload);
        addJob(result.request_id, {
          batchId: batchId || 'manual',
          brandSlug: variant.brandSlug || 'unknown',
          variant: `v${variant.variantNum || i + 1}`,
          format: variant.format,
          prompt: variant.prompt,
          estimatedCost: variant.estimatedCost
        });

        results.push({
          variantNum: variant.variantNum,
          format: variant.format,
          requestId: result.request_id,
          status: 'submitted'
        });

        logger.info(`Variant ${variant.variantNum} submitted`, { requestId: result.request_id });
      } catch (err) {
        results.push({
          variantNum: variant.variantNum,
          format: variant.format,
          error: err.message,
          status: 'failed'
        });
      }
    }

    res.json({
      batchId,
      submitted: results.filter(r => r.status === 'submitted').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    });

  } catch (err) {
    logger.error('Submit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Quick single generation
router.post('/single', async (req, res) => {
  try {
    const { prompt, imageUrl, audioUrl, duration, resolution, model, aspectRatio, webhookUrl } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const payload = {
      model: model || 'seedance2-fast',
      prompt,
      duration: duration || 5,
      resolution: resolution || '720p',
      aspect_ratio: aspectRatio || '9:16'
    };

    if (imageUrl) {
      payload.image = imageUrl;
    } else {
      payload.model = 'seedance2-t2v';
    }
    if (audioUrl) payload.reference_audios = [audioUrl];

    const result = await submitGeneration(payload);
    const cost = estimateCost(model || 'seedance2-fast', resolution || '720p', duration || 5);

    addJob(result.request_id, {
      batchId: 'single',
      variant: 'single',
      format: 'custom',
      prompt,
      estimatedCost: cost
    });

    res.json({
      requestId: result.request_id,
      estimatedCost: `$${cost}`,
      status: 'submitted'
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
