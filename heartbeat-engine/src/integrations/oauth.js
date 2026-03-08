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
  process.env.SUPABASE_SERVICE_KEY
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
};

// ── STEP 1: Build the authorization URL ──────────────────────────────────────
export function buildAuthUrl(slug, orgId) {
  const connector = CONNECTORS[slug];
  if (!connector) throw new Error(`Unknown connector: ${slug}`);

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
      connected_by: userId || null,
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
