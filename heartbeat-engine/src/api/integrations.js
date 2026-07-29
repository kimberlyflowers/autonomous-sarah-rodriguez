// heartbeat-engine/src/api/integrations.js
// OAuth connector routes — authorize, callback, disconnect, status, list
// Ticket: 578b0355

import { Router } from 'express';
import { createLogger } from '../logging/logger.js';
import { getUserOrgId, extractUserId } from './org-boundary.js';
import crypto from 'crypto';

const router = Router();
const logger = createLogger('integrations-api');

// App URL for redirects — use BLOOM_APP_URL env var, fall back to Railway domain
const APP_URL = process.env.BLOOM_APP_URL || 'https://app.bloomiestaffing.com';
function normalizeBaseUrl(url) {
  if (!url) return null;
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  return normalized.replace(/\/+$/, '');
}

function oauthBaseUrl(platform) {
  // Preserve Google's previously registered Railway callback, while all new
  // tenant connectors use Bloomie's public application URL.
  if (platform === 'google' && process.env.GOOGLE_OAUTH_REDIRECT_BASE_URL) {
    return normalizeBaseUrl(process.env.GOOGLE_OAUTH_REDIRECT_BASE_URL);
  }
  return normalizeBaseUrl(process.env.OAUTH_BASE_URL || process.env.BLOOM_APP_URL || process.env.BLOOM_API_URL) || APP_URL;
}

function encodeOAuthState(payload) {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error('OAUTH_STATE_SECRET is not configured');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function decodeOAuthState(value) {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error('OAUTH_STATE_SECRET is not configured');
  const [encoded, signature] = String(value || '').split('.');
  if (!encoded || !signature) throw new Error('Invalid OAuth state');
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw new Error('Invalid OAuth state signature');
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.ts || Date.now() - payload.ts > 15 * 60 * 1000) throw new Error('Expired OAuth state');
  return payload;
}

// ── Supabase client (lazy singleton) ──
let _supabase = null;
async function getSupabase() {
  if (!_supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return _supabase;
}

// ══════════════════════════════════════════════════════════════
// PLATFORM CONFIGS
// Each platform maps to one or more connector slugs in the DB.
// Google uses one OAuth flow to cover gmail + calendar + drive.
// ══════════════════════════════════════════════════════════════
const PLATFORMS = {
  zoom: {
    name: 'Zoom',
    authUrl: 'https://zoom.us/oauth/authorize',
    tokenUrl: 'https://zoom.us/oauth/token',
    scopes: ['cloud_recording:read', 'recording:read', 'meeting:read', 'user:read'],
    extraParams: {},
    envClientId: 'ZOOM_CLIENT_ID',
    envClientSecret: 'ZOOM_CLIENT_SECRET',
    tokenAuthMethod: 'basic', // Zoom requires Basic auth for token exchange
    connectorSlugs: ['zoom'],
  },
  google: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    extraParams: { access_type: 'offline', prompt: 'consent' },
    envClientId: 'GOOGLE_OAUTH_CLIENT_ID',
    envClientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET',
    connectorSlugs: ['gmail', 'google-calendar', 'google-drive'],
  },
  shopify: {
    name: 'Shopify',
    authUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
    tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token',
    scopes: ['read_products', 'read_orders', 'read_customers'],
    scopeSeparator: ',',
    extraParams: {},
    envClientId: 'SHOPIFY_CLIENT_ID',
    envClientSecret: 'SHOPIFY_CLIENT_SECRET',
    connectorSlugs: ['shopify'],
    requiresShopDomain: true,
  },
  github: {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'read:user', 'user:email'],
    extraParams: {},
    envClientId: 'GITHUB_CLIENT_ID',
    envClientSecret: 'GITHUB_CLIENT_SECRET',
    connectorSlugs: ['github'],
    tokenResponseFormat: 'json',
  },
  vercel: {
    name: 'Vercel',
    authUrl: 'https://vercel.com/integrations/{slug}/new',
    tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
    scopes: [],
    extraParams: {},
    envClientId: 'VERCEL_CLIENT_ID',
    envClientSecret: 'VERCEL_CLIENT_SECRET',
    envIntegrationSlug: 'VERCEL_INTEGRATION_SLUG',
    connectorSlugs: ['vercel'],
  },
};

const PLATFORM_ALIASES = {
  gmail: 'google',
  'google-calendar': 'google',
  'google-drive': 'google',
};

function platformKey(input) {
  return PLATFORM_ALIASES[input] || input;
}

function normalizeShopDomain(value) {
  const raw = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

  if (!raw) return null;
  if (raw.includes('.')) return raw;
  return `${raw}.myshopify.com`;
}

function getPlatformConfig(platform, options = {}) {
  const normalizedPlatform = platformKey(platform);
  const base = PLATFORMS[normalizedPlatform];
  if (!base) return { platform: normalizedPlatform, cfg: null };

  const cfg = { ...base };
  if (cfg.requiresShopDomain) {
    const shopDomain = normalizeShopDomain(options.shopDomain);
    if (!shopDomain && options.requireShopDomain !== false) {
      throw new Error(`${cfg.name} needs a shop domain before connecting.`);
    }
    if (shopDomain) {
      const shopSubdomain = shopDomain.replace(/\.myshopify\.com$/i, '');
      cfg.shopDomain = shopDomain;
      cfg.authUrl = cfg.authUrl.replace('{shop}', shopSubdomain);
      cfg.tokenUrl = cfg.tokenUrl.replace('{shop}', shopSubdomain);
    }
  }

  return { platform: normalizedPlatform, cfg };
}

// Social connectors blocked until GHL $297 upgrade
const COMING_SOON_SLUGS = new Set(['facebook', 'instagram', 'linkedin', 'tiktok']);

// ── Auth middleware — requires valid JWT with org membership ──
async function withAuth(req, res, next) {
  try {
    const orgId = await getUserOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Authentication required' });
    req.orgId = orgId;
    req.userId = extractUserId(req);
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// ── Exchange authorization code for access token ──
async function exchangeCodeForToken(platform, code, redirectUri, options = {}) {
  const { cfg } = getPlatformConfig(platform, options);
  const clientId = process.env[cfg.envClientId];
  const clientSecret = process.env[cfg.envClientSecret];

  if (!clientId || !clientSecret) {
    throw new Error(`Missing env vars: ${cfg.envClientId} / ${cfg.envClientSecret}`);
  }

  const bodyParams = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  };

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(cfg.tokenResponseFormat === 'json' ? { Accept: 'application/json' } : {}),
  };

  // Some providers (Zoom) require HTTP Basic auth instead of body params
  if (cfg.tokenAuthMethod === 'basic') {
    headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    delete bodyParams.client_id;
    delete bodyParams.client_secret;
  }

  const response = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(bodyParams).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed for ${platform}: ${response.status} ${errorText}`);
  }

  return response.json();
}

// ── Refresh an expired access token using the stored refresh token ──
async function refreshAccessToken(platform, refreshToken) {
  const { cfg } = getPlatformConfig(platform);
  const clientId = process.env[cfg.envClientId];
  const clientSecret = process.env[cfg.envClientSecret];

  if (!clientId || !clientSecret) {
    throw new Error(`Missing env vars for ${platform} token refresh`);
  }

  const bodyParams = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  };

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  if (cfg.tokenAuthMethod === 'basic') {
    headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    delete bodyParams.client_id;
    delete bodyParams.client_secret;
  }

  const response = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(bodyParams).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed for ${platform}: ${response.status} ${errorText}`);
  }

  return response.json();
}

// ── Upsert token rows in user_connectors for each connector slug ──
async function storeTokens(platform, tokenData, orgId, userId) {
  const supabase = await getSupabase();
  const { cfg } = getPlatformConfig(platform, { shopDomain: tokenData.shopDomain });

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  for (const slug of cfg.connectorSlugs) {
    const { data: connectorRow } = await supabase
      .from('connectors')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!connectorRow) {
      logger.warn(`Connector slug "${slug}" not in connectors table — skipping upsert`);
      continue;
    }

    let refreshToken = tokenData.refresh_token || null;
    if (!refreshToken) {
      const { data: existingRow } = await supabase
        .from('user_connectors')
        .select('refresh_token')
        .eq('connector_id', connectorRow.id)
        .eq('organization_id', orgId)
        .maybeSingle();
      refreshToken = existingRow?.refresh_token || null;
    }

    const { error } = await supabase
      .from('user_connectors')
      .upsert({
        connector_id: connectorRow.id,
        organization_id: orgId,
        connected_by: userId,
        access_token: tokenData.access_token,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        granted_scopes: cfg.scopes,
        external_account_id: tokenData.external_account_id || tokenData.team_id || tokenData.shopDomain || null,
        external_account_name: tokenData.external_account_name || tokenData.user_id || tokenData.team_id || tokenData.shopDomain || null,
        status: 'active',
        last_error: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'connector_id,organization_id' });

    if (error) {
      logger.error(`Failed to store token for ${slug}`, { error: error.message });
    } else {
      logger.info(`Stored ${platform} token for connector "${slug}"`, { org: orgId.slice(0, 8) });
    }
  }
}

// ── Auto-refresh helper: refresh token if expired, update DB ──
async function refreshIfExpired(platform, userConnRow, orgId) {
  if (!userConnRow.token_expires_at || !userConnRow.refresh_token) return userConnRow;

  const expiresAt = new Date(userConnRow.token_expires_at);
  const bufferMs = 5 * 60 * 1000; // Refresh 5 minutes before expiry
  if (expiresAt.getTime() - Date.now() > bufferMs) return userConnRow;

  try {
    logger.info(`Refreshing ${platform} token`, { org: orgId.slice(0, 8) });
    const tokenData = await refreshAccessToken(platform, userConnRow.refresh_token);
    await storeTokens(platform, tokenData, orgId, userConnRow.connected_by);
    return { ...userConnRow, access_token: tokenData.access_token };
  } catch (err) {
    logger.warn(`Token refresh failed for ${platform}: ${err.message}`);
    return userConnRow; // Return stale token — let caller handle error
  }
}

function buildProviderAuthUrl(platform, orgId, userId, options = {}) {
  const { platform: normalizedPlatform, cfg } = getPlatformConfig(platform, options);
  if (!cfg) throw new Error(`Unknown platform: ${platform}`);

  const clientId = process.env[cfg.envClientId];
  if (!clientId) {
    throw new Error(`${cfg.name} client ID not configured. Set ${cfg.envClientId} in Railway env vars.`);
  }

  const redirectUri = `${oauthBaseUrl(normalizedPlatform)}/api/integrations/${normalizedPlatform}/callback`;
  const state = encodeOAuthState({
      orgId,
      userId,
      platform: normalizedPlatform,
      shopDomain: cfg.shopDomain || null,
      ts: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    ...(cfg.extraParams || {}),
  });

  if (cfg.scopes?.length) {
    params.set('scope', cfg.scopes.join(cfg.scopeSeparator || ' '));
  }

  if (normalizedPlatform === 'vercel') {
    const slug = process.env[cfg.envIntegrationSlug];
    if (!slug) throw new Error(`Vercel integration slug not configured. Set ${cfg.envIntegrationSlug} in Railway env vars.`);
    params.delete('client_id');
    params.delete('response_type');
    return { authUrl: `https://vercel.com/integrations/${encodeURIComponent(slug)}/new?${params.toString()}`, platform: normalizedPlatform, cfg };
  }

  return { authUrl: `${cfg.authUrl}?${params.toString()}`, platform: normalizedPlatform, cfg };
}

// ════════════════════════════════════════════════════════════════
// GET /api/integrations/list
// Returns all connectors with connection status for the current org.
// Social connectors (facebook, instagram, linkedin, tiktok) marked comingSoon.
// ════════════════════════════════════════════════════════════════
router.get('/list', withAuth, async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { orgId } = req;

    const { data: allConnectors, error: connErr } = await supabase
      .from('connectors')
      .select('id, name, slug, category, auth_type, docs_url, active')
      .eq('active', true)
      .order('category', { ascending: true });

    if (connErr) throw connErr;

    const { data: userConns } = await supabase
      .from('user_connectors')
      .select('connector_id, status, external_account_name, connected_at, token_expires_at')
      .eq('organization_id', orgId)
      .eq('status', 'active');

    const connectedMap = {};
    (userConns || []).forEach(uc => { connectedMap[uc.connector_id] = uc; });

    const connectors = (allConnectors || []).map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      category: c.category,
      authType: c.auth_type,
      docsUrl: c.docs_url,
      connected: !!connectedMap[c.id],
      comingSoon: COMING_SOON_SLUGS.has(c.slug),
      supported: !!PLATFORMS[platformKey(c.slug)] || c.slug === 'ghl' || c.slug === 'heygen' || c.slug === 'uber-eats',
      platform: platformKey(c.slug),
      connectionMode: c.slug === 'uber-eats' ? 'browser_handoff' : 'oauth',
      requiresShopDomain: !!PLATFORMS[platformKey(c.slug)]?.requiresShopDomain,
      connectedAt: connectedMap[c.id]?.connected_at || null,
      externalAccount: connectedMap[c.id]?.external_account_name || null,
    }));

    res.json({ success: true, connectors });
  } catch (error) {
    logger.error('Failed to list connectors', { error: error.message });
    res.status(500).json({ error: 'Failed to load connectors' });
  }
});

// ════════════════════════════════════════════════════════════════
// Uber Eats — customer discovery + authenticated browser checkout.
//
// Uber's Eats Marketplace OAuth scopes are merchant-facing. They do not let
// an eater build or pay for a consumer order. Bloomie therefore records only
// that this tenant prepared its own authenticated browser session. Passwords,
// cookies, addresses, and payment data remain in that browser.
// ════════════════════════════════════════════════════════════════
router.post('/uber-eats/start', withAuth, async (_req, res) => {
  res.json({
    success: true,
    platform: 'uber-eats',
    name: 'Uber Eats',
    connectionMode: 'browser_handoff',
    authUrl: 'https://www.ubereats.com/',
    message: 'Sign in to your own Uber Eats account in the opened browser, then return to Bloomie and confirm that the browser is ready.',
  });
});

router.post('/uber-eats/browser-ready', withAuth, async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { data: connector, error: connectorError } = await supabase
      .from('connectors')
      .select('id')
      .eq('slug', 'uber-eats')
      .single();
    if (connectorError || !connector) throw new Error('Uber Eats connector is not installed');

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('user_connectors')
      .upsert({
        connector_id: connector.id,
        organization_id: req.orgId,
        connected_by: req.userId,
        access_token: null,
        refresh_token: null,
        granted_scopes: [],
        external_account_name: 'Tenant browser session',
        status: 'active',
        last_error: null,
        connected_at: now,
        updated_at: now,
      }, { onConflict: 'connector_id,organization_id' });
    if (error) throw error;

    logger.info('Uber Eats browser handoff marked ready', { org: req.orgId.slice(0, 8) });
    res.json({ success: true, connected: true, connectionMode: 'browser_handoff' });
  } catch (error) {
    logger.error('Uber Eats browser readiness failed', { error: error.message });
    res.status(500).json({ error: 'Could not save Uber Eats browser readiness.' });
  }
});

router.get('/uber-eats/status', withAuth, async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { data: connector } = await supabase
      .from('connectors')
      .select('id')
      .eq('slug', 'uber-eats')
      .maybeSingle();
    if (!connector) return res.json({ connected: false, connectionMode: 'browser_handoff' });

    const { data } = await supabase
      .from('user_connectors')
      .select('connected_at, external_account_name')
      .eq('connector_id', connector.id)
      .eq('organization_id', req.orgId)
      .eq('status', 'active')
      .maybeSingle();
    res.json({
      connected: !!data,
      connectionMode: 'browser_handoff',
      connectedAt: data?.connected_at || null,
      externalAccount: data?.external_account_name || null,
    });
  } catch (error) {
    logger.error('Uber Eats status failed', { error: error.message });
    res.json({ connected: false, connectionMode: 'browser_handoff' });
  }
});

router.post('/uber-eats/disconnect', withAuth, async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { data: connector } = await supabase
      .from('connectors')
      .select('id')
      .eq('slug', 'uber-eats')
      .maybeSingle();
    if (connector) {
      const { error } = await supabase
        .from('user_connectors')
        .update({
          status: 'inactive',
          access_token: null,
          refresh_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq('connector_id', connector.id)
        .eq('organization_id', req.orgId);
      if (error) throw error;
    }
    res.json({ success: true, disconnected: true });
  } catch (error) {
    logger.error('Uber Eats disconnect failed', { error: error.message });
    res.status(500).json({ error: 'Uber Eats disconnect failed.' });
  }
});


// ════════════════════════════════════════════════════════════════
// GHL (GoHighLevel) — API Key connector (not OAuth)
// Users provide their Private Integration Token (PIT) directly.
// PIT is stored in user_connectors.api_key;
// location_id in user_connectors.external_account_id.
// ════════════════════════════════════════════════════════════════
const GHL_CONNECTOR_ID = 'd2bbdfe4-f1f1-46a5-9084-ab4422766835';

// GET /api/integrations/ghl/status
router.get('/ghl/status', withAuth, async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { orgId } = req;

    const { data } = await supabase
      .from('user_connectors')
      .select('id, api_key, external_account_id, connected_at')
      .eq('connector_id', GHL_CONNECTOR_ID)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .maybeSingle();

    if (!data?.api_key) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      locationId: data.external_account_id || null,
      connectedAt: data.connected_at || null,
    });
  } catch (error) {
    logger.error('GHL status check failed', { error: error.message });
    res.json({ connected: false });
  }
});

// POST /api/integrations/ghl/connect — save PIT to user_connectors
router.post('/ghl/connect', withAuth, async (req, res) => {
  try {
    const { pit, location_id } = req.body;
    const { orgId, userId } = req;

    if (!pit || typeof pit !== 'string' || !pit.startsWith('pit-')) {
      return res.status(400).json({
        error: 'Invalid PIT format — GoHighLevel Private Integration Tokens start with "pit-"'
      });
    }

    const supabase = await getSupabase();

    const { error } = await supabase
      .from('user_connectors')
      .upsert({
        connector_id: GHL_CONNECTOR_ID,
        organization_id: orgId,
        connected_by: userId,
        api_key: pit,
        external_account_id: location_id || null,
        status: 'active',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'connector_id,organization_id' });

    if (error) {
      logger.error('Failed to save GHL credentials', { error: error.message, org: orgId?.slice(0, 8) });
      return res.status(500).json({ error: 'Failed to save GHL credentials' });
    }

    logger.info('GHL PIT saved', { org: orgId?.slice(0, 8), hasLocationId: !!location_id });
    res.json({ success: true, connected: true });
  } catch (error) {
    logger.error('GHL connect failed', { error: error.message });
    res.status(500).json({ error: 'Failed to connect GHL' });
  }
});

// POST /api/integrations/ghl/disconnect
router.post('/ghl/disconnect', withAuth, async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { orgId } = req;

    const { error } = await supabase
      .from('user_connectors')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('connector_id', GHL_CONNECTOR_ID)
      .eq('organization_id', orgId);

    if (error) throw error;

    logger.info('GHL disconnected', { org: orgId?.slice(0, 8) });
    res.json({ success: true, disconnected: true });
  } catch (error) {
    logger.error('GHL disconnect failed', { error: error.message });
    res.status(500).json({ error: 'GHL disconnect failed' });
  }
});

// ════════════════════════════════════════════════════════════════
// HeyGen — tenant API key connector
// HeyGen recommends API keys for automation. Each organization stores and
// uses its own key; no shared Railway credential is used for generation.
// ════════════════════════════════════════════════════════════════
async function getConnectorRowBySlug(slug) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, slug')
    .eq('slug', slug)
    .single();
  if (error || !data) throw new Error(`${slug} connector is not installed`);
  return data;
}

router.get('/heygen/status', withAuth, async (req, res) => {
  try {
    const supabase = await getSupabase();
    const connector = await getConnectorRowBySlug('heygen');
    const { data } = await supabase
      .from('user_connectors')
      .select('id, connected_at, external_account_name')
      .eq('connector_id', connector.id)
      .eq('organization_id', req.orgId)
      .eq('status', 'active')
      .maybeSingle();
    res.json({
      connected: !!data,
      connectedAt: data?.connected_at || null,
      externalAccount: data?.external_account_name || null,
    });
  } catch (error) {
    logger.error('HeyGen status check failed', { error: error.message });
    res.json({ connected: false });
  }
});

router.post('/heygen/connect', withAuth, async (req, res) => {
  try {
    const apiKey = String(req.body?.apiKey || '').trim();
    if (apiKey.length < 16 || /\s/.test(apiKey)) {
      return res.status(400).json({ error: 'Enter a valid HeyGen API key.' });
    }

    // Validate before saving. A private avatar listing is read-only and proves
    // the credential belongs to an API-enabled HeyGen account.
    const validation = await fetch('https://api.heygen.com/v3/avatars?ownership=private&limit=1', {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
    });
    if (!validation.ok) {
      const detail = await validation.text();
      return res.status(400).json({
        error: validation.status === 401 || validation.status === 403
          ? 'HeyGen rejected this API key. Copy a current key from your HeyGen account.'
          : `HeyGen connection check failed (${validation.status}): ${detail.slice(0, 240)}`,
      });
    }

    const supabase = await getSupabase();
    const connector = await getConnectorRowBySlug('heygen');
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('user_connectors')
      .upsert({
        connector_id: connector.id,
        organization_id: req.orgId,
        connected_by: req.userId,
        api_key: apiKey,
        external_account_name: 'HeyGen account',
        status: 'active',
        last_error: null,
        connected_at: now,
        updated_at: now,
      }, { onConflict: 'connector_id,organization_id' });
    if (error) throw error;

    logger.info('HeyGen tenant connection saved', { org: req.orgId.slice(0, 8) });
    res.json({ success: true, connected: true });
  } catch (error) {
    logger.error('HeyGen connect failed', { error: error.message });
    res.status(500).json({ error: 'Failed to connect HeyGen.' });
  }
});

router.post('/heygen/disconnect', withAuth, async (req, res) => {
  try {
    const supabase = await getSupabase();
    const connector = await getConnectorRowBySlug('heygen');
    const { error } = await supabase
      .from('user_connectors')
      .update({ status: 'inactive', api_key: null, updated_at: new Date().toISOString() })
      .eq('connector_id', connector.id)
      .eq('organization_id', req.orgId);
    if (error) throw error;
    res.json({ success: true, disconnected: true });
  } catch (error) {
    logger.error('HeyGen disconnect failed', { error: error.message });
    res.status(500).json({ error: 'HeyGen disconnect failed.' });
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/integrations/:platform/status
// Returns connection status for the platform for the current org.
// ════════════════════════════════════════════════════════════════
router.get('/:platform/status', withAuth, async (req, res) => {
  try {
    const { platform, cfg } = getPlatformConfig(req.params.platform, { ...req.query, requireShopDomain: false });
    if (!cfg) return res.status(404).json({ error: `Unknown platform: ${platform}` });

    const supabase = await getSupabase();
    const { orgId } = req;

    const { data: slugRows } = await supabase
      .from('connectors')
      .select('id, slug')
      .in('slug', cfg.connectorSlugs);

    if (!slugRows?.length) return res.json({ connected: false });

    const connectorIds = slugRows.map(r => r.id);

    const { data: userConns } = await supabase
      .from('user_connectors')
      .select('id, connected_at, token_expires_at, external_account_name, refresh_token, connected_by')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .in('connector_id', connectorIds)
      .limit(1);

    const connected = (userConns?.length || 0) > 0;

    res.json({
      connected,
      platform,
      connectedAt: userConns?.[0]?.connected_at || null,
      externalAccount: userConns?.[0]?.external_account_name || null,
      expiresAt: userConns?.[0]?.token_expires_at || null,
    });
  } catch (error) {
    logger.error('Status check failed', { error: error.message });
    res.status(500).json({ error: 'Status check failed' });
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/integrations/:platform/start
// Returns a provider OAuth URL for the authenticated user's tenant.
// Dashboard calls this with JWT headers, then navigates to authUrl.
// ════════════════════════════════════════════════════════════════
router.post('/:platform/start', withAuth, async (req, res) => {
  try {
    const { orgId, userId } = req;
    const { authUrl, platform, cfg } = buildProviderAuthUrl(req.params.platform, orgId, userId, {
      shopDomain: req.body?.shopDomain,
    });

    logger.info(`OAuth start URL generated → ${platform}`, { org: orgId.slice(0, 8) });
    res.json({
      success: true,
      platform,
      name: cfg.name,
      authUrl,
    });
  } catch (error) {
    logger.error('OAuth start failed', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/integrations/:platform/authorize
// Redirects user to the OAuth provider's consent screen.
// Encodes orgId + userId in the state parameter for callback recovery.
// ════════════════════════════════════════════════════════════════
router.get('/:platform/authorize', withAuth, async (req, res) => {
  try {
    const { orgId, userId } = req;
    const { authUrl, platform } = buildProviderAuthUrl(req.params.platform, orgId, userId, req.query);
    logger.info(`OAuth authorize → ${platform}`, { org: orgId.slice(0, 8) });
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Authorize redirect failed', { error: error.message });
    res.redirect(`${APP_URL}?oauth_error=${encodeURIComponent(error.message)}`);
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/integrations/:platform/callback
// OAuth callback from provider — exchanges code for tokens,
// stores them in user_connectors, redirects back to dashboard.
// No auth middleware here — JWT is not present during OAuth redirect.
// orgId is recovered from the state parameter.
// ════════════════════════════════════════════════════════════════
router.get('/:platform/callback', async (req, res) => {
  const requestedPlatform = req.params.platform;
  try {
    const { code, state, error } = req.query;

    let orgId, userId, shopDomain, platform;
    if (state) {
      try {
        const decoded = decodeOAuthState(state);
        orgId = decoded.orgId;
        userId = decoded.userId;
        shopDomain = decoded.shopDomain || null;
        platform = platformKey(decoded.platform || requestedPlatform);
      } catch {
        return res.redirect(`${APP_URL}?oauth_error=invalid_state&platform=${requestedPlatform}`);
      }
    } else {
      platform = platformKey(requestedPlatform);
    }

    const { cfg } = getPlatformConfig(platform, { shopDomain });
    if (!cfg) return res.redirect(`${APP_URL}?oauth_error=unknown_platform`);

    if (error) {
      logger.warn(`OAuth callback error for ${platform}`, { error });
      return res.redirect(`${APP_URL}?oauth_error=${encodeURIComponent(error)}&platform=${platform}`);
    }

    if (!code || !state) {
      return res.redirect(`${APP_URL}?oauth_error=missing_code&platform=${platform}`);
    }

    if (!orgId) return res.redirect(`${APP_URL}?oauth_error=missing_org&platform=${platform}`);

    const redirectUri = `${oauthBaseUrl(platform)}/api/integrations/${platform}/callback`;
    const tokenData = await exchangeCodeForToken(platform, code, redirectUri, { shopDomain });
    if (shopDomain) tokenData.shopDomain = shopDomain;
    if (platform === 'github') {
      const profileResponse = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${tokenData.access_token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!profileResponse.ok) throw new Error(`GitHub identity validation failed: ${profileResponse.status}`);
      const profile = await profileResponse.json();
      tokenData.external_account_id = String(profile.id);
      tokenData.external_account_name = profile.login;
    } else if (platform === 'vercel') {
      tokenData.external_account_id = tokenData.team_id || tokenData.user_id || null;
      tokenData.external_account_name = tokenData.team_id || tokenData.user_id || 'Vercel account';
    }
    await storeTokens(platform, tokenData, orgId, userId);

    logger.info(`✅ OAuth connected: ${platform}`, {
      org: orgId.slice(0, 8),
      slugs: cfg.connectorSlugs.join(', '),
    });

    res.redirect(`${APP_URL}?oauth_success=${platform}&connected=${cfg.connectorSlugs.join(',')}`);
  } catch (error) {
    logger.error(`OAuth callback failed for ${platform}`, { error: error.message });
    res.redirect(`${APP_URL}?oauth_error=${encodeURIComponent(error.message)}&platform=${platform}`);
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/integrations/:platform/disconnect
// Sets all user_connectors rows for the platform to inactive.
// ════════════════════════════════════════════════════════════════
router.post('/:platform/disconnect', withAuth, async (req, res) => {
  try {
    const { platform, cfg } = getPlatformConfig(req.params.platform, { ...(req.body || {}), requireShopDomain: false });
    if (!cfg) return res.status(404).json({ error: `Unknown platform: ${platform}` });

    const supabase = await getSupabase();
    const { orgId } = req;

    const { data: slugRows } = await supabase
      .from('connectors')
      .select('id')
      .in('slug', cfg.connectorSlugs);

    if (!slugRows?.length) return res.json({ success: true, message: 'Nothing to disconnect' });

    const connectorIds = slugRows.map(r => r.id);

    const { error } = await supabase
      .from('user_connectors')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .in('connector_id', connectorIds);

    if (error) throw error;

    logger.info(`Disconnected ${platform}`, { org: orgId.slice(0, 8), slugs: cfg.connectorSlugs });
    res.json({ success: true, platform, disconnected: cfg.connectorSlugs });
  } catch (error) {
    logger.error('Disconnect failed', { error: error.message });
    res.status(500).json({ error: 'Disconnect failed' });
  }
});

export { refreshIfExpired };
export default router;
