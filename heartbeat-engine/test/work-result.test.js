import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWorkOutputStatus } from '../src/orchestrator/work-result.js';

test('terminal execution handoffs are not mislabeled complete', () => {
  assert.equal(classifyWorkOutputStatus('The task failed with this exact error: github API 404'), 'failed');
  assert.equal(classifyWorkOutputStatus('The task is blocked and needs user input.'), 'blocked');
});

test('pending execution handoffs remain resumable', () => {
  assert.equal(classifyWorkOutputStatus('The work is still pending verification; it has not failed.'), 'pending');
});

test('verified output is complete', () => {
  assert.equal(classifyWorkOutputStatus('Checks passed and the deployment reached READY.'), 'complete');
});
