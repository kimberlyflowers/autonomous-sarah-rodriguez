import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('codex-ticket-reporter');

function clean(value, max = 4000) {
  return String(value || '').replace(/\0/g, '').trim().slice(0, max);
}

export async function reportFailureTicket({
  supabase = null,
  title,
  description,
  error,
  severity = 'high',
  category = 'tool_failure',
  agentId = null,
  agentName = null,
  organizationId = null,
  affectedTask = null,
  source = 'execution_engine',
} = {}) {
  const client = supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const safeTitle = clean(title || 'Bloomie execution failure', 200);
  const reporter = clean(agentName || agentId || 'bloomie-agent', 120);

  // Do not flood Codex with duplicates when a poller or scheduled task encounters
  // the same terminal failure repeatedly.
  const { data: existing, error: lookupError } = await client
    .from('tech_tickets')
    .select('id, title, severity, status, created_at')
    .eq('title', safeTitle)
    .eq('reported_by', reporter)
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError) logger.warn('Ticket dedupe lookup failed; continuing with report', { error: lookupError.message });
  if (existing) return { success: true, deduplicated: true, ticket: existing };

  const detail = [
    clean(description, 3000),
    `Source: ${clean(source, 100)}`,
    organizationId ? `Organization: ${clean(organizationId, 120)}` : null,
    agentId ? `Agent ID: ${clean(agentId, 120)}` : null,
    'Support owner: Codex',
  ].filter(Boolean).join('\n\n');

  const { data, error: insertError } = await client
    .from('tech_tickets')
    .insert({
      title: safeTitle,
      description: detail,
      severity,
      category,
      reported_by: reporter,
      affected_task: clean(affectedTask, 500) || null,
      error_message: clean(error, 2000) || null,
      status: 'open',
    })
    .select('id, title, severity, status, created_at')
    .single();
  if (insertError) throw new Error(`Could not report failure to Codex: ${insertError.message}`);

  logger.warn('Bloomie failure reported to Codex ticket queue', {
    ticketId: data.id,
    title: data.title,
    reporter,
    source,
  });
  return { success: true, deduplicated: false, ticket: data };
}
