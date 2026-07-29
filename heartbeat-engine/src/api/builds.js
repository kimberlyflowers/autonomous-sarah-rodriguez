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
import { getWorkExecutionPath, normalizeWorkType } from '../orchestrator/work-routing.js';
import { DurableWorkQueue } from '../orchestrator/durable-work-queue.js';
import { pairExecutionEvents } from '../orchestrator/execution-events.js';

const router = Router();
const logger = createLogger('builds-api');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function resolveBuildAgent(supabase, buildId, orgId, requestedAgentId = null) {
  if (requestedAgentId) {
    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, role')
      .eq('id', requestedAgentId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!agent) throw new Error('Selected Bloomie does not belong to this organization');
    return agent;
  }
  if (buildId) {
    const { data: session } = await supabase
      .from('sessions')
      .select('agent_id')
      .eq('id', buildId)
      .maybeSingle();
    if (session?.agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id, name, role')
        .eq('id', session.agent_id)
        .maybeSingle();
      if (agent) return agent;
    }
  }
  const { data: fallback } = await supabase
    .from('agents')
    .select('id, name, role')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!fallback) throw new Error('No Bloomie is configured for this organization');
  return fallback;
}

async function ensureBuildChatSession(supabase, build, orgId, userId, agentId = null) {
  const agent = await resolveBuildAgent(supabase, build.id, orgId, agentId);
  const { error } = await supabase
    .from('sessions')
    .upsert({
      id: build.id,
      organization_id: orgId,
      org_id: orgId,
      user_id: userId || build.created_by || null,
      agent_id: agent.id,
      title: build.title || build.brief || 'Work session',
      status: 'active',
      project_id: build.project_id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) logger.warn('Failed to ensure build chat session', { buildId: build.id, error: error.message });
  return error ? null : agent;
}

function attachmentMetadata(images = []) {
  return images.map(image => ({
    name: image?.name || 'attachment',
    type: image?.type || 'application/octet-stream',
  }));
}

function composeExecutionInput(instruction, images = [], mode = 'work', agentName = 'the current Bloomie') {
  const text = mode === 'build'
    ? `BUILD WORKSPACE TASK\n${instruction}\n\nYou are ${agentName}. Use this Bloomie's real engineering tools and connected tenant services. Inspect the actual source before editing, preserve unrelated work, create or update real files, verify the result, and deploy only when the request calls for deployment. Keep progress visible in this Build session. Do not claim a file, commit, artifact, or deployment unless a tool actually produced it.`
    : instruction;

  const blocks = [];
  for (const image of images) {
    const match = String(image?.data || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (match) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: match[1], data: match[2] },
      });
    }
  }
  const nonImageNames = images
    .filter(image => !String(image?.type || '').startsWith('image/'))
    .map(image => image?.name)
    .filter(Boolean);
  blocks.push({
    type: 'text',
    text: nonImageNames.length
      ? `${text}\n\nAttached files: ${nonImageNames.join(', ')}. Their names are available, but binary document contents must be opened through an available file or storage tool.`
      : text,
  });
  return blocks.length > 1 ? blocks : text;
}

function extractOutputUrl(output = '') {
  const matches = String(output).match(/https?:\/\/[^\s<>)\]}]+/g) || [];
  return matches.find(url => /vercel\.app|bloomiestaffing\.com|railway\.app|netlify\.app/i.test(url)) || null;
}

async function saveBuildUserMessage(supabase, buildId, message, userId, source = 'user', images = []) {
  if (!message?.trim()) return true;

  const { error } = await supabase.from('messages').insert({
    session_id: buildId,
    role: 'user',
    content: message.trim(),
    files: images.length ? attachmentMetadata(images) : null,
    metadata: { source, user_id: userId || null },
  });

  if (error) logger.warn('Failed to save build user message', { buildId, source, error: error.message });
  return !error;
}

async function withProjectWorkspaceContext(supabase, build, instruction) {
  if (!build.project_id) return instruction;
  const { data: project } = await supabase
    .from('projects')
    .select('name, repository_owner, repository_name, repository_default_branch, vercel_project_id, workspace_instructions')
    .eq('id', build.project_id)
    .maybeSingle();
  if (!project) return instruction;
  const context = [
    `PROJECT WORKSPACE: ${project.name}`,
    project.repository_owner && project.repository_name
      ? `Default repository: ${project.repository_owner}/${project.repository_name}`
      : null,
    project.repository_default_branch ? `Default base branch: ${project.repository_default_branch}` : null,
    project.vercel_project_id ? `Vercel project: ${project.vercel_project_id}` : null,
    project.workspace_instructions ? `Persistent project instructions:\n${project.workspace_instructions}` : null,
  ].filter(Boolean).join('\n');
  return `${context}\n\nCURRENT TASK:\n${instruction}`;
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

async function getSarahWorkRunner() {
  const mod = await import('./chat.js');
  return mod.runSarahWorkTask;
}

async function persistClarification(supabase, build, result) {
  const clarification = result?.clarification;
  if (!clarification?.question) return false;
  const { error } = await supabase.from('managed_clarify_queue').insert({
    session_id: build.id,
    question: clarification.question,
    options: clarification.options || [],
    allow_free_text: true,
  });
  if (error) throw new Error(`Failed to persist Work clarification: ${error.message}`);
  await supabase.from('website_builds').update({
    status: 'clarifying',
    updated_at: new Date().toISOString(),
  }).eq('id', build.id);
  return true;
}

async function executeBuildRecord(supabase, build, instruction, { orgId, userId, images = [] }) {
  const agent = await resolveBuildAgent(supabase, build.id, orgId);
  const contextualInstruction = await withProjectWorkspaceContext(supabase, build, instruction);
  await supabase.from('website_builds')
    .update({ status: 'building', updated_at: new Date().toISOString() })
    .eq('id', build.id);

  if (getWorkExecutionPath(build.type).startsWith('sarah')) {
    const runner = await getSarahWorkRunner();
    const result = await runner(composeExecutionInput(contextualInstruction, images, build.type, agent.name), {
      orgId,
      sessionId: build.id,
      userId,
      agentId: agent.id,
    });
    if (result.status === 'clarifying') {
      await persistClarification(supabase, build, result);
      return result;
    }
    if (['failed', 'blocked', 'pending'].includes(result.status)) {
      const status = result.status === 'failed' ? 'error' : result.status === 'blocked' ? 'clarifying' : 'building';
      await supabase.from('website_builds').update({
        status,
        managed_agent_session_id: `agent-${agent.id}-${build.id}`,
        updated_at: new Date().toISOString(),
      }).eq('id', build.id);
      return result;
    }
    const outputUrl = extractOutputUrl(result.output);
    await supabase.from('website_builds').update({
      status: 'complete',
      managed_agent_session_id: `agent-${agent.id}-${build.id}`,
      output_url: outputUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', build.id);
    return result;
  }

  const runner = await getBuildRunner();
  if (!runner) throw new Error('Managed website agent is unavailable');
  const result = await runner(contextualInstruction, {
    orgId,
    chatSessionId: build.id,
    buildId: build.id,
    agentId: agent.id,
    agentName: agent.name,
    agentRole: agent.role,
  });
  await supabase.from('website_builds').update({
    status: 'complete',
    managed_agent_session_id: result.sessionId || null,
    output_url: result.outputUrl || null,
    updated_at: new Date().toISOString(),
  }).eq('id', build.id);
  return result;
}

const workQueue = new DurableWorkQueue({
  execute: async (build, instruction, context) => {
    const supabase = await getSupabase();
    const result = await executeBuildRecord(supabase, build, instruction, context);
    logger.info('Build complete', { buildId: build.id, recovered: context.recovered === true });
    return result;
  },
  onError: async (err, build) => {
    logger.error('Build failed', { buildId: build.id, error: err.message });
    const supabase = await getSupabase();
    const { error } = await supabase.from('website_builds')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', build.id);
    if (error) logger.warn('Failed to mark build as error', { buildId: build.id, error: error.message });
  },
  logger,
});

function enqueueBuild(build, instruction, context) {
  workQueue.enqueue(build, instruction, context).catch(() => {});
}

export async function recoverDurableWorkSessions() {
  const supabase = await getSupabase();
  const recovered = await workQueue.recover(async () => {
    const { data, error } = await supabase
      .from('website_builds')
      .select('id, org_id, created_by, title, brief, type, status, project_id, updated_at')
      .in('status', ['queued', 'building'])
      .order('updated_at', { ascending: true })
      .limit(25);
    if (error) throw new Error(`Failed to load unfinished Work sessions: ${error.message}`);
    return data || [];
  }, build => ({
    orgId: build.org_id,
    userId: build.created_by,
    images: [],
  }));
  if (recovered.length) logger.info('Recovered durable Work sessions', { count: recovered.length, buildIds: recovered });
  return recovered;
}

// ════════════════════════════════════════════════════════════════
// POST /api/builds — create a build record and kick off the MA
// Body: { brief, title, type: 'work'|'build' }
// ════════════════════════════════════════════════════════════════
router.post('/', withAuth, async (req, res) => {
  try {
    const { brief, title, type = 'work', images = [], projectId = null, agentId = null } = req.body;
    const { orgId, userId } = req;
    const effectiveBrief = brief?.trim() || (images.length
      ? 'Review the attached files and complete the requested task.'
      : '');

    if (!effectiveBrief) return res.status(400).json({ error: 'brief or attachment is required' });

    const supabase = await getSupabase();
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!project) return res.status(404).json({ error: 'Project not found' });
    }

    const { data: build, error } = await supabase
      .from('website_builds')
      .insert({
        org_id: orgId,
        created_by: userId,
        title: title?.trim() || effectiveBrief.slice(0, 60),
        brief: effectiveBrief,
        type: normalizeWorkType(type),
        status: 'queued',
        project_id: projectId || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create build record', { error: error.message });
      return res.status(500).json({ error: 'Failed to create build' });
    }

    logger.info('Build created', { buildId: build.id, type, org: orgId.slice(0, 8) });

    const agent = await ensureBuildChatSession(supabase, build, orgId, userId, agentId);
    if (!agent) throw new Error('Failed to bind Work session to the selected Bloomie');
    await saveBuildUserMessage(supabase, build.id, effectiveBrief, userId, 'initial-brief', images);

    // Respond immediately while the durable queue serializes this session.
    // Unfinished queued/building rows are recovered on process startup.
    enqueueBuild(build, effectiveBrief, { orgId, userId, images });

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
    const { type, projectId, agentId } = req.query;

    const supabase = await getSupabase();

    let allowedBuildIds = null;
    if (agentId) {
      await resolveBuildAgent(supabase, null, orgId, agentId);
      const { data: agentSessions, error: sessionError } = await supabase
        .from('sessions')
        .select('id')
        .eq('organization_id', orgId)
        .eq('agent_id', agentId);
      if (sessionError) throw sessionError;
      // Legacy chat sessions use values such as "session-1782243701085".
      // website_builds.id is UUID, so sending those legacy ids to `.in()`
      // makes Postgres reject the entire Work list query.
      allowedBuildIds = (agentSessions || [])
        .map(session => session.id)
        .filter(id => UUID_PATTERN.test(String(id || '')));
      if (!allowedBuildIds.length) return res.json({ success: true, builds: [] });
    }

    let query = supabase
      .from('website_builds')
      .select('id, title, brief, status, type, output_url, project_id, created_at, updated_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (type) query = query.eq('type', type);
    if (projectId) query = query.eq('project_id', projectId);
    if (allowedBuildIds) query = query.in('id', allowedBuildIds);

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
    if (req.query.agentId) {
      const agent = await resolveBuildAgent(supabase, build.id, orgId);
      if (agent.id !== req.query.agentId) return res.status(404).json({ error: 'Work session not found for this Bloomie' });
    }

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

    // Conversation and progress messages posted against build.id as session_id
    const { data: messages } = await supabase
      .from('messages')
      .select('id, role, content, files, metadata, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true })
      .limit(500);

    // Pending clarify prompt — managed_clarify_queue uses session_id + response IS NULL
    const { data: clarifyRows } = await supabase
      .from('managed_clarify_queue')
      .select('id, question, options, allow_free_text, created_at')
      .eq('session_id', id)
      .is('response', null)
      .order('created_at', { ascending: false })
      .limit(1);

    const clarify = clarifyRows?.[0] || null;

    const messageRows = messages || [];
    const executionEvents = messageRows
      .filter(message => message.metadata?.type === 'execution_event')
      .map(message => message.metadata.execution_event)
      .filter(Boolean);
    res.json({
      success: true,
      build,
      progress,
      messages: messageRows.filter(message => message.metadata?.type !== 'execution_event'),
      executionEvents: pairExecutionEvents(executionEvents),
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
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (!build) return res.status(404).json({ error: 'Build not found' });
    if (req.body?.agentId) {
      const agent = await resolveBuildAgent(supabase, build.id, orgId);
      if (agent.id !== req.body.agentId) return res.status(404).json({ error: 'Work session not found for this Bloomie' });
    }

    // Mark as answered — website-mcp.js polls for response IS NOT NULL
    const { error } = await supabase
      .from('managed_clarify_queue')
      .update({ response: answer, responded_at: new Date().toISOString() })
      .eq('id', clarify_id)
      .eq('session_id', id);

    if (error) throw error;
    await saveBuildUserMessage(supabase, id, answer, req.userId, 'clarify-answer');

    if (getWorkExecutionPath(build.type).startsWith('sarah')) {
      enqueueBuild(build, answer, { orgId, userId: req.userId });
    }

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
    const { message, images = [] } = req.body;
    const effectiveMessage = message?.trim() || (images.length
      ? 'Review the attached files and continue this task.'
      : '');

    if (!effectiveMessage) return res.status(400).json({ error: 'message or attachment is required' });

    const supabase = await getSupabase();

    // Verify build belongs to this org
    const { data: build } = await supabase
      .from('website_builds')
      .select('id, org_id, managed_agent_session_id, status, title, brief, created_by, type, project_id')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (!build) return res.status(404).json({ error: 'Build not found' });

    const existingAgent = await resolveBuildAgent(supabase, build.id, orgId, req.body?.agentId || null);
    await ensureBuildChatSession(supabase, build, orgId, userId, existingAgent.id);

    // Save user message to messages table so it stays visible in Work/Build logs.
    await saveBuildUserMessage(supabase, id, effectiveMessage, userId, 'user-steer', images);

    if (getWorkExecutionPath(build.type).startsWith('sarah')) {
      enqueueBuild(build, effectiveMessage, { orgId, userId, images });
      return res.json({ success: true, routedTo: build.type === 'build' ? 'sarah-build' : 'sarah' });
    }

    // Build sessions stay with the specialized Managed Website Agent.
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
          await _steer(build.managed_agent_session_id, effectiveMessage);
          logger.info('Build steered', { buildId: id, sessionId: build.managed_agent_session_id.slice(0, 8) });
        }
      } catch (e) {
        logger.warn('Failed to steer session', { error: e.message });
      }
    } else {
      try {
        const mod = await import('../agents/managed-website-agent.js');
        if (mod.continueWebsiteBuildSession) {
          await mod.continueWebsiteBuildSession(effectiveMessage, {
            orgId,
            chatSessionId: id,
            agentId: existingAgent.id,
            agentName: existingAgent.name,
            agentRole: existingAgent.role,
          });
        }
      } catch (e) {
        logger.warn('Failed to continue OpenRouter build session', { buildId: id, error: e.message });
        return res.status(500).json({ error: 'Failed to continue session' });
      }
    }

    res.json({ success: true, steered: !!build.managed_agent_session_id });
  } catch (err) {
    logger.error('POST /builds/:id/message failed', { error: err.message });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
