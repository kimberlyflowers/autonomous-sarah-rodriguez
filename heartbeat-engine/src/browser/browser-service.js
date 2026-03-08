// Sarah's Browser Service — connects to Browserless for managed Chrome
// Manages a persistent browser session, captures screenshots for the Screen Viewer
// Uses Browserless (Railway) for headless Chrome — same instance the AI sidecar uses

import { chromium } from 'playwright';
import { createLogger } from '../logging/logger.js';
import { EventEmitter } from 'events';

const logger = createLogger('browser-service');

// Browserless connection config
const BROWSERLESS_WS_URL = process.env.BROWSERLESS_WS_URL || '';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '';

class BrowserService extends EventEmitter {
  constructor() {
    super();
    // Allow up to 50 concurrent screenshot listeners (one per open dashboard tab/SSE connection)
    // Default of 10 triggers false-positive memory leak warnings when multiple tabs are open
    this.setMaxListeners(50);
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isRunning = false;
    this.screenshotInterval = null;
    this.currentUrl = null;
    this.lastScreenshot = null;
    this.lastScreenshotTime = null;
    this.usesBrowserless = false;
  }

  /**
   * Build CDP connection URL for Browserless
   */
  _buildCdpUrl() {
    if (!BROWSERLESS_WS_URL || !BROWSERLESS_TOKEN) return null;
    const base = BROWSERLESS_WS_URL.rstrip ? BROWSERLESS_WS_URL.replace(/\/+$/, '') : BROWSERLESS_WS_URL.replace(/\/+$/, '');
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}token=${BROWSERLESS_TOKEN}&stealth=true`;
  }

  async launch() {
    if (this.isRunning) return;
    try {
      const cdpUrl = this._buildCdpUrl();

      // Shared context options — used for both Browserless and local
      const contextOptions = {
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      if (cdpUrl) {
        // Connect to Browserless via CDP — shared with AI sidecar
        logger.info('🌐 Connecting to Browserless...', { url: BROWSERLESS_WS_URL });
        this.browser = await chromium.connectOverCDP(cdpUrl);
        this.usesBrowserless = true;

        // Get or create context
        if (this.browser.contexts().length > 0) {
          this.context = this.browser.contexts()[0];
        } else {
          this.context = await this.browser.newContext(contextOptions);
        }

        logger.info('✅ Connected to Browserless');
      } else {
        // Fallback: launch local Chrome (dev mode or if Browserless not configured)
        logger.info('🌐 Launching local browser (Browserless not configured)...');
        const executablePath = process.env.CHROMIUM_PATH || undefined;
        this.browser = await chromium.launch({
          headless: true,
          executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--window-size=1280,800'
          ]
        });

        this.context = await this.browser.newContext(contextOptions);
        this.usesBrowserless = false;
        logger.info('✅ Local browser launched');
      }

      this.page = await this.context.newPage();

      // ── Performance: block images, fonts, and media for scraping tasks ──
      // Cuts page load time by 60–80% on content-heavy sites
      await this.page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        const blockedTypes = ['image', 'media', 'font', 'stylesheet'];
        // Allow stylesheets only if needed for JS-rendered content detection
        if (blockedTypes.includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      this.isRunning = true;

      // Start screenshot streaming
      this.startScreenshotStream();

      this.emit('ready');
    } catch (error) {
      logger.error('Failed to launch browser:', error.message);
      this.isRunning = false;
    }
  }

  startScreenshotStream() {
    // Capture screenshot every 1 second when browser is active
    this.screenshotInterval = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        // If using Browserless, check for newest page across all contexts
        // This catches pages opened by the AI sidecar too
        let activePage = this.page;

        if (this.usesBrowserless && this.browser) {
          try {
            const contexts = this.browser.contexts();
            for (const ctx of contexts) {
              const pages = ctx.pages();
              if (pages.length > 0) {
                // Use the most recently active page (last in array)
                activePage = pages[pages.length - 1];
              }
            }
          } catch (e) {
            // CDP connection may have dropped — use our own page
            activePage = this.page;
          }
        }

        if (!activePage) return;

        const screenshot = await activePage.screenshot({
          type: 'jpeg',
          quality: 70,
          fullPage: false
        });
        this.lastScreenshot = screenshot.toString('base64');
        this.lastScreenshotTime = Date.now();
        this.currentUrl = activePage.url();
        this.emit('screenshot', {
          data: this.lastScreenshot,
          url: this.currentUrl,
          timestamp: this.lastScreenshotTime
        });
      } catch (e) {
        // Page may be navigating or CDP reconnecting
      }
    }, 1000);
  }

  async navigate(url) {
    // Ensure browser is alive — relaunch only if genuinely dead, not on every call
    if (!this.isRunning || !this.page || this.page.isClosed()) {
      logger.info('Browser not running or page closed — relaunching...');
      this.isRunning = false;
      await this.launch();
    }
    logger.info(`🌐 Navigating to: ${url}`);
    // 'commit' fires as soon as the server responds — faster than domcontentloaded
    await this.page.goto(url, { waitUntil: 'commit', timeout: 15000 });
    // Brief wait for JS to render initial content
    await this.page.waitForTimeout(800);
    this.currentUrl = this.page.url();
    return { success: true, url: this.currentUrl };
  }

  /**
   * Fast navigation for bulk scraping — minimal wait, no screenshots
   */
  async navigateFast(url) {
    if (!this.isRunning || !this.page || this.page.isClosed()) {
      this.isRunning = false;
      await this.launch();
    }
    await this.page.goto(url, { waitUntil: 'commit', timeout: 12000 });
    this.currentUrl = this.page.url();
    return { success: true, url: this.currentUrl };
  }

  async click(selector) {
    if (!this.page) throw new Error('Browser not running');
    logger.info(`🖱️ Clicking: ${selector}`);
    await this.page.click(selector, { timeout: 10000 });
    await this.page.waitForTimeout(500);
    return { success: true };
  }

  async type(selector, text) {
    if (!this.page) throw new Error('Browser not running');
    logger.info(`⌨️ Typing into: ${selector}`);
    await this.page.click(selector);
    await this.page.fill(selector, text);
    return { success: true };
  }

  async getPageContent() {
    if (!this.page) throw new Error('Browser not running');
    const content = await this.page.evaluate(() => document.body.innerText);
    const url = this.page.url();
    const title = await this.page.title();
    return { content: content.slice(0, 8000), url, title };
  }

  async screenshot() {
    if (!this.page) throw new Error('Browser not running');
    const buf = await this.page.screenshot({ type: 'jpeg', quality: 80 });
    return buf.toString('base64');
  }

  async executeScript(script) {
    if (!this.page) throw new Error('Browser not running');
    const result = await this.page.evaluate(script);
    return result;
  }

  async waitForSelector(selector, timeout = 10000) {
    if (!this.page) throw new Error('Browser not running');
    await this.page.waitForSelector(selector, { timeout });
    return { success: true };
  }

  async scrollDown() {
    if (!this.page) throw new Error('Browser not running');
    await this.page.evaluate(() => window.scrollBy(0, 500));
    return { success: true };
  }

  async goBack() {
    if (!this.page) throw new Error('Browser not running');
    await this.page.goBack();
    return { success: true, url: this.page.url() };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      currentUrl: this.currentUrl,
      hasScreenshot: !!this.lastScreenshot,
      lastScreenshotTime: this.lastScreenshotTime,
      usesBrowserless: this.usesBrowserless
    };
  }

  async close() {
    if (this.screenshotInterval) clearInterval(this.screenshotInterval);
    if (this.browser) {
      if (this.usesBrowserless) {
        // Disconnect (don't kill Browserless — sidecar may still need it)
        try { await this.browser.close(); } catch (e) { /* ok */ }
      } else {
        await this.browser.close();
      }
    }
    this.isRunning = false;
    this.browser = null;
    this.context = null;
    this.page = null;
    logger.info('Browser closed');
  }
}

// Singleton — one browser instance for Sarah
let instance = null;

export function getBrowserService() {
  if (!instance) instance = new BrowserService();
  return instance;
}

export default BrowserService;
