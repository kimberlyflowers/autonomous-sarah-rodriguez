import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';
import { extractUserId, validateAgentAccess } from './org-boundary.js';

const router = Router();
const logger = createLogger('avatar-api');

const SARAH_AGENT_ID = process.env.SARAH_AGENT_ID || process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003';
const HEYGEN_API_BASE = (process.env.HEYGEN_API_BASE_URL || 'https://api.heygen.com').replace(/\/+$/, '');
const LIVEAVATAR_API_BASE = (process.env.LIVEAVATAR_API_BASE_URL || 'https://api.liveavatar.com').replace(/\/+$/, '');

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

function getHeyGenApiKey() {
  return process.env.HEYGEN_API_KEY || process.env.HEYGEN_API_TOKEN || '';
}

function getLiveAvatarApiKey() {
  return process.env.LIVEAVATAR_API_KEY
    || process.env.LIVE_AVATAR_API_KEY
    || process.env.HEYGEN_LIVEAVATAR_API_KEY
    || process.env.HEYGEN_LIVE_AVATAR_API_KEY
    || '';
}

async function heygenFetch(path, options = {}) {
  const apiKey = getHeyGenApiKey();
  if (!apiKey) {
    const err = new Error('HeyGen API key is not configured');
    err.status = 503;
    throw err;
  }

  const response = await fetch(`${HEYGEN_API_BASE}${path}`, {
    ...options,
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || `HeyGen API error ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function liveAvatarFetch(path, options = {}) {
  const apiKey = getLiveAvatarApiKey();
  if (!apiKey) {
    const err = new Error('LiveAvatar API key is not configured');
    err.status = 503;
    throw err;
  }

  const response = await fetch(`${LIVEAVATAR_API_BASE}${path}`, {
    ...options,
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.data?.[0]?.message || data?.message || data?.error || `LiveAvatar API error ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function getStoredAgentConfig(orgId, agentId) {
  const sb = getSupabase();
  const { data } = await sb
    .from('user_settings')
    .select('value')
    .eq('organization_id', orgId)
    .eq('key', 'live_avatar_config')
    .maybeSingle();
  return {
    value: data?.value || {},
    agentConfig: pickAgentConfig(data?.value, agentId)
  };
}

async function pollRealtimeSession(streamId, timeoutMs = 22000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await heygenFetch(`/v3/avatar-realtime/${encodeURIComponent(streamId)}`, { method: 'GET' });
    const status = last?.data?.status;
    const hlsUrl = last?.data?.hls_url;
    if (hlsUrl || status === 'error' || status === 'completed') break;
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return last;
}

router.get('/live/config', requireAuth, async (req, res) => {
  const agentId = req.query.agentId || SARAH_AGENT_ID;

  try {
    const access = await validateAgentAccess(req, agentId);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });

    let storedConfig = null;
    try {
      storedConfig = (await getStoredAgentConfig(access.orgId, agentId)).agentConfig;
    } catch (e) {
      logger.warn('Live avatar settings lookup failed', { error: e.message });
    }

    const config = storedConfig || envConfigForAgent(agentId);
    if (!config?.embedUrl && !config?.avatarId) {
      return res.json({
        enabled: false,
        configured: false,
        provider: 'heygen',
        agentId,
        heygenApiConfigured: !!getHeyGenApiKey(),
        liveAvatarApiConfigured: !!getLiveAvatarApiKey(),
        message: 'Live avatar is not configured for this employee yet'
      });
    }

    return res.json({
      enabled: true,
      configured: true,
      provider: config.provider || 'heygen',
      mode: config.mode || 'embed',
      agentId,
      embedUrl: config.embedUrl || null,
      avatarId: config.avatarId || null,
      voiceId: config.voiceId || null,
      contextId: config.contextId || null,
      language: config.language || 'en',
      sandbox: config.sandbox !== false,
      avatarName: config.avatarName || null,
      heygenApiConfigured: !!getHeyGenApiKey(),
      liveAvatarApiConfigured: !!getLiveAvatarApiKey(),
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

    const mode = req.body?.mode || (req.body?.embedUrl ? 'embed' : 'heygen_realtime');
    const embedUrl = String(req.body?.embedUrl || '').trim();
    const avatarId = String(req.body?.avatarId || '').trim();
    const voiceId = String(req.body?.voiceId || '').trim();
    const contextId = String(req.body?.contextId || '').trim();

    if (mode === 'embed' && !/^https:\/\/.+/i.test(embedUrl)) {
      return res.status(400).json({ error: 'A secure HeyGen LiveAvatar embed URL is required' });
    }

    if (mode === 'heygen_realtime' && (!avatarId || !voiceId)) {
      return res.status(400).json({ error: 'HeyGen avatar and voice are required' });
    }

    if (mode === 'liveavatar_sdk' && (!avatarId || !contextId)) {
      return res.status(400).json({ error: 'LiveAvatar avatar ID and context ID are required' });
    }

    const sb = getSupabase();
    const { value } = await getStoredAgentConfig(access.orgId, agentId);

    const next = {
      ...value,
      agents: {
        ...(value.agents || {}),
        [agentId]: {
          provider: req.body?.provider || 'heygen',
          mode,
          embedUrl: mode === 'embed' ? embedUrl : null,
          avatarId: avatarId || null,
          voiceId: voiceId || null,
          contextId: contextId || null,
          language: req.body?.language || 'en',
          sandbox: req.body?.sandbox !== false,
          avatarName: req.body?.avatarName || null,
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
    return res.json({ success: true, agentId, provider: 'heygen', mode, configured: true });
  } catch (e) {
    logger.error('Live avatar config save error', { error: e.message });
    return res.status(500).json({ error: 'Failed to save live avatar config' });
  }
});

router.post('/live/session-token', requireAuth, async (req, res) => {
  const agentId = req.body?.agentId || SARAH_AGENT_ID;

  try {
    const access = await validateAgentAccess(req, agentId);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });

    const { agentConfig } = await getStoredAgentConfig(access.orgId, agentId);
    const config = agentConfig || {};
    const avatarId = String(req.body?.avatarId || config.avatarId || '').trim();
    const contextId = String(req.body?.contextId || config.contextId || '').trim();
    const voiceId = String(req.body?.voiceId || config.voiceId || '').trim();
    const language = String(req.body?.language || config.language || 'en').trim();
    const pushToTalk = req.body?.pushToTalk === true;
    const sandbox = req.body?.sandbox ?? config.sandbox ?? true;

    if (!avatarId || !contextId) {
      return res.status(400).json({ error: 'Configure a LiveAvatar avatar ID and context ID before starting Live' });
    }

    const tokenResponse = await liveAvatarFetch('/v1/sessions/token', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'FULL',
        avatar_id: avatarId,
        avatar_persona: {
          context_id: contextId,
          ...(voiceId ? { voice_id: voiceId } : {}),
          language
        },
        video_settings: {
          quality: req.body?.quality || config.quality || 'medium',
          encoding: req.body?.encoding || config.encoding || 'H264'
        },
        ...(pushToTalk ? { interactivity_type: 'PUSH_TO_TALK' } : {}),
        is_sandbox: sandbox !== false
      })
    });

    return res.json({
      sessionToken: tokenResponse?.data?.session_token || null,
      sessionId: tokenResponse?.data?.session_id || null
    });
  } catch (e) {
    logger.warn('LiveAvatar session token failed', { status: e.status, error: e.message });
    return res.status(e.status || 500).json({ error: e.message || 'Failed to start LiveAvatar session' });
  }
});

router.get('/heygen/status', requireAuth, async (req, res) => {
  try {
    if (!getHeyGenApiKey()) {
      return res.json({ configured: false, ok: false, message: 'HeyGen API key is not configured' });
    }
    return res.json({
      configured: true,
      ok: true,
      liveAvatarConfigured: !!getLiveAvatarApiKey()
    });
  } catch (e) {
    logger.warn('HeyGen status error', { error: e.message });
    return res.status(500).json({ error: 'Failed to check HeyGen status' });
  }
});

router.get('/heygen/avatars', requireAuth, async (req, res) => {
  try {
    const data = await heygenFetch('/v3/avatars', { method: 'GET' });
    const avatars = (data?.data || []).map(avatar => ({
      id: avatar.id,
      name: avatar.name,
      gender: avatar.gender || null,
      status: avatar.status || null,
      consentStatus: avatar.consent_status || null,
      previewImageUrl: avatar.preview_image_url || null,
      previewVideoUrl: avatar.preview_video_url || null,
      defaultVoiceId: avatar.default_voice_id || null,
      looksCount: avatar.looks_count || 0
    }));
    return res.json({ avatars, hasMore: !!data?.has_more, nextToken: data?.next_token || null });
  } catch (e) {
    logger.warn('HeyGen avatar list failed', { status: e.status, error: e.message });
    return res.status(e.status || 500).json({ error: e.message || 'Failed to load HeyGen avatars' });
  }
});

router.get('/heygen/voices', requireAuth, async (req, res) => {
  try {
    const data = await heygenFetch('/v3/voices', { method: 'GET' });
    const voices = (data?.data || []).map(voice => ({
      id: voice.voice_id || voice.id,
      name: voice.name,
      language: voice.language || null,
      gender: voice.gender || null,
      previewAudioUrl: voice.preview_audio_url || null
    }));
    return res.json({ voices, hasMore: !!data?.has_more, nextToken: data?.next_token || null });
  } catch (e) {
    logger.warn('HeyGen voice list failed', { status: e.status, error: e.message });
    return res.status(e.status || 500).json({ error: e.message || 'Failed to load HeyGen voices' });
  }
});

router.post('/live/session', requireAuth, async (req, res) => {
  const agentId = req.body?.agentId || SARAH_AGENT_ID;

  try {
    const access = await validateAgentAccess(req, agentId);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });

    const { agentConfig } = await getStoredAgentConfig(access.orgId, agentId);
    const config = agentConfig || {};
    const avatarId = String(req.body?.avatarId || config.avatarId || '').trim();
    const voiceId = String(req.body?.voiceId || config.voiceId || '').trim();
    const text = String(req.body?.text || `Hi, I'm ${config.avatarName || 'your Bloomie'}. I'm ready to help.`).trim();

    if (!avatarId || !voiceId) {
      return res.status(400).json({ error: 'Configure a HeyGen avatar and voice before starting Live' });
    }
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const created = await heygenFetch('/v3/avatar-realtime', {
      method: 'POST',
      body: JSON.stringify({
        type: 'tts',
        avatar_id: avatarId,
        voice_id: voiceId,
        text
      })
    });

    const streamId = created?.data?.stream_id;
    if (!streamId) {
      return res.status(502).json({ error: 'HeyGen did not return a stream id' });
    }

    const status = await pollRealtimeSession(streamId);
    return res.json({
      streamId,
      status: status?.data?.status || 'pending',
      hlsUrl: status?.data?.hls_url || null,
      errorMessage: status?.data?.error_message || null
    });
  } catch (e) {
    logger.warn('HeyGen live session failed', { status: e.status, error: e.message });
    return res.status(e.status || 500).json({ error: e.message || 'Failed to start HeyGen live session' });
  }
});

export default router;
