// Credential Registry for Browser Automation
// Multi-tenant: credentials stored per-org in Supabase, not shared env vars
// Each Bloomie agent only accesses their own org's credentials

import { createLogger } from '../logging/logger.js';
const logger = createLogger('credential-registry');

// Known site templates — used for defaults when adding new sites
const SITE_TEMPLATES = {
  quora: { name: 'Quora', domain: 'quora.com', loginUrl: 'https://www.quora.com/login' },
  reddit: { name: 'Reddit', domain: 'reddit.com', loginUrl: 'https://www.reddit.com/login' },
  facebook: { name: 'Facebook', domain: 'facebook.com', loginUrl: 'https://www.facebook.com/login' },
  linkedin: { name: 'LinkedIn', domain: 'linkedin.com', loginUrl: 'https://www.linkedin.com/login' },
  twitter: { name: 'Twitter / X', domain: 'x.com', loginUrl: 'https://x.com/i/flow/login' },
  instagram: { name: 'Instagram', domain: 'instagram.com', loginUrl: 'https://www.instagram.com/accounts/login/' },
  canva: { name: 'Canva', domain: 'canva.com', loginUrl: 'https://www.canva.com/login' },
  wordpress: { name: 'WordPress', domain: '', loginUrl: '' },
  pinterest: { name: 'Pinterest', domain: 'pinterest.com', loginUrl: 'https://www.pinterest.com/login/' },
  tiktok: { name: 'TikTok', domain: 'tiktok.com', loginUrl: 'https://www.tiktok.com/login' },
  youtube: { name: 'YouTube', domain: 'youtube.com', loginUrl: 'https://accounts.google.com/signin' },
  medium: { name: 'Medium', domain: 'medium.com', loginUrl: 'https://medium.com/m/signin' },
};

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

// Simple reversible encoding — not military-grade but keeps passwords out of plain sight in DB
// For production, use pgcrypto or Vault
const CRED_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'bl00m-cr3d-k3y-2026';
function encodePassword(plain) {
  return Buffer.from(plain).toString('base64');
}
function decodePassword(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

/**
 * Get credentials for a site (per-org)
 */
export async function getCredentials(siteName, orgId) {
  try {
    const sb = await getSupabase();
    const org = orgId || process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';

    const { data, error } = await sb.from('site_credentials')
      .select('*')
      .eq('org_id', org)
      .eq('site_key', siteName.toLowerCase())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      logger.warn(`No credentials found for site "${siteName}" in org ${org}`);
      return null;
    }

    // Update last_used_at
    sb.from('site_credentials').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {});

    return {
      configured: true,
      name: data.site_name,
      domain: data.domain,
      loginUrl: data.login_url,
      email: data.username,
      password: decodePassword(data.encrypted_password),
      notes: data.notes,
      extraFields: data.extra_fields || {}
    };
  } catch (e) {
    logger.error('getCredentials failed:', e.message);
    return null;
  }
}

/**
 * List all sites for an org (never exposes passwords)
 */
export async function listSites(orgId) {
  try {
    const sb = await getSupabase();
    const org = orgId || process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';

    const { data, error } = await sb.from('site_credentials')
      .select('id, site_key, site_name, domain, login_url, username, is_active, last_used_at, notes, created_at')
      .eq('org_id', org)
      .order('site_name');

    if (error) throw error;
    return (data || []).map(s => ({
      ...s,
      configured: true
    }));
  } catch (e) {
    logger.error('listSites failed:', e.message);
    return [];
  }
}

/**
 * Check if a site has credentials configured
 */
export async function isSiteConfigured(siteName, orgId) {
  const creds = await getCredentials(siteName, orgId);
  return creds !== null;
}

/**
 * Get login instructions for browser_task
 */
export async function getLoginInstructions(siteName, orgId) {
  const creds = await getCredentials(siteName, orgId);
  if (!creds) return { error: `No credentials configured for "${siteName}". Ask Kimberly to add them in Dashboard → Settings → Site Logins.` };

  return {
    url: creds.loginUrl,
    steps: [
      `Navigate to ${creds.loginUrl}`,
      `Enter email/username: ${creds.email}`,
      `Enter password: ${creds.password}`,
      `Click submit/login button`,
      `Wait for dashboard or home page to load`
    ],
    notes: creds.notes
  };
}

/**
 * Add or update a site credential (used by dashboard API)
 */
export async function upsertCredential(orgId, siteKey, { siteName, domain, loginUrl, username, password, notes }) {
  try {
    const sb = await getSupabase();
    const template = SITE_TEMPLATES[siteKey.toLowerCase()] || {};

    const row = {
      org_id: orgId,
      site_key: siteKey.toLowerCase(),
      site_name: siteName || template.name || siteKey,
      domain: domain || template.domain || '',
      login_url: loginUrl || template.loginUrl || '',
      username: username,
      encrypted_password: encodePassword(password),
      notes: notes || '',
      is_active: true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb.from('site_credentials')
      .upsert(row, { onConflict: 'org_id,site_key' })
      .select('id, site_key, site_name, domain, is_active')
      .single();

    if (error) throw error;
    logger.info(`Credential upserted for ${siteKey} in org ${orgId}`);
    return { success: true, credential: data };
  } catch (e) {
    logger.error('upsertCredential failed:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Delete a site credential
 */
export async function deleteCredential(orgId, siteKey) {
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('site_credentials')
      .delete()
      .eq('org_id', orgId)
      .eq('site_key', siteKey.toLowerCase());
    if (error) throw error;
    return { success: true };
  } catch (e) {
    logger.error('deleteCredential failed:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Get registry summary for dashboard (never exposes passwords)
 */
export async function getRegistrySummary(orgId) {
  const sites = await listSites(orgId);
  // Also include unconfigured templates so the user knows what's available
  const configuredKeys = new Set(sites.map(s => s.site_key));
  const unconfigured = Object.entries(SITE_TEMPLATES)
    .filter(([key]) => !configuredKeys.has(key))
    .map(([key, tmpl]) => ({
      site_key: key,
      site_name: tmpl.name,
      domain: tmpl.domain,
      configured: false
    }));

  return { configured: sites, available: unconfigured };
}

export { SITE_TEMPLATES };
