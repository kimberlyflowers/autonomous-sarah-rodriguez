import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStateAwareHandoff, deriveExecutionState, getLatestExternalState } from '../src/orchestrator/execution-state.js';

test('execution state distinguishes pending deployment from failure', () => {
  const state = deriveExecutionState({
    toolResults: [{ success: true, deployments: [{ uid: 'dpl-1', state: 'BUILDING', url: 'preview.vercel.app' }] }],
    exhausted: true,
  });
  assert.equal(state.status, 'pending');
  assert.equal(state.terminal, false);
  assert.equal(state.reason, 'external_pending');
});

test('execution state recognizes READY even when the plan was not updated', () => {
  const state = deriveExecutionState({
    todos: [{ content: 'Verify deployment', status: 'in_progress' }],
    toolResults: [{ success: true, status: 'ready', terminal: true, deployment: { id: 'dpl-1', url: 'ready.vercel.app' } }],
    exhausted: true,
  });
  assert.equal(state.status, 'ready');
  assert.equal(state.terminal, true);
});

test('round exhaustion produces a pending handoff rather than a false failure', () => {
  const state = deriveExecutionState({
    todos: [{ content: 'Verify deployment', status: 'in_progress' }],
    exhausted: true,
  });
  const message = buildStateAwareHandoff(state, { toolsUsed: [{ name: 'vercel_list_deployments' }] });
  assert.equal(state.status, 'pending');
  assert.match(message, /still pending verification/i);
  assert.match(message, /has not failed/i);
  assert.doesNotMatch(message, /more complex than expected/i);
});

test('terminal provider errors remain failures with exact evidence', () => {
  const state = deriveExecutionState({
    failedTools: [{ name: 'github_put_file', error: 'github API 403: forbidden' }],
    exhausted: true,
  });
  const message = buildStateAwareHandoff(state, { failedTools: [{ error: 'github API 403: forbidden' }] });
  assert.equal(state.status, 'failed');
  assert.match(message, /github API 403: forbidden/);
});

test('latest external state reads direct typed timeout', () => {
  const state = getLatestExternalState([{ success: true, status: 'timeout', terminal: false, pending: true }]);
  assert.equal(state.status, 'timeout');
  assert.equal(state.terminal, false);
});
