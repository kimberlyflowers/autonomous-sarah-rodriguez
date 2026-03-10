/**
 * BLOOM OAuth Integration
 * Handles OAuth2 flows for all connectors.
 * Client connects once → token saved to Supabase user_connectors → Bloomie uses it.
 * 
 * Sources: Official docs from each provider, verified March 2026.
 * TikTok note: uses 'client_key' instead of 'client_id' in auth URL params.
 * Notion note: token endpoint uses HTTP Basic Auth (base64 clientId:clientSecret).
 * Slack note: token response nests bot token under access_token, user token under authed_user.
 * Meta/Instagram: one Meta app handles both Facebook and Instagram.
 */

import { createClient } from '@supabase/supabase-js';
const logger = {
  info: (...a) => console.log('[oauth]', ...a),
  warn: (...a) => console.warn('[oauth]', ...a),
  error: (...a) => console.error('[oauth]', ...a),
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// ── CONNECTOR DEFINITIONS ────────────────────────────────────────────────────
export const CONNECTORS = {

  // ── GOOGLE ──────────────────────────────────────────────────────────────────
  'gmail': {
    name: 'Gmail',
    authType: 'oauth2',
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    extraParams: { access_type: 'offline', prompt: 'consent' },
  },

  'google-calendar': {
    name: 'Google Calendar',
    authType: 'oauth2',
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    extraParams: { access_type: 'offline', prompt: 'consent' },
  },

  'google-drive': {
    name: 'Google Drive',
    authType: 'oauth2',
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
    ],
    extraParams: { access_type: 'offline', prompt: 'consent' },
  },

  // ── HUBSPOT ─────────────────────────────────────────────────────────────────
  // Docs: https://developers.hubspot.com/docs/apps/authentication/working-with-oauth
  // Auth URL: https://app.hubspot.com/oauth/authorize
  // Token URL: https://api.hubapi.com/oauth/v1/token
  // Access tokens expire in 30 minutes; refresh tokens are long-lived.
  'hubspot': {
    name: 'HubSpot',
    authType: 'oauth2',
    clientId: process.env.HUBSPOT_CLIENT_ID,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.objects.companies.read',
    ],
    extraParams: {},
  },

  // ── SLACK ───────────────────────────────────────────────────────────────────
  // Docs: https://api.slack.com/authentication/oauth-v2
  // Auth URL: https://slack.com/oauth/v2/authorize
  // Token URL: https://slack.com/api/oauth.v2.access (POST with client_id+secret as Basic Auth)
  // Slack tokens do not expire unless revoked.
  // Bot token is in access_token; user token is in authed_user.access_token
  'slack': {
    name: 'Slack',
    authType: 'oauth2',
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: [
      'channels:read',
      'channels:history',
      'chat:write',
      'files:read',
      'users:read',
      'im:read',
      'im:write',
    ],
    extraParams: {},
    // Slack uses Basic Auth for token exchange (client_id:client_secret base64)
    tokenAuthMethod: 'basic',
  },

  // ── NOTION ──────────────────────────────────────────────────────────────────
  // Docs: https://developers.notion.com/docs/authorization
  // Auth URL: provided in integration settings page on notion.so, follows pattern below
  // Token URL: https://api.notion.com/v1/oauth/token (POST with Basic Auth)
  // Notion uses HTTP Basic Auth for token exchange (clientId:clientSecret base64)
  // No scopes param — Notion controls access via workspace page selection by user
  'notion': {
    name: 'Notion',
    authType: 'oauth2',
    clientId: process.env.NOTION_CLIENT_ID,
    clientSecret: process.env.NOTION_CLIENT_SECRET,
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    extraParams: { owner: 'user', response_type: 'code' },
    tokenAuthMethod: 'basic',
  },

  // ── LINKEDIN ────────────────────────────────────────────────────────────────
  // Docs: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
  // Auth URL: https://www.linkedin.com/oauth/v2/authorization
  // Token URL: https://www.linkedin.com/oauth/v2/accessToken
  // Access tokens expire in ~60 days; refresh tokens available if r_liteprofile requested
  'linkedin': {
    name: 'LinkedIn',
    authType: 'oauth2',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: [
      'openid',
      'profile',
      'email',
      'w_member_social',
    ],
    extraParams: {},
  },

  // ── META: FACEBOOK + INSTAGRAM ──────────────────────────────────────────────
  // One Meta app handles both. Facebook Graph API for pages/posts/ads.
  // Docs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens
  // Auth URL: https://www.facebook.com/v18.0/dialog/oauth
  // Token URL: https://graph.facebook.com/v18.0/oauth/access_token
  'facebook': {
    name: 'Facebook',
    authType: 'oauth2',
    clientId: process.env.META_APP_ID,
    clientSecret: process.env.META_APP_SECRET,
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: [
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_ads',
      'public_profile',
    ],
    extraParams: {},
  },

  // Instagram uses same Meta app, different scopes
  // Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
  'instagram': {
    name: 'Instagram',
    authType: 'oauth2',
    clientId: process.env.META_APP_ID,
    clientSecret: process.env.META_APP_SECRET,
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
    ],
    extraParams: {},
  },

  // ── TIKTOK ──────────────────────────────────────────────────────────────────
  // Docs: https://developers.tiktok.com/doc/oauth-user-access-token-management
  // Auth URL: https://www.tiktok.com/v2/auth/authorize/
  // Token URL: https://open.tiktokapis.com/v2/oauth/token/
  // IMPORTANT: TikTok uses 'client_key' (not client_id) in the auth URL params.
  // Access tokens expire in 24 hours; refresh tokens expire in 365 days.
  'tiktok': {
    name: 'TikTok',
    authType: 'oauth2',
    clientId: process.env.TIKTOK_CLIENT_KEY,      // TikTok calls this "Client Key"
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: [
      'user.info.basic',
      'user.info.profile',
      'user.info.stats',
      'video.list',
      'video.publish',
    ],
    extraParams: {},
    // TikTok uses 'client_key' param instead of 'client_id' in the auth URL
    clientIdParam: 'client_key',
  },

  // ── CANVA ───────────────────────────────────────────────────────────────────
  // Docs: https://www.canva.dev/docs/apps/authenticating-users/
  // Auth URL: https://www.canva.com/api/oauth/authorize
  // Token URL: https://api.canva.com/rest/v1/oauth/token
  'canva': {
    name: 'Canva',
    authType: 'oauth2',
    clientId: process.env.CANVA_CLIENT_ID,
    clientSecret: process.env.CANVA_CLIENT_SECRET,
    authUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    scopes: [
      'asset:read',
      'asset:write',
      'design:content:read',
      'design:content:write',
      'design:meta:read',
      'folder:read',
      'folder:write',
      'profile:read',
    ],
    extraParams: { code_challenge_method: 'S256' },
    // Canva requires PKCE — handled in buildAuthUrl
    requiresPKCE: true,
  },

  // ── SHOPIFY ─────────────────────────────────────────────────────────────────
  // Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-token-types/online-access
  // Auth URL: https://{shop}.myshopify.com/admin/oauth/authorize (shop-specific)
  // Token URL: https://{shop}.myshopify.com/admin/oauth/access_token
  // NOTE: Shopify OAuth is shop-specific — the shop domain must be collected from the user first
  'shopify': {
    name: 'Shopify',
    authType: 'oauth2',
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    authUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
    tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token',
    scopes: [
      'read_orders',
      'read_products',
      'read_customers',
      'write_products',
    ],
    extraParams: {},
    requiresShopDomain: true,
  },

  // ── STRIPE (API key — no OAuth flow needed) ──────────────────────────────────
  'stripe': {
    name: 'Stripe',
    authType: 'api_key',
    clientId: null,
    clientSecret: null,
    authUrl: null,
    tokenUrl: null,
    scopes: [],
    extraParams: {},
  },

  // ── AIRTABLE (API key — no OAuth flow needed) ─────────────────────────────────
  'airtable': {
    name: 'Airtable',
    authType: 'api_key',
    clientId: null,
    clientSecret: null,
    authUrl: null,
    tokenUrl: null,
    scopes: [],
    extraParams: {},
  },
};

// ── STEP 1: Build the authorization URL ──────────────────────────────────────
export function buildAuthUrl(slug, orgId, extraQuery = {}) {
  const connector = CONNECTORS[slug];
  if (!connector) throw new Error(`Unknown connector: ${slug}`);

  if (connector.authType === 'api_key') {
    throw new Error(`${connector.name} uses an API key — connect via the key input form, not OAuth.`);
  }

  if (connector.requiresShopDomain && !extraQuery.shop) {
    throw new Error(`Shopify requires a shop domain. Pass ?shop=yourstore.myshopify.com`);
  }

  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'https://autonomous-sarah-rodriguez-production.up.railway.app';

  const redirectUri = `${baseUrl}/oauth/callback/${slug}`;
  const state = Buffer.from(JSON.stringify({ orgId, slug })).toString('base64url');

  // Build auth URL — handle shop-specific Shopify URL
  let authUrl = connector.authUrl;
  if (connector.requiresShopDomain && extraQuery.shop) {
    authUrl = `https://${extraQuery.shop}/admin/oauth/authorize`;
  }

  // TikTok uses 'client_key' instead of 'client_id'
  const clientIdKey = connector.clientIdParam || 'client_id';

  const params = new URLSearchParams({
    [clientIdKey]: connector.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    ...connector.extraParams,
  });

  // Scopes: Notion has no scope param
  if (connector.scopes.length > 0) {
    params.set('scope', connector.scopes.join(' '));
  }

  return `${authUrl}?${params.toString()}`;
}

// ── STEP 2: Exchange code for tokens and save to Supabase ────────────────────
export async function handleCallback(slug, code, stateB64) {
  const connector = CONNECTORS[slug];
  if (!connector) throw new Error(`Unknown connector: ${slug}`);

  let orgId, userId;
  try {
    const state = JSON.parse(Buffer.from(stateB64, 'base64url').toString());
    orgId = state.orgId;
    userId = state.userId;
  } catch (e) {
    throw new Error('Invalid OAuth state parameter');
  }

  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'https://autonomous-sarah-rodriguez-production.up.railway.app';

  const redirectUri = `${baseUrl}/oauth/callback/${slug}`;

  // Build token request — Slack and Notion use HTTP Basic Auth
  let tokenRes;
  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  if (connector.tokenAuthMethod === 'basic') {
    // Notion and Slack: credentials in Authorization header
    const credentials = Buffer.from(`${connector.clientId}:${connector.clientSecret}`).toString('base64');
    tokenRes = await fetch(connector.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body,
    });
  } else {
    // Standard: credentials in body
    body.set('client_id', connector.clientId);
    body.set('client_secret', connector.clientSecret);
    tokenRes = await fetch(connector.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed for ${slug}: ${err}`);
  }

  const tokens = await tokenRes.json();

  // Slack nests the bot token at top level; user token at authed_user.access_token
  // We store the bot token (access_token) for Sarah to act as the bot
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token || null;

  if (!accessToken) {
    throw new Error(`No access_token in ${slug} token response: ${JSON.stringify(tokens)}`);
  }

  // Look up connector row
  const { data: connectorRow } = await supabase
    .from('connectors')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!connectorRow) throw new Error(`Connector slug '${slug}' not found in connectors table`);

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from('user_connectors')
    .upsert({
      connector_id: connectorRow.id,
      organization_id: orgId,
      connected_by: userId || process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      granted_scopes: connector.scopes,
      status: 'active',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'connector_id,organization_id',
    });

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

  logger.info(`✅ OAuth connected: ${connector.name} for org ${orgId}`);
  return { connector: connector.name, orgId };
}

// ── STEP 3: Get active connector tokens for an org ───────────────────────────
export async function getActiveConnectors(orgId) {
  const { data, error } = await supabase
    .from('user_connectors')
    .select('connector_id, access_token, refresh_token, token_expires_at, granted_scopes, connectors(slug, name)')
    .eq('organization_id', orgId)
    .eq('status', 'active');

  if (error) {
    logger.warn('getActiveConnectors error:', error.message);
    return [];
  }

  return data || [];
}

// ── STEP 4: Refresh an expired token ─────────────────────────────────────────
export async function refreshToken(slug, orgId) {
  const connector = CONNECTORS[slug];
  if (!connector || !connector.tokenUrl) return null;

  const { data: uc } = await supabase
    .from('user_connectors')
    .select('refresh_token, connector_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .single();

  if (!uc?.refresh_token) return null;

  let res;
  const body = new URLSearchParams({
    refresh_token: uc.refresh_token,
    grant_type: 'refresh_token',
  });

  if (connector.tokenAuthMethod === 'basic') {
    const credentials = Buffer.from(`${connector.clientId}:${connector.clientSecret}`).toString('base64');
    res = await fetch(connector.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body,
    });
  } else {
    body.set('client_id', connector.clientId);
    body.set('client_secret', connector.clientSecret);
    res = await fetch(connector.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  if (!res.ok) return null;

  const tokens = await res.json();
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  await supabase
    .from('user_connectors')
    .update({
      access_token: tokens.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('connector_id', uc.connector_id)
    .eq('organization_id', orgId);

  return tokens.access_token;
}
