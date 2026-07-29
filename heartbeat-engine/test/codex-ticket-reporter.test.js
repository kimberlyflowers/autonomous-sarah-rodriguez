import test from 'node:test';
import assert from 'node:assert/strict';
import { reportFailureTicket } from '../src/support/ticket-reporter.js';

function createMockSupabase({ existing = null } = {}) {
  const inserted = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: existing, error: null }),
    insert: payload => {
      inserted.push(payload);
      return {
        select: () => ({
          single: async () => ({
            data: { id: 'ticket-test-1', ...payload, created_at: new Date().toISOString() },
            error: null,
          }),
        }),
      };
    },
  };
  return {
    client: { from: table => {
      assert.equal(table, 'tech_tickets');
      return chain;
    } },
    inserted,
  };
}

test('terminal Bloomie failures create a Codex-owned support ticket', async () => {
  const { client, inserted } = createMockSupabase();
  const result = await reportFailureTicket({
    supabase: client,
    title: 'Scheduled task failed: CRM follow-up',
    description: 'The required CRM tool failed after retry.',
    error: 'GHL returned 503',
    agentId: 'agent-123',
    organizationId: 'org-123',
    affectedTask: 'task-123',
    source: 'scheduled_task',
  });
  assert.equal(result.success, true);
  assert.equal(result.deduplicated, false);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].status, 'open');
  assert.equal(inserted[0].reported_by, 'agent-123');
  assert.equal(inserted[0].affected_task, 'task-123');
  assert.match(inserted[0].description, /Support owner: Codex/);
  assert.equal(inserted[0].error_message, 'GHL returned 503');
});

test('repeated polling failures reuse an existing open ticket', async () => {
  const existing = { id: 'existing-ticket', status: 'open' };
  const { client, inserted } = createMockSupabase({ existing });
  const result = await reportFailureTicket({
    supabase: client,
    title: 'Work session failed: browser task',
    agentName: 'Sarah Rodriguez',
  });
  assert.equal(result.deduplicated, true);
  assert.equal(result.ticket.id, 'existing-ticket');
  assert.equal(inserted.length, 0);
});
