import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { executeCodingWorkspaceTool, resolveWorkspacePath, sanitizedCheckEnvironment, workspaceRootFor } from '../src/tools/coding-workspace-tools.js';

const execFileAsync = promisify(execFile);

test('workspace paths are tenant-scoped and traversal-safe', () => {
  const root = workspaceRootFor('org-1', 'owner', 'repo');
  assert.match(root, /org-1/);
  assert.match(root, /owner--repo/);
  assert.equal(resolveWorkspacePath(root, 'web/app/page.tsx'), path.join(root, 'web/app/page.tsx'));
  assert.throws(() => resolveWorkspacePath(root, '../../outside'), /Unsafe workspace path/);
});

test('work sessions receive separate repository worktree paths and branches', () => {
  const first = workspaceRootFor('org-1', 'owner', 'repo', { sessionId: 'session-one' });
  const second = workspaceRootFor('org-1', 'owner', 'repo', { sessionId: 'session-two' });
  assert.notEqual(first, second);
  assert.match(first, /\.worktrees[/\\]session-one/);
  assert.match(second, /\.worktrees[/\\]session-two/);
});

test('check environment excludes production secrets', () => {
  process.env.OPENROUTER_API_KEY = 'do-not-copy';
  const env = sanitizedCheckEnvironment('/tmp/workspace-test');
  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(env.SUPABASE_SERVICE_KEY, undefined);
  assert.equal(env.CI, 'true');
});

test('workspace exact replacement rejects missing and ambiguous text', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'bloomie-workspace-test-'));
  const oldRoot = process.env.CODING_WORKSPACE_ROOT;
  process.env.CODING_WORKSPACE_ROOT = base;
  const root = workspaceRootFor('org-test', 'owner', 'repo');
  await fs.mkdir(root, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: root });
  await fs.writeFile(path.join(root, 'file.txt'), 'same same', 'utf8');

  const missing = await executeCodingWorkspaceTool('coding_workspace_replace_text', {
    owner: 'owner', repo: 'repo', edits: [{ path: 'file.txt', find: 'absent', replace: 'new' }],
  }, 'org-test', null).then(() => null, error => error);
  assert.match(missing.message, /not found/);

  const ambiguous = await executeCodingWorkspaceTool('coding_workspace_replace_text', {
    owner: 'owner', repo: 'repo', edits: [{ path: 'file.txt', find: 'same', replace: 'new' }],
  }, 'org-test', null).then(() => null, error => error);
  assert.match(ambiguous.message, /ambiguous/);

  const replaced = await executeCodingWorkspaceTool('coding_workspace_replace_text', {
    owner: 'owner', repo: 'repo', edits: [{ path: 'file.txt', find: 'same', replace: 'new', replaceAll: true }],
  }, 'org-test', null);
  assert.equal(replaced.edits[0].replacements, 2);
  assert.equal(await fs.readFile(path.join(root, 'file.txt'), 'utf8'), 'new new');

  if (oldRoot === undefined) delete process.env.CODING_WORKSPACE_ROOT;
  else process.env.CODING_WORKSPACE_ROOT = oldRoot;
});

test('workspace runs checks and exposes the resulting diff before commit', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'bloomie-workspace-checks-'));
  const oldRoot = process.env.CODING_WORKSPACE_ROOT;
  process.env.CODING_WORKSPACE_ROOT = base;
  const root = workspaceRootFor('org-checks', 'owner', 'repo');
  await fs.mkdir(root, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'workspace-check',
    version: '1.0.0',
    scripts: { test: 'node -e "process.exit(0)"', build: 'node -e "process.exit(0)"' },
  }), 'utf8');
  await fs.writeFile(path.join(root, 'message.txt'), 'before', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: root });
  await fs.writeFile(path.join(root, 'message.txt'), 'after', 'utf8');

  const checks = await executeCodingWorkspaceTool('coding_workspace_run_checks', {
    owner: 'owner', repo: 'repo', checks: ['test', 'build'],
  }, 'org-checks', null);
  assert.equal(checks.status, 'ready');
  assert.deepEqual(checks.checks.map(check => check.status), ['passed', 'passed']);

  const diff = await executeCodingWorkspaceTool('coding_workspace_diff', {
    owner: 'owner', repo: 'repo',
  }, 'org-checks', null);
  assert.match(diff.status, /message\.txt/);
  assert.doesNotMatch(diff.status, /\.npm-cache/);
  assert.match(diff.diff, /-before/);
  assert.match(diff.diff, /\+after/);

  if (oldRoot === undefined) delete process.env.CODING_WORKSPACE_ROOT;
  else process.env.CODING_WORKSPACE_ROOT = oldRoot;
});

test('workspace can create files and run controlled repository-specific commands', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'bloomie-workspace-command-'));
  const oldRoot = process.env.CODING_WORKSPACE_ROOT;
  process.env.CODING_WORKSPACE_ROOT = base;
  const root = workspaceRootFor('org-command', 'owner', 'repo');
  await fs.mkdir(root, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: root });

  const write = await executeCodingWorkspaceTool('coding_workspace_write_file', {
    owner: 'owner',
    repo: 'repo',
    path: 'scripts/check.mjs',
    content: 'console.log("sandbox-ok")\n',
  }, 'org-command', null);
  assert.equal(write.status, 'ready');
  assert.equal(write.file.path, 'scripts/check.mjs');

  const command = await executeCodingWorkspaceTool('coding_workspace_run_command', {
    owner: 'owner',
    repo: 'repo',
    command: 'node',
    args: ['scripts/check.mjs'],
  }, 'org-command', null);
  assert.equal(command.status, 'ready');
  assert.match(command.stdout, /sandbox-ok/);

  if (oldRoot === undefined) delete process.env.CODING_WORKSPACE_ROOT;
  else process.env.CODING_WORKSPACE_ROOT = oldRoot;
});
