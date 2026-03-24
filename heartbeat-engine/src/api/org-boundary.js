// ═══════════════════════════════════════════════════════════════════════════
// Org-Boundary Security — Multi-Tenant Access Control
// Ensures users can only access agents/data belonging to their organization
// ═══════════════════════════════════════════════════════════════════════════

import { createLogger } from '../logging/logger.js';

const logger = createLogger('org-boundary');

const BLOOM_ORG_ID = 'a1000000-0000-0000-0000-000000000001';
const SARAH_AGENT_ID = process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003';

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

// ── Extract user ID from JWT bearer token ──
export function extractUserId(req) {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      if (payload.sub) return payload.sub;
    }
  } catch (e) { /* fall through */ }
  return null;
}

// ── Resolve user's organization from JWT → organization_members ──
// Returns orgId or null if unauthenticated
const orgCache = new Map(); // userId → { orgId, expiry }
const ORG_CACHE_TTL = 60_000; // 60 seconds

export async function getUserOrgId(req) {
  const userId = extractUserId(req);
  if (!userId) return null; // No JWT = unauthenticated

  // Check cache
  const cached = orgCache.get(userId);
  if (cached && Date.now() < cached.expiry) return cached.orgId;

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (data?.organization_id) {
      orgCache.set(userId, { orgId: data.organization_id, expiry: Date.now() + ORG_CACHE_TTL });
      return data.organization_id;
    }
    if (error) logger.warn('Org lookup failed', { userId: userId.slice(0, 8), error: error.message });
  } catch (e) {
    logger.warn('getUserOrgId error', { error: e.message });
  }
  return null;
}

// ── Validate that an agent belongs to the requesting user's org ──
// agentCache: agentId → { orgId, expiry }
const agentOrgCache = new Map();
const AGENT_CACHE_TTL = 60_000;

async function getAgentOrgId(agentId) {
  const cached = agentOrgCache.get(agentId);
  if (cached && Date.now() < cached.expiry) return cached.orgId;

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('agents')
      .select('organization_id')
      .eq('id', agentId)
      .single();

    if (data?.organization_id) {
      agentOrgCache.set(agentId, { orgId: data.organization_id, expiry: Date.now() + AGENT_CACHE_TTL });
      return data.organization_id;
    }
    if (error) logger.warn('Agent org lookup failed', { agentId: agentId.slice(0, 8), error: error.message });
  } catch (e) {
    logger.warn('getAgentOrgId error', { error: e.message });
  }
  return null;
}

// ── Validate that a session belongs to the requesting user ──
async function getSessionUserId(sessionId) {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single();
    return data?.user_id || null;
  } catch {
    return null;
  }
}

/**
 * validateAgentAccess(req, agentId)
 *
 * Core security check — verifies the requesting user's org owns the target agent.
 * Returns { authorized: true, orgId } or { authorized: false, status, error }.
 *
 * For unauthenticated requests (no JWT), falls back to BLOOM_ORG_ID for
 * backward compatibility during the auth migration period.
 */
export async function validateAgentAccess(req, agentId) {
  if (!agentId) {
    return { authorized: false, status: 400, error: 'Agent ID is required' };
  }

  const userId = extractUserId(req);

  // Unauthenticated fallback: allow access to BLOOM default agent only
  // This preserves backward compat during auth migration
  if (!userId) {
    if (agentId === SARAH_AGENT_ID) {
      return { authorized: true, orgId: BLOOM_ORG_ID, fallback: true };
    }
    // Unauthenticated user trying to access non-default agent
    return { authorized: false, status: 401, error: 'Authentication required' };
  }

  // Resolve user's org
  const userOrgId = await getUserOrgId(req);
  if (!userOrgId) {
    return { authorized: false, status: 403, error: 'User not associated with any organization' };
  }

  // Resolve agent's org
  const agentOrgId = await getAgentOrgId(agentId);
  if (!agentOrgId) {
    return { authorized: false, status: 404, error: 'Agent not found' };
  }

  // Cross-org check
  if (userOrgId !== agentOrgId) {
    logger.warn('Org boundary violation blocked', {
      userId: userId.slice(0, 8),
      userOrg: userOrgId.slice(0, 8),
      agentOrg: agentOrgId.slice(0, 8),
      agentId: agentId.slice(0, 8)
    });
    return { authorized: false, status: 403, error: 'Access denied — agent belongs to a different organization' };
  }

  return { authorized: true, orgId: userOrgId };
}

/**
 * validateSessionAccess(req, sessionId)
 *
 * Verifies the requesting user owns the session (by user_id match).
 * Returns { authorized: true } or { authorized: false, status, error }.
 */
export async function validateSessionAccess(req, sessionId) {
  if (!sessionId) {
    return { authorized: false, status: 400, error: 'Session ID is required' };
  }

  const userId = extractUserId(req);

  // Unauthenticated fallback — allow during migration
  if (!userId) {
    return { authorized: true, fallback: true };
  }

  const sessionOwner = await getSessionUserId(sessionId);
  if (!sessionOwner) {
    // Session not found or no user_id — allow (may be legacy data)
    return { authorized: true, fallback: true };
  }

  if (sessionOwner !== userId) {
    logger.warn('Session boundary violation blocked', {
      userId: userId.slice(0, 8),
      sessionOwner: sessionOwner.slice(0, 8),
      sessionId: sessionId.slice(0, 16)
    });
    return { authorized: false, status: 403, error: 'Access denied — session belongs to a different user' };
  }

  return { authorized: true };
}

/**
 * Express middleware — drops onto any route that takes ?agentId or body.agentId
 * Usage: router.get('/endpoint', requireAgentAccess, handler)
 *
 * Sets req.resolvedAgentId and req.resolvedOrgId on success.
 */
export function requireAgentAccess(req, res, next) {
  const agentId = req.query.agentId || req.body?.agentId || req.params?.agentId || SARAH_AGENT_ID;

  validateAgentAccess(req, agentId)
    .then(result => {
      if (!result.authorized) {
        return res.status(result.status).json({ error: result.error });
      }
      req.resolvedAgentId = agentId;
      req.resolvedOrgId = result.orgId;
      next();
    })
    .catch(err => {
      logger.error('requireAgentAccess middleware error', { error: err.message });
      res.status(500).json({ error: 'Authorization check failed' });
    });
}

/**
 * Express middleware for session-based routes
 * Usage: router.get('/sessions/:id', requireSessionAccess, handler)
 */
export function requireSessionAccess(req, res, next) {
  const sessionId = req.params.id || req.params.sessionId;

  validateSessionAccess(req, sessionId)
    .then(result => {
      if (!result.authorized) {
        return res.status(result.status).json({ error: result.error });
      }
      next();
    })
    .catch(err => {
      logger.error('requireSessionAccess middleware error', { error: err.message });
      res.status(500).json({ error: 'Authorization check failed' });
    });
}

// ── Cache invalidation (for tests or admin ops) ──
export function clearOrgBoundaryCache() {
  orgCache.clear();
  agentOrgCache.clear();
}
