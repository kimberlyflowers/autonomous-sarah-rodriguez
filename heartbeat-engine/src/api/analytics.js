import express from 'express';
import crypto from 'crypto';
import { getSharedPool } from '../database/pool.js';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('bloomie-analytics');

let schemaReady = false;

async function ensureAnalyticsSchema() {
  if (schemaReady) return;
  const pool = getSharedPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_analytics_events (
      id BIGSERIAL PRIMARY KEY,
      site TEXT NOT NULL DEFAULT 'bloomiestaffing.com',
      event_type TEXT NOT NULL,
      page_path TEXT NOT NULL,
      page_url TEXT,
      page_title TEXT,
      referrer TEXT,
      link_url TEXT,
      link_text TEXT,
      session_id TEXT,
      visitor_id TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      device_type TEXT,
      browser_lang TEXT,
      screen_size TEXT,
      duration_seconds INTEGER,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS website_analytics_events_created_idx
      ON website_analytics_events (created_at DESC);
    CREATE INDEX IF NOT EXISTS website_analytics_events_page_idx
      ON website_analytics_events (site, page_path, created_at DESC);
    CREATE INDEX IF NOT EXISTS website_analytics_events_type_idx
      ON website_analytics_events (site, event_type, created_at DESC);
  `);
  schemaReady = true;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.ANALYTICS_IP_SALT || process.env.SUPABASE_SERVICE_KEY || 'bloomie-staffing';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function cleanString(value, max = 600) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().slice(0, max);
  return clean || null;
}

function normalizePath(value) {
  const raw = cleanString(value, 1000) || '/';
  try {
    const parsed = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://bloomiestaffing.com');
    return parsed.pathname || '/';
  } catch {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
}

function detectDevice(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobile|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

router.post('/collect', async (req, res) => {
  try {
    await ensureAnalyticsSchema();
    const body = req.body || {};
    const eventType = cleanString(body.eventType || body.event_type, 80) || 'page_view';
    const pageUrl = cleanString(body.pageUrl || body.page_url, 1200);
    const pagePath = normalizePath(body.pagePath || body.page_path || pageUrl || req.headers.referer || '/');
    const userAgent = cleanString(req.headers['user-agent'] || body.userAgent || body.user_agent, 1200);
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    const duration = Number.isFinite(Number(body.durationSeconds)) ? Math.max(0, Math.round(Number(body.durationSeconds))) : null;

    await getSharedPool().query(`
      INSERT INTO website_analytics_events (
        site, event_type, page_path, page_url, page_title, referrer, link_url, link_text,
        session_id, visitor_id, ip_hash, user_agent, device_type, browser_lang, screen_size,
        duration_seconds, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    `, [
      cleanString(body.site, 120) || 'bloomiestaffing.com',
      eventType,
      pagePath,
      pageUrl,
      cleanString(body.pageTitle || body.page_title, 300),
      cleanString(body.referrer, 1200),
      cleanString(body.linkUrl || body.link_url, 1200),
      cleanString(body.linkText || body.link_text, 300),
      cleanString(body.sessionId || body.session_id, 120),
      cleanString(body.visitorId || body.visitor_id, 120),
      hashIp(getClientIp(req)),
      userAgent,
      cleanString(body.deviceType || body.device_type, 40) || detectDevice(userAgent || ''),
      cleanString(body.browserLang || body.browser_lang, 80),
      cleanString(body.screenSize || body.screen_size, 80),
      duration,
      metadata
    ]);

    res.json({ ok: true });
  } catch (error) {
    logger.warn('analytics collect failed', { error: error.message });
    res.status(202).json({ ok: false });
  }
});

router.get('/summary', async (req, res) => {
  try {
    await ensureAnalyticsSchema();
    const days = Math.min(90, Math.max(1, Number(req.query.days || 30)));
    const site = cleanString(req.query.site, 120) || 'bloomiestaffing.com';
    const pool = getSharedPool();

    const [overview, pages, clicks, referrers, recent, devices] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
          COUNT(DISTINCT visitor_id)::int AS visitors,
          COUNT(DISTINCT session_id)::int AS sessions,
          COUNT(*) FILTER (WHERE event_type = 'cta_click')::int AS cta_clicks,
          COUNT(*) FILTER (WHERE event_type = 'time_on_page')::int AS timed_pages,
          COALESCE(ROUND(AVG(duration_seconds) FILTER (WHERE event_type = 'time_on_page' AND duration_seconds BETWEEN 1 AND 7200)), 0)::int AS avg_time_seconds,
          COUNT(DISTINCT visitor_id) FILTER (WHERE created_at > NOW() - INTERVAL '15 minutes')::int AS active_now
        FROM website_analytics_events
        WHERE site = $1 AND created_at > NOW() - ($2::int * INTERVAL '1 day')
      `, [site, days]),
      pool.query(`
        SELECT
          page_path,
          MAX(page_title) AS page_title,
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS views,
          COUNT(DISTINCT visitor_id)::int AS visitors,
          COALESCE(ROUND(AVG(duration_seconds) FILTER (WHERE event_type = 'time_on_page' AND duration_seconds BETWEEN 1 AND 7200)), 0)::int AS avg_time_seconds
        FROM website_analytics_events
        WHERE site = $1 AND created_at > NOW() - ($2::int * INTERVAL '1 day')
        GROUP BY page_path
        ORDER BY views DESC, visitors DESC
        LIMIT 50
      `, [site, days]),
      pool.query(`
        SELECT COALESCE(link_text, '(unlabeled)') AS link_text, COALESCE(link_url, '') AS link_url,
               page_path, COUNT(*)::int AS clicks
        FROM website_analytics_events
        WHERE site = $1 AND event_type = 'cta_click' AND created_at > NOW() - ($2::int * INTERVAL '1 day')
        GROUP BY link_text, link_url, page_path
        ORDER BY clicks DESC
        LIMIT 40
      `, [site, days]),
      pool.query(`
        SELECT COALESCE(NULLIF(referrer, ''), '(direct / none)') AS referrer,
               COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS visits
        FROM website_analytics_events
        WHERE site = $1 AND created_at > NOW() - ($2::int * INTERVAL '1 day')
        GROUP BY referrer
        ORDER BY visits DESC
        LIMIT 30
      `, [site, days]),
      pool.query(`
        SELECT created_at, event_type, page_path, page_title, referrer, link_text, link_url,
               visitor_id, session_id, device_type, duration_seconds
        FROM website_analytics_events
        WHERE site = $1
        ORDER BY created_at DESC
        LIMIT 80
      `, [site]),
      pool.query(`
        SELECT device_type, COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS views
        FROM website_analytics_events
        WHERE site = $1 AND created_at > NOW() - ($2::int * INTERVAL '1 day')
        GROUP BY device_type
        ORDER BY views DESC
      `, [site, days])
    ]);

    res.json({
      ok: true,
      site,
      days,
      generatedAt: new Date().toISOString(),
      overview: overview.rows[0],
      pages: pages.rows,
      clicks: clicks.rows,
      referrers: referrers.rows,
      recent: recent.rows,
      devices: devices.rows
    });
  } catch (error) {
    logger.error('analytics summary failed', { error: error.message });
    res.status(500).json({ ok: false, error: 'Analytics summary failed' });
  }
});

export default router;
