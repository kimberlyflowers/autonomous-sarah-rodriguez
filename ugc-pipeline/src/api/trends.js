const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const TRENDS_PATH = path.join(__dirname, '..', '..', 'data', 'viral-hooks.json');

function loadTrends() {
  if (!fs.existsSync(TRENDS_PATH)) return [];
  return JSON.parse(fs.readFileSync(TRENDS_PATH, 'utf8'));
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

module.exports = router;
