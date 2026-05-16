const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { downloadSourceVideo, getRunpodToolConfig, transcribeAudio } = require('../services/runpodTools');
const { downloadWithYtDlp } = require('../services/localDownloader');
const {
  analyzeTrendVideoFile,
  buildFrameWorkflow,
  materializeVideoSource
} = require('../services/trendFrameAnalysis');

const router = express.Router();
const TRENDS_PATH = path.join(__dirname, '..', '..', 'data', 'viral-hooks.json');
const thumbnailCache = new Map();

function loadTrends() {
  if (!fs.existsSync(TRENDS_PATH)) return [];
  return JSON.parse(fs.readFileSync(TRENDS_PATH, 'utf8'));
}

function clampDuration(value, fallback = 12) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(parsed, 6), 60);
}

function buildScenePlan(trend = {}, options = {}) {
  const totalDuration = clampDuration(options.duration || trend.durationSeconds || trend.duration, 12);
  const sceneCount = totalDuration <= 8 ? 3 : totalDuration <= 18 ? 4 : 5;
  const baseLength = totalDuration / sceneCount;
  const sourceUrl = trend.url || '';
  const canMimicMotion = /\/reel\//i.test(sourceUrl) || /\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i.test(sourceUrl);
  const defaultEngine = canMimicMotion ? 'wan-animate' : 'seedance2-fast';
  const hook = trend.hook || 'Use the selected trend structure.';
  const remixPrompt = trend.remixPrompt || 'Match the pacing and visual rhythm, while making the content original for the selected brand.';
  const product = options.productName || 'the selected product';
  const character = options.characterName || 'the selected creator';
  const environment = options.environment || 'a creator-style environment';
  const cta = options.cta || 'take the next step';

  const beats = [
    {
      title: 'Hook frame',
      engine: defaultEngine,
      pacing: 'fast cold open',
      script: hook,
      visualPrompt: `${character} opens with the trend hook in ${environment}. Frame the product naturally without making it feel like a hard ad.`
    },
    {
      title: 'Setup',
      engine: defaultEngine,
      pacing: 'quick context beat',
      script: `Show why ${product} matters before the payoff.`,
      visualPrompt: `Recreate the source trend's setup rhythm with ${character}, using ${product} as the visual anchor.`
    },
    {
      title: 'Demonstration',
      engine: defaultEngine === 'wan-animate' ? 'wan-animate' : 'seedance2-standard',
      pacing: 'active middle beat',
      script: `Demonstrate the contrast, transformation, or proof the trend is built around.`,
      visualPrompt: `Show the key action or reveal. Keep camera motion smooth, creator identity consistent, and product visibility clear.`
    },
    {
      title: 'Payoff',
      engine: defaultEngine,
      pacing: 'clean reveal',
      script: `Land the trend's payoff in original words for ${product}.`,
      visualPrompt: `${character} delivers the final comparison or reveal. Match the source timing without copying captions or creator identity.`
    },
    {
      title: 'CTA',
      engine: defaultEngine,
      pacing: 'short closing beat',
      script: `Close with this next step: ${cta}.`,
      visualPrompt: `End on ${product} and ${character} with a confident UGC-style call to action: ${cta}.`
    }
  ];

  const selectedBeats = sceneCount === 3
    ? [beats[0], beats[2], beats[4]]
    : sceneCount === 4
      ? [beats[0], beats[1], beats[2], beats[4]]
      : beats.slice(0, sceneCount);

  return selectedBeats.map((beat, index) => {
    const start = Number((index * baseLength).toFixed(1));
    const end = index === sceneCount - 1
      ? totalDuration
      : Number(((index + 1) * baseLength).toFixed(1));
    return {
      id: `scene-${index + 1}`,
      title: beat.title,
      start,
      end,
      duration: Number((end - start).toFixed(1)),
      engine: beat.engine,
      pacing: beat.pacing,
      script: beat.script,
      visualPrompt: `${beat.visualPrompt}\n\nTrend direction: ${remixPrompt}`,
      sourceTrendId: trend.id || '',
      sourceTrendUrl: sourceUrl,
      referenceVideoUrl: canMimicMotion ? sourceUrl : ''
    };
  });
}

function refineScenePlan(trend = {}, scenes = [], options = {}) {
  const sourceUrl = trend.url || options.sourceTrendUrl || '';
  const sourceMotionAvailable = /\/reel\//i.test(sourceUrl) || /\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i.test(sourceUrl);
  const totalDuration = clampDuration(
    options.duration ||
    scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0) ||
    trend.durationSeconds ||
    trend.duration,
    12
  );
  const sourceHook = trend.hook || options.prompt || 'Match the selected trend structure.';
  const sourceDirection = trend.remixPrompt || 'Match the source pacing, shot order, and reveal structure while replacing creator/product identity.';
  const product = options.productName || 'the selected product';
  const character = options.characterName || 'the selected creator';
  const environment = options.environment || 'the selected environment';
  const cta = options.cta || 'take the next step';
  const draftScenes = scenes.length ? scenes : buildScenePlan(trend, options);
  const baseLength = totalDuration / draftScenes.length;

  return draftScenes.map((scene, index) => {
    const start = Number((index * baseLength).toFixed(1));
    const end = index === draftScenes.length - 1
      ? totalDuration
      : Number(((index + 1) * baseLength).toFixed(1));
    const duration = Number((end - start).toFixed(1));
    const isFirst = index === 0;
    const isLast = index === draftScenes.length - 1;
    const isMiddle = !isFirst && !isLast;
    const engine = sourceMotionAvailable && scene.engine === 'seedance2-fast' && isMiddle
      ? 'wan-animate'
      : scene.engine || (sourceMotionAvailable ? 'wan-animate' : 'seedance2-fast');

    const matchInstruction = [
      `Source-match pass: recreate the selected trend's cut timing from ${start}s to ${end}s.`,
      isFirst ? `Open on the same kind of hook frame: immediate eye contact or product-first interruption. Spoken hook: ${sourceHook}` : '',
      isMiddle ? `Mirror the source transition rhythm: keep the same number of action beats, hand/product movement, and camera energy.` : '',
      isLast ? `Land the same payoff timing, then close with CTA: ${cta}.` : '',
      `Replace the original creator with ${character}; replace any featured object with ${product}; place it in ${environment}.`,
      `Keep output clean: no text overlays, no watermark, no duplicate limbs, no cropped face, product remains recognizable.`
    ].filter(Boolean).join(' ');

    return {
      ...scene,
      id: scene.id || `scene-${index + 1}`,
      title: scene.title || (isFirst ? 'Hook frame' : isLast ? 'Payoff and CTA' : `Source beat ${index + 1}`),
      start,
      end,
      duration,
      engine,
      pacing: [
        scene.pacing || '',
        isFirst ? '0.0s cold open; no buildup' : '',
        isLast ? 'payoff lands in final second' : 'match source cut rhythm',
        sourceMotionAvailable ? 'use source motion as timing reference' : 'prompt-led source mimic'
      ].filter(Boolean).join(' · '),
      script: isFirst && !scene.script ? sourceHook : isLast && !scene.script ? `Close with: ${cta}.` : scene.script || '',
      visualPrompt: [
        matchInstruction,
        scene.visualPrompt || '',
        `Trend direction: ${sourceDirection}`
      ].filter(Boolean).join('\n\n'),
      negativePrompt: [
        scene.negativePrompt || '',
        'cropped bottom, cropped face, wrong aspect ratio, unreadable product, extra fingers, distorted eyes, duplicate person, text overlays, watermark'
      ].filter(Boolean).join(', '),
      sourceTrendId: trend.id || scene.sourceTrendId || '',
      sourceTrendUrl: sourceUrl || scene.sourceTrendUrl || '',
      referenceVideoUrl: sourceMotionAvailable ? sourceUrl : (scene.referenceVideoUrl || ''),
      refinementNotes: [
        isFirst ? 'Hook tightened to source cold-open timing.' : '',
        isMiddle ? 'Middle beat tightened for motion and product action.' : '',
        isLast ? 'Final beat tightened for payoff and CTA.' : '',
        sourceMotionAvailable ? 'Source video URL attached for motion-reference engines.' : 'No source motion URL available; using prompt-level scene matching.'
      ].filter(Boolean)
    };
  });
}

function instagramMediaUrl(sourceUrl = '') {
  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    if (!host.includes('instagram.com')) return '';
    const parts = parsed.pathname.split('/').filter(Boolean);
    const typeIndex = parts.findIndex(part => ['p', 'reel', 'tv'].includes(part));
    const type = parts[typeIndex];
    const code = parts[typeIndex + 1];
    if (typeIndex === -1 || !code) return '';
    return `https://www.instagram.com/${type}/${code}/media/?size=l`;
  } catch (error) {
    return '';
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const industry = String(req.query.industry || '').trim();
  const platform = String(req.query.platform || '').trim();
  const limit = Math.min(Number(req.query.limit || 1200), 1200);
  let trends = loadTrends();

  if (industry && industry !== 'All') {
    trends = trends.filter(trend => (trend.industries || []).includes(industry));
  }
  if (platform && platform !== 'All') {
    trends = trends.filter(trend => trend.platform === platform);
  }
  if (q) {
    trends = trends.filter(trend => [
      trend.hook,
      trend.url,
      trend.platform,
      ...(trend.industries || [])
    ].join(' ').toLowerCase().includes(q));
  }

  res.json({
    total: trends.length,
    industries: ['All', 'General', 'Real estate', 'Financial advisors', 'Ecommerce', 'Small business', 'Creators', 'Coaches'],
    platforms: ['All', 'Instagram', 'TikTok', 'Web'],
    trends: trends.slice(0, limit)
  });
});

router.post('/scene-plan', (req, res) => {
  try {
    const trends = loadTrends();
    const trendId = String(req.body.trendId || '').trim();
    const trend = trends.find(item => item.id === trendId || item.url === trendId);
    if (!trend) return res.status(404).json({ error: 'Trend not found.' });

    const scenes = buildScenePlan(trend, {
      duration: req.body.duration,
      productName: req.body.productName,
      characterName: req.body.characterName,
      environment: req.body.environment,
      cta: req.body.cta
    });

    return res.json({
      success: true,
      trend,
      totalDuration: scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0),
      scenes
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/frame-workflow', async (req, res) => {
  let materialized = null;
  try {
    const trends = loadTrends();
    const trendId = String(req.body.trendId || req.body.trend?.id || '').trim();
    const trend = trends.find(item => item.id === trendId || item.url === trendId) || req.body.trend || {};
    const sourceTrendUrl = String(req.body.sourceTrendUrl || trend.url || req.body.url || '').trim();
    if (!sourceTrendUrl) return res.status(400).json({ error: 'A source trend video URL is required for frame analysis.' });

    const preferLocalDownloader = String(process.env.USE_LOCAL_DOWNLOADER || 'true') !== 'false';
    const maxDuration = Number(req.body.maxDuration || req.body.duration || 12);
    const downloadTimeoutMs = Number(req.body.downloadTimeoutMs || process.env.LOCAL_DOWNLOADER_TIMEOUT_MS || 180000);
    let mediaUrl = sourceTrendUrl;
    let downloaded = false;
    let downloader = 'direct';
    const downloaderConfigured = getRunpodToolConfig('DOWNLOADER').apiKey && (getRunpodToolConfig('DOWNLOADER').endpointId || getRunpodToolConfig('DOWNLOADER').endpointUrl);

    if (preferLocalDownloader) {
      const download = await withTimeout(
        downloadWithYtDlp(sourceTrendUrl, { audioOnly: false, maxDuration, timeoutMs: downloadTimeoutMs }),
        downloadTimeoutMs + 5000,
        'Source video download'
      );
      mediaUrl = download.url;
      downloaded = true;
      downloader = download.raw?.provider || 'local-yt-dlp';
    } else if (downloaderConfigured) {
      const download = await downloadSourceVideo(sourceTrendUrl, { audioOnly: false, maxDuration });
      mediaUrl = download.url;
      downloaded = true;
      downloader = 'runpod-downloader';
    }

    materialized = await materializeVideoSource(mediaUrl, { timeoutMs: downloadTimeoutMs });
    const analysis = await analyzeTrendVideoFile(materialized.path, {
      maxFrames: req.body.maxFrames,
      maxAnalysisWidth: req.body.maxAnalysisWidth || 360,
      aspectRatio: req.body.aspectRatio || '9:16',
      targetSceneSeconds: req.body.targetSceneSeconds || 2.2,
      cutThreshold: req.body.cutThreshold
    });
    const workflow = buildFrameWorkflow(
      { ...trend, url: sourceTrendUrl },
      analysis,
      {
        sourceTrendUrl,
        prompt: req.body.prompt,
        productName: req.body.productName,
        characterName: req.body.characterName,
        environment: req.body.environment,
        cta: req.body.cta
      }
    );

    return res.json({
      success: true,
      trend: { ...trend, url: sourceTrendUrl },
      downloaded,
      downloader,
      frameCount: analysis.summary.totalFrames,
      detectedScenes: analysis.summary.detectedScenes,
      totalDuration: analysis.summary.duration,
      analysis,
      workflow,
      scenes: workflow.scenes,
      replacementSummary: workflow.replacements
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (materialized?.tempDir) {
      fs.promises.rm(materialized.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

router.post('/refine-scene-plan', (req, res) => {
  try {
    const trends = loadTrends();
    const trendId = String(req.body.trendId || req.body.trend?.id || '').trim();
    const trend = trends.find(item => item.id === trendId || item.url === trendId) || req.body.trend || {};
    if (!trend?.id && !trend?.url && !req.body.sourceTrendUrl) return res.status(404).json({ error: 'Trend not found.' });

    const scenes = Array.isArray(req.body.scenes) ? req.body.scenes : [];
    const refined = refineScenePlan(trend, scenes, {
      duration: req.body.duration,
      prompt: req.body.prompt,
      productName: req.body.productName,
      characterName: req.body.characterName,
      environment: req.body.environment,
      cta: req.body.cta,
      sourceTrendUrl: req.body.sourceTrendUrl
    });

    return res.json({
      success: true,
      trend,
      totalDuration: refined.reduce((sum, scene) => sum + Number(scene.duration || 0), 0),
      refinementSummary: [
        'Scene timing normalized into contiguous cuts.',
        'Visual prompts now explicitly reference source cut timing and shot rhythm.',
        'Negative prompt now guards against cropping, distorted eyes, extra limbs, text, and watermark.',
        'Motion-reference scenes keep the source trend URL when available.'
      ],
      scenes: refined
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/thumbnail', async (req, res) => {
  try {
    const mediaUrl = instagramMediaUrl(String(req.query.url || ''));
    if (!mediaUrl) return res.status(404).json({ error: 'No thumbnail available for this trend URL.' });

    const cached = thumbnailCache.get(mediaUrl);
    if (cached && Date.now() - cached.createdAt < 1000 * 60 * 30) {
      res.set('Content-Type', cached.contentType);
      res.set('Cache-Control', 'public, max-age=900');
      return res.send(cached.buffer);
    }

    const response = await fetch(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 BloomStudio/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      timeout: 12000
    });
    if (!response.ok) return res.status(response.status).json({ error: `Thumbnail source returned ${response.status}` });
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return res.status(415).json({ error: 'Thumbnail source did not return an image.' });
    const buffer = await response.buffer();
    thumbnailCache.set(mediaUrl, { buffer, contentType, createdAt: Date.now() });
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=900');
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/extract-script', async (req, res) => {
  try {
    const sourceUrl = String(req.body.url || '').trim();
    if (!sourceUrl) return res.status(400).json({ error: 'A source video URL is required.' });

    let mediaUrl = sourceUrl;
    let download = null;
    const preferLocalDownloader = String(process.env.USE_LOCAL_DOWNLOADER || 'true') !== 'false';
    const maxDuration = Number(req.body.maxDuration || 180);
    const downloadTimeoutMs = Number(req.body.downloadTimeoutMs || process.env.LOCAL_DOWNLOADER_TIMEOUT_MS || 120000);
    const downloaderConfigured = getRunpodToolConfig('DOWNLOADER').apiKey && (getRunpodToolConfig('DOWNLOADER').endpointId || getRunpodToolConfig('DOWNLOADER').endpointUrl);

    if (preferLocalDownloader) {
      download = await withTimeout(
        downloadWithYtDlp(sourceUrl, { audioOnly: true, maxDuration, timeoutMs: downloadTimeoutMs }),
        downloadTimeoutMs + 5000,
        'Source download'
      );
      mediaUrl = download.url;
    } else if (downloaderConfigured) {
      download = await downloadSourceVideo(sourceUrl, { audioOnly: true, maxDuration });
      mediaUrl = download.url;
    }

    const transcript = await transcribeAudio(mediaUrl, {
      model: req.body.model || 'turbo',
      transcription: req.body.transcription || 'plain_text',
      language: req.body.language || null,
      enableVad: true
    });

    return res.json({
      success: true,
      sourceUrl,
      mediaUrl,
      text: transcript.text,
      downloaded: !!download,
      raw: {
        downloader: download?.raw || null,
        transcription: transcript.raw
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
