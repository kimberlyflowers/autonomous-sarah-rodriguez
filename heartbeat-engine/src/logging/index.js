// BLOOM Heartbeat Engine - Database Logging
// Stores actions, rejections, and handoffs to Supabase (Bloomie Staffing project)

import { createLogger } from './logger.js';

const logger = createLogger('logging');

const AGENT_ID = process.env.AGENT_UUID || process.env.AGENT_ID || 'c3000000-0000-0000-0000-000000000003';
const ORG_ID = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';

let _supabase = null;
async function getSupabase() {
  if (!_supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return _supabase;
}

// Log heartbeat cycle completion
export async function logHeartbeat(cycleId, data) {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('heartbeat_cycles').upsert({
      agent_id:          data.agentId || AGENT_ID,
      organization_id:   ORG_ID,
      duration_ms:       data.duration,
      actions_count:     data.actionsCount || 0,
      rejections_count:  data.rejectionsCount || 0,
      handoffs_count:    data.handoffsCount || 0,
      status:            data.status || 'completed',
      error:             data.error || null,
      environment_snapshot: data.environmentSnapshot || {},
      started_at:        new Date(Date.now() - (data.duration || 0)).toISOString(),
      completed_at:      new Date().toISOString()
    }, { onConflict: 'id' });

    if (error) logger.warn('logHeartbeat Supabase error:', { error: error.message });

    logger.info(`Logged heartbeat cycle`, {
      status: data.status,
      duration: data.duration,
      actions: data.actionsCount,
      rejections: data.rejectionsCount,
      handoffs: data.handoffsCount
    });
  } catch (error) {
    logger.error('Failed to log heartbeat:', error);
  }
}

// Log agent action execution
export async function logAction(cycleId, decision, result) {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('action_log').insert({
      ...(cycleId && cycleId.includes('-') ? { cycle_id: cycleId } : {}),
      agent_id:       decision.agentId || AGENT_ID,
      organization_id: ORG_ID,
      action_type:    decision.action_type || 'unknown',
      description:    decision.description || '',
      target_system:  decision.target_system,
      input_data:     decision.input_data || {},
      result:         result || {},
      success:        result?.success || false
    });

    if (error) logger.warn('logAction Supabase error:', { error: error.message });

    logger.info(`Logged action: ${decision.action_type}`, {
      cycleId,
      success: result?.success,
      target: decision.target_system
    });
  } catch (error) {
    logger.error('Failed to log action:', error);
  }
}

// Log agent rejection decision
export async function logRejection(cycleId, candidate, reason, confidence, reasonCode = null) {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('rejection_log').insert({
      ...(cycleId && cycleId.includes('-') ? { cycle_id: cycleId } : {}),
      agent_id:         AGENT_ID,
      organization_id:  ORG_ID,
      candidate_action: candidate,
      reason,
      reason_code:      reasonCode,
      confidence
    });

    if (error) logger.warn('logRejection Supabase error:', { error: error.message });

    logger.info(`Logged rejection: ${candidate}`, { cycleId, reason, confidence, reason_code: reasonCode });
  } catch (error) {
    logger.error('Failed to log rejection:', error);
  }
}

// Log agent handoff/escalation
export async function logHandoff(cycleId, decision) {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('handoff_log').insert({
      ...(cycleId && cycleId.includes('-') ? { cycle_id: cycleId } : {}),
      agent_id:        AGENT_ID,
      organization_id: ORG_ID,
      issue:           decision.issue,
      analysis:        decision.analysis || null,
      recommendation:  decision.recommendation || null,
      confidence:      decision.confidence || null,
      urgency:         decision.urgency || 'MEDIUM'
    });

    if (error) logger.warn('logHandoff Supabase error:', { error: error.message });

    logger.warn(`Logged handoff: ${decision.issue}`, { cycleId, urgency: decision.urgency });
  } catch (error) {
    logger.error('Failed to log handoff:', error);
  }
}

// Query functions for dashboard/monitoring
export async function getRecentHeartbeats(agentId, limit = 10) {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('heartbeat_cycles')
      .select('id, agent_id, started_at, completed_at, duration_ms, status, actions_count, rejections_count, handoffs_count')
      .eq('agent_id', agentId || AGENT_ID)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return data || [];
  } catch (error) {
    logger.error('Failed to get recent heartbeats:', error);
    return [];
  }
}

export async function getAgentMetrics(agentId, hours = 24) {
  try {
    const supabase = await getSupabase();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('heartbeat_cycles')
      .select('duration_ms, actions_count, rejections_count, handoffs_count, status')
      .eq('agent_id', agentId || AGENT_ID)
      .gte('started_at', since);

    if (error) throw new Error(error.message);
    const rows = data || [];
    return {
      total_cycles:      rows.length,
      total_actions:     rows.reduce((s, r) => s + (r.actions_count || 0), 0),
      total_rejections:  rows.reduce((s, r) => s + (r.rejections_count || 0), 0),
      total_handoffs:    rows.reduce((s, r) => s + (r.handoffs_count || 0), 0),
      avg_cycle_duration: rows.length ? rows.reduce((s, r) => s + (r.duration_ms || 0), 0) / rows.length : 0,
      successful_cycles: rows.filter(r => r.status === 'completed').length
    };
  } catch (error) {
    logger.error('Failed to get agent metrics:', error);
    return {};
  }
}

// Pre-register cycle row (no-op for Supabase — id is auto-generated uuid, not cycle_id string)
export async function initCycleRow(cycleId, agentId) {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('heartbeat_cycles').insert({
      agent_id:       agentId || AGENT_ID,
      organization_id: ORG_ID,
      started_at:     new Date().toISOString(),
      status:         'running'
    });
    if (error && !error.message.includes('duplicate')) {
      logger.warn('initCycleRow warning (non-fatal):', { cycleId, error: error.message });
    }
  } catch (error) {
    logger.warn('initCycleRow failed (non-fatal):', { cycleId, error: error.message });
  }
}
