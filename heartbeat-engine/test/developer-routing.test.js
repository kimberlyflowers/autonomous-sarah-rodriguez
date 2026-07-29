import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentExecutor, classifyExecutionTask } from '../src/agent/executor.js';

test('website edit and Vercel deployment uses focused developer routing', () => {
  assert.equal(
    classifyExecutionTask(
      'Audit the repository, edit the Youth Empowerment School website, deploy a Vercel preview, and verify it.',
      { taskType: 'developer' },
    ),
    'developer',
  );
});

test('ordinary research remains routed as research', () => {
  assert.equal(
    classifyExecutionTask('Research three competitors and write a report.'),
    'research',
  );
});

test('ordinary conversation remains unfiltered', () => {
  assert.equal(classifyExecutionTask('Hello, how are you?'), null);
});

test('scheduled CRM tasks receive the focused follow-up connector tools', () => {
  assert.equal(
    classifyExecutionTask(
      'Use ghl_search_contacts to perform a read-only contact lookup.',
      { taskType: 'crm' },
    ),
    'followup',
  );
});

test('Work execution suppresses consecutive planning-only turns', () => {
  const executor = Object.create(AgentExecutor.prototype);
  executor._isScheduledTask = false;
  executor.toolExecutionHistory = [{ tool: 'bloom_todo_write', result: { success: true } }];

  assert.equal(executor.shouldSuppressConsecutivePlanningTools('bloom_todo_write'), true);
  assert.equal(executor.shouldSuppressConsecutivePlanningTools('github_list_repositories'), false);

  executor.toolExecutionHistory.push({ tool: 'github_list_repositories', result: { success: true } });
  assert.equal(executor.shouldSuppressConsecutivePlanningTools('bloom_todo_write'), false);
});

test('developer planning recovery advances through tenant discovery evidence', () => {
  const executor = Object.create(AgentExecutor.prototype);
  executor._currentTaskText = 'Edit the Youth Empowerment School website in Vercel.';
  executor.toolExecutionHistory = [];

  assert.deepEqual(executor.getDeveloperPlanningReplacement(), {
    name: 'github_list_repositories',
    input: {},
  });

  executor.toolExecutionHistory.push({
    tool: 'github_list_repositories',
    result: {
      success: true,
      repositories: [
        { fullName: 'kimberlyflowers/unrelated-site' },
        { fullName: 'kimberlyflowers/youth-empowerment-school' },
      ],
    },
  });
  executor.toolExecutionHistory.push({
    tool: 'vercel_list_projects',
    result: { success: true, projects: [{ name: 'youth-empowerment-school' }] },
  });

  assert.deepEqual(executor.getDeveloperPlanningReplacement(), {
    name: 'github_get_repository',
    input: { owner: 'kimberlyflowers', repo: 'youth-empowerment-school' },
  });
});

test('developer planning recovery advances an exact edit into its workspace', () => {
  const executor = Object.create(AgentExecutor.prototype);
  executor._currentTaskText = `For the Youth Empowerment School tenant:
1. Inspect GitHub and Vercel.
2. Create bloomie-verification/probe.txt. Its exact content must be:
OK
2026-07-25T00:00:00.000Z
3. Commit with message "test: exact edit".
4. Create a PREVIEW deployment.`;
  executor.toolExecutionHistory = [
    { tool: 'github_list_repositories', result: { success: true, repositories: [{ fullName: 'kimberlyflowers/youth-empowerment-school' }] } },
    { tool: 'vercel_list_projects', result: { success: true, projects: [{ id: 'project-1', name: 'youth-empowerment-school' }] } },
    { tool: 'github_get_repository', result: { success: true, repository: { defaultBranch: 'main' } } },
    { tool: 'github_list_files', result: { success: true, files: [] } },
  ];

  assert.deepEqual(executor.getDeveloperPlanningReplacement(), {
    name: 'coding_workspace_prepare',
    input: { owner: 'kimberlyflowers', repo: 'youth-empowerment-school', ref: 'main' },
  });
  executor.toolExecutionHistory.push({ tool: 'coding_workspace_prepare', result: { success: true } });
  assert.deepEqual(executor.getDeveloperPlanningReplacement(), {
    name: 'coding_workspace_write_file',
    input: {
      owner: 'kimberlyflowers',
      repo: 'youth-empowerment-school',
      path: 'bloomie-verification/probe.txt',
      content: 'OK\n2026-07-25T00:00:00.000Z',
    },
  });
});

test('verified developer completion is summarized from real receipts', () => {
  const executor = Object.create(AgentExecutor.prototype);
  executor.toolExecutionHistory = [
    { tool: 'github_get_repository', result: { success: true, repository: { fullName: 'kimberlyflowers/youth-empowerment-school', defaultBranch: 'main' } } },
    { tool: 'coding_workspace_write_file', result: { success: true, file: { path: 'bloomie-verification/probe.txt' } } },
    { tool: 'coding_workspace_commit', result: { success: true, commit: 'abc123', url: 'https://github.com/example/commit/abc123' } },
    { tool: 'vercel_wait_for_deployment', result: { success: true, terminal: true, status: 'ready', deploymentId: 'dpl_123', url: 'preview.vercel.app' } },
  ];

  const summary = executor.buildVerifiedCompletionSummary();
  assert.match(summary, /^TASK COMPLETED/);
  assert.match(summary, /abc123/);
  assert.match(summary, /dpl_123/);
  assert.match(summary, /https:\/\/preview\.vercel\.app/);
});
