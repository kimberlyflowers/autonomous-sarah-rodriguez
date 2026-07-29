import { createClient } from '@supabase/supabase-js';

export const EXECUTION_STATUSES = Object.freeze([
  'running',
  'pending',
  'ready',
  'failed',
  'blocked',
  'timeout',
]);

function normalizeStatus(value) {
  const status = String(value || '').toLowerCase();
  return EXECUTION_STATUSES.includes(status) ? status : null;
}

export function getLatestExternalState(toolResults = []) {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = toolResults[index];
    if (!result || typeof result !== 'object') continue;

    const direct = normalizeStatus(result.status);
    if (direct) {
      return {
        status: direct,
        terminal: result.terminal === true || ['ready', 'failed', 'blocked'].includes(direct),
        resource: result.deployment || result.job || null,
        message: result.message || null,
      };
    }

    const deployment = result.deployment || result.deployments?.[0];
    const providerState = String(deployment?.state || deployment?.readyState || '').toUpperCase();
    if (providerState === 'READY') return { status: 'ready', terminal: true, resource: deployment, message: null };
    if (['ERROR', 'CANCELED', 'CANCELLED'].includes(providerState)) {
      return { status: 'failed', terminal: true, resource: deployment, message: null };
    }
    if (providerState) return { status: 'pending', terminal: false, resource: deployment, message: null };
  }
  return null;
}

export function deriveExecutionState({ todos = null, failedTools = [], toolResults = [], exhausted = false } = {}) {
  const external = getLatestExternalState(toolResults);
  if (external?.status === 'ready') return { ...external, reason: 'external_ready' };
  if (external?.status === 'failed') return { ...external, reason: 'external_failed' };
  if (external?.status === 'timeout') return { ...external, reason: 'external_timeout' };
  if (external?.status === 'pending') return { ...external, reason: 'external_pending' };

  if (failedTools.length > 0) {
    const last = failedTools[failedTools.length - 1];
    return { status: 'failed', terminal: true, resource: null, message: last.error || 'A tool failed.', reason: 'tool_failure' };
  }

  const items = Array.isArray(todos) ? todos : [];
  if (items.length > 0 && items.every(item => item?.status === 'completed')) {
    return { status: 'ready', terminal: true, resource: null, message: null, reason: 'plan_completed' };
  }
  if (exhausted) {
    return { status: 'pending', terminal: false, resource: null, message: 'The execution window ended before every step was verified.', reason: 'round_limit' };
  }
  return { status: 'running', terminal: false, resource: null, message: null, reason: 'in_progress' };
}

export function buildStateAwareHandoff(state, { toolsUsed = [], failedTools = [] } = {}) {
  const resourceUrl = state?.resource?.url;
  const url = resourceUrl
    ? (String(resourceUrl).startsWith('http') ? String(resourceUrl) : `https://${resourceUrl}`)
    : null;

  if (state?.status === 'ready') {
    return `The work completed successfully and verification reached READY.${url ? ` Live result: ${url}` : ''}`;
  }
  if (state?.status === 'failed') {
    const exact = state.message || failedTools.at(-1)?.error || 'The external system returned a terminal failure.';
    return `The task failed with this exact error: ${exact}`;
  }
  if (state?.status === 'blocked') {
    return `The task is blocked and needs user input or additional authority.${state.message ? ` ${state.message}` : ''}`;
  }
  if (state?.status === 'timeout') {
    return `The operation is still pending after the verification window. It has not failed.${url ? ` Current deployment: ${url}` : ''}`;
  }

  const toolSummary = toolsUsed.length > 0 ? ` Completed tools: ${toolsUsed.map(tool => tool.name || tool).join(', ')}.` : '';
  return `The work is still pending verification; it has not failed.${state?.message ? ` ${state.message}` : ''}${toolSummary}`;
}

function safeReceipt(result, index) {
  if (!result || typeof result !== 'object') return { index, value: String(result).slice(0, 500) };
  const receipt = {
    index,
    success: result.success,
    status: result.status,
    terminal: result.terminal,
    error: result.error,
    message: result.message,
    deployment: result.deployment,
    project: result.project,
    commit: result.commit,
    sha: result.sha,
  };
  return Object.fromEntries(Object.entries(receipt).filter(([, value]) => value !== undefined));
}

export async function persistExecutionCheckpoint({
  sessionId,
  organizationId = null,
  agentId = null,
  status = 'running',
  currentStep = null,
  todos = [],
  toolsUsed = [],
  toolResults = [],
  pendingJobs = [],
  lastError = null,
  roundsUsed = 0,
}) {
  if (!sessionId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { persisted: false, reason: 'checkpoint_store_unavailable' };
  }

  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const normalized = normalizeStatus(status) || 'running';
  const row = {
    session_id: sessionId,
    organization_id: organizationId,
    agent_id: agentId,
    status: normalized,
    current_step: currentStep,
    todos,
    tools_used: toolsUsed.map(tool => ({ name: tool.name || String(tool), input: tool.input || null })),
    tool_receipts: toolResults.map(safeReceipt),
    pending_jobs: pendingJobs,
    last_error: lastError,
    rounds_used: roundsUsed,
    updated_at: new Date().toISOString(),
    completed_at: ['ready', 'failed', 'blocked'].includes(normalized) ? new Date().toISOString() : null,
  };
  const { error } = await client.from('agent_execution_checkpoints').upsert(row, { onConflict: 'session_id' });
  if (error) throw new Error(`Checkpoint persistence failed: ${error.message}`);
  return { persisted: true, status: normalized };
}

export async function loadExecutionCheckpoint(sessionId) {
  if (!sessionId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.from('agent_execution_checkpoints').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(`Checkpoint load failed: ${error.message}`);
  return data || null;
}
