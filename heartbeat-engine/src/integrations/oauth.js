/**
 * BLOOM OAuth Integration
 * Handles OAuth2 flows for all connectors.
 * Client connects once → token saved to Supabase user_connectors → Bloomie uses it.
 */

import { createClient } from '@supabase/supabase-js';
const logger = {
  info: (...a) => console.log('[oauth]', ...a),
  warn: (...a) => console.warn('[oauth]', ...a),
  error: (...a) => console.error('[oauth]', ...a),
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// ── CONNECTOR DEFINITIONS ────────────────────────────────────────────────────
// Add new connectors here — everything else is automatic
export const CONNECTORS = {
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
  'hubspot': {
    name: 'HubSpot',
    authType: 'oauth2',
    clientId: process.env.HUBSPOT_CLIENT_ID,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write', 'crm.objects.deals.read', 'crm.objects.deals.write'],
    extraParams: {},
  },
  'notion': {
    name: 'Notion',
    authType: 'oauth2',
    clientId: process.env.NOTION_CLIENT_ID,
    clientSecret: process.env.NOTION_CLIENT_SECRET,
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    extraParams: { owner: 'user' },
  },
  'slack': {
    name: 'Slack',
    authType: 'oauth2',
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['channels:read', 'chat:write', 'files:read', 'users:read'],
    extraParams: {},
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
  'salesforce': {
    name: 'Salesforce',
    authType: 'oauth2',
    clientId: process.env.SALESFORCE_CLIENT_ID,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
    authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    scopes: ['api', 'refresh_token', 'offline_access'],
    extraParams: {},
  },
  'instagram': {
    name: 'Instagram',
    authType: 'oauth2',
    clientId: process.env.META_APP_ID,
    clientSecret: process.env.META_APP_SECRET,
    authUrl: 'https://api.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'],
    extraParams: {},
  },
  'facebook': {
    name: 'Facebook',
    authType: 'oauth2',
    clientId: process.env.META_APP_ID,
    clientSecret: process.env.META_APP_SECRET,
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'ads_management'],
    extraParams: {},
  },
  'linkedin': {
    name: 'LinkedIn',
    authType: 'oauth2',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['openid', 'profile', 'w_member_social', 'r_organization_social'],
    extraParams: {},
  },
  'tiktok': {
    name: 'TikTok',
    authType: 'oauth2',
    clientId: process.env.TIKTOK_CLIENT_ID,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.list', 'video.publish'],
    extraParams: {},
  },
  'airtable': {
    name: 'Airtable',
    authType: 'oauth2',
    clientId: process.env.AIRTABLE_CLIENT_ID,
    clientSecret: process.env.AIRTABLE_CLIENT_SECRET,
    authUrl: 'https://airtable.com/oauth2/v1/authorize',
    tokenUrl: 'https://airtable.com/oauth2/v1/token',
    scopes: ['data.records:read', 'data.records:write', 'schema.bases:read'],
    extraParams: { code_challenge_method: 'S256' },
  },
  'canva': {
    name: 'Canva',
    authType: 'oauth2',
    clientId: process.env.CANVA_CLIENT_ID,
    clientSecret: process.env.CANVA_CLIENT_SECRET,
    authUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    scopes: ['asset:read', 'asset:write', 'design:content:read', 'design:content:write'],
    extraParams: {},
  },
  'shopify': {
    name: 'Shopify',
    authType: 'oauth2',
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    authUrl: `https://${process.env.SHOPIFY_SHOP || 'your-store'}.myshopify.com/admin/oauth/authorize`,
    tokenUrl: `https://${process.env.SHOPIFY_SHOP || 'your-store'}.myshopify.com/admin/oauth/access_token`,
    scopes: ['read_orders', 'write_orders', 'read_products', 'write_products', 'read_customers'],
    extraParams: {},
  },
  'stripe': {
    name: 'Stripe',
    authType: 'oauth2',
    clientId: process.env.STRIPE_CLIENT_ID,
    clientSecret: process.env.STRIPE_SECRET_KEY,
    authUrl: 'https://connect.stripe.com/oauth/authorize',
    tokenUrl: 'https://connect.stripe.com/oauth/token',
    scopes: ['read_write'],
    extraParams: { response_type: 'code' },
  },
};

// ── STEP 1: Build the authorization URL ──────────────────────────────────────
export function buildAuthUrl(slug, orgId) {
  const connector = CONNECTORS[slug];
  if (!connector) throw new Error(`Unknown connector: ${slug}`);

  // If the connector's credentials aren't configured yet, throw a friendly error
  if (!connector.clientId || !connector.clientSecret) {
    throw new Error(`${connector.name} integration coming soon — API credentials not yet configured`);
  }

  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'https://autonomous-sarah-rodriguez-production.up.railway.app';

  const redirectUri = `${baseUrl}/oauth/callback/${slug}`;

  // State encodes orgId so we know who to save the token for after callback
  const state = Buffer.from(JSON.stringify({ orgId, slug })).toString('base64url');

  const params = new URLSearchParams({
    client_id: connector.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: connector.scopes.join(' '),
    state,
    ...connector.extraParams,
  });

  return `${connector.authUrl}?${params.toString()}`;
}

// ── STEP 2: Exchange code for tokens and save to Supabase ────────────────────
export async function handleCallback(slug, code, stateB64) {
  const connector = CONNECTORS[slug];
  if (!connector) throw new Error(`Unknown connector: ${slug}`);

  // Decode state to get orgId
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

  // Exchange code for tokens
  const tokenRes = await fetch(connector.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: connector.clientId,
      client_secret: connector.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokens = await tokenRes.json();

  // Look up the connector row in Supabase
  const { data: connectorRow } = await supabase
    .from('connectors')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!connectorRow) throw new Error(`Connector slug ${slug} not found in DB`);

  // Upsert into user_connectors — one row per org per connector
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from('user_connectors')
    .upsert({
      connector_id: connectorRow.id,
      organization_id: orgId,
      connected_by: userId || process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
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
// Used by chat.js to load tools dynamically per org
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
  if (!connector) return null;

  const { data: uc } = await supabase
    .from('user_connectors')
    .select('refresh_token, connector_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .single();

  if (!uc?.refresh_token) return null;

  const res = await fetch(connector.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: uc.refresh_token,
      client_id: connector.clientId,
      client_secret: connector.clientSecret,
      grant_type: 'refresh_token',
    }),
  });

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
