// BLOOM Heartbeat Engine - Database Logging
// Stores actions, rejections, and handoffs to PostgreSQL

import { createLogger } from './logger.js';

const logger = createLogger('logging');

// Database pool will be imported dynamically to avoid circular deps
let pool = null;

async function getPool() {
  if (!pool) {
    const { getSharedPool } = await import('../database/pool.js');
    pool = getSharedPool();
  }
  return pool;
}

// Log heartbeat cycle completion
export async function logHeartbeat(cycleId, data) {
  try {
    const dbPool = await getPool();
    await dbPool.query(`
      INSERT INTO heartbeat_cycles (
        cycle_id, agent_id, started_at, completed_at, duration_ms,
        actions_count, rejections_count, handoffs_count, status, error,
        environment_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (cycle_id) DO UPDATE SET
        completed_at = EXCLUDED.completed_at,
        duration_ms = EXCLUDED.duration_ms,
        actions_count = EXCLUDED.actions_count,
        rejections_count = EXCLUDED.rejections_count,
        handoffs_count = EXCLUDED.handoffs_count,
        status = EXCLUDED.status,
        error = EXCLUDED.error,
        environment_snapshot = EXCLUDED.environment_snapshot
    `, [
      cycleId,
      data.agentId,
      new Date(Date.now() - (data.duration || 0)),
      new Date(),
      data.duration,
      data.actionsCount || 0,
      data.rejectionsCount || 0,
      data.handoffsCount || 0,
      data.status,
      data.error || null,
      JSON.stringify(data.environmentSnapshot || {})
    ]);

    logger.info(`Logged heartbeat cycle: ${cycleId}`, {
      status: data.status,
      duration: data.duration,
      actions: data.actionsCount,
      rejections: data.rejectionsCount,
      handoffs: data.handoffsCount
    });

    // Also backup to Supabase if configured
    await backupToSupabase('heartbeat_cycles', {
      cycle_id: cycleId,
      agent_id: data.agentId,
      duration_ms: data.duration,
      actions_count: data.actionsCount || 0,
      rejections_count: data.rejectionsCount || 0,
      handoffs_count: data.handoffsCount || 0,
      status: data.status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to log heartbeat:', error, { cycleId });
  }
}

// Log agent action execution
export async function logAction(cycleId, decision, result) {
  try {
    const dbPool = await getPool();
    await dbPool.query(`
      INSERT INTO action_log (
        cycle_id, agent_id, action_type, description, target_system,
        input_data, result, success
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      cycleId,
      decision.agentId || process.env.AGENT_ID || 'bloomie-sarah-rodriguez',
      decision.action_type,
      decision.description,
      decision.target_system,
      JSON.stringify(decision.input_data || {}),
      JSON.stringify(result || {}),
      result?.success || false
    ]);

    logger.info(`Logged action: ${decision.action_type}`, {
      cycleId,
      success: result?.success,
      target: decision.target_system
    });

    // Backup to Supabase
    await backupToSupabase('action_log', {
      cycle_id: cycleId,
      agent_id: decision.agentId || process.env.AGENT_ID,
      action_type: decision.action_type,
      description: decision.description,
      target_system: decision.target_system,
      success: result?.success || false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to log action:', error, {
      cycleId,
      action: decision.action_type
    });
  }
}

// Log agent rejection decision
export async function logRejection(cycleId, candidate, reason, confidence, reasonCode = null) {
  try {
    const dbPool = await getPool();
    await dbPool.query(`
      INSERT INTO rejection_log (
        cycle_id, agent_id, candidate_action, reason, reason_code, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      cycleId,
      process.env.AGENT_ID || 'bloomie-sarah-rodriguez',
      candidate,
      reason,
      reasonCode,
      confidence
    ]);

    logger.info(`Logged rejection: ${candidate}`, {
      cycleId,
      reason,
      confidence,
      reason_code: reasonCode
    });

    // Backup to Supabase
    await backupToSupabase('rejection_log', {
      cycle_id: cycleId,
      agent_id: process.env.AGENT_ID,
      candidate_action: candidate,
      reason,
      reason_code: reasonCode,
      confidence,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to log rejection:', error, {
      cycleId,
      candidate
    });
  }
}

// Log agent handoff/escalation
export async function logHandoff(cycleId, decision) {
  try {
    const dbPool = await getPool();
    await dbPool.query(`
      INSERT INTO handoff_log (
        cycle_id, agent_id, issue, analysis_path, hypotheses_tested,
        recommendation, confidence, urgency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      cycleId,
      process.env.AGENT_ID || 'bloomie-sarah-rodriguez',
      decision.issue,
      decision.analysis || null,
      JSON.stringify(decision.hypotheses_tested || {}),
      decision.recommendation || null,
      decision.confidence || null,
      decision.urgency || 'MEDIUM'
    ]);

    logger.warn(`Logged handoff: ${decision.issue}`, {
      cycleId,
      urgency: decision.urgency,
      confidence: decision.confidence
    });

    // Backup to Supabase
    await backupToSupabase('handoff_log', {
      cycle_id: cycleId,
      agent_id: process.env.AGENT_ID,
      issue: decision.issue,
      analysis_path: decision.analysis,
      recommendation: decision.recommendation,
      confidence: decision.confidence,
      urgency: decision.urgency || 'MEDIUM',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to log handoff:', error, {
      cycleId,
      issue: decision.issue
    });
  }
}

// Backup to Supabase for redundancy
async function backupToSupabase(table, data) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return; // Supabase backup is optional
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

    const { error } = await supabase
      .from(table)
      .insert(data);

    if (error) {
      logger.warn('Supabase backup failed:', error, { table });
    }
  } catch (error) {
    logger.warn('Supabase backup error:', error, { table });
  }
}

// Query functions for dashboard/monitoring
export async function getRecentHeartbeats(agentId, limit = 10) {
  try {
    const dbPool = await getPool();
    const result = await dbPool.query(`
      SELECT cycle_id, started_at, completed_at, duration_ms, status,
             actions_count, rejections_count, handoffs_count
      FROM heartbeat_cycles
      WHERE agent_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `, [agentId, limit]);

    return result.rows;
  } catch (error) {
    logger.error('Failed to get recent heartbeats:', error);
    return [];
  }
}

export async function getAgentMetrics(agentId, hours = 24) {
  try {
    const dbPool = await getPool();
    const result = await dbPool.query(`
      SELECT
        COUNT(*) as total_cycles,
        SUM(actions_count) as total_actions,
        SUM(rejections_count) as total_rejections,
        SUM(handoffs_count) as total_handoffs,
        AVG(duration_ms) as avg_cycle_duration,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_cycles
      FROM heartbeat_cycles
      WHERE agent_id = $1 AND started_at > NOW() - INTERVAL '${hours} hours'
    `, [agentId]);

    return result.rows[0] || {};
  } catch (error) {
    logger.error('Failed to get agent metrics:', error);
    return {};
  }
}