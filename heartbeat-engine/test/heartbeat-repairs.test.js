import test from 'node:test';
import assert from 'node:assert/strict';
import { isCreatedGhlTaskResult, normalizeEventTimestamp, shouldSkipMissingSmsPhone } from '../src/agent/act.js';
import { normalizeRejectionRecord } from '../src/logging/index.js';
import { isToolPerformanceHealthy } from '../src/monitoring/system-monitor.js';
import fs from 'node:fs';

test('missing-phone SMS is skipped before the GHL send path', () => {
  assert.equal(shouldSkipMissingSmsPhone('SMS', ''), true);
  assert.equal(shouldSkipMissingSmsPhone('sms', '   '), true);
  assert.equal(shouldSkipMissingSmsPhone('SMS', '+12105550123'), false);
  assert.equal(shouldSkipMissingSmsPhone('EMAIL', ''), false);
});

test('GHL millisecond timestamps are normalized before database inserts', () => {
  assert.equal(normalizeEventTimestamp('1766092030991'), '2025-12-18T21:07:10.991Z');
  assert.equal(normalizeEventTimestamp(1766092030), '2025-12-18T21:07:10.000Z');
});

test('heartbeat only reports a GHL task as successful when GHL actually created it', () => {
  assert.equal(isCreatedGhlTaskResult({ id: 'task-1', created: true }), true);
  assert.equal(isCreatedGhlTaskResult({ id: 'local-1', created: false, skipped: true, reason: 'no_contact_id' }), false);
  assert.equal(isCreatedGhlTaskResult({ created: true }), false);
});

test('rejection logging always supplies required schema values', () => {
  assert.deepEqual(normalizeRejectionRecord(null, null, null), {
    candidateAction: 'unknown_action',
    reason: 'No rejection reason provided',
    confidence: 0,
  });
  assert.equal(normalizeRejectionRecord('', 'Unsafe', 0.9, 'policy_block').candidateAction, 'policy_block');
});

test('tool performance treats no samples as neutral health', () => {
  assert.equal(isToolPerformanceHealthy(0, 0, 0.9), true);
  assert.equal(isToolPerformanceHealthy(10, 0.95, 0.9), true);
  assert.equal(isToolPerformanceHealthy(10, 0.5, 0.9), false);
});

test('scheduled runs hide planning paperwork after substantive work succeeds', () => {
  const executorSource = fs.readFileSync(new URL('../src/agent/executor.js', import.meta.url), 'utf8');
  assert.match(executorSource, /remove it from[\s\S]+scheduled runs from the first turn onward[\s\S]+PRE_ACTION_SUPPRESSED_TOOLS/);
  assert.match(executorSource, /if \(this\._isScheduledTask && this\.hasSubstantiveToolUse\(\)\) return false/);
  assert.match(executorSource, /return new Set\(\['bloom_create_document'\]\)/);
  assert.match(executorSource, /Research evidence exists[\s\S]+return new Set\(\)/);
  assert.match(executorSource, /publish and live-page verification are the terminal actions[\s\S]+return new Set\(\)/);
  assert.match(executorSource, /Replacing hallucinated scheduled planning call with requested web fetch/);
});

test('scheduled clarification and blocked results are never recorded as completed', () => {
  const schedulerSource = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(schedulerSource, /innerStatus === 'blocked'/);
  assert.match(schedulerSource, /result\?\.response === 'clarification_needed'/);
  assert.match(schedulerSource, /explicitlyExcludesScheduledPublication/);
  assert.match(schedulerSource, /wasRepairedLater/);
});

test('scheduled tasks have bounded turns and output reservations', () => {
  const executorSource = fs.readFileSync(new URL('../src/agent/executor.js', import.meta.url), 'utf8');
  assert.match(executorSource, /this\._currentTaskType === 'blog' \? 24 : 12/);
  assert.match(executorSource, /SCHEDULED_TASK_MAX_OUTPUT_TOKENS \|\| 2048/);
  assert.match(executorSource, /SCHEDULED_BLOG_MAX_OUTPUT_TOKENS \|\| 4096/);
});

test('read-only scheduled connector tests finalize after one substantive receipt', () => {
  const executorSource = fs.readFileSync(new URL('../src/agent/executor.js', import.meta.url), 'utf8');
  assert.match(executorSource, /isExplicitlyReadOnlyScheduledTask\(\) && this\.hasSubstantiveToolUse\(\)/);
  assert.match(executorSource, /Remove tools on the following turn/);
  assert.match(executorSource, /getScheduledRequiredNextToolSet\(\)/);
  assert.match(executorSource, /return PRE_ACTION_SUPPRESSED_TOOLS\.has\(toolName\)/);
});
