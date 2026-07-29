import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const liveEvents = new Map();
const MAX_LIVE_EVENTS = 300;
const MAX_TEXT = 24_000;
const SENSITIVE_KEY = /(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|cookie|session[_-]?token|private[_-]?key|client[_-]?secret)/i;
const SECRET_TEXT_PATTERNS = [
  /\b(sk-(?:proj-)?[A-Za-z0-9_-]{12,})\b/g,
  /\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g,
  /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{10,}/gi,
  /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*=\s*([^\s"']+)/g,
  /\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g,
];

function cleanString(value) {
  let text = String(value ?? '');
  for (const pattern of SECRET_TEXT_PATTERNS) {
    text = text.replace(pattern, (match, prefix) => prefix && /^(Bearer\s+|[A-Z])/i.test(prefix)
      ? `${prefix}[REDACTED]`
      : '[REDACTED]');
  }
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n… [output truncated]` : text;
}

export function sanitizeExecutionValue(value, key = '', depth = 0) {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (depth > 8) return '[truncated]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeExecutionValue(item, '', depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([entryKey]) => !/^(image_base64|data|binary|screenshot)$/i.test(entryKey))
        .slice(0, 100)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeExecutionValue(entryValue, entryKey, depth + 1)])
    );
  }
  return cleanString(value);
}

export function executionEventSnapshot(sessionId) {
  return [...(liveEvents.get(sessionId || 'default') || [])];
}

export async function appendExecutionEvent({
  sessionId,
  organizationId = null,
  userId = null,
  agentId = null,
  event = {},
}) {
  if (!sessionId) return null;
  const now = Date.now();
  const normalized = {
    id: event.id || crypto.randomUUID(),
    callId: event.callId || event.call_id || crypto.randomUUID(),
    sequence: Number(event.sequence || now),
    type: event.type || 'tool.output',
    toolName: cleanString(event.toolName || event.name || 'tool'),
    status: event.status || (event.type === 'tool.finish' ? 'passed' : 'running'),
    startedAt: event.startedAt || now,
    finishedAt: event.finishedAt || null,
    elapsedMs: event.elapsedMs ?? null,
    input: sanitizeExecutionValue(event.input || {}),
    output: sanitizeExecutionValue(event.output ?? ''),
    timestamp: now,
  };
  const current = liveEvents.get(sessionId) || [];
  current.push(normalized);
  liveEvents.set(sessionId, current.slice(-MAX_LIVE_EVENTS));

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.from('messages').insert({
      session_id: sessionId,
      organization_id: organizationId,
      user_id: userId,
      agent_id: agentId,
      role: 'assistant',
      content: '',
      metadata: {
        source: 'execution-event',
        type: 'execution_event',
        execution_event: normalized,
      },
    });
    if (error) throw new Error(`Could not persist execution event: ${error.message}`);
  }
  return normalized;
}

export function pairExecutionEvents(events = []) {
  const calls = new Map();
  for (const event of events) {
    if (!event?.callId) continue;
    const call = calls.get(event.callId) || {
      callId: event.callId,
      toolName: event.toolName,
      status: 'running',
      startedAt: event.startedAt || event.timestamp,
      finishedAt: null,
      elapsedMs: null,
      input: event.input || {},
      output: '',
      events: [],
    };
    call.events.push(event);
    if (event.type === 'tool.start') {
      call.input = event.input || {};
      call.startedAt = event.startedAt || event.timestamp;
    }
    if (event.type === 'tool.output') {
      call.output = `${call.output}${call.output ? '\n' : ''}${String(event.output || '')}`.slice(-MAX_TEXT);
    }
    if (event.type === 'tool.finish') {
      call.status = event.status || 'passed';
      call.finishedAt = event.finishedAt || event.timestamp;
      call.elapsedMs = event.elapsedMs ?? Math.max(0, call.finishedAt - call.startedAt);
      if (event.output) call.output = cleanString(event.output);
    }
    calls.set(event.callId, call);
  }
  return [...calls.values()].sort((a, b) => a.startedAt - b.startedAt);
}
