// BLOOM Task Executor
// Runs scheduled tasks through the orchestrator pipeline:
// Heartbeat tick → check schedule → route task → execute sub-agent → save results
import { routeTask, executeSubAgent, calculateCost } from './router.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('task-executor');

async function getPool() {
  const { createPool } = await import('../../database/setup.js');
  return createPool();
}

// ═══ Ensure task_runs table exists ═══
async function ensureTaskRunsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_runs (
      id SERIAL PRIMARY KEY,
      run_id VARCHAR(64) UNIQUE NOT NULL,
      task_id VARCHAR(64),
      task_name VARCHAR(500),
      task_type VARCHAR(50),
      status VARCHAR(20) DEFAULT 'queued',
      instruction TEXT,
      routing_model VARCHAR(100),
      worker_model VARCHAR(100),
      worker_provider VARCHAR(50),
      routing_tokens INTEGER DEFAULT 0,
      worker_tokens INTEGER DEFAULT 0,
      routing_cost_cents NUMERIC(10,4) DEFAULT 0,
      worker_cost_cents NUMERIC(10,4) DEFAULT 0,
      total_cost_cents NUMERIC(10,4) DEFAULT 0,
      result TEXT,
      evidence JSONB DEFAULT '{}',
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ═══ Load Letta memory context for the orchestrator ═══
async function loadMemoryContext() {
  // TODO: Pull from Letta when integrated
  // For now, return a static context from env or a summary
  try {
    const pool = await getPool();
    // Try to load from agent_profile for basic context
    const profileResult = await pool.query(
      `SELECT job_title, job_description FROM agent_profile WHERE agent_id = 'bloomie-sarah-rodriguez'`
    );
    await pool.end();

    const profile = profileResult.rows[0] || {};
    let context = '';
    if (profile.job_title) context += `Agent role: ${profile.job_title}\n`;
    if (profile.job_description) context += `Job description: ${profile.job_description}\n`;

    // Add any env-based context
    if (process.env.BLOOM_BUSINESS_CONTEXT) {
      context += process.env.BLOOM_BUSINESS_CONTEXT + '\n';
    }

    return context || 'AI Employee for a small business. Focus on quality, professional tone.';
  } catch (e) {
    logger.warn('Failed to load memory context', { error: e.message });
    return 'AI Employee for a small business. Focus on quality, professional tone.';
  }
}

// ═══ Check and run due tasks ═══
// Called by the heartbeat on each tick
export async function checkAndRunScheduledTasks() {
  let pool;
  try {
    pool = await getPool();
    await ensureTaskRunsTable(pool);

    // Find tasks that are due (past next_run_at and enabled)
    const dueResult = await pool.query(`
      SELECT * FROM scheduled_tasks 
      WHERE enabled = true 
        AND next_run_at IS NOT NULL 
        AND next_run_at <= NOW()
      ORDER BY next_run_at ASC
      LIMIT 3
    `);

    if (dueResult.rows.length === 0) return { tasksRun: 0 };

    logger.info(`Found ${dueResult.rows.length} due task(s)`);

    const results = [];
    for (const task of dueResult.rows) {
      try {
        const result = await executeScheduledTask(pool, task);
        results.push(result);
      } catch (e) {
        logger.error('Task execution failed', { taskId: task.task_id, error: e.message });
        results.push({ taskId: task.task_id, status: 'failed', error: e.message });
      }
    }

    return { tasksRun: results.length, results };
  } catch (e) {
    logger.error('checkAndRunScheduledTasks error', { error: e.message });
    return { tasksRun: 0, error: e.message };
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}

// ═══ Execute a single scheduled task ═══
async function executeScheduledTask(pool, task) {
  const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const startTime = Date.now();

  logger.info('Executing scheduled task', { taskId: task.task_id, name: task.name, runId });

  // 1. Create task_run record (status: pending)
  await pool.query(`
    INSERT INTO task_runs (run_id, task_id, task_name, task_type, status, instruction, started_at)
    VALUES ($1, $2, $3, $4, 'pending', $5, NOW())
  `, [runId, task.task_id, task.name, task.task_type, task.instruction]);

  try {
    // 2. Load memory context for Sarah
    const memoryContext = await loadMemoryContext();

    // 3. Route the task — Sarah (Haiku) decides which model to use
    const routing = await routeTask(task.instruction, memoryContext);

    // Update with routing info
    await pool.query(`
      UPDATE task_runs SET routing_model = $1, routing_tokens = $2, routing_cost_cents = $3
      WHERE run_id = $4
    `, [
      routing.routingModel,
      (routing.routingUsage?.inputTokens || 0) + (routing.routingUsage?.outputTokens || 0),
      routing.routingCostCents || 0,
      runId
    ]);

    // 4. Execute the sub-agent on the chosen model
    const result = await executeSubAgent(routing);

    // 5. Post-process — save files, log actions
    const evidence = await postProcess(pool, routing, result, task);

    // 6. Calculate total cost
    const totalCost = (routing.routingCostCents || 0) + (result.costCents || 0);
    const durationMs = Date.now() - startTime;

    // 7. Update task_run as completed
    await pool.query(`
      UPDATE task_runs SET 
        status = 'completed',
        worker_model = $1,
        worker_provider = $2,
        worker_tokens = $3,
        worker_cost_cents = $4,
        total_cost_cents = $5,
        result = $6,
        evidence = $7,
        completed_at = NOW(),
        duration_ms = $8
      WHERE run_id = $9
    `, [
      result.model,
      result.provider,
      (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
      result.costCents || 0,
      totalCost,
      evidence.summary || result.text?.slice(0, 500),
      JSON.stringify(evidence),
      durationMs,
      runId
    ]);

    // 8. Update scheduled_task — bump next_run_at, increment run_count
    await updateNextRun(pool, task);

    logger.info('Task completed', {
      taskId: task.task_id,
      runId,
      model: result.model,
      durationMs,
      totalCostCents: totalCost
    });

    return { taskId: task.task_id, runId, status: 'completed', model: result.model, cost: totalCost };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Mark as failed
    await pool.query(`
      UPDATE task_runs SET 
        status = 'failed',
        result = $1,
        evidence = $2,
        completed_at = NOW(),
        duration_ms = $3
      WHERE run_id = $4
    `, [
      error.message,
      JSON.stringify({
        actions: [
          { type: 'error', label: 'Task failed', detail: error.message },
          { type: 'retry_scheduled', label: 'Will retry next cycle', detail: 'Task remains in schedule' }
        ]
      }),
      durationMs,
      runId
    ]);

    // Still bump next_run_at so we don't retry immediately
    await updateNextRun(pool, task);

    throw error;
  }
}

// ═══ Post-processing — save files, log CRM actions ═══
async function postProcess(pool, routing, result, task) {
  const evidence = {
    summary: '',
    files: [],
    actions: [],
    screenshots: [],
    modelRouting: {
      orchestrator: {
        model: routing.routingModel,
        tokens: (routing.routingUsage?.inputTokens || 0) + (routing.routingUsage?.outputTokens || 0),
        costCents: routing.routingCostCents || 0
      },
      worker: {
        model: result.model,
        tokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
        costCents: result.costCents || 0
      }
    }
  };

  const postSteps = routing.postProcessing || [];

  // Save as file
  if (postSteps.includes('save_as_file') && result.text) {
    try {
      const fileExt = routing.expectedOutput === 'html' ? 'html' :
                       routing.expectedOutput === 'code' ? 'js' : 'md';
      const fileName = generateFileName(task.name, fileExt);

      // Call the files API to save
      const port = process.env.PORT || 3000;
      const mimeMap = { md: 'text/markdown', html: 'text/html', js: 'text/javascript' };
      const resp = await fetch(`http://localhost:${port}/api/files/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fileName,
          description: `Auto-generated by scheduled task: ${task.name}`,
          fileType: routing.expectedOutput === 'html' ? 'html' : routing.expectedOutput === 'code' ? 'code' : 'markdown',
          mimeType: mimeMap[fileExt] || 'text/markdown',
          content: result.text,
          sessionId: null
        })
      });
      const fileData = await resp.json();

      if (fileData.success) {
        evidence.files.push({
          name: fileName,
          artifactId: fileData.artifact?.id,
          size: Math.round(result.text.length / 1024 * 10) / 10 + ' KB'
        });
        evidence.actions.push({
          type: 'file_created', label: `Created ${fileName}`, detail: `${result.text.length} characters`
        });
        evidence.actions.push({
          type: 'saved_to_files', label: 'Saved to Files', detail: 'Auto-saved on creation'
        });
        evidence.summary = `Created "${fileName}" — ${Math.round(result.text.split(/\s+/).length)} words.`;
      }
    } catch (e) {
      logger.error('Failed to save file', { error: e.message });
      evidence.actions.push({ type: 'error', label: 'Failed to save file', detail: e.message });
    }
  }

  // Log CRM actions
  if (postSteps.includes('log_crm_actions')) {
    evidence.actions.push({
      type: 'crm_operation', label: 'CRM task executed', detail: result.text?.slice(0, 200)
    });
    evidence.summary = evidence.summary || result.text?.slice(0, 200);
  }

  // Email tasks
  if (postSteps.includes('send_via_crm')) {
    evidence.actions.push({
      type: 'email_prepared', label: 'Email content prepared', detail: 'Ready for send via BLOOM CRM'
    });
    evidence.summary = evidence.summary || 'Email content prepared for review.';
  }

  if (!evidence.summary) {
    evidence.summary = result.text?.slice(0, 200) || 'Task completed.';
  }

  return evidence;
}

// ═══ Update next_run_at for a task ═══
async function updateNextRun(pool, task) {
  const now = new Date();
  const [hour, minute] = (task.run_time || '09:00').split(':').map(Number);
  let next = new Date(now);
  next.setHours(hour, minute, 0, 0);

  // Move to next occurrence
  switch (task.frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekdays':
      next.setDate(next.getDate() + 1);
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1);
      }
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }

  await pool.query(`
    UPDATE scheduled_tasks 
    SET next_run_at = $1, last_run_at = NOW(), run_count = run_count + 1, updated_at = NOW()
    WHERE task_id = $2
  `, [next.toISOString(), task.task_id]);
}

// ═══ Generate a clean file name from task name ═══
function generateFileName(taskName, ext) {
  const date = new Date().toISOString().slice(0, 10); // 2026-03-04
  const slug = taskName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return `${slug}-${date}.${ext}`;
}

// ═══ Get task run history for the Activity page ═══
export async function getTaskRuns(limit = 50) {
  let pool;
  try {
    pool = await getPool();
    await ensureTaskRunsTable(pool);

    const result = await pool.query(`
      SELECT * FROM task_runs
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(r => ({
      id: r.id,
      runId: r.run_id,
      taskId: r.task_id,
      taskName: r.task_name,
      taskType: r.task_type,
      status: r.status,
      instruction: r.instruction,
      routingModel: r.routing_model,
      workerModel: r.worker_model,
      workerProvider: r.worker_provider,
      routingTokens: r.routing_tokens,
      workerTokens: r.worker_tokens,
      totalCostCents: parseFloat(r.total_cost_cents || 0),
      result: r.result,
      evidence: r.evidence || {},
      startedAt: r.started_at,
      completedAt: r.completed_at,
      durationMs: r.duration_ms,
      createdAt: r.created_at
    }));
  } catch (e) {
    logger.error('getTaskRuns error', { error: e.message });
    return [];
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
