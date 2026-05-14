const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { downloadSourceVideo, getRunpodToolConfig, transcribeAudio } = require('../services/runpodTools');

const router = express.Router();
const TRENDS_PATH = path.join(__dirname, '..', '..', 'data', 'viral-hooks.json');
const thumbnailCache = new Map();

function loadTrends() {
  if (!fs.existsSync(TRENDS_PATH)) return [];
  return JSON.parse(fs.readFileSync(TRENDS_PATH, 'utf8'));
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
    if (getRunpodToolConfig('DOWNLOADER').apiKey && (getRunpodToolConfig('DOWNLOADER').endpointId || getRunpodToolConfig('DOWNLOADER').endpointUrl)) {
      download = await downloadSourceVideo(sourceUrl, { audioOnly: true, maxDuration: Number(req.body.maxDuration || 180) });
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
