import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);
const object = (properties, required = []) => ({ type: 'object', properties, required });
const string = (description) => ({ type: 'string', description });
const WORKSPACE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const BRANCH_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/;

export const codingWorkspaceToolDefinitions = {
  coding_workspace_prepare: {
    name: 'coding_workspace_prepare',
    description: 'Clone or refresh a tenant-authorized GitHub repository into an isolated Bloomie coding workspace. Returns the actual branch and repository root.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), ref: string('Branch, tag, or commit to check out') }, ['owner', 'repo']),
  },
  coding_workspace_list_files: {
    name: 'coding_workspace_list_files',
    description: 'List repository files in the prepared tenant coding workspace. Use this for broad local discovery before editing.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), directory: string('Optional relative directory'), limit: { type: 'number' } }, ['owner', 'repo']),
  },
  coding_workspace_read_file: {
    name: 'coding_workspace_read_file',
    description: 'Read a UTF-8 file from the prepared tenant coding workspace.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), path: string('Relative file path'), maxChars: { type: 'number' } }, ['owner', 'repo', 'path']),
  },
  coding_workspace_replace_text: {
    name: 'coding_workspace_replace_text',
    description: 'Apply one or more exact find-and-replace edits across workspace files. Each find string must exist; ambiguous repeated matches are rejected unless replaceAll is true.',
    parameters: object({
      owner: string('Repository owner'),
      repo: string('Repository name'),
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: string('Relative file path'),
            find: string('Exact existing text'),
            replace: string('Replacement text'),
            replaceAll: { type: 'boolean' },
          },
          required: ['path', 'find', 'replace'],
        },
      },
    }, ['owner', 'repo', 'edits']),
  },
  coding_workspace_write_file: {
    name: 'coding_workspace_write_file',
    description: 'Create or fully replace a UTF-8 file inside the prepared tenant workspace. Returns a file receipt; use diff and checks before committing.',
    parameters: object({
      owner: string('Repository owner'),
      repo: string('Repository name'),
      path: string('Relative file path'),
      content: string('Complete UTF-8 file content'),
    }, ['owner', 'repo', 'path', 'content']),
  },
  coding_workspace_run_command: {
    name: 'coding_workspace_run_command',
    description: 'Run a controlled non-shell Node or package-manager command inside the isolated workspace with production secrets removed. Use for repository-specific checks not covered by coding_workspace_run_checks.',
    parameters: object({
      owner: string('Repository owner'),
      repo: string('Repository name'),
      workingDirectory: string('Optional relative package directory'),
      command: { type: 'string', enum: ['node', 'npm', 'npx', 'pnpm', 'yarn'] },
      args: { type: 'array', items: { type: 'string' } },
      timeoutSeconds: { type: 'number', description: 'Timeout from 5-900 seconds' },
    }, ['owner', 'repo', 'command', 'args']),
  },
  coding_workspace_run_checks: {
    name: 'coding_workspace_run_checks',
    description: 'Run selected install, test, lint, typecheck, and build checks in the prepared workspace with production secrets removed from the subprocess environment.',
    parameters: object({
      owner: string('Repository owner'),
      repo: string('Repository name'),
      workingDirectory: string('Relative package directory, such as web'),
      checks: { type: 'array', items: { type: 'string', enum: ['install', 'test', 'lint', 'typecheck', 'build'] } },
      timeoutSeconds: { type: 'number', description: 'Per-check timeout, 30-900 seconds' },
    }, ['owner', 'repo', 'checks']),
  },
  coding_workspace_diff: {
    name: 'coding_workspace_diff',
    description: 'Review git status, diff summary, and patch from the prepared workspace before committing.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), maxChars: { type: 'number' } }, ['owner', 'repo']),
  },
  coding_workspace_commit: {
    name: 'coding_workspace_commit',
    description: 'Commit the verified workspace changes and push them to a tenant-authorized GitHub branch. Use only after checks and diff review.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), branch: string('Target branch'), message: string('Commit message') }, ['owner', 'repo', 'branch', 'message']),
  },
};

function safeSessionSegment(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function workspaceRootFor(organizationId, owner, repo, executionContext = {}) {
  if (!organizationId) throw new Error('Authenticated organization context is required');
  if (!WORKSPACE_SEGMENT.test(String(owner || '')) || !WORKSPACE_SEGMENT.test(String(repo || ''))) {
    throw new Error('Invalid repository owner or name');
  }
  const base = process.env.CODING_WORKSPACE_ROOT
    || path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/tmp/bloomie-workspaces', 'coding');
  const repositoryRoot = path.join(base, String(organizationId), `${owner}--${repo}`);
  const sessionKey = safeSessionSegment(executionContext.sessionId || executionContext.workSessionId);
  return sessionKey
    ? path.join(base, String(organizationId), '.worktrees', sessionKey, `${owner}--${repo}`)
    : repositoryRoot;
}

function repositoryRootFor(organizationId, owner, repo) {
  return workspaceRootFor(organizationId, owner, repo);
}

function sessionBranchFor(executionContext = {}) {
  const sessionKey = safeSessionSegment(executionContext.sessionId || executionContext.workSessionId);
  return sessionKey ? `bloomie/work-${sessionKey}`.slice(0, 190) : null;
}

export function resolveWorkspacePath(root, relativePath = '') {
  const raw = String(relativePath || '');
  if (path.isAbsolute(raw) || raw.split(/[\\/]+/).includes('..')) {
    throw new Error(`Unsafe workspace path: ${relativePath}`);
  }
  const normalized = path.normalize(raw);
  const target = path.resolve(root, normalized);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe workspace path: ${relativePath}`);
  }
  return target;
}

export function sanitizedCheckEnvironment(root) {
  return {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || process.env.LANG || 'C.UTF-8',
    CI: 'true',
    HOME: path.join(root, '.home'),
    npm_config_cache: path.join(root, '.npm-cache'),
    NEXT_TELEMETRY_DISABLED: '1',
    VERCEL_TELEMETRY_DISABLED: '1',
  };
}

function gitEnvironment(root, accessToken) {
  // GitHub's smart-HTTP Git endpoint expects Basic auth even when the
  // credential itself is an OAuth access token. Keep it in an ephemeral Git
  // config header so it never appears in the clone URL or command logs.
  const authorization = Buffer.from(`x-access-token:${accessToken}`, 'utf8').toString('base64');
  return {
    ...sanitizedCheckEnvironment(root),
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${authorization}`,
    GIT_TERMINAL_PROMPT: '0',
  };
}

async function run(command, args, options = {}) {
  if (typeof options.onOutput === 'function') {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const maxBuffer = options.maxBuffer || 8 * 1024 * 1024;
      const emit = (stream, chunk) => {
        const text = String(chunk);
        if (stream === 'stdout') stdout = (stdout + text).slice(-maxBuffer);
        else stderr = (stderr + text).slice(-maxBuffer);
        options.onOutput({ stream, text });
      };
      child.stdout?.on('data', chunk => emit('stdout', chunk));
      child.stderr?.on('data', chunk => emit('stderr', chunk));
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        const error = new Error(`Command timed out after ${options.timeout || 120_000}ms`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }, options.timeout || 120_000);
      child.on('error', error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      });
      child.on('close', code => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else {
          const error = new Error(`${command} exited with code ${code}`);
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });
    });
  }
  const { stdout = '', stderr = '' } = await execFileAsync(command, args, {
    timeout: options.timeout || 120_000,
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    ...options,
  });
  return { stdout, stderr };
}

async function ensurePrepared(root) {
  try {
    await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root });
  } catch {
    throw new Error('Coding workspace is not prepared. Call coding_workspace_prepare first.');
  }
}

async function ensureWorkspaceExcludes(root) {
  const excludePath = (await run('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: root })).stdout.trim();
  const absoluteExcludePath = path.isAbsolute(excludePath) ? excludePath : path.resolve(root, excludePath);
  await fs.mkdir(path.dirname(absoluteExcludePath), { recursive: true });
  let current = '';
  try { current = await fs.readFile(absoluteExcludePath, 'utf8'); } catch {}
  const entries = ['.home/', '.npm-cache/', 'node_modules/'];
  const missing = entries.filter(entry => !current.split('\n').includes(entry));
  if (missing.length > 0) {
    const prefix = current && !current.endsWith('\n') ? '\n' : '';
    await fs.appendFile(absoluteExcludePath, `${prefix}${missing.join('\n')}\n`, 'utf8');
  }
}

async function listWorkspaceFiles(directory, root, limit) {
  const files = [];
  const pending = [directory];
  const ignoredDirectories = new Set(['.git', 'node_modules', '.home', '.npm-cache']);

  while (pending.length > 0 && files.length < limit) {
    const current = pending.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (files.length >= limit) break;
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolute));
      }
    }
  }

  return files;
}

function packageManagerFor(directory, entries) {
  if (entries.includes('pnpm-lock.yaml')) return 'pnpm';
  if (entries.includes('yarn.lock')) return 'yarn';
  if (entries.includes('bun.lockb') || entries.includes('bun.lock')) return 'bun';
  return 'npm';
}

function checkCommand(manager, check) {
  const commands = {
    npm: {
      install: ['npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']],
      test: ['npm', ['test', '--if-present']],
      lint: ['npm', ['run', 'lint', '--if-present']],
      typecheck: ['npm', ['run', 'typecheck', '--if-present']],
      build: ['npm', ['run', 'build', '--if-present']],
    },
    pnpm: {
      install: ['pnpm', ['install', '--frozen-lockfile', '--ignore-scripts']],
      test: ['pnpm', ['run', 'test', '--if-present']],
      lint: ['pnpm', ['run', 'lint', '--if-present']],
      typecheck: ['pnpm', ['run', 'typecheck', '--if-present']],
      build: ['pnpm', ['run', 'build', '--if-present']],
    },
    yarn: {
      install: ['yarn', ['install', '--frozen-lockfile', '--ignore-scripts']],
      test: ['yarn', ['run', 'test']],
      lint: ['yarn', ['run', 'lint']],
      typecheck: ['yarn', ['run', 'typecheck']],
      build: ['yarn', ['run', 'build']],
    },
    bun: {
      install: ['bun', ['install', '--frozen-lockfile', '--ignore-scripts']],
      test: ['bun', ['run', 'test']],
      lint: ['bun', ['run', 'lint']],
      typecheck: ['bun', ['run', 'typecheck']],
      build: ['bun', ['run', 'build']],
    },
  };
  return commands[manager]?.[check];
}

export async function executeCodingWorkspaceTool(name, params, organizationId, accessToken, executionContext = {}) {
  const root = workspaceRootFor(organizationId, params.owner, params.repo, executionContext);
  if (name === 'coding_workspace_prepare') {
    if (!accessToken) throw new Error('GitHub is not connected for this organization');
    const repositoryRoot = repositoryRootFor(organizationId, params.owner, params.repo);
    await fs.mkdir(path.dirname(repositoryRoot), { recursive: true });
    const env = gitEnvironment(repositoryRoot, accessToken);
    const ref = params.ref || null;
    let exists = true;
    try { await fs.access(path.join(repositoryRoot, '.git')); } catch { exists = false; }
    if (!exists) {
      const args = ['clone', '--single-branch'];
      if (ref) args.push('--branch', ref);
      args.push(`https://github.com/${params.owner}/${params.repo}.git`, repositoryRoot);
      await run('git', args, { env, timeout: 180_000 });
    } else {
      await run('git', ['fetch', '--prune', 'origin'], { cwd: repositoryRoot, env, timeout: 180_000 });
    }

    const sessionBranch = sessionBranchFor(executionContext);
    if (sessionBranch) {
      let worktreeExists = true;
      try { await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root }); } catch { worktreeExists = false; }
      if (!worktreeExists) {
        await fs.mkdir(path.dirname(root), { recursive: true });
        await run('git', ['worktree', 'prune'], { cwd: repositoryRoot, env });
        let baseRef = ref ? `origin/${ref}` : 'origin/HEAD';
        try {
          await run('git', ['rev-parse', '--verify', baseRef], { cwd: repositoryRoot, env });
        } catch {
          baseRef = ref || 'HEAD';
        }
        await run('git', ['worktree', 'add', '-B', sessionBranch, root, baseRef], {
          cwd: repositoryRoot, env, timeout: 180_000,
        });
      }
    } else if (ref) {
      await run('git', ['checkout', '--force', ref], { cwd: repositoryRoot, env });
      await run('git', ['reset', '--hard', `origin/${ref}`], { cwd: repositoryRoot, env });
    }
    const branch = (await run('git', ['branch', '--show-current'], { cwd: root, env })).stdout.trim();
    const commit = (await run('git', ['rev-parse', 'HEAD'], { cwd: root, env })).stdout.trim();
    return {
      success: true,
      status: 'ready',
      workspace: {
        owner: params.owner,
        repo: params.repo,
        branch,
        commit,
        root,
        isolation: sessionBranch ? 'git-worktree' : 'shared-fallback',
        sessionId: executionContext.sessionId || executionContext.workSessionId || null,
      },
    };
  }

  await ensurePrepared(root);

  if (name === 'coding_workspace_list_files') {
    const directory = resolveWorkspacePath(root, params.directory || '');
    const limit = Math.min(Math.max(Number(params.limit || 500), 1), 2000);
    const files = await listWorkspaceFiles(directory, root, limit);
    return { success: true, files };
  }
  if (name === 'coding_workspace_read_file') {
    const target = resolveWorkspacePath(root, params.path);
    const content = await fs.readFile(target, 'utf8');
    const max = Math.min(Math.max(Number(params.maxChars || 100_000), 1000), 500_000);
    return { success: true, path: params.path, content: content.slice(0, max), truncated: content.length > max };
  }
  if (name === 'coding_workspace_replace_text') {
    const receipts = [];
    for (const edit of params.edits || []) {
      const target = resolveWorkspacePath(root, edit.path);
      const original = await fs.readFile(target, 'utf8');
      const occurrences = original.split(edit.find).length - 1;
      if (occurrences === 0) throw new Error(`Find text was not found in ${edit.path}`);
      if (occurrences > 1 && !edit.replaceAll) throw new Error(`Find text is ambiguous in ${edit.path}: ${occurrences} matches`);
      const updated = edit.replaceAll ? original.split(edit.find).join(edit.replace) : original.replace(edit.find, edit.replace);
      await fs.writeFile(target, updated, 'utf8');
      receipts.push({ path: edit.path, replacements: edit.replaceAll ? occurrences : 1 });
    }
    return { success: true, status: 'ready', edits: receipts };
  }
  if (name === 'coding_workspace_write_file') {
    const target = resolveWorkspacePath(root, params.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(params.content), 'utf8');
    return {
      success: true,
      status: 'ready',
      file: { path: params.path, bytes: Buffer.byteLength(String(params.content), 'utf8') },
    };
  }
  if (name === 'coding_workspace_run_command') {
    const allowed = new Set(['node', 'npm', 'npx', 'pnpm', 'yarn']);
    if (!allowed.has(params.command)) throw new Error(`Unsupported workspace command: ${params.command}`);
    const args = Array.isArray(params.args) ? params.args.map(value => String(value)) : [];
    if (args.some(arg => arg.includes('\0'))) throw new Error('Command arguments cannot contain null bytes');
    const directory = resolveWorkspacePath(root, params.workingDirectory || '');
    await ensureWorkspaceExcludes(root);
    await fs.mkdir(path.join(root, '.home'), { recursive: true });
    const timeout = Math.min(Math.max(Number(params.timeoutSeconds || 300), 5), 900) * 1000;
    try {
      const output = await run(params.command, args, {
        cwd: directory,
        env: sanitizedCheckEnvironment(root),
        timeout,
        onOutput: executionContext.onOutput,
      });
      return {
        success: true,
        status: 'ready',
        terminal: true,
        command: [params.command, ...args],
        stdout: output.stdout.slice(-20_000),
        stderr: output.stderr.slice(-8_000),
      };
    } catch (error) {
      return {
        success: true,
        status: 'failed',
        terminal: true,
        command: [params.command, ...args],
        error: error.message,
        stdout: String(error.stdout || '').slice(-20_000),
        stderr: String(error.stderr || '').slice(-8_000),
      };
    }
  }
  if (name === 'coding_workspace_run_checks') {
    const directory = resolveWorkspacePath(root, params.workingDirectory || '');
    await ensureWorkspaceExcludes(root);
    const entries = await fs.readdir(directory);
    if (!entries.includes('package.json')) throw new Error(`No package.json in ${params.workingDirectory || 'repository root'}`);
    await fs.mkdir(path.join(root, '.home'), { recursive: true });
    const manager = packageManagerFor(directory, entries);
    const timeout = Math.min(Math.max(Number(params.timeoutSeconds || 600), 30), 900) * 1000;
    const results = [];
    for (const check of params.checks || []) {
      const command = checkCommand(manager, check);
      if (!command) throw new Error(`Unsupported check ${check} for ${manager}`);
      try {
        const output = await run(command[0], command[1], { cwd: directory, env: sanitizedCheckEnvironment(root), timeout });
        results.push({ check, status: 'passed', stdout: output.stdout.slice(-12_000), stderr: output.stderr.slice(-4_000) });
      } catch (error) {
        results.push({ check, status: 'failed', error: error.message, stdout: String(error.stdout || '').slice(-12_000), stderr: String(error.stderr || '').slice(-8_000) });
        return { success: true, status: 'failed', terminal: true, packageManager: manager, checks: results };
      }
    }
    return { success: true, status: 'ready', terminal: true, packageManager: manager, checks: results };
  }
  if (name === 'coding_workspace_diff') {
    const max = Math.min(Math.max(Number(params.maxChars || 100_000), 1000), 500_000);
    const status = (await run('git', ['status', '--short'], { cwd: root, env: sanitizedCheckEnvironment(root) })).stdout;
    const stat = (await run('git', ['diff', '--stat'], { cwd: root, env: sanitizedCheckEnvironment(root) })).stdout;
    const diff = (await run('git', ['diff', '--no-ext-diff'], { cwd: root, env: sanitizedCheckEnvironment(root), maxBuffer: 16 * 1024 * 1024 })).stdout;
    return { success: true, status: status.trim(), stat: stat.trim(), diff: diff.slice(0, max), truncated: diff.length > max };
  }
  if (name === 'coding_workspace_commit') {
    if (!accessToken) throw new Error('GitHub is not connected for this organization');
    if (!BRANCH_NAME.test(String(params.branch || '')) || String(params.branch).includes('..')) throw new Error('Invalid branch name');
    const env = gitEnvironment(root, accessToken);
    const commitAgentName = String(executionContext.agentName || 'Bloomie AI Employee').replace(/[\r\n<>]/g, '').slice(0, 100);
    const commitAgentSlug = commitAgentName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'bloomie';
    await run('git', ['config', 'user.name', commitAgentName], { cwd: root, env });
    await run('git', ['config', 'user.email', `${commitAgentSlug}@bloomiestaffing.com`], { cwd: root, env });
    await run('git', ['add', '--all'], { cwd: root, env });
    const staged = (await run('git', ['diff', '--cached', '--name-only'], { cwd: root, env })).stdout.trim();
    if (!staged) throw new Error('No workspace changes to commit');
    await run('git', ['commit', '-m', params.message], { cwd: root, env, timeout: 120_000 });
    await run('git', ['push', '--set-upstream', 'origin', `HEAD:refs/heads/${params.branch}`], { cwd: root, env, timeout: 180_000 });
    const commit = (await run('git', ['rev-parse', 'HEAD'], { cwd: root, env })).stdout.trim();
    return { success: true, status: 'ready', commit, branch: params.branch, files: staged.split('\n').filter(Boolean), url: `https://github.com/${params.owner}/${params.repo}/commit/${commit}` };
  }
  throw new Error(`Unknown coding workspace tool: ${name}`);
}
