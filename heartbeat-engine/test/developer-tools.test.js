import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { developerToolDefinitions, executeDeveloperTool, normalizeVercelDeploymentState, waitForVercelDeployment } from '../src/tools/developer-tools.js';

const developerToolSource = fs.readFileSync(new URL('../src/tools/developer-tools.js', import.meta.url), 'utf8');

test('developer connectors expose tenant-safe GitHub, Vercel, Hyperframes, and HeyGen tools', () => {
  const names = Object.keys(developerToolDefinitions);
  assert.deepEqual(names.sort(), [
    'bloom_studio_check_job',
    'bloom_studio_generate_video',
    'coding_workspace_commit',
    'coding_workspace_diff',
    'coding_workspace_list_files',
    'coding_workspace_prepare',
    'coding_workspace_read_file',
    'coding_workspace_replace_text',
    'coding_workspace_run_checks',
    'coding_workspace_run_command',
    'coding_workspace_write_file',
    'github_get_file',
    'github_get_repository',
    'github_list_branches',
    'github_list_files',
    'github_list_repositories',
    'github_put_file',
    'github_search_code',
    'heygen_create_video',
    'heygen_get_video',
    'heygen_list_avatars',
    'heygen_list_voices',
    'hyperframes_add',
    'hyperframes_catalog',
    'hyperframes_clone_template',
    'hyperframes_list_projects',
    'hyperframes_read_project',
    'hyperframes_run',
    'hyperframes_write_project',
    'vercel_create_deployment',
    'vercel_create_project',
    'vercel_list_deployments',
    'vercel_list_projects',
    'vercel_wait_for_deployment',
  ]);
});

test('HeyGen tools use tenant API keys and v3 endpoints', () => {
  assert.match(developerToolSource, /connectors!inner\(slug\)/);
  assert.match(developerToolSource, /'x-api-key': grant\.api_key/);
  assert.match(developerToolSource, /\/v3\/avatars/);
  assert.match(developerToolSource, /\/v3\/voices/);
  assert.match(developerToolSource, /\/v3\/videos/);
  assert.match(developerToolSource, /ownership: params\.ownership \|\| 'private'/);
  assert.match(developerToolSource, /v\.id \|\| v\.voice_id/);
  assert.doesNotMatch(developerToolSource, /api\.heygen\.com\/v[12]\//);
});

test('Vercel deployment states are typed without treating pending as failure', () => {
  assert.equal(normalizeVercelDeploymentState('READY'), 'ready');
  assert.equal(normalizeVercelDeploymentState('ERROR'), 'failed');
  assert.equal(normalizeVercelDeploymentState('CANCELED'), 'failed');
  assert.equal(normalizeVercelDeploymentState('BUILDING'), 'pending');
  assert.equal(normalizeVercelDeploymentState('QUEUED'), 'pending');
  assert.equal(normalizeVercelDeploymentState(null), 'unknown');
});

test('Vercel preview deployments omit the production target', () => {
  assert.match(developerToolSource, /params\.target === 'production'/);
  assert.doesNotMatch(developerToolSource, /target: params\.target \|\| 'production'/);
});

test('Vercel waiter stays inside one tool call until READY', async () => {
  const states = ['QUEUED', 'BUILDING', 'READY'];
  let clock = 0;
  const result = await waitForVercelDeployment(
    { projectId: 'project-test', timeoutSeconds: 10, pollIntervalSeconds: 3 },
    'org-test',
    {
      fetchProvider: async () => ({ deployments: [{ uid: 'dpl-test', url: 'example.vercel.app', state: states.shift() }] }),
      sleepFn: async ms => { clock += ms; },
      now: () => clock,
    },
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.terminal, true);
  assert.equal(result.checks, 3);
});

test('Vercel waiter reports timeout as pending, not failed', async () => {
  let clock = 0;
  const result = await waitForVercelDeployment(
    { projectId: 'project-test', timeoutSeconds: 10, pollIntervalSeconds: 3 },
    'org-test',
    {
      fetchProvider: async () => ({ deployments: [{ uid: 'dpl-test', state: 'BUILDING' }] }),
      sleepFn: async ms => { clock += ms; },
      now: () => clock,
    },
  );
  assert.equal(result.status, 'timeout');
  assert.equal(result.pending, true);
  assert.equal(result.terminal, false);
  assert.doesNotMatch(result.message, /failed/i);
});

test('provider tools reject calls without authenticated organization context', async () => {
  const result = await executeDeveloperTool('github_list_repositories', {}, null);
  assert.equal(result.success, false);
  assert.match(result.error, /organization context is required/i);
});

test('Hyperframes rejects unsafe project slugs before touching the filesystem', async () => {
  const result = await executeDeveloperTool('hyperframes_write_project', {
    project: '../another-tenant',
    files: [{ path: 'index.html', content: '<html></html>' }],
  }, 'org-test');
  assert.equal(result.success, false);
  assert.match(result.error, /invalid hyperframes project slug/i);
});

test('Hyperframes render saves the real MP4 binary as a session artifact', () => {
  assert.match(developerToolSource, /fs\.readFile\(outputPath\)/);
  assert.match(developerToolSource, /mimeType: 'video\/mp4'/);
  assert.match(developerToolSource, /content: rendered\.toString\('base64'\)/);
  assert.match(developerToolSource, /sessionId: executionContext\.sessionId/);
  assert.match(developerToolSource, /Rendered MP4 could not be saved as an artifact/);
});
