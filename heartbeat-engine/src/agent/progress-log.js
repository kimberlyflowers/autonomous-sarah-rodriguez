// BLOOM Progress Log - Ralph Pattern's "progress.txt" equivalent
// Persistent cross-cycle memory stored in Supabase
// Each heartbeat cycle APPENDS learnings, never overwrites
// This is what gives Sarah memory between execution loops

import { createLogger } from '../logging/logger.js';

const logger = createLogger('progress-log');

let supabase = null;

async function getSupabase() {
  if (supabase) return supabase;
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return supabase;
}

/**
 * Ensure the progress_log table exists
 */
async function ensureTable() {
  const sb = await getSupabase();
  // Table creation handled by migration, but we'll check it exists
  try {
    await sb.from('bloom_progress_log').select('id').limit(1);
  } catch (err) {
    logger.warn('progress_log table may not exist, attempting to create via RPC');
    // Fallback: the table should be created via migration
  }
}

/**
 * Append a progress entry after a heartbeat cycle or task execution
 * This is the equivalent of Ralph's "append to progress.txt"
 *
 * CRITICAL: Always APPEND, never UPDATE or OVERWRITE
 *
 * @param {Object} entry - The progress entry
 * @param {string} entry.cycleId - The heartbeat cycle or execution ID
 * @param {string} entry.projectId - Optional project/workflow this relates to
 * @param {string} entry.type - 'task_completed' | 'task_failed' | 'learning' | 'blocker' | 'observation'
 * @param {string} entry.summary - What happened in plain English
 * @param {Object} entry.details - Structured details
 * @param {Array} entry.stepsCompleted - Which plan steps were completed
 * @param {Array} entry.stepsFailed - Which plan steps failed and why
 * @param {string} entry.nextPriority - What Sarah thinks should be done next
 */
export async function appendProgress(entry) {
  const sb = await getSupabase();
  const now = new Date().toISOString();

  const record = {
    agent_id: 'bloomie-sarah-rodriguez',
    cycle_id: entry.cycleId || null,
    project_id: entry.projectId || null,
    entry_type: entry.type || 'observation',
    summary: entry.summary,
    details: entry.details || {},
    steps_completed: entry.stepsCompleted || [],
    steps_failed: entry.stepsFailed || [],
    next_priority: entry.nextPriority || null,
    verification_results: entry.verificationResults || null,
    created_at: now
  };

  try {
    const { data, error } = await sb
      .from('bloom_progress_log')
      .insert(record)
      .select('id, entry_type, summary, created_at')
      .single();

    if (error) {
      // If table doesn't exist, log warning but don't crash
      logger.warn('Could not append to progress log (table may need migration)', {
        error: error.message,
        fallback: 'Entry logged to console only'
      });
      logger.info('PROGRESS LOG ENTRY (fallback):', record);
      return { success: false, error: error.message, fallback: true };
    }

    logger.info('Progress entry appended', {
      id: data.id,
      type: data.entry_type,
      summary: data.summary.substring(0, 80)
    });

    return { success: true, entry: data };

  } catch (err) {
    logger.error('Failed to append progress:', err);
    logger.info('PROGRESS LOG ENTRY (fallback):', record);
    return { success: false, error: err.message, fallback: true };
  }
}

/**
 * Get recent progress entries for context loading
 * This is what Sarah reads at the start of each cycle to know what happened before
 *
 * @param {Object} options
 * @param {string} options.projectId - Filter by project
 * @param {number} options.hours - How many hours back to look (default 48)
 * @param {number} options.limit - Max entries (default 20)
 * @param {Array} options.types - Filter by entry types
 * @returns {Array} Recent progress entries, newest first
 */
export async function getRecentProgress(options = {}) {
  const sb = await getSupabase();
  const hours = options.hours || 48;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    let query = sb
      .from('bloom_progress_log')
      .select('*')
      .eq('agent_id', 'bloomie-sarah-rodriguez')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(options.limit || 20);

    if (options.projectId) {
      query = query.eq('project_id', options.projectId);
    }

    if (options.types && options.types.length > 0) {
      query = query.in('entry_type', options.types);
    }

    const { data, error } = await query;

    if (error) {
      logger.warn('Could not read progress log:', error.message);
      return [];
    }

    return data || [];

  } catch (err) {
    logger.error('Failed to read progress log:', err);
    return [];
  }
}

/**
 * Get progress formatted as plain text (like progress.txt)
 * This is what gets injected into the system prompt for each cycle
 *
 * @param {Object} options - Same as getRecentProgress
 * @returns {string} Formatted progress text
 */
export async function getProgressText(options = {}) {
  const entries = await getRecentProgress(options);

  if (entries.length === 0) {
    return 'No recent progress entries. This may be the start of a new work session.';
  }

  const lines = entries.map(entry => {
    const time = new Date(entry.created_at).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });

    let line = `[${time}] [${entry.entry_type.toUpperCase()}] ${entry.summary}`;

    if (entry.steps_completed && entry.steps_completed.length > 0) {
      line += `\n  ✅ Completed: ${entry.steps_completed.join(', ')}`;
    }

    if (entry.steps_failed && entry.steps_failed.length > 0) {
      line += `\n  ❌ Failed: ${JSON.stringify(entry.steps_failed)}`;
    }

    if (entry.next_priority) {
      line += `\n  ➡️ Next: ${entry.next_priority}`;
    }

    return line;
  });

  return lines.join('\n\n');
}

/**
 * Get the PRD-style task status for a project
 * Returns all tasks with their passes/fails status
 * This is the equivalent of Ralph's prd.json
 *
 * @param {string} projectId - The project to get status for
 * @returns {Object} PRD-style status
 */
export async function getProjectPRDStatus(projectId) {
  const sb = await getSupabase();

  try {
    // Get the latest task plan for this project
    const { data: plan, error: planError } = await sb
      .from('task_plans')
      .select('*')
      .eq('session_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (planError || !plan) {
      return { exists: false, projectId };
    }

    const steps = typeof plan.steps === 'string' ? JSON.parse(plan.steps) : plan.steps;

    return {
      exists: true,
      projectId,
      title: plan.title,
      steps: steps.map(s => ({
        ...s,
        passes: s.status === 'completed' && s.verified === true
      })),
      totalSteps: steps.length,
      passingSteps: steps.filter(s => s.status === 'completed' && s.verified === true).length,
      failingSteps: steps.filter(s => s.verified === false || s.status === 'failed').length,
      pendingSteps: steps.filter(s => s.status === 'pending').length,
      allPassing: steps.every(s => s.status === 'completed' && s.verified === true),
      updatedAt: plan.updated_at
    };

  } catch (err) {
    logger.error('Failed to get PRD status:', err);
    return { exists: false, projectId, error: err.message };
  }
}

/**
 * SQL migration for the progress log table
 * Run this to create the table in Supabase
 */
export const MIGRATION_SQL = `
-- BLOOM Progress Log table (Ralph pattern's progress.txt equivalent)
CREATE TABLE IF NOT EXISTS bloom_progress_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) NOT NULL DEFAULT 'bloomie-sarah-rodriguez',
  cycle_id VARCHAR(100),
  project_id VARCHAR(255),
  entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN (
    'task_completed', 'task_failed', 'learning', 'blocker',
    'observation', 'verification_result', 'retry_attempt', 'cycle_summary'
  )),
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  steps_completed TEXT[] DEFAULT '{}',
  steps_failed JSONB DEFAULT '[]',
  next_priority TEXT,
  verification_results JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient querying by agent and time
CREATE INDEX IF NOT EXISTS idx_progress_log_agent_time
  ON bloom_progress_log(agent_id, created_at DESC);

-- Index for project-specific queries
CREATE INDEX IF NOT EXISTS idx_progress_log_project
  ON bloom_progress_log(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

-- Add verified field to task_plans steps (for PRD passes/fails pattern)
-- This is handled in the JSON steps column, no schema change needed
-- But we add a status tracking column for the overall plan
ALTER TABLE task_plans
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS all_steps_passing BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE;
`;
