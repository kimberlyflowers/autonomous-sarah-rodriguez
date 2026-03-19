// Mobile App API — serves everything the BLOOM Mobile app needs
// Uses service key to bypass RLS — auth validated via JWT in Authorization header

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('mobile-api');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Middleware: validate JWT and extract user
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error } = await anon.auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return res.status(401).json({ error: 'Invalid session' });
    req.authUser = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Auth failed: ' + e.message });
  }
}

// GET /api/mobile/init
// Returns everything the mobile app needs: user info, org, all agents, last messages per agent
router.get('/init', requireAuth, async (req, res) => {
  const user = req.authUser;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Get user profile
    const { data: profile } = await sb.from('users')
      .select('id, email, full_name, avatar_url')
      .eq('id', user.id).single();

    // 2. Get org membership
    const { data: membership } = await sb.from('organization_members')
      .select('organization_id, role, organizations(id, name, slug, logo_url)')
      .eq('user_id', user.id).limit(1).single();

    if (!membership) {
      return res.json({ user: profile, org: null, agents: [], messages: {} });
    }

    const orgId = membership.organization_id;
    const org = { id: orgId, name: membership.organizations?.name, role: membership.role, logo: membership.organizations?.logo_url };

    // 3. Get ALL agents for this org
    const { data: agents } = await sb.from('agents')
      .select('id, name, role, job_title, avatar_url, status')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    // 4. Get assigned agent (for default selection)
    let assignedAgentId = null;
    const { data: assignment } = await sb.from('agent_assignments')
      .select('agent_id')
      .eq('organization_id', orgId)
      .eq('active', true)
      .limit(1).maybeSingle();
    if (assignment) assignedAgentId = assignment.agent_id;

    // 5. Get last 50 messages per agent (for preloading chat history)
    const messagesByAgent = {};
    for (const agent of (agents || [])) {
      const { data: msgs } = await sb.from('messages')
        .select('id, role, content, created_at, session_id')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(50);
      messagesByAgent[agent.id] = (msgs || []).reverse();
    }

    logger.info(`Mobile init: ${user.email} → org: ${org.name}, agents: ${agents?.length || 0}`);

    res.json({
      user: profile,
      org,
      agents: agents || [],
      assignedAgentId: assignedAgentId || agents?.[0]?.id || null,
      messages: messagesByAgent,
    });
  } catch (e) {
    logger.error('Mobile init error:', e.message);
    res.status(500).json({ error: 'Failed to load mobile app data' });
  }
});

// GET /api/mobile/messages/:agentId
// Load messages for a specific agent (when switching agents)
router.get('/messages/:agentId', requireAuth, async (req, res) => {
  const { agentId } = req.params;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { data: msgs } = await sb.from('messages')
      .select('id, role, content, created_at, session_id')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json({ messages: (msgs || []).reverse() });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

export default router;
