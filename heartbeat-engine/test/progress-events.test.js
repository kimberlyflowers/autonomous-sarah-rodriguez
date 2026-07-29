import test from 'node:test';
import assert from 'node:assert/strict';
import { appendProgressUpdate, buildCheckpointResumeContext, buildToolProgressUpdate, clearProgressUpdates, progressUpdates } from '../src/orchestrator/progress-events.js';

test('progress updates are user-facing milestones without private reasoning', () => {
  clearProgressUpdates('session-test');
  appendProgressUpdate('session-test', 'The code change is committed. I am verifying deployment.', 'milestone');
  const stored = progressUpdates.get('session-test');
  assert.equal(stored.events.length, 1);
  assert.match(stored.events[0].text, /verifying deployment/i);
  assert.equal(stored.events[0].reasoning, undefined);
});

test('duplicate progress messages are suppressed', () => {
  clearProgressUpdates('session-duplicate');
  appendProgressUpdate('session-duplicate', 'Still building.', 'pending');
  appendProgressUpdate('session-duplicate', 'Still building.', 'pending');
  assert.equal(progressUpdates.get('session-duplicate').events.length, 1);
});

test('Vercel wait progress distinguishes READY from pending', () => {
  const ready = buildToolProgressUpdate('vercel_wait_for_deployment', {}, { success: true, status: 'ready' });
  const pending = buildToolProgressUpdate('vercel_wait_for_deployment', {}, { success: true, status: 'timeout', pending: true });
  assert.match(ready.text, /READY/);
  assert.match(pending.text, /pending state, not a failure/i);
});

test('checkpoint context resumes unfinished work without restarting', () => {
  const text = buildCheckpointResumeContext({
    status: 'pending',
    current_step: 'Verify deployment',
    todos: [
      { content: 'Commit edit', status: 'completed' },
      { content: 'Verify deployment', status: 'in_progress' },
    ],
    pending_jobs: [{ status: 'pending', deployment: { id: 'dpl-1' } }],
  });
  assert.match(text, /Resume it instead of restarting/);
  assert.match(text, /Verify deployment/);
  assert.doesNotMatch(text, /Unfinished steps:.*Commit edit/);
});

test('CRM milestones expose a receipt and next verification condition', () => {
  const event = buildToolProgressUpdate('ghl_send_message', {}, { success: true, messageId: 'msg-123' });
  assert.match(event.text, /receipt msg-123/i);
  assert.match(event.text, /checking the resulting record/i);
});

test('browser milestones verify page state instead of claiming success blindly', () => {
  const event = buildToolProgressUpdate('browser_task', {}, { success: true, currentUrl: 'https://example.com/done' });
  assert.match(event.text, /visible page state/i);
  assert.match(event.text, /example.com\/done/i);
});

test('deliverable milestones include saved receipt and validation target', () => {
  const event = buildToolProgressUpdate('create_pptx', {}, { success: true, artifactId: 'artifact-9' });
  assert.match(event.text, /receipt artifact-9/i);
  assert.match(event.text, /validating its format/i);
});
