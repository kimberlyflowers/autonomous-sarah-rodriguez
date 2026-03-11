// Browser API — exposes Sarah's browser to the dashboard Screen Viewer
// and to Sarah's AI brain as tools

import express from 'express';
import { getBrowserService } from '../browser/browser-service.js';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('browser-api');

// GET /api/browser/status
router.get('/status', (req, res) => {
  const browser = getBrowserService();
  res.json(browser.getStatus());
});

// POST /api/browser/launch — start the browser
router.post('/launch', async (req, res) => {
  try {
    const browser = getBrowserService();
    await browser.launch();
    res.json({ success: true, status: browser.getStatus() });
  } catch (e) {
    logger.error('Browser launch failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/browser/screenshot — current screenshot as base64 JPEG
router.get('/screenshot', async (req, res) => {
  try {
    const browser = getBrowserService();
    if (!browser.isRunning) {
      return res.json({ live: false, screenshot: null });
    }
    const screenshot = await browser.screenshot();
    res.json({ live: true, screenshot, url: browser.currentUrl });
  } catch (e) {
    res.json({ live: false, screenshot: null, error: e.message });
  }
});

// GET /api/browser/stream — SSE screenshot stream for the Screen Viewer
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const browser = getBrowserService();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({
    type: 'status',
    live: browser.isRunning,
    url: browser.currentUrl
  })}\n\n`);

  // Subscribe to screenshots
  const onScreenshot = (data) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'screenshot', ...data })}\n\n`);
    } catch (e) {
      browser.removeListener('screenshot', onScreenshot);
    }
  };

  browser.on('screenshot', onScreenshot);

  // Keepalive ping
  const ping = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'ping', ts: Date.now() })}\n\n`);
    } catch (e) {
      clearInterval(ping);
    }
  }, 15000);

  req.on('close', () => {
    browser.removeListener('screenshot', onScreenshot);
    clearInterval(ping);
  });
});

// POST /api/browser/navigate
router.post('/navigate', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    const browser = getBrowserService();
    if (!browser.isRunning) await browser.launch();
    const result = await browser.navigate(url);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/browser/click
router.post('/click', async (req, res) => {
  try {
    const { selector } = req.body;
    const browser = getBrowserService();
    const result = await browser.click(selector);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/browser/type
router.post('/type', async (req, res) => {
  try {
    const { selector, text } = req.body;
    const browser = getBrowserService();
    const result = await browser.type(selector, text);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/browser/content — get page text content
router.get('/content', async (req, res) => {
  try {
    const browser = getBrowserService();
    const result = await browser.getPageContent();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/browser/close
router.post('/close', async (req, res) => {
  try {
    const browser = getBrowserService();
    await browser.close();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/browser/push-screenshot — receives screenshots from sidecar, pushes to SSE stream
router.post('/push-screenshot', express.json({ limit: '10mb' }), (req, res) => {
  try {
    const { data, url, idle } = req.body;

    const browser = getBrowserService();

    // Idle signal — desktop app is closed or stopped capture
    if (idle || !data) {
      browser.isRunning = false;
      browser.emit('status', { type: 'status', live: false, url: null });
      return res.json({ success: true, idle: true });
    }

    browser.isRunning = true;
    browser.currentUrl = url || browser.currentUrl;
    browser.lastScreenshot = data;
    browser.lastScreenshotTime = Date.now();
    browser.emit('screenshot', {
      data: data,
      url: url || '',
      timestamp: Date.now()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
