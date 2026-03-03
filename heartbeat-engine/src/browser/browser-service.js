// Sarah's Browser Service — Playwright-powered autonomous browsing
// Manages a persistent browser session, captures screenshots for the Screen Viewer

import { chromium } from 'playwright';
import { createLogger } from '../logging/logger.js';
import { EventEmitter } from 'events';

const logger = createLogger('browser-service');

class BrowserService extends EventEmitter {
  constructor() {
    super();
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isRunning = false;
    this.screenshotInterval = null;
    this.currentUrl = null;
    this.lastScreenshot = null;
    this.lastScreenshotTime = null;
  }

  async launch() {
    if (this.isRunning) return;
    try {
      logger.info('🌐 Launching Sarah\'s browser...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1280,800'
        ]
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      this.page = await this.context.newPage();
      this.isRunning = true;

      // Start screenshot streaming
      this.startScreenshotStream();

      logger.info('✅ Browser launched and ready');
      this.emit('ready');
    } catch (error) {
      logger.error('Failed to launch browser:', error.message);
      this.isRunning = false;
    }
  }

  startScreenshotStream() {
    // Capture screenshot every 1 second when browser is active
    this.screenshotInterval = setInterval(async () => {
      if (!this.page || !this.isRunning) return;
      try {
        const screenshot = await this.page.screenshot({
          type: 'jpeg',
          quality: 70,
          fullPage: false
        });
        this.lastScreenshot = screenshot.toString('base64');
        this.lastScreenshotTime = Date.now();
        this.currentUrl = this.page.url();
        this.emit('screenshot', {
          data: this.lastScreenshot,
          url: this.currentUrl,
          timestamp: this.lastScreenshotTime
        });
      } catch (e) {
        // Page may be navigating
      }
    }, 1000);
  }

  async navigate(url) {
    if (!this.isRunning) await this.launch();
    logger.info(`🌐 Navigating to: ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
      lastScreenshotTime: this.lastScreenshotTime
    };
  }

  async close() {
    if (this.screenshotInterval) clearInterval(this.screenshotInterval);
    if (this.browser) await this.browser.close();
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
