import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';
import { extractUserId, validateAgentAccess } from './org-boundary.js';

const router = Router();
const logger = createLogger('avatar-api');

const SARAH_AGENT_ID = process.env.SARAH_AGENT_ID || process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003';

let serviceClient = null;

function getSupabase() {
  if (!serviceClient) {
    serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return serviceClient;
}

function requireAuth(req, res, next) {
  if (!extractUserId(req)) return res.status(401).json({ error: 'Authentication required' });
  next();
}

function envConfigForAgent(agentId) {
  const suffix = String(agentId || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const embedUrl =
    process.env[`LIVE_AVATAR_EMBED_URL_${suffix}`] ||
    process.env[`HEYGEN_LIVE_AVATAR_EMBED_URL_${suffix}`] ||
    (agentId === SARAH_AGENT_ID ? process.env.HEYGEN_LIVE_AVATAR_SARAH_EMBED_URL : null) ||
    process.env.HEYGEN_LIVE_AVATAR_EMBED_URL ||
    process.env.LIVE_AVATAR_EMBED_URL ||
    null;

  if (!embedUrl) return null;
  return {
    provider: process.env.LIVE_AVATAR_PROVIDER || 'heygen',
    embedUrl,
    mode: 'embed',
    source: 'env'
  };
}

function pickAgentConfig(value, agentId) {
  const config = value || {};
  return config.agents?.[agentId] || config.agentConfigs?.[agentId] || config[agentId] || config.default || null;
}

router.get('/live/config', requireAuth, async (req, res) => {
  const agentId = req.query.agentId || SARAH_AGENT_ID;

  try {
    const access = await validateAgentAccess(req, agentId);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });

    const sb = getSupabase();
    let storedConfig = null;
    try {
      const { data } = await sb
        .from('user_settings')
        .select('value')
        .eq('organization_id', access.orgId)
        .eq('key', 'live_avatar_config')
        .maybeSingle();
      storedConfig = pickAgentConfig(data?.value, agentId);
    } catch (e) {
      logger.warn('Live avatar settings lookup failed', { error: e.message });
    }

    const config = storedConfig || envConfigForAgent(agentId);
    if (!config?.embedUrl) {
      return res.json({
        enabled: false,
        configured: false,
        provider: 'heygen',
        agentId,
        message: 'Live avatar is not configured for this employee yet'
      });
    }

    return res.json({
      enabled: true,
      configured: true,
      provider: config.provider || 'heygen',
      mode: config.mode || 'embed',
      agentId,
      embedUrl: config.embedUrl,
      avatarId: config.avatarId || null,
      source: config.source || 'tenant'
    });
  } catch (e) {
    logger.error('Live avatar config error', { error: e.message });
    return res.status(500).json({ error: 'Failed to load live avatar config' });
  }
});

router.post('/live/config', requireAuth, async (req, res) => {
  const agentId = req.body?.agentId || SARAH_AGENT_ID;

  try {
    const access = await validateAgentAccess(req, agentId);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });

    const embedUrl = String(req.body?.embedUrl || '').trim();
    if (!/^https:\/\/.+/i.test(embedUrl)) {
      return res.status(400).json({ error: 'A secure HeyGen LiveAvatar embed URL is required' });
    }

    const sb = getSupabase();
    const { data: existing } = await sb
      .from('user_settings')
      .select('value')
      .eq('organization_id', access.orgId)
      .eq('key', 'live_avatar_config')
      .maybeSingle();

    const value = existing?.value || {};
    const next = {
      ...value,
      agents: {
        ...(value.agents || {}),
        [agentId]: {
          provider: req.body?.provider || 'heygen',
          mode: 'embed',
          embedUrl,
          avatarId: req.body?.avatarId || null,
          updatedAt: new Date().toISOString()
        }
      }
    };

    const { error } = await sb.from('user_settings').upsert({
      organization_id: access.orgId,
      key: 'live_avatar_config',
      value: next,
      updated_at: new Date().toISOString()
    }, { onConflict: 'organization_id,key' });

    if (error) throw error;
    return res.json({ success: true, agentId, provider: 'heygen', configured: true });
  } catch (e) {
    logger.error('Live avatar config save error', { error: e.message });
    return res.status(500).json({ error: 'Failed to save live avatar config' });
  }
});

export default router;
