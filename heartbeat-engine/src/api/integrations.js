// heartbeat-engine/src/api/integrations.js
// OAuth connector routes — authorize, callback, disconnect, status, list
// Ticket: 578b0355

import { Router } from 'express';
import { createLogger } from '../logging/logger.js';
import { getUserOrgId, extractUserId } from './org-boundary.js';

const router = Router();
const logger = createLogger('integrations-api');

// App URL for redirects — use BLOOM_APP_URL env var, fall back to Railway domain
const APP_URL = process.env.BLOOM_APP_URL || 'https://app.bloomiestaffing.com';
const API_BASE = `${APP_URL}/api/integrations`;

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
    envClientId: 'GOOGLE_CLIENT_ID',
    envClientSecret: 'GOOGLE_CLIENT_SECRET',
    connectorSlugs: ['gmail', 'google-calendar', 'google-drive'],
  },
};

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
async function exchangeCodeForToken(platform, code, redirectUri) {
  const cfg = PLATFORMS[platform];
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

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

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
  const cfg = PLATFORMS[platform];
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
  const cfg = PLATFORMS[platform];

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

    const { error } = await supabase
      .from('user_connectors')
      .upsert({
        connector_id: connectorRow.id,
        organization_id: orgId,
        connected_by: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_expires_at: expiresAt,
        granted_scopes: cfg.scopes,
        status: 'active',
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
// GET /api/integrations/:platform/status
// Returns connection status for the platform for the current org.
// ════════════════════════════════════════════════════════════════
router.get('/:platform/status', withAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const cfg = PLATFORMS[platform];
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
// GET /api/integrations/:platform/authorize
// Redirects user to the OAuth provider's consent screen.
// Encodes orgId + userId in the state parameter for callback recovery.
// ════════════════════════════════════════════════════════════════
router.get('/:platform/authorize', withAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const cfg = PLATFORMS[platform];
    if (!cfg) return res.status(404).json({ error: `Unknown platform: ${platform}` });

    const clientId = process.env[cfg.envClientId];
    if (!clientId) {
      return res.status(500).json({
        error: `${cfg.name} client ID not configured. Set ${cfg.envClientId} in Railway env vars.`
      });
    }

    const { orgId, userId } = req;
    const redirectUri = `${API_BASE}/${platform}/callback`;
    const state = Buffer.from(
      JSON.stringify({ orgId, userId, platform, ts: Date.now() })
    ).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: cfg.scopes.join(' '),
      state,
      ...(cfg.extraParams || {}),
    });

    const authUrl = `${cfg.authUrl}?${params.toString()}`;
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
  const { platform } = req.params;
  try {
    const cfg = PLATFORMS[platform];
    if (!cfg) return res.redirect(`${APP_URL}?oauth_error=unknown_platform`);

    const { code, state, error } = req.query;

    if (error) {
      logger.warn(`OAuth callback error for ${platform}`, { error });
      return res.redirect(`${APP_URL}?oauth_error=${encodeURIComponent(error)}&platform=${platform}`);
    }

    if (!code || !state) {
      return res.redirect(`${APP_URL}?oauth_error=missing_code&platform=${platform}`);
    }

    // Decode state to recover orgId and userId
    let orgId, userId;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      orgId = decoded.orgId;
      userId = decoded.userId;
    } catch {
      return res.redirect(`${APP_URL}?oauth_error=invalid_state&platform=${platform}`);
    }

    if (!orgId) return res.redirect(`${APP_URL}?oauth_error=missing_org&platform=${platform}`);

    const redirectUri = `${API_BASE}/${platform}/callback`;
    const tokenData = await exchangeCodeForToken(platform, code, redirectUri);
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
    const { platform } = req.params;
    const cfg = PLATFORMS[platform];
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
