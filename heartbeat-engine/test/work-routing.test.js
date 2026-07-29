import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorkExecutionPath, normalizeWorkType, WORK_EXECUTION_PATHS } from '../src/orchestrator/work-routing.js';

test('general Work sessions route to Sarah execution controller', () => {
  assert.equal(getWorkExecutionPath('work'), 'sarah');
  assert.equal(WORK_EXECUTION_PATHS.work, 'sarah');
});

test('Build sessions route to Sarah build execution with real tools', () => {
  assert.equal(getWorkExecutionPath('build'), 'sarah-build');
  assert.equal(WORK_EXECUTION_PATHS.build, 'sarah-build');
});

test('unknown and omitted types fail safe to general Work, not website build', () => {
  assert.equal(normalizeWorkType(), 'work');
  assert.equal(normalizeWorkType('unknown'), 'work');
  assert.equal(getWorkExecutionPath('unknown'), 'sarah');
});
