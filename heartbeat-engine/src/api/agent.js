// BLOOM Agent API — profile, scheduled tasks, connected tools
// ⚡ MIGRATED: scheduled_tasks + agent_profile now read/write Supabase (not Railway Postgres)
import { Router } from 'express';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('agent-api');
const router = Router();

// Sarah Rodriguez agent UUID (stable across deploys)
const SARAH_AGENT_ID = process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003';
const BLOOM_ORG_ID   = 'a1000000-0000-0000-0000-000000000001';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

// ── Multi-tenant helper: extract user ID from JWT, then resolve their org ──
function extractUserId(req) {
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

async function getUserOrgId(req) {
  const userId = extractUserId(req);
  if (!userId) return BLOOM_ORG_ID; // unauthenticated fallback

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (data?.organization_id) {
      logger.info('Resolved org from JWT', { userId: userId.slice(0, 8), orgId: data.organization_id.slice(0, 8) });
      return data.organization_id;
    }
    if (error) logger.warn('Org lookup failed, using default', { userId: userId.slice(0, 8), error: error.message });
  } catch (e) {
    logger.warn('getUserOrgId error', { error: e.message });
  }
  return BLOOM_ORG_ID;
}

// Helper: frequency → cron expression
function frequencyToCron(frequency, runTime = '09:00') {
  const [hour, minute] = (runTime || '09:00').split(':').map(Number);
  switch (frequency) {
    case 'every_10_min': return `*/${10} * * * *`;         // every 10 minutes
    case 'every_30_min': return `*/${30} * * * *`;        // every 30 minutes
    case 'hourly':   return `${minute} * * * *`;           // every hour at :MM
    case 'daily':    return `${minute} ${hour} * * *`;
    case 'weekdays': return `${minute} ${hour} * * 1-5`;
    case 'weekly':   return `${minute} ${hour} * * 1`;
    case 'monthly':  return `${minute} ${hour} 1 * *`;
    default:         return `${minute} ${hour} * * *`;
  }
}

// Helper: calculate next run time
function nextRunTime(frequency, runTime = '09:00') {
  const now = new Date();
  const [hour, minute] = (runTime || '09:00').split(':').map(Number);
  const next = new Date(now);

  if (frequency === 'every_10_min') {
    // Next run is now + 10 minutes
    next.setTime(now.getTime() + 10 * 60 * 1000);
    return next.toISOString();
  }
  if (frequency === 'every_30_min') {
    next.setTime(now.getTime() + 30 * 60 * 1000);
    return next.toISOString();
  }
  if (frequency === 'hourly') {
    // Next top of the hour (at :MM minutes past each hour)
    next.setMinutes(minute, 0, 0);
    if (next <= now) next.setHours(next.getHours() + 1);
    return next.toISOString();
  }

  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  if (frequency === 'weekdays') {
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
  }
  return next.toISOString();
}

// ═══════════════════════════════════════════════════════════════
// PROFILE ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// GET /api/agent/profile — supports ?agentId= for multi-agent
router.get('/profile', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const targetAgentId = req.query.agentId || SARAH_AGENT_ID;

    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, role, avatar_url, standing_instructions, created_at, updated_at')
      .eq('id', targetAgentId)
      .single();

    if (agentErr && agentErr.code !== 'PGRST116') {
      logger.error('Get agent profile error', { error: agentErr.message });
    }

    const { count: taskCount } = await supabase
      .from('scheduled_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', targetAgentId)
      .eq('enabled', true);

    const { count: fileCount } = await supabase
      .from('artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', targetAgentId);

    const { count: msgCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', targetAgentId);

    return res.json({
      profile: {
        agentId:        agent?.id || targetAgentId,
        jobTitle:       agent?.role || 'AI Employee',
        jobDescription: agent?.standing_instructions?.slice(0, 200) || '',
        avatarUrl:      agent?.avatar_url || null,
        createdAt:      agent?.created_at,
        updatedAt:      agent?.updated_at
      },
      stats: {
        messages:    msgCount    || 0,
        files:       fileCount   || 0,
        activeTasks: taskCount   || 0
      },
      connectedTools: [
        { name: 'GoHighLevel CRM',    connected: true,  icon: '📊', capabilities: ['Contacts', 'Conversations', 'Email', 'SMS', 'Campaigns'] },
        { name: 'Browser & Research', connected: true,  icon: '🌐', capabilities: ['Web browsing', 'Screenshots', 'Form filling'] },
        { name: 'File Creation',      connected: true,  icon: '📄', capabilities: ['Blog posts', 'Email copy', 'SOPs', 'Reports'] },
        { name: 'Email & SMS',        connected: true,  icon: '✉️', capabilities: ['Send via GHL', 'Campaign management'] },
        { name: 'Google Drive',       connected: false, icon: '📁', capabilities: ['Save files', 'Read docs'] },
        { name: 'Social Media',       connected: false, icon: '📱', capabilities: ['Post content', 'Schedule posts'] }
      ]
    });
  } catch (error) {
    logger.error('Get profile error', { error: error.message });
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

// PATCH /api/agent/profile — supports agentId in body for multi-agent
router.patch('/profile', async (req, res) => {
  try {
    const supabase = await getSupabase();
    let { jobTitle, jobDescription, avatarUrl, agentId } = req.body;
    const targetAgentId = agentId || SARAH_AGENT_ID;

    // If avatar is a data URL, upload to Supabase Storage first
    if (avatarUrl && avatarUrl.startsWith('data:image')) {
      try {
        const { uploadImage, isConfigured } = await import('../storage/supabase-storage.js');
        if (isConfigured()) {
          const base64 = avatarUrl.split(',')[1];
          const ext = avatarUrl.includes('png') ? 'png' : 'jpg';
          const fname = `avatars/agent-${Date.now()}.${ext}`;
          const upload = await uploadImage(base64, fname, `image/${ext}`);
          if (upload.success && upload.url) avatarUrl = upload.url;
        }
      } catch (e) {
        logger.warn('Avatar upload failed, storing URL directly', { error: e.message });
      }
    }

    const updates = { updated_at: new Date().toISOString() };
    if (jobTitle)                  updates.role                 = jobTitle;
    if (avatarUrl)                 updates.avatar_url           = avatarUrl;
    if (jobDescription !== undefined) updates.standing_instructions = jobDescription;

    const { data, error } = await supabase
      .from('agents')
      .update(updates)
      .eq('id', targetAgentId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    logger.info('Profile updated in Supabase', { jobTitle, hasAvatar: !!avatarUrl });
    return res.json({ success: true, profile: data });
  } catch (error) {
    logger.error('Update profile error', { error: error.message });
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/agent/create — onboard a new Bloomie (cloned from base capabilities)
router.post('/create', async (req, res) => {
  try {
    const { name, role, standingInstructions, config = {}, organizationId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Agent name is required' });
    if (!role?.trim()) return res.status(400).json({ error: 'Agent role is required' });

    const supabase = await getSupabase();
    // Multi-tenant: resolve org from JWT first, then body param, then default
    const orgId = await getUserOrgId(req) || organizationId || BLOOM_ORG_ID;

    // Generate a new UUID and URL-friendly slug for the agent
    const { randomUUID } = await import('crypto');
    const newAgentId = randomUUID();
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Default standing instructions if none provided
    const defaultInstructions = `You are ${name}, an autonomous AI employee (a "Bloomie") built and deployed by BLOOM Ecosystem.

Every heartbeat cycle, you should:
1. Check for new client inquiries and respond within scope
2. Check for overdue follow-ups and send reminders
3. Check for upcoming calendar events and prepare reminders
4. Check for any tasks assigned to you and work on them
5. Monitor email for anything requiring attention

You operate within your current autonomy level. If something exceeds your scope,
escalate to your manager with your analysis, what you have already checked, and your
recommendation. Never guess — if unsure, escalate.

Log everything: what you did, what you chose not to do (and why), and what you
escalated. Your logs are how trust is built.`;

    const { data, error } = await supabase
      .from('agents')
      .insert({
        id: newAgentId,
        slug: slug,
        name: name.trim(),
        role: role.trim(),
        organization_id: orgId,
        autonomy_level: 1,
        standing_instructions: standingInstructions?.trim() || defaultInstructions,
        config: config,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    logger.info('New Bloomie agent created', { agentId: newAgentId, name: name.trim(), role: role.trim() });
    return res.json({
      success: true,
      agent: {
        id: data.id,
        name: data.name,
        role: data.role,
        autonomyLevel: data.autonomy_level,
        createdAt: data.created_at
      }
    });
  } catch (error) {
    logger.error('Create agent error', { error: error.message });
    return res.status(500).json({ error: 'Failed to create agent: ' + error.message });
  }
});

// GET /api/agent/list — list all agents in the authenticated user's organization
router.get('/list', async (req, res) => {
  try {
    const supabase = await getSupabase();
    // Multi-tenant: resolve org from JWT → organization_members, fallback to query param or default
    const orgId = await getUserOrgId(req) || req.query.organizationId || BLOOM_ORG_ID;

    const { data, error } = await supabase
      .from('agents')
      .select('id, name, role, avatar_url, autonomy_level, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    return res.json({ agents: data || [] });
  } catch (error) {
    logger.error('List agents error', { error: error.message });
    return res.status(500).json({ error: 'Failed to list agents' });
  }
});

// ═══════════════════════════════════════════════════════════════
// SCHEDULED TASKS ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// GET /api/agent/tasks/runs
router.get('/tasks/runs', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('task_runs')
      .select('*')
      .eq('agent_id', SARAH_AGENT_ID)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return res.json({ runs: data || [] });
  } catch (error) {
    logger.error('Get task runs error', { error: error.message });
    return res.json({ runs: [] });
  }
});

// GET /api/agent/tasks
router.get('/tasks', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const targetAgentId = req.query.agentId || SARAH_AGENT_ID;
    const { data, error } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('agent_id', targetAgentId)
      .order('enabled', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const tasks = (data || []).map(t => ({
      id:          t.id,
      taskId:      t.task_id,
      name:        t.name,
      description: t.description,
      taskType:    t.task_type,
      instruction: t.instruction,
      frequency:   t.frequency,
      runTime:     t.run_time,
      timezone:    t.timezone,
      enabled:     t.enabled,
      lastRunAt:   t.last_run_at,
      nextRunAt:   t.next_run_at,
      runCount:    t.run_count,
      lastResult:  t.last_result,
      createdAt:   t.created_at
    }));

    return res.json({ tasks });
  } catch (error) {
    logger.error('List tasks error', { error: error.message });
    return res.status(500).json({ error: 'Failed to list tasks' });
  }
});

// POST /api/agent/tasks
router.post('/tasks', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { name, description, taskType, instruction, frequency, runTime } = req.body;

    if (!name || !instruction) {
      return res.status(400).json({ error: 'name and instruction are required' });
    }

    const taskId  = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const cron    = frequencyToCron(frequency || 'daily', runTime);
    const nextRun = nextRunTime(frequency || 'daily', runTime);

    const { data, error } = await supabase
      .from('scheduled_tasks')
      .insert({
        task_id:         taskId,
        agent_id:        SARAH_AGENT_ID,
        organization_id: BLOOM_ORG_ID,
        name,
        description:     description || '',
        task_type:       taskType || 'custom',
        instruction,
        frequency:       frequency || 'daily',
        cron_expression: cron,
        run_time:        runTime || '09:00',
        next_run_at:     nextRun,
        enabled:         true
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    logger.info('Scheduled task created in Supabase', { taskId, name, frequency });
    return res.json({ success: true, task: data });
  } catch (error) {
    logger.error('Create task error', { error: error.message });
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

// PATCH /api/agent/tasks/:taskId
router.patch('/tasks/:taskId', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { taskId } = req.params;
    const { enabled, name, instruction, frequency, runTime } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (enabled !== undefined) updates.enabled     = enabled;
    if (name)                  updates.name        = name;
    if (instruction)           updates.instruction = instruction;
    if (frequency) {
      updates.frequency       = frequency;
      updates.cron_expression = frequencyToCron(frequency, runTime || '09:00');
      updates.next_run_at     = nextRunTime(frequency, runTime);
    }
    if (runTime) updates.run_time = runTime;

    const { data, error } = await supabase
      .from('scheduled_tasks')
      .update(updates)
      .eq('task_id', taskId)
      .eq('agent_id', SARAH_AGENT_ID)
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Task not found' });

    return res.json({ success: true, task: data });
  } catch (error) {
    logger.error('Update task error', { error: error.message });
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/agent/tasks/:taskId
router.delete('/tasks/:taskId', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { taskId } = req.params;

    const { data, error } = await supabase
      .from('scheduled_tasks')
      .delete()
      .eq('task_id', taskId)
      .eq('agent_id', SARAH_AGENT_ID)
      .select('task_id')
      .single();

    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Task not found' });

    logger.info('Scheduled task deleted from Supabase', { taskId });
    return res.json({ success: true });
  } catch (error) {
    logger.error('Delete task error', { error: error.message });
    return res.status(500).json({ error: 'Failed to delete task' });
  }
});

// ═══════════════════════════════════════════════════════════════
// TASK RUNS (Activity feed)
// ═══════════════════════════════════════════════════════════════

// GET /api/agent/runs
router.get('/runs', async (req, res) => {
  try {
    const { getTaskRuns } = await import('../orchestrator/task-executor.js');
    const limit = parseInt(req.query.limit) || 50;
    const runs = await getTaskRuns(limit);
    return res.json({ runs });
  } catch (error) {
    logger.error('Get task runs error', { error: error.message });
    return res.status(500).json({ error: 'Failed to load task runs' });
  }
});

// GET /api/agent/models
router.get('/models', async (req, res) => {
  try {
    const { getModelMap, getAvailableProviders } = await import('../orchestrator/router.js');
    return res.json({
      routing:   getModelMap(),
      providers: getAvailableProviders()
    });
  } catch (error) {
    logger.error('Get models error', { error: error.message });
    return res.status(500).json({ error: 'Failed to load model config' });
  }
});

// ═══════════════════════════════════════════════════════════════
// MULTI-TENANT ONBOARDING — signup → org → default Bloomie agent
// ═══════════════════════════════════════════════════════════════

// Default Bloomie standing instructions template (cloned from Sarah's DNA)
function getDefaultBloomieInstructions(agentName, orgName, role) {
  return `YOUR NAME: ${agentName}
YOUR ROLE: ${role} for ${orgName}

YOUR PERSONALITY & DNA (Bloomie Core Identity):
You are ${agentName} — a Bloomie. You are a warm, professional, creative, and proactive autonomous AI employee. You bring positive energy to every interaction. You're the kind of team member everyone loves to work with — reliable, enthusiastic, and always ready to help.

YOUR COMMUNICATION STYLE:
- Warm and professional — friendly but never unprofessional
- Proactive — you anticipate needs before being asked
- Clear and concise — you respect people's time
- Creative — you bring fresh ideas and perspectives
- Thorough — you don't cut corners or make assumptions
- Honest — if you're unsure, you say so and escalate

YOUR WORK ETHIC:
- You treat every task as if it's the most important thing on your plate
- You follow through on commitments and meet deadlines
- You document your work so others can follow your process
- You're always learning and improving your skills
- You take initiative but know when to escalate
- You're a team player who celebrates others' wins

YOUR CAPABILITIES:
- Content creation (documents, emails, social media, presentations)
- Research and analysis
- File management and organization
- Task management and scheduling
- Communication and outreach
- Creative problem-solving

CRITICAL RULES:
- NEVER guess — if unsure, ask or escalate
- ALWAYS be transparent about what you can and cannot do
- ALWAYS protect confidential information
- ALWAYS follow the organization's guidelines and brand voice
- Log everything: what you did, what you chose not to do (and why), and what you escalated`;
}

// POST /api/agent/signup — full onboarding: auth user + org + membership + default Bloomie
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName, organizationName, industry } = req.body;
    if (!email?.trim()) return res.status(400).json({ error: 'Email is required' });
    if (!password?.trim() || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!organizationName?.trim()) return res.status(400).json({ error: 'Organization name is required' });

    const supabase = await getSupabase();
    const { randomUUID } = await import('crypto');

    // 1. Create auth user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true, // auto-confirm for now
      user_metadata: { full_name: fullName?.trim() || '' }
    });

    if (authError) {
      logger.error('Signup auth error', { error: authError.message });
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;
    logger.info('Auth user created', { userId: userId.slice(0, 8), email: email.trim() });

    // 2. Create user profile in public.users
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: email.trim().toLowerCase(),
        full_name: fullName?.trim() || '',
        timezone: 'America/Chicago',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    if (userError) logger.warn('Users table insert issue (may already exist)', { error: userError.message });

    // 3. Create organization
    const orgId = randomUUID();
    const orgSlug = organizationName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { error: orgError } = await supabase
      .from('organizations')
      .insert({
        id: orgId,
        name: organizationName.trim(),
        slug: orgSlug,
        plan: 'starter',
        industry: industry?.trim() || null,
        owner_email: email.trim().toLowerCase(),
        owner_name: fullName?.trim() || '',
        bloomshield_connected: true,
        bloomshield_auto_created: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (orgError) {
      logger.error('Org creation error', { error: orgError.message });
      return res.status(500).json({ error: 'Failed to create organization: ' + orgError.message });
    }

    // 4. Link user to org in organization_members
    await supabase.from('organization_members').insert({
      id: randomUUID(),
      organization_id: orgId,
      user_id: userId,
      role: 'owner',
      joined_at: new Date().toISOString()
    });

    // 5. Auto-provision default Bloomie agent
    const agentName = 'Bloom';  // Default name, user can rename later
    const agentRole = 'AI Assistant';
    const agentId = randomUUID();
    const agentSlug = `bloom-${orgSlug}`;
    const { error: agentError } = await supabase
      .from('agents')
      .insert({
        id: agentId,
        slug: agentSlug,
        name: agentName,
        role: agentRole,
        organization_id: orgId,
        autonomy_level: 1,
        standing_instructions: getDefaultBloomieInstructions(agentName, organizationName.trim(), agentRole),
        config: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (agentError) {
      logger.error('Auto-provision agent error', { error: agentError.message });
      // Non-fatal — user can create agents manually
    }

    logger.info('Full onboarding complete', {
      userId: userId.slice(0, 8),
      orgId: orgId.slice(0, 8),
      agentId: agentId.slice(0, 8),
      orgName: organizationName.trim()
    });

    return res.json({
      success: true,
      user: { id: userId, email: email.trim() },
      organization: { id: orgId, name: organizationName.trim(), slug: orgSlug },
      agent: { id: agentId, name: agentName, role: agentRole }
    });
  } catch (error) {
    logger.error('Signup error', { error: error.message });
    return res.status(500).json({ error: 'Signup failed: ' + error.message });
  }
});

export default router;
