import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pairExecutionEvents, sanitizeExecutionValue } from '../src/orchestrator/execution-events.js';

test('execution events pair stable tool calls and compute terminal state', () => {
  const calls = pairExecutionEvents([
    { type: 'tool.start', callId: 'call-1', toolName: 'npm_test', status: 'running', startedAt: 100, input: { args: ['test'] } },
    { type: 'tool.output', callId: 'call-1', toolName: 'npm_test', output: 'running tests', timestamp: 125 },
    { type: 'tool.finish', callId: 'call-1', toolName: 'npm_test', status: 'passed', startedAt: 100, finishedAt: 180, elapsedMs: 80 },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, 'passed');
  assert.equal(calls[0].elapsedMs, 80);
  assert.match(calls[0].output, /running tests/);
});

test('execution event sanitization redacts nested secrets and secret-shaped text', () => {
  const sanitized = sanitizeExecutionValue({
    password: 'not-for-display',
    headers: { Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz' },
    output: 'OPENAI_API_KEY=sk-proj-examplelongsecretvalue',
    safe: 'npm test',
  });
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.headers.Authorization, '[REDACTED]');
  assert.doesNotMatch(sanitized.output, /sk-proj-|examplelongsecretvalue/);
  assert.equal(sanitized.safe, 'npm test');
});

test('Chat and Work APIs separate persistent execution events from conversation messages', () => {
  const chat = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');
  const builds = fs.readFileSync(new URL('../src/api/builds.js', import.meta.url), 'utf8');
  assert.match(chat, /metadata\?\.type !== 'execution_event'/);
  assert.match(chat, /executionEvents: pairExecutionEvents/);
  assert.match(builds, /executionEvents: pairExecutionEvents/);
  assert.match(builds, /metadata\?\.type !== 'execution_event'/);
});

test('progress stream enforces session access and streams execution lifecycle events', () => {
  const chat = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');
  assert.match(chat, /validateSessionAccess\(req, sessionId\)/);
  assert.match(chat, /payload\.executionEvents/);
});

test('controlled workspace commands emit incremental output without a shell', () => {
  const tools = fs.readFileSync(new URL('../src/tools/coding-workspace-tools.js', import.meta.url), 'utf8');
  assert.match(tools, /spawn\(command, args/);
  assert.match(tools, /shell: false/);
  assert.match(tools, /options\.onOutput\(\{ stream, text \}\)/);
  assert.match(tools, /onOutput: executionContext\.onOutput/);
});

test('Chat and Work render the same expandable command card history', () => {
  const app = fs.readFileSync(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /function ExecutionCommandCards/);
  assert.match(app, /data-testid="execution-command-card"/);
  assert.match(app, /source="work"/);
  assert.match(app, /source="chat"/);
  assert.match(app, /COMMAND OUTPUT/);
  assert.match(app, /subscribeAuthenticatedEvents/);
  assert.equal(app.includes('new EventSource(`/api/chat/progress-stream'), false);
});

test('Work refresh keeps a bounded but substantial persistent event history', () => {
  const builds = fs.readFileSync(new URL('../src/api/builds.js', import.meta.url), 'utf8');
  assert.match(builds, /\.limit\(500\)/);
});
