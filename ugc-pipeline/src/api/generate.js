const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../services/logger');
const { estimateCost, uploadToTempHost, submitGeneration } = require('../services/seedance');
const { addJob } = require('../services/poller');
const { submitInfiniteTalkHdJob } = require('../services/infinitetalkHd');
const { submitMuseTalkVideoJob, submitWanAnimateVideoJob } = require('../services/runpodVideo');
const { downloadSourceVideo, getRunpodToolConfig } = require('../services/runpodTools');
const { downloadWithYtDlp } = require('../services/localDownloader');
const templates = require('../templates');

const router = express.Router();
const BRANDS_DIR = path.join(__dirname, '..', '..', 'config', 'brands');
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

function isDirectVideoUrl(value = '') {
  return /^https?:\/\/.+\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i.test(String(value));
}

async function prepareCampaignReferenceVideoUrl(sourceUrl, maxDuration = 180) {
  const url = String(sourceUrl || '').trim();
  if (!url) return '';
  if (/^data:video\//i.test(url) || isDirectVideoUrl(url)) return url;

  const preferLocalDownloader = String(process.env.USE_LOCAL_DOWNLOADER || 'true') !== 'false';
  if (preferLocalDownloader) {
    const downloaded = await downloadWithYtDlp(url, {
      audioOnly: false,
      maxDuration: Number(maxDuration || 180),
      timeoutMs: Number(process.env.LOCAL_DOWNLOADER_TIMEOUT_MS || 120000)
    });
    return downloaded.url;
  }

  const downloaderConfig = getRunpodToolConfig('DOWNLOADER');
  const downloaderReady = !!downloaderConfig.apiKey && !!(downloaderConfig.endpointId || downloaderConfig.endpointUrl);
  if (!downloaderReady) return url;
  const downloaded = await downloadSourceVideo(url, {
    audioOnly: false,
    maxDuration: Number(maxDuration || 180)
  });
  return downloaded.url;
}

function normalizeSceneEngine(engine = '') {
  const value = String(engine || '').trim();
  if (value === 'wan-animate') return 'wan-animate';
  if (value === 'infinitetalk-hd') return 'infinitetalk-hd';
  if (value === 'musetalk') return 'musetalk';
  if (value === 'seedance2-standard') return 'seedance2-standard';
  return 'seedance2-fast';
}

function normalizeProviderDuration(seconds = 5) {
  const targetDuration = Math.max(1, Number(seconds || 5));
  return targetDuration <= 5 ? 5 : 10;
}

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
          // If we have BOTH, pass product as last_image so it appears in scene.
          if (assetUrls.subject && assetUrls.product) payload.last_image = assetUrls.product;
        } else {
          throw new Error('RunPod Seedance 1.5 Pro is image-to-video only. Choose a subject or product image first.');
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
    const {
      prompt,
      imageUrl,
      audioUrl,
      duration,
      resolution,
      model,
      aspectRatio,
      webhookUrl,
      lastImageUrl,
      productImageUrl,
      referenceImageUrls,
      forceMultiReference,
      batchId,
      variant,
      format
    } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const payload = {
      model: model || 'seedance2-fast',
      prompt,
      duration: duration || 5,
      resolution: resolution || '720p',
      aspect_ratio: aspectRatio || '9:16'
    };

    const references = Array.isArray(referenceImageUrls)
      ? referenceImageUrls.filter(url => /^https?:\/\//i.test(String(url || '')))
      : [];

    if (imageUrl) {
      payload.image = imageUrl;
      const sharedReferenceImage = productImageUrl || lastImageUrl;
      if (sharedReferenceImage) payload.last_image = sharedReferenceImage;
    } else if (references.length) {
      payload.image = references[0];
      if (references[1]) payload.last_image = references[1];
    } else {
      return res.status(400).json({ error: 'RunPod Seedance 1.5 Pro is image-to-video only. Add an image URL first.' });
    }
    if (audioUrl) payload.reference_audios = [audioUrl];

    const result = await submitGeneration(payload);
    const cost = estimateCost(model || 'seedance2-fast', resolution || '720p', duration || 5);

    const imagePreviewUrl = payload.image || references[0] || '';

    addJob(result.request_id, {
      batchId: batchId || 'single',
      variant: variant || 'single',
      format: format || 'custom',
      prompt,
      estimatedCost: cost,
      imagePreviewUrl,
      provider: result.provider || 'runpod-seedance',
      tenantId: req.tenant?.slug || req.tenant?.id || 'default'
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

router.post('/campaign-scenes', async (req, res) => {
  try {
    const {
      campaignId,
      prompt,
      characters,
      productImageUrl,
      environmentImageUrl,
      scenes,
      resolution,
      aspectRatio,
      outputMode,
      sourceTrendId,
      sourceTrendUrl,
      sourceTrendTitle,
      sourceTrendHook,
      sourceTrendThumbnail,
      workflow,
      assembly,
      cta
    } = req.body;

    const selectedCharacters = Array.isArray(characters) ? characters : [];
    const selectedScenes = Array.isArray(scenes) ? scenes : [];
    if (!selectedCharacters.length) return res.status(400).json({ error: 'At least one character is required.' });
    if (!selectedScenes.length) return res.status(400).json({ error: 'At least one approved scene is required.' });
    if (outputMode === 'together' && selectedCharacters.length > 1) {
      return res.status(400).json({
        error: 'RunPod Seedance 1.5 Pro I2V accepts one source character image per video. Use "Separate video per character" or make a composite image first for multi-character scenes.'
      });
    }

    const id = campaignId || `campaign-${Date.now()}`;
    const submitted = [];
    const failed = [];
    const tenantId = req.tenant?.slug || req.tenant?.id || 'default';
    const groups = outputMode === 'together'
      ? [{
          batchId: `${id}-group`,
          label: selectedCharacters.map(item => item.name).filter(Boolean).join(' + ') || 'Selected characters',
          characters: selectedCharacters
        }]
      : selectedCharacters.map((character, index) => ({
          batchId: `${id}-c${index + 1}`,
          label: character.name || `Character ${index + 1}`,
          characters: [character]
        }));

    for (const group of groups) {
      const characterImages = group.characters
        .map(character => character.imageUrl || character.url || '')
        .filter(url => /^https?:\/\//i.test(url));
      if (characterImages.length !== group.characters.length) {
        failed.push({ character: group.label, error: 'Every selected character needs an absolute image URL.' });
        continue;
      }
      const primaryImageUrl = characterImages[0];
      const characterNames = group.characters.map(character => character.name).filter(Boolean).join(', ') || group.label;

      for (let sceneIndex = 0; sceneIndex < selectedScenes.length; sceneIndex++) {
        const scene = selectedScenes[sceneIndex] || {};
        const targetDuration = Math.max(1, Number(scene.duration || 5));
        const providerDuration = normalizeProviderDuration(targetDuration);
        const engine = normalizeSceneEngine(scene.engine);
        const model = engine === 'seedance2-standard' ? 'seedance2-standard' : 'seedance2-fast';
        const scenePrompt = [
          `Campaign direction: ${prompt || 'Create a trend-style UGC campaign.'}`,
          outputMode === 'together'
            ? `Characters in the same video: ${characterNames}. Keep each identity distinct and compose them naturally in one scene.`
            : `Character: ${characterNames}.`,
          `Scene ${sceneIndex + 1}: ${scene.title || 'Untitled scene'}.`,
          scene.pacing ? `Pacing: ${scene.pacing}.` : '',
          scene.script ? `Spoken/script beat: ${scene.script}` : '',
          scene.visualPrompt || '',
          cta ? `Required call to action: ${cta}` : '',
          sourceTrendId ? `Source trend ID: ${sourceTrendId}. Recreate structure and pacing, not the original creator identity.` : '',
          engine === 'wan-animate' ? 'Use the reference video motion and timing as the choreography map while replacing the creator/product identity.' : ''
        ].filter(Boolean).join('\n');

        try {
          let requestId = '';
          let provider = 'runpod-seedance';
          let rawProviderId = '';
          let cost = estimateCost(model, resolution || '720p', providerDuration);

          if (engine === 'wan-animate') {
            const referenceVideoUrl = await prepareCampaignReferenceVideoUrl(
              scene.referenceVideoUrl || scene.sourceTrendUrl || sourceTrendUrl || '',
              Math.max(providerDuration, Number(scene.end || 0), 12)
            );
            if (!referenceVideoUrl) throw new Error('Wan Animate scene needs a trend/reference video URL.');
            const motion = await submitWanAnimateVideoJob({
              imageUrl: primaryImageUrl,
              videoUrl: referenceVideoUrl,
              prompt: scenePrompt,
              negativePrompt: scene.negativePrompt,
              aspectRatio: aspectRatio || '9:16',
              steps: scene.steps || 6,
              seed: scene.seed || 12345,
              cfg: scene.cfg || 1
            });
            rawProviderId = motion.id;
            requestId = `wananimate_${motion.id}`;
            provider = 'wan-animate';
            cost = Number(scene.estimatedCost || 0);
          } else if (engine === 'infinitetalk-hd') {
            const talk = await submitInfiniteTalkHdJob({
              imageUrl: primaryImageUrl,
              audioUrl: scene.audioUrl || scene.voiceUrl || '',
              quality: resolution === '1080p' ? '1080p' : '720p',
              steps: scene.steps || 40,
              seed: scene.seed ?? -1
            });
            rawProviderId = talk.id;
            requestId = `infinitetalk_${talk.id}`;
            provider = 'infinitetalk-hd';
            cost = Number(scene.estimatedCost || 0);
          } else if (engine === 'musetalk') {
            const talk = await submitMuseTalkVideoJob({
              imageUrl: primaryImageUrl,
              audioUrl: scene.audioUrl || scene.voiceUrl || '',
              prompt: scenePrompt,
              fps: scene.fps || 25,
              bboxShift: scene.bboxShift || scene.bbox_shift || 0
            });
            rawProviderId = talk.id;
            requestId = `musetalk_${talk.id}`;
            provider = 'musetalk';
            cost = Number(scene.estimatedCost || 0);
          } else {
            const payload = {
              model,
              prompt: scenePrompt,
              image: primaryImageUrl,
              last_image: /^https?:\/\//i.test(String(productImageUrl || '')) ? productImageUrl : undefined,
              duration: providerDuration,
              resolution: resolution || '720p',
              aspect_ratio: aspectRatio || '9:16',
              camera_fixed: model === 'seedance2-standard'
            };
            const result = await submitGeneration(payload);
            requestId = result.request_id;
            rawProviderId = result.raw?.id || result.request_id;
            provider = result.provider || 'runpod-seedance';
          }

          addJob(requestId, {
            batchId: group.batchId,
            campaignId: id,
            brandSlug: 'trend-campaign',
            variant: `${group.label} scene ${sceneIndex + 1}`,
            characterName: group.label,
            format: 'trend-scene',
            prompt: scenePrompt,
            campaignPrompt: prompt || '',
            estimatedCost: cost,
            imagePreviewUrl: primaryImageUrl,
            provider,
            providerJobId: rawProviderId,
            rawRequestId: rawProviderId,
            sceneIndex: sceneIndex + 1,
            totalScenes: selectedScenes.length,
            sceneTitle: scene.title || `Scene ${sceneIndex + 1}`,
            sceneStart: scene.start,
            sceneEnd: scene.end,
            sceneDuration: providerDuration,
            targetDuration,
            sourceTrendId,
            sourceTrendUrl,
            sourceTrendTitle,
            sourceTrendHook,
            sourceTrendThumbnail,
            workflowSchema: workflow?.schema || '',
            frameWorkflowSchema: workflow?.frameWorkflow?.schema || '',
            assemblyMethod: assembly?.method || workflow?.assembly?.method || 'concat_in_scene_order',
            preserveSourceTiming: Boolean(assembly?.preserveSourceTiming || workflow?.assembly?.preserveSourceTiming),
            sourceStartFrame: scene.sourceStartFrame,
            sourceEndFrame: scene.sourceEndFrame,
            sourceKeyFrame: scene.sourceKeyFrame,
            aspectRatio: aspectRatio || '9:16',
            resolution: resolution || '720p',
            audioStatus: provider === 'runpod-seedance' ? 'silent' : undefined,
            tenantId
          });
          submitted.push({
            character: group.label,
            sceneIndex: sceneIndex + 1,
            requestId,
            provider,
            batchId: group.batchId,
            status: 'submitted',
            estimatedCost: cost
          });
        } catch (error) {
          failed.push({
            character: group.label,
            sceneIndex: sceneIndex + 1,
            error: error.message
          });
        }

        await new Promise(resolve => setTimeout(resolve, 650));
      }
    }

    res.json({
      campaignId: id,
      submitted: submitted.length,
      failed: failed.length,
      batches: [...new Set(submitted.map(item => item.batchId))],
      results: submitted,
      errors: failed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wan 2.5 clip endpoint for Remotion pipelines.
// Remotion should call this per scene/clip, then assemble returned request IDs
// or downloaded clips into the final edited video.
router.post('/wan25/remotion-clip', async (req, res) => {
  try {
    const {
      prompt,
      imageUrl,
      audioUrl,
      duration,
      resolution,
      aspectRatio,
      negativePrompt,
      sceneId,
      size,
      webhookUrl
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const model = imageUrl ? 'wan25-i2v' : 'wan25-t2v';
    const dur = Number(duration || (imageUrl ? 5 : 10));
    const payload = {
      model,
      prompt,
      negative_prompt: negativePrompt || '',
      image: imageUrl || undefined,
      audio: audioUrl || undefined,
      duration: dur,
      resolution: resolution || '720p',
      aspect_ratio: aspectRatio || '16:9',
      size,
      webhookUrl
    };

    const result = await submitGeneration(payload);
    const cost = estimateCost(model, resolution || '720p', dur);
    addJob(result.request_id, {
      batchId: 'remotion-wan25',
      brandSlug: req.body.brandSlug || 'remotion',
      variant: sceneId || 'scene',
      format: 'wan25-remotion-clip',
      prompt,
      estimatedCost: cost,
      tenantId: req.tenant?.slug || req.tenant?.id || 'default'
    });

    res.json({
      provider: 'wavespeed',
      model,
      sceneId: sceneId || null,
      requestId: result.request_id,
      estimatedCost: `$${cost}`,
      status: 'submitted',
      constraints: imageUrl
        ? 'Wan 2.5 image-to-video clips support 3-10 seconds.'
        : 'Wan 2.5 text-to-video clips support 5 or 10 seconds.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
