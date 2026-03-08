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
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
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

// GET /api/agent/profile
router.get('/profile', async (req, res) => {
  try {
    const supabase = await getSupabase();

    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, role, avatar_url, standing_instructions, created_at, updated_at')
      .eq('id', SARAH_AGENT_ID)
      .single();

    if (agentErr && agentErr.code !== 'PGRST116') {
      logger.error('Get agent profile error', { error: agentErr.message });
    }

    const { count: taskCount } = await supabase
      .from('scheduled_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', SARAH_AGENT_ID)
      .eq('enabled', true);

    const { count: fileCount } = await supabase
      .from('artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', SARAH_AGENT_ID);

    const { count: msgCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', SARAH_AGENT_ID);

    return res.json({
      profile: {
        agentId:        agent?.id || SARAH_AGENT_ID,
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

// PATCH /api/agent/profile
router.patch('/profile', async (req, res) => {
  try {
    const supabase = await getSupabase();
    let { jobTitle, jobDescription, avatarUrl } = req.body;

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
      .eq('id', SARAH_AGENT_ID)
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
    const { data, error } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('agent_id', SARAH_AGENT_ID)
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

export default router;
