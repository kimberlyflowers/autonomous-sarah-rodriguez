// /api/clone — Seedance 2.0 video clone via Evolink (primary) / WaveSpeed (fallback)
// This is the dedicated endpoint for the Video Clone feature.
// It does NOT use RunPod — RunPod only has Seedance 1.5.
//
// POST /api/clone/generate   — submit a clone generation
// GET  /api/clone/status/:id — poll for result

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { submitCloneGeneration, checkCloneStatus, estimateCost } = require('../services/evolink');
const { getSupabaseConfig } = require('../services/supabase');
const { logger } = require('../services/logger');

// Resolve @slug → { id, image_url } from ugc_characters
async function resolveCharacterSlug(slug) {
  const { url, anonKey, available } = getSupabaseConfig();
  if (!available) return null;
  try {
    const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('ugc_characters')
      .select('id, name, image_url')
      .eq('slug', slug.toLowerCase())
      .eq('active', true)
      .single();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

// Strip all resolved @slug tags from prompt text
function stripSlugTags(prompt, slugs) {
  let clean = prompt;
  for (const slug of slugs) {
    clean = clean.replace(new RegExp(`@${slug}\\b`, 'gi'), '');
  }
  return clean.replace(/\s{2,}/g, ' ').trim();
}

const router = express.Router();

// Upcharge multiplier — cost to user vs cost to us
const UPCHARGE = 1.5; // 50% margin

/**
 * POST /api/clone/generate
 *
 * Body:
 *   prompt        string   (required) — Seedance clone prompt
 *   referenceUrl  string   — source video URL to clone (social media or direct .mp4)
 *   productUrl    string   — product image URL
 *   avatarUrl     string   — avatar/creator image URL
 *   duration      number   — 4–15 seconds per clip (default 15)
 *   quality       string   — '480p' | '720p' | '1080p' (default '720p')
 *   aspectRatio   string   — '9:16' | '16:9' (default '9:16')
 *   generateAudio boolean  (default true)
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      prompt,
      referenceUrl,
      productUrl,
      avatarUrl,
      duration = 15,
      quality = '720p',
      aspectRatio = '9:16',
      generateAudio = true
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    if (!productUrl && !referenceUrl) {
      return res.status(400).json({ error: 'Provide at least a productUrl (image anchor) or referenceUrl (video to clone).' });
    }

    // Resolve @slug mentions (e.g. @mia, @naomi) → character image URL
    let resolvedAvatarUrl = avatarUrl;
    let cleanPrompt = prompt;
    const slugMatches = [...new Set((prompt.match(/@([a-z][a-z0-9-]+)/gi) || []).map(m => m.slice(1).toLowerCase()))];
    if (slugMatches.length > 0) {
      for (const slug of slugMatches) {
        const char = await resolveCharacterSlug(slug);
        if (char) {
          resolvedAvatarUrl = resolvedAvatarUrl || char.image_url;
          logger.info(`Resolved @${slug} → ${char.name} (${char.id})`);
        }
      }
      cleanPrompt = stripSlugTags(prompt, slugMatches);
    }

    // Build image_urls: product first, avatar second (both used as visual anchors)
    const imageUrls = [productUrl, resolvedAvatarUrl].filter(u => u && /^https?:\/\//i.test(u));

    // Build video_urls: the reference video to clone style from
    // If it's a social media URL (not a direct .mp4), Evolink's reference-to-video
    // model accepts it and handles the download server-side.
    const videoUrls = referenceUrl ? [referenceUrl] : [];

    const durationSec = Math.min(15, Math.max(4, Number(duration) || 15));
    const costRaw = estimateCost(durationSec, quality);
    const costUser = +(costRaw * UPCHARGE).toFixed(2);

    const result = await submitCloneGeneration({
      prompt: cleanPrompt,
      imageUrls,
      videoUrls,
      duration: durationSec,
      quality,
      aspectRatio,
      generateAudio
    });

    logger.info('Clone generation submitted', {
      requestId: result.request_id,
      provider: result.provider,
      durationSec,
      quality
    });

    res.json({
      success: true,
      requestId: result.request_id,
      provider: result.provider,
      status: result.status || 'pending',
      estimatedCostUs: `$${costRaw}`,
      estimatedCostUser: `$${costUser}`,
      durationSec
    });
  } catch (err) {
    logger.error('Clone generate error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/clone/status/:requestId
 * requestId format: 'evolink_{taskId}' or 'wavespeed_{taskId}'
 */
router.get('/status/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    if (!requestId) return res.status(400).json({ error: 'Missing requestId' });

    const result = await checkCloneStatus(requestId);

    res.json({
      success: true,
      requestId,
      provider: result.provider,
      status: result.status,         // 'pending' | 'processing' | 'completed' | 'failed'
      videoUrl: result.video_url,    // populated when completed
      progress: result.progress || 0,
      error: result.error || null
    });
  } catch (err) {
    logger.error('Clone status error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
