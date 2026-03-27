// BLOOM Task Executor
// ⚡ MIGRATED: scheduled_tasks + task_runs now read/write Supabase (not Railway Postgres)
import { routeTask, executeSubAgent } from './router.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('task-executor');

// MULTI-TENANT: No hardcoded agent/org IDs.
// Tasks carry their own agent_id and organization_id — we query ALL enabled agents.

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

// ═══ Load memory context for a specific agent (multi-tenant) ═══
async function loadMemoryContext(agentId) {
  try {
    const supabase = await getSupabase();
    const { data: agent } = await supabase
      .from('agents')
      .select('role, standing_instructions')
      .eq('id', agentId)
      .single();

    let context = '';
    if (agent?.role)                 context += `Agent role: ${agent.role}\n`;
    if (agent?.standing_instructions) context += agent.standing_instructions.slice(0, 500) + '\n';
    if (process.env.BLOOM_BUSINESS_CONTEXT) context += process.env.BLOOM_BUSINESS_CONTEXT + '\n';

    return context || 'AI Employee for a small business. Focus on quality, professional tone.';
  } catch (e) {
    logger.warn('Failed to load memory context', { agentId, error: e.message });
    return 'AI Employee for a small business. Focus on quality, professional tone.';
  }
}

// ═══ Check and run due tasks — called by the heartbeat on each tick ═══
export async function checkAndRunScheduledTasks() {
  let supabase;
  try {
    supabase = await getSupabase();

    // MULTI-TENANT: Find due tasks for ALL agents across all orgs
    const { data: dueTasks, error } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('enabled', true)
      .not('next_run_at', 'is', null)
      .lte('next_run_at', new Date().toISOString())
      .order('next_run_at', { ascending: true })
      .limit(10);

    if (error) throw new Error(error.message);
    if (!dueTasks || dueTasks.length === 0) return { tasksRun: 0 };

    logger.info(`Found ${dueTasks.length} due task(s)`);

    const results = [];
    for (const task of dueTasks) {
      try {
        const result = await executeScheduledTask(supabase, task);
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
  }
}

// ═══ Execute a single scheduled task ═══
async function executeScheduledTask(supabase, task) {
  const runId     = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const startTime = Date.now();

  logger.info('Executing scheduled task', { taskId: task.task_id, name: task.name, runId });

  // MULTI-TENANT: Use the task's own agent_id and organization_id
  const agentId = task.agent_id;
  const orgId   = task.organization_id;

  // 1. Create task_run record
  await supabase.from('task_runs').insert({
    run_id:          runId,
    task_id:         task.task_id,
    agent_id:        agentId,
    organization_id: orgId,
    task_name:       task.name,
    task_type:       task.task_type,
    status:          'pending',
    instruction:     task.instruction,
    started_at:      new Date().toISOString()
  });

  try {
    // 2. Load memory context for THIS agent (multi-tenant)
    const memoryContext = await loadMemoryContext(agentId);

    // 3. Route the task
    const routing = await routeTask(task.instruction, memoryContext);

    // Update with routing info
    await supabase.from('task_runs').update({
      routing_model:       routing.routingModel,
      routing_tokens:      (routing.routingUsage?.inputTokens || 0) + (routing.routingUsage?.outputTokens || 0),
      routing_cost_cents:  routing.routingCostCents || 0
    }).eq('run_id', runId);

    // 4. Execute the sub-agent WITH skill injection (multi-tenant)
    const result = await executeSubAgent(routing, { orgId, agentId });

    // 5. Post-process — save files, log CRM actions
    const evidence = await postProcess(supabase, routing, result, task);

    // 6. Calculate total cost
    const totalCost  = (routing.routingCostCents || 0) + (result.costCents || 0);
    const durationMs = Date.now() - startTime;

    // 7. Update task_run as completed
    await supabase.from('task_runs').update({
      status:            'completed',
      worker_model:      result.model,
      worker_provider:   result.provider,
      worker_tokens:     (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
      worker_cost_cents: result.costCents || 0,
      total_cost_cents:  totalCost,
      result:            evidence.summary || result.text?.slice(0, 500),
      evidence:          evidence,
      completed_at:      new Date().toISOString(),
      duration_ms:       durationMs
    }).eq('run_id', runId);

    // 8. Bump next_run_at, increment run_count
    await updateNextRun(supabase, task);

    logger.info('Task completed', { taskId: task.task_id, runId, model: result.model, durationMs, totalCost });
    return { taskId: task.task_id, runId, status: 'completed', model: result.model, cost: totalCost };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    await supabase.from('task_runs').update({
      status:       'failed',
      result:       error.message,
      evidence:     { actions: [{ type: 'error', label: 'Task failed', detail: error.message }] },
      completed_at: new Date().toISOString(),
      duration_ms:  durationMs
    }).eq('run_id', runId);

    // Still bump next_run_at so we don't retry immediately
    await updateNextRun(supabase, task);

    throw error;
  }
}

// ═══ Post-processing — save files, log CRM actions ═══
async function postProcess(supabase, routing, result, task) {
  const evidence = {
    summary: '',
    files: [],
    actions: [],
    screenshots: [],
    modelRouting: {
      orchestrator: {
        model:      routing.routingModel,
        tokens:     (routing.routingUsage?.inputTokens || 0) + (routing.routingUsage?.outputTokens || 0),
        costCents:  routing.routingCostCents || 0
      },
      worker: {
        model:     result.model,
        tokens:    (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
        costCents: result.costCents || 0
      }
    }
  };

  const postSteps = routing.postProcessing || [];

  if (postSteps.includes('save_as_file') && result.text) {
    try {
      const fileExt  = routing.expectedOutput === 'html' ? 'html' : routing.expectedOutput === 'code' ? 'js' : 'md';
      const fileName = generateFileName(task.name, fileExt);
      const port     = process.env.PORT || 3000;
      const mimeMap  = { md: 'text/markdown', html: 'text/html', js: 'text/javascript' };

      const resp = await fetch(`http://localhost:${port}/api/files/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        fileName,
          description: `Auto-generated by scheduled task: ${task.name}`,
          fileType:    routing.expectedOutput === 'html' ? 'html' : routing.expectedOutput === 'code' ? 'code' : 'markdown',
          mimeType:    mimeMap[fileExt] || 'text/markdown',
          content:     result.text,
          sessionId:   null
        })
      });
      const fileData = await resp.json();

      if (fileData.success) {
        evidence.files.push({ name: fileName, artifactId: fileData.artifact?.id, size: Math.round(result.text.length / 1024 * 10) / 10 + ' KB' });
        evidence.actions.push({ type: 'file_created',   label: `Created ${fileName}`, detail: `${result.text.length} characters` });
        evidence.actions.push({ type: 'saved_to_files', label: 'Saved to Files',      detail: 'Auto-saved on creation' });
        evidence.summary = `Created "${fileName}" — ${Math.round(result.text.split(/\s+/).length)} words.`;
      }
    } catch (e) {
      logger.error('Failed to save file', { error: e.message });
      evidence.actions.push({ type: 'error', label: 'Failed to save file', detail: e.message });
    }
  }

  if (postSteps.includes('log_crm_actions')) {
    evidence.actions.push({ type: 'crm_operation', label: 'CRM task executed', detail: result.text?.slice(0, 200) });
    evidence.summary = evidence.summary || result.text?.slice(0, 200);
  }

  if (postSteps.includes('send_via_crm')) {
    evidence.actions.push({ type: 'email_prepared', label: 'Email content prepared', detail: 'Ready for send via BLOOM CRM' });
    evidence.summary = evidence.summary || 'Email content prepared for review.';
  }

  if (!evidence.summary) evidence.summary = result.text?.slice(0, 200) || 'Task completed.';
  return evidence;
}

// ═══ Update next_run_at for a task ═══
async function updateNextRun(supabase, task) {
  const now    = new Date();
  const [hour, minute] = (task.run_time || '09:00').split(':').map(Number);
  let next = new Date(now);
  next.setHours(hour, minute, 0, 0);

  if (task.frequency === 'every_10_min') {
    next.setTime(now.getTime() + 10 * 60 * 1000);
    await supabase.from('scheduled_tasks').update({
      next_run_at: next.toISOString(),
      last_run_at: now.toISOString(),
      run_count:   (task.run_count || 0) + 1,
      updated_at:  now.toISOString()
    }).eq('task_id', task.task_id);
    return;
  }
  if (task.frequency === 'every_30_min') {
    next.setTime(now.getTime() + 30 * 60 * 1000);
    await supabase.from('scheduled_tasks').update({
      next_run_at: next.toISOString(),
      last_run_at: now.toISOString(),
      run_count:   (task.run_count || 0) + 1,
      updated_at:  now.toISOString()
    }).eq('task_id', task.task_id);
    return;
  }
  if (task.frequency === 'hourly') {
    // Hourly: next run is next hour at the same :MM minutes
    next.setMinutes(minute, 0, 0);
    next.setHours(now.getHours() + 1);
    await supabase.from('scheduled_tasks').update({
      next_run_at: next.toISOString(),
      last_run_at: now.toISOString(),
      run_count:   (task.run_count || 0) + 1,
      updated_at:  now.toISOString()
    }).eq('task_id', task.task_id);
    return;
  }

  switch (task.frequency) {
    case 'daily':    next.setDate(next.getDate() + 1); break;
    case 'weekdays':
      next.setDate(next.getDate() + 1);
      while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
      break;
    case 'weekly':  next.setDate(next.getDate() + 7);   break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    default:        next.setDate(next.getDate() + 1);   break;
  }

  await supabase
    .from('scheduled_tasks')
    .update({
      next_run_at: next.toISOString(),
      last_run_at: new Date().toISOString(),
      run_count:   (task.run_count || 0) + 1,
      updated_at:  new Date().toISOString()
    })
    .eq('task_id', task.task_id);
}

// ═══ Generate a clean file name from task name ═══
function generateFileName(taskName, ext) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = taskName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return `${slug}-${date}.${ext}`;
}

// ═══ Get task run history for the Activity page (multi-tenant) ═══
export async function getTaskRuns(limit = 50, agentId = null) {
  try {
    const supabase = await getSupabase();
    let query = supabase
      .from('task_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Filter by agent if specified, otherwise return all (for admin views)
    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    return (data || []).map(r => ({
      id:              r.id,
      runId:           r.run_id,
      taskId:          r.task_id,
      taskName:        r.task_name,
      taskType:        r.task_type,
      status:          r.status,
      instruction:     r.instruction,
      routingModel:    r.routing_model,
      workerModel:     r.worker_model,
      workerProvider:  r.worker_provider,
      routingTokens:   r.routing_tokens,
      workerTokens:    r.worker_tokens,
      totalCostCents:  parseFloat(r.total_cost_cents || 0),
      result:          r.result,
      evidence:        r.evidence || {},
      startedAt:       r.started_at,
      completedAt:     r.completed_at,
      durationMs:      r.duration_ms,
      createdAt:       r.created_at
    }));
  } catch (e) {
    logger.error('getTaskRuns error', { error: e.message });
    return [];
  }
}
