// BLOOM Agent API — profile, scheduled tasks, connected tools
import { Router } from 'express';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('agent-api');
const router = Router();

async function getPool() {
  const { createPool } = await import('../../database/setup.js');
  return createPool();
}

async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_profile (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(64) DEFAULT 'bloomie-sarah-rodriguez' UNIQUE,
      job_title TEXT DEFAULT 'AI Employee',
      job_description TEXT DEFAULT '',
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id SERIAL PRIMARY KEY,
      task_id VARCHAR(64) UNIQUE NOT NULL,
      agent_id VARCHAR(64) DEFAULT 'bloomie-sarah-rodriguez',
      name VARCHAR(500) NOT NULL,
      description TEXT,
      task_type VARCHAR(50) NOT NULL DEFAULT 'custom',
      instruction TEXT NOT NULL,
      frequency VARCHAR(50) NOT NULL DEFAULT 'daily',
      cron_expression VARCHAR(100),
      run_time VARCHAR(10) DEFAULT '09:00',
      timezone VARCHAR(50) DEFAULT 'America/Chicago',
      enabled BOOLEAN DEFAULT true,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      run_count INTEGER DEFAULT 0,
      last_result TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Ensure default profile exists
  await pool.query(`
    INSERT INTO agent_profile (agent_id) VALUES ('bloomie-sarah-rodriguez')
    ON CONFLICT (agent_id) DO NOTHING
  `);
}

// Helper: frequency → cron expression
function frequencyToCron(frequency, runTime = '09:00') {
  const [hour, minute] = (runTime || '09:00').split(':').map(Number);
  switch (frequency) {
    case 'daily': return `${minute} ${hour} * * *`;
    case 'weekdays': return `${minute} ${hour} * * 1-5`;
    case 'weekly': return `${minute} ${hour} * * 1`; // Mondays
    case 'monthly': return `${minute} ${hour} 1 * *`; // 1st of month
    default: return `${minute} ${hour} * * *`;
  }
}

// Helper: calculate next run time
function nextRunTime(frequency, runTime = '09:00', timezone = 'America/Chicago') {
  const now = new Date();
  const [hour, minute] = (runTime || '09:00').split(':').map(Number);
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  // Skip weekends for weekday tasks
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
  let pool;
  try {
    pool = await getPool();
    await ensureTables(pool);
    
    const result = await pool.query(
      `SELECT * FROM agent_profile WHERE agent_id = 'bloomie-sarah-rodriguez'`
    );
    const profile = result.rows[0] || {};

    // Get task count
    const taskResult = await pool.query(
      `SELECT COUNT(*) as count FROM scheduled_tasks WHERE agent_id = 'bloomie-sarah-rodriguez' AND enabled = true`
    );

    // Get file count
    let fileCount = 0;
    try {
      const fileResult = await pool.query(`SELECT COUNT(*) as count FROM artifacts`);
      fileCount = parseInt(fileResult.rows[0]?.count || 0);
    } catch {}

    // Get message count
    let msgCount = 0;
    try {
      const msgResult = await pool.query(`SELECT COALESCE(SUM(message_count), 0) as count FROM chat_sessions`);
      msgCount = parseInt(msgResult.rows[0]?.count || 0);
    } catch {}

    return res.json({
      profile: {
        agentId: profile.agent_id,
        jobTitle: profile.job_title || 'AI Employee',
        jobDescription: profile.job_description || '',
        avatarUrl: profile.avatar_url || null,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      },
      stats: {
        messages: msgCount,
        files: fileCount,
        activeTasks: parseInt(taskResult.rows[0]?.count || 0)
      },
      connectedTools: [
        { name: 'GoHighLevel CRM', connected: true, icon: '📊', capabilities: ['Contacts', 'Conversations', 'Email', 'SMS', 'Campaigns'] },
        { name: 'Browser & Research', connected: true, icon: '🌐', capabilities: ['Web browsing', 'Screenshots', 'Form filling'] },
        { name: 'File Creation', connected: true, icon: '📄', capabilities: ['Blog posts', 'Email copy', 'SOPs', 'Reports'] },
        { name: 'Email & SMS', connected: true, icon: '✉️', capabilities: ['Send via GHL', 'Campaign management'] },
        { name: 'Google Drive', connected: false, icon: '📁', capabilities: ['Save files', 'Read docs'] },
        { name: 'Social Media', connected: false, icon: '📱', capabilities: ['Post content', 'Schedule posts'] }
      ]
    });
  } catch (error) {
    logger.error('Get profile error', { error: error.message });
    return res.status(500).json({ error: 'Failed to load profile' });
  } finally { if (pool) await pool.end().catch(()=>{}); }
});

// PATCH /api/agent/profile
router.patch('/profile', async (req, res) => {
  let pool;
  try {
    pool = await getPool();
    await ensureTables(pool);
    const { jobTitle, jobDescription, avatarUrl } = req.body;

    const result = await pool.query(`
      UPDATE agent_profile 
      SET job_title = COALESCE($1, job_title),
          job_description = COALESCE($2, job_description),
          avatar_url = COALESCE($3, avatar_url),
          updated_at = NOW()
      WHERE agent_id = 'bloomie-sarah-rodriguez'
      RETURNING *
    `, [jobTitle || null, jobDescription || null, avatarUrl || null]);

    logger.info('Profile updated', { jobTitle, jobDescription: jobDescription?.slice(0, 50) });
    return res.json({ success: true, profile: result.rows[0] });
  } catch (error) {
    logger.error('Update profile error', { error: error.message });
    return res.status(500).json({ error: 'Failed to update profile' });
  } finally { if (pool) await pool.end().catch(()=>{}); }
});

// ═══════════════════════════════════════════════════════════════
// SCHEDULED TASKS ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// GET /api/agent/tasks/runs — task execution history
router.get('/tasks/runs', async (req, res) => {
  let pool;
  try {
    pool = await getPool();
    // task_runs table will be created when heartbeat execution is wired up
    // For now return empty array
    try {
      const result = await pool.query(`
        SELECT * FROM task_runs 
        WHERE agent_id = 'bloomie-sarah-rodriguez'
        ORDER BY created_at DESC LIMIT 50
      `);
      return res.json({ runs: result.rows });
    } catch {
      // Table doesn't exist yet — that's fine
      return res.json({ runs: [] });
    }
  } catch (error) {
    return res.json({ runs: [] });
  } finally { if (pool) await pool.end().catch(()=>{}); }
});

// GET /api/agent/tasks
router.get('/tasks', async (req, res) => {
  let pool;
  try {
    pool = await getPool();
    await ensureTables(pool);

    const result = await pool.query(`
      SELECT * FROM scheduled_tasks 
      WHERE agent_id = 'bloomie-sarah-rodriguez'
      ORDER BY enabled DESC, created_at DESC
    `);

    const tasks = result.rows.map(t => ({
      id: t.id,
      taskId: t.task_id,
      name: t.name,
      description: t.description,
      taskType: t.task_type,
      instruction: t.instruction,
      frequency: t.frequency,
      runTime: t.run_time,
      timezone: t.timezone,
      enabled: t.enabled,
      lastRunAt: t.last_run_at,
      nextRunAt: t.next_run_at,
      runCount: t.run_count,
      lastResult: t.last_result,
      createdAt: t.created_at
    }));

    return res.json({ tasks });
  } catch (error) {
    logger.error('List tasks error', { error: error.message });
    return res.status(500).json({ error: 'Failed to list tasks' });
  } finally { if (pool) await pool.end().catch(()=>{}); }
});

// POST /api/agent/tasks
router.post('/tasks', async (req, res) => {
  let pool;
  try {
    pool = await getPool();
    await ensureTables(pool);

    const { name, description, taskType, instruction, frequency, runTime } = req.body;
    if (!name || !instruction) {
      return res.status(400).json({ error: 'name and instruction are required' });
    }

    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const cron = frequencyToCron(frequency || 'daily', runTime);
    const nextRun = nextRunTime(frequency || 'daily', runTime);

    const result = await pool.query(`
      INSERT INTO scheduled_tasks (task_id, name, description, task_type, instruction, frequency, cron_expression, run_time, next_run_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [taskId, name, description || '', taskType || 'custom', instruction, frequency || 'daily', cron, runTime || '09:00', nextRun]);

    logger.info('Scheduled task created', { taskId, name, frequency, runTime });
    return res.json({ success: true, task: result.rows[0] });
  } catch (error) {
    logger.error('Create task error', { error: error.message });
    return res.status(500).json({ error: 'Failed to create task' });
  } finally { if (pool) await pool.end().catch(()=>{}); }
});

// PATCH /api/agent/tasks/:taskId — toggle enabled, update fields
router.patch('/tasks/:taskId', async (req, res) => {
  let pool;
  try {
    pool = await getPool();
    const { taskId } = req.params;
    const { enabled, name, instruction, frequency, runTime } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    if (enabled !== undefined) { updates.push(`enabled = $${idx++}`); params.push(enabled); }
    if (name) { updates.push(`name = $${idx++}`); params.push(name); }
    if (instruction) { updates.push(`instruction = $${idx++}`); params.push(instruction); }
    if (frequency) {
      updates.push(`frequency = $${idx++}`); params.push(frequency);
      updates.push(`cron_expression = $${idx++}`); params.push(frequencyToCron(frequency, runTime || '09:00'));
      updates.push(`next_run_at = $${idx++}`); params.push(nextRunTime(frequency, runTime));
    }
    if (runTime) { updates.push(`run_time = $${idx++}`); params.push(runTime); }
    updates.push(`updated_at = NOW()`);

    params.push(taskId);
    const result = await pool.query(
      `UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE task_id = $${idx} RETURNING *`,
      params
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Task not found' });
    return res.json({ success: true, task: result.rows[0] });
  } catch (error) {
    logger.error('Update task error', { error: error.message });
    return res.status(500).json({ error: 'Failed to update task' });
  } finally { if (pool) await pool.end().catch(()=>{}); }
});

// DELETE /api/agent/tasks/:taskId
router.delete('/tasks/:taskId', async (req, res) => {
  let pool;
  try {
    pool = await getPool();
    const { taskId } = req.params;
    const result = await pool.query(`DELETE FROM scheduled_tasks WHERE task_id = $1 RETURNING task_id`, [taskId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Task not found' });
    logger.info('Scheduled task deleted', { taskId });
    return res.json({ success: true });
  } catch (error) {
    logger.error('Delete task error', { error: error.message });
    return res.status(500).json({ error: 'Failed to delete task' });
  } finally { if (pool) await pool.end().catch(()=>{}); }
});

export default router;
