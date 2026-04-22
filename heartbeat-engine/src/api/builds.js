// heartbeat-engine/src/api/builds.js
// REST API for Work + Build tab managed-agent sessions
//
// Routes:
//   POST   /api/builds              — create build + trigger Managed Agent
//   GET    /api/builds              — list builds for this org (?type=work|build)
//   GET    /api/builds/:id          — build + checklist + messages + pending clarify
//   POST   /api/builds/:id/clarify  — submit answer to bloom_clarify prompt

import { Router } from 'express';
import { createLogger } from '../logging/logger.js';
import { getUserOrgId, extractUserId } from './org-boundary.js';

const router = Router();
const logger = createLogger('builds-api');

// ── Supabase client ───────────────────────────────────────────────────────────
let _supabase = null;
async function getSupabase() {
  if (!_supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return _supabase;
}

// ── Auth middleware ───────────────────────────────────────────────────────────
async function withAuth(req, res, next) {
  try {
    const orgId = await getUserOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Authentication required' });
    req.orgId = orgId;
    req.userId = extractUserId(req);
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// ── Lazy-load the Managed Agent runner ───────────────────────────────────────
let _runBuild = null;
async function getBuildRunner() {
  if (!_runBuild) {
    try {
      const mod = await import('../agents/managed-website-agent.js');
      _runBuild = mod.runWebsiteBuild;
    } catch (e) {
      logger.warn('Managed agent not available', { error: e.message });
    }
  }
  return _runBuild;
}

// ════════════════════════════════════════════════════════════════
// POST /api/builds — create a build record and kick off the MA
// Body: { brief, title, type: 'work'|'build' }
// ════════════════════════════════════════════════════════════════
router.post('/', withAuth, async (req, res) => {
  try {
    const { brief, title, type = 'build' } = req.body;
    const { orgId, userId } = req;

    if (!brief?.trim()) return res.status(400).json({ error: 'brief is required' });

    const supabase = await getSupabase();

    const { data: build, error } = await supabase
      .from('website_builds')
      .insert({
        org_id: orgId,
        created_by: userId,
        title: title?.trim() || brief.slice(0, 60),
        brief: brief.trim(),
        type,
        status: 'queued',
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create build record', { error: error.message });
      return res.status(500).json({ error: 'Failed to create build' });
    }

    logger.info('Build created', { buildId: build.id, type, org: orgId.slice(0, 8) });

    // Fire-and-forget — respond immediately, run agent in background
    (async () => {
      try {
        const runner = await getBuildRunner();
        if (!runner) {
          await supabase.from('website_builds')
            .update({ status: 'error', updated_at: new Date().toISOString() })
            .eq('id', build.id);
          return;
        }

        await supabase.from('website_builds')
          .update({ status: 'building', updated_at: new Date().toISOString() })
          .eq('id', build.id);

        const result = await runner(brief, {
          orgId,
          chatSessionId: build.id,  // progress messages use build.id as session_id
          buildId: build.id,         // agent stores session ID immediately for steering
        });

        await supabase.from('website_builds')
          .update({
            status: 'complete',
            managed_agent_session_id: result.sessionId || null,
            output_url: result.outputUrl || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', build.id);

        logger.info('Build complete', { buildId: build.id });
      } catch (err) {
        logger.error('Build failed', { buildId: build.id, error: err.message });
        await supabase.from('website_builds')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', build.id)
          .catch(() => {});
      }
    })();

    res.json({ success: true, build });
  } catch (err) {
    logger.error('POST /builds failed', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/builds — list builds for this org
// ════════════════════════════════════════════════════════════════
router.get('/', withAuth, async (req, res) => {
  try {
    const { orgId } = req;
    const { type } = req.query;

    const supabase = await getSupabase();

    let query = supabase
      .from('website_builds')
      .select('id, title, brief, status, type, output_url, created_at, updated_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (type) query = query.eq('type', type);

    const { data: builds, error } = await query;
    if (error) throw error;

    res.json({ success: true, builds: builds || [] });
  } catch (err) {
    logger.error('GET /builds failed', { error: err.message });
    res.status(500).json({ error: 'Failed to list builds' });
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/builds/:id — build + checklist (todos) + messages + clarify
// ════════════════════════════════════════════════════════════════
router.get('/:id', withAuth, async (req, res) => {
  try {
    const { orgId } = req;
    const { id } = req.params;

    const supabase = await getSupabase();

    // Build record
    const { data: build, error: buildErr } = await supabase
      .from('website_builds')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (buildErr || !build) return res.status(404).json({ error: 'Build not found' });

    // Checklist — managed_task_progress stores todos as jsonb array keyed by session_id
    // The agent calls task_progress with session_id = build.id
    const { data: progressRow } = await supabase
      .from('managed_task_progress')
      .select('todos')
      .eq('session_id', id)
      .maybeSingle();

    // Normalize todos into a flat array for the UI
    const progress = (progressRow?.todos || []).map(t => ({
      step_name: t.content || t.id,
      status: t.status === 'completed' ? 'complete' : t.status || 'pending',
    }));

    // Progress messages posted by the agent using build.id as session_id
    const { data: messages } = await supabase
      .from('messages')
      .select('id, role, content, metadata, created_at')
      .eq('session_id', id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: true })
      .limit(100);

    // Pending clarify prompt — managed_clarify_queue uses session_id + response IS NULL
    const { data: clarifyRows } = await supabase
      .from('managed_clarify_queue')
      .select('id, question, options, allow_free_text, created_at')
      .eq('session_id', id)
      .is('response', null)
      .order('created_at', { ascending: false })
      .limit(1);

    const clarify = clarifyRows?.[0] || null;

    res.json({
      success: true,
      build,
      progress,
      messages: messages || [],
      clarify,
    });
  } catch (err) {
    logger.error('GET /builds/:id failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load build' });
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/builds/:id/clarify — answer a bloom_clarify prompt
// Body: { answer, clarify_id }
// ════════════════════════════════════════════════════════════════
router.post('/:id/clarify', withAuth, async (req, res) => {
  try {
    const { orgId } = req;
    const { id } = req.params;
    const { answer, clarify_id } = req.body;

    if (!answer || !clarify_id) {
      return res.status(400).json({ error: 'answer and clarify_id required' });
    }

    const supabase = await getSupabase();

    // Verify build belongs to org
    const { data: build } = await supabase
      .from('website_builds')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (!build) return res.status(404).json({ error: 'Build not found' });

    // Mark as answered — website-mcp.js polls for response IS NOT NULL
    const { error } = await supabase
      .from('managed_clarify_queue')
      .update({ response: answer, responded_at: new Date().toISOString() })
      .eq('id', clarify_id)
      .eq('session_id', id);

    if (error) throw error;

    logger.info('Clarify answered', { buildId: id, clarifyId: clarify_id });
    res.json({ success: true });
  } catch (err) {
    logger.error('POST /builds/:id/clarify failed', { error: err.message });
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});


// ════════════════════════════════════════════════════════════════
// POST /api/builds/:id/message — steer an active session mid-build
// Body: { message }
// ════════════════════════════════════════════════════════════════
router.post('/:id/message', withAuth, async (req, res) => {
  try {
    const { orgId, userId } = req;
    const { id } = req.params;
    const { message } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

    const supabase = await getSupabase();

    // Verify build belongs to this org
    const { data: build } = await supabase
      .from('website_builds')
      .select('id, managed_agent_session_id, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (!build) return res.status(404).json({ error: 'Build not found' });

    // Save user message to messages table so it shows in the live log
    await supabase.from('messages').insert({
      session_id: id,
      role: 'user',
      content: message.trim(),
      metadata: { source: 'user-steer', user_id: userId },
    }).catch(() => {});

    // If we have a live MA session, steer it
    if (build.managed_agent_session_id) {
      try {
        let _steer = null;
        try {
          const mod = await import('../agents/managed-website-agent.js');
          _steer = mod.steerSession;
        } catch (e) {
          logger.warn('steerSession not available', { error: e.message });
        }
        if (_steer) {
          await _steer(build.managed_agent_session_id, message.trim());
          logger.info('Build steered', { buildId: id, sessionId: build.managed_agent_session_id.slice(0, 8) });
        }
      } catch (e) {
        logger.warn('Failed to steer session', { error: e.message });
      }
    }

    res.json({ success: true, steered: !!build.managed_agent_session_id });
  } catch (err) {
    logger.error('POST /builds/:id/message failed', { error: err.message });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;

