import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { codingWorkspaceToolDefinitions, executeCodingWorkspaceTool } from './coding-workspace-tools.js';

const execFileAsync = promisify(execFile);
const API = {
  github: 'https://api.github.com',
  vercel: 'https://api.vercel.com',
  heygen: 'https://api.heygen.com',
};

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

async function tenantGrant(slug, organizationId) {
  if (!organizationId) throw new Error('Authenticated organization context is required');
  const { data, error } = await supabase()
    .from('user_connectors')
    .select('access_token, api_key, external_account_id, connectors!inner(slug)')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('connectors.slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token && !data?.api_key) throw new Error(`${slug} is not connected for this organization`);
  return data;
}

async function providerFetch(provider, organizationId, endpoint, options = {}) {
  const grant = await tenantGrant(provider, organizationId);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(provider === 'heygen'
      ? { 'x-api-key': grant.api_key }
      : { Authorization: `Bearer ${grant.access_token}` }),
    ...(provider === 'github' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${API[provider]}${endpoint}`, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(`${provider} API ${response.status}: ${body.message || body.error?.message || text}`);
  return body;
}

const object = (properties, required = []) => ({ type: 'object', properties, required });
const string = (description) => ({ type: 'string', description });
const VERCEL_READY_STATES = new Set(['READY']);
const VERCEL_FAILED_STATES = new Set(['ERROR', 'CANCELED', 'CANCELLED']);

export function normalizeVercelDeploymentState(state) {
  const raw = String(state || '').toUpperCase();
  if (VERCEL_READY_STATES.has(raw)) return 'ready';
  if (VERCEL_FAILED_STATES.has(raw)) return 'failed';
  if (raw) return 'pending';
  return 'unknown';
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function waitForVercelDeployment(params, organizationId, dependencies = {}) {
  if (!params.deploymentId && !params.projectId) {
    throw new Error('deploymentId or projectId is required');
  }
  const fetchProvider = dependencies.fetchProvider || providerFetch;
  const sleepFn = dependencies.sleepFn || sleep;
  const now = dependencies.now || Date.now;
  const timeoutMs = Math.min(Math.max(Number(params.timeoutSeconds || 180), 10), 300) * 1000;
  const pollMs = Math.min(Math.max(Number(params.pollIntervalSeconds || 10), 3), 30) * 1000;
  const startedAt = now();
  let checks = 0;
  let latest = null;

  while (now() - startedAt < timeoutMs) {
    checks += 1;
    if (params.deploymentId) {
      const q = params.teamId ? `?teamId=${encodeURIComponent(params.teamId)}` : '';
      const row = await fetchProvider('vercel', organizationId, `/v13/deployments/${encodeURIComponent(params.deploymentId)}${q}`);
      latest = { id: row.id || row.uid, name: row.name, url: row.url, state: row.readyState || row.state, created: row.createdAt || row.created };
    } else {
      const q = new URLSearchParams({ limit: '1', projectId: params.projectId, ...(params.teamId ? { teamId: params.teamId } : {}) });
      const row = await fetchProvider('vercel', organizationId, `/v6/deployments?${q}`);
      const deployment = row.deployments?.[0];
      latest = deployment ? { id: deployment.uid, name: deployment.name, url: deployment.url, state: deployment.state || deployment.readyState, created: deployment.created } : null;
    }

    if (!latest) {
      await sleepFn(pollMs);
      continue;
    }

    const status = normalizeVercelDeploymentState(latest.state);
    if (status === 'ready') {
      return { success: true, status: 'ready', terminal: true, deployment: latest, checks, waitedMs: now() - startedAt };
    }
    if (status === 'failed') {
      return { success: true, status: 'failed', terminal: true, deployment: latest, checks, waitedMs: now() - startedAt };
    }
    await sleepFn(pollMs);
  }

  return {
    success: true,
    status: 'timeout',
    terminal: false,
    pending: true,
    deployment: latest,
    checks,
    waitedMs: now() - startedAt,
    message: 'The deployment is still pending after the wait window. This is not a deployment failure.',
  };
}

export const developerToolDefinitions = {
  ...codingWorkspaceToolDefinitions,
  github_list_repositories: {
    name: 'github_list_repositories',
    description: 'List repositories accessible through the current tenant GitHub connection.',
    parameters: object({ visibility: string('all, public, or private'), limit: { type: 'number' } }),
  },
  github_get_repository: {
    name: 'github_get_repository',
    description: 'Get repository metadata, including its actual default branch. Use this before assuming a branch name.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name') }, ['owner', 'repo']),
  },
  github_list_branches: {
    name: 'github_list_branches',
    description: 'List branches in a tenant-authorized GitHub repository. Use this instead of guessing main or master.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), limit: { type: 'number' } }, ['owner', 'repo']),
  },
  github_list_files: {
    name: 'github_list_files',
    description: 'List files and directories at a repository path and ref. Start at the root, inspect package manifests, then traverse likely source directories instead of guessing file paths.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), path: string('Directory path; omit or use an empty string for repository root'), ref: string('Branch, tag, or commit; omit to use the actual default branch') }, ['owner', 'repo']),
  },
  github_search_code: {
    name: 'github_search_code',
    description: 'Search filenames and code within one tenant-authorized repository. Use when the desired file or component path is unknown.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), query: string('Code or filename search expression'), limit: { type: 'number' } }, ['owner', 'repo', 'query']),
  },
  github_get_file: {
    name: 'github_get_file',
    description: 'Read a file from a repository accessible to the current tenant.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), path: string('File path'), ref: string('Branch, tag, or commit') }, ['owner', 'repo', 'path']),
  },
  github_put_file: {
    name: 'github_put_file',
    description: 'Create or update one file in a tenant-authorized GitHub repository.',
    parameters: object({ owner: string('Repository owner'), repo: string('Repository name'), path: string('File path'), content: string('Complete UTF-8 content'), message: string('Commit message'), branch: string('Target branch'), sha: string('Existing file SHA when updating') }, ['owner', 'repo', 'path', 'content', 'message']),
  },
  vercel_list_projects: {
    name: 'vercel_list_projects',
    description: 'List projects accessible through the current tenant Vercel connection.',
    parameters: object({ limit: { type: 'number' }, teamId: string('Optional Vercel team ID') }),
  },
  vercel_create_project: {
    name: 'vercel_create_project',
    description: 'Create a Vercel project in the current tenant account or team.',
    parameters: object({ name: string('Project name'), framework: string('Framework slug'), teamId: string('Optional Vercel team ID'), gitRepository: { type: 'object', description: 'Optional {type, repo} Git repository configuration' } }, ['name']),
  },
  vercel_list_deployments: {
    name: 'vercel_list_deployments',
    description: 'List recent Vercel deployments for the current tenant.',
    parameters: object({ projectId: string('Project ID or name'), teamId: string('Optional Vercel team ID'), limit: { type: 'number' } }),
  },
  vercel_create_deployment: {
    name: 'vercel_create_deployment',
    description: 'Create a Vercel deployment from a tenant-authorized Git repository.',
    parameters: object({ name: string('Deployment/project name'), repo: string('owner/repository'), ref: string('Git branch or ref'), teamId: string('Optional Vercel team ID'), target: string('Use production only for a production deployment. Omit or use preview for a preview deployment.') }, ['name', 'repo']),
  },
  vercel_wait_for_deployment: {
    name: 'vercel_wait_for_deployment',
    description: 'Wait inside one tool call until a Vercel deployment reaches READY, fails, or times out. Use this instead of repeatedly calling vercel_list_deployments. A timeout means the deployment is still pending, not failed.',
    parameters: object({
      deploymentId: string('Optional deployment ID. If omitted, waits for the newest deployment in projectId.'),
      projectId: string('Project ID or name; required when deploymentId is omitted.'),
      teamId: string('Optional Vercel team ID'),
      timeoutSeconds: { type: 'number', description: 'Maximum wait time, 10-300 seconds. Default 180.' },
      pollIntervalSeconds: { type: 'number', description: 'Polling interval, 3-30 seconds. Default 10.' },
    }),
  },
  hyperframes_list_projects: {
    name: 'hyperframes_list_projects',
    description: 'List HyperFrames projects available inside the current tenant workspace. Use before assuming a requested project is new.',
    parameters: object({}),
  },
  hyperframes_catalog: {
    name: 'hyperframes_catalog',
    description: 'List the current official HyperFrames blocks and components available for tenant projects. Use this instead of guessing template names.',
    parameters: object({ query: string('Optional keyword used to filter catalog items') }),
  },
  hyperframes_add: {
    name: 'hyperframes_add',
    description: 'Install one selected official HyperFrames catalog block or component into a tenant-isolated project.',
    parameters: object({ project: string('Tenant project slug'), item: string('Exact catalog item name') }, ['project', 'item']),
  },
  hyperframes_clone_template: {
    name: 'hyperframes_clone_template',
    description: 'Clone one approved read-only company HyperFrames template into a new tenant-owned project before customization.',
    parameters: object({ template: string('Approved template slug'), project: string('New tenant project slug') }, ['template', 'project']),
  },
  hyperframes_read_project: {
    name: 'hyperframes_read_project',
    description: 'Read text files from an existing tenant-isolated HyperFrames project before editing or resuming it. Omit paths to read the project manifest and composition files automatically.',
    parameters: object({
      project: string('Project slug'),
      paths: { type: 'array', items: { type: 'string' }, description: 'Optional relative text file paths to read' },
    }, ['project']),
  },
  hyperframes_write_project: {
    name: 'hyperframes_write_project',
    description: 'Create or update files in a tenant-isolated Hyperframes project on the server. New standalone projects require a root index.html containing the Hyperframes composition.',
    parameters: object({ project: string('Project slug'), files: { type: 'array', items: { type: 'object', properties: { path: string('Relative file path'), content: string('Complete file content') }, required: ['path', 'content'] } } }, ['project', 'files']),
  },
  hyperframes_run: {
    name: 'hyperframes_run',
    description: 'Run a safe HyperFrames init, version check, upgrade, validation, snapshot, or render command for a tenant-isolated project. Render requires an .mp4 output filename and automatically saves the real rendered binary as a Bloomie session artifact.',
    parameters: object({ project: string('Project slug'), action: { type: 'string', enum: ['init', 'upgrade-check', 'upgrade', 'check', 'snapshot', 'render'] }, composition: string('Composition name for snapshot/render'), output: string('Relative output filename') }, ['project', 'action']),
  },
  heygen_list_avatars: {
    name: 'heygen_list_avatars',
    description: 'List avatar groups from the current tenant HeyGen account. Use ownership=private when looking for the agent or user themselves.',
    parameters: object({
      ownership: { type: 'string', enum: ['private', 'public'] },
      limit: { type: 'number', description: 'Maximum 50' },
      token: string('Optional pagination token'),
    }),
  },
  heygen_list_voices: {
    name: 'heygen_list_voices',
    description: 'List voices available in the current tenant HeyGen account.',
    parameters: object({
      ownership: { type: 'string', enum: ['private', 'public'] },
      language: string('Optional language filter'),
      limit: { type: 'number', description: 'Maximum 100' },
      token: string('Optional pagination token'),
    }),
  },
  heygen_create_video: {
    name: 'heygen_create_video',
    description: 'Create an avatar video with HeyGen v3 in the current tenant account. This is a paid generation action; use only after the user has requested or approved generation.',
    parameters: object({
      avatarId: string('Private or public avatar look ID'),
      voiceId: string('HeyGen voice ID'),
      script: string('Final spoken script'),
      title: string('Descriptive video title'),
      aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
      engine: { type: 'string', enum: ['avatar_iv', 'avatar_v'] },
      motionPrompt: string('Optional natural movement direction'),
    }, ['avatarId', 'voiceId', 'script', 'title']),
  },
  heygen_get_video: {
    name: 'heygen_get_video',
    description: 'Get the real status and output URL of a HeyGen v3 video. Poll this until completed or failed.',
    parameters: object({ videoId: string('HeyGen video ID') }, ['videoId']),
  },
  bloom_studio_generate_video: {
    name: 'bloom_studio_generate_video',
    description: 'Generate a lip-synced video in BLOOM Studio using the active Bloomie employee’s own saved reference image and ElevenLabs voice. This is a paid generation action; call only after the user approves the final script.',
    parameters: object({
      script: string('Final approved spoken script'),
      imageUrl: string('Optional public reference image URL; omit to use the active Bloomie employee avatar'),
      prompt: string('Optional natural movement and scene direction'),
      quality: { type: 'string', enum: ['480p', '720p'] },
      aspectRatio: { type: 'string', enum: ['16:9', '9:16'] },
    }, ['script']),
  },
  bloom_studio_check_job: {
    name: 'bloom_studio_check_job',
    description: 'Check a BLOOM Studio video request and poll until it is completed or failed.',
    parameters: object({ requestId: string('Request ID returned by bloom_studio_generate_video') }, ['requestId']),
  },
  bloom_studio_list_characters: {
    name: 'bloom_studio_list_characters',
    description: 'List the active tenant’s BLOOM Studio characters and saved looks before choosing a source image.',
    parameters: object({}),
  },
  bloom_studio_list_assets: {
    name: 'bloom_studio_list_assets',
    description: 'List the active tenant’s BLOOM Studio product references, character images, audio, generated images, and generated videos.',
    parameters: object({}),
  },
  bloom_studio_generate_image: {
    name: 'bloom_studio_generate_image',
    description: 'Generate an image through BLOOM Studio using its configured OpenRouter image model and optional tenant character, product, or reference images.',
    parameters: object({
      prompt: string('Detailed image request'),
      aspectRatio: { type: 'string', enum: ['1:1', '4:5', '9:16', '16:9'] },
      characterUrl: string('Optional public character image URL'),
      productUrl: string('Optional public product image URL'),
      referenceUrls: { type: 'array', items: { type: 'string' } },
    }, ['prompt']),
  },
  bloom_studio_generate_seedance: {
    name: 'bloom_studio_generate_seedance',
    description: 'Generate a Seedance video through BLOOM Studio from a prompt and source image or reference media. This is a paid generation action.',
    parameters: object({
      prompt: string('Seedance-native motion prompt'),
      imageUrl: string('Optional public starting image URL'),
      referenceImageUrls: { type: 'array', items: { type: 'string' } },
      referenceVideoUrls: { type: 'array', items: { type: 'string' } },
      audioUrl: string('Optional public audio URL'),
      duration: { type: 'number' },
      resolution: { type: 'string', enum: ['480p', '720p', '1080p'] },
      model: { type: 'string', enum: ['seedance2-fast', 'seedance2-standard'] },
      aspectRatio: { type: 'string', enum: ['16:9', '9:16'] },
    }, ['prompt']),
  },
  bloom_studio_check_seedance: {
    name: 'bloom_studio_check_seedance',
    description: 'Check a BLOOM Studio Seedance request and keep polling until it completes or fails.',
    parameters: object({ requestId: string('Request ID returned by bloom_studio_generate_seedance') }, ['requestId']),
  },
  bloom_studio_list_voices: {
    name: 'bloom_studio_list_voices',
    description: 'List ElevenLabs voices connected to the active tenant’s BLOOM Studio workspace.',
    parameters: object({}),
  },
  bloom_studio_generate_voice: {
    name: 'bloom_studio_generate_voice',
    description: 'Generate and save ElevenLabs voice audio inside the active tenant’s BLOOM Studio workspace.',
    parameters: object({
      script: string('Spoken script'),
      voiceId: string('ElevenLabs voice ID'),
      name: string('Optional saved audio name'),
    }, ['script', 'voiceId']),
  },
};

export async function executeDeveloperTool(name, params, organizationId, executionContext = {}) {
  try {
    if (codingWorkspaceToolDefinitions[name]) {
      const grant = await tenantGrant('github', organizationId);
      return await executeCodingWorkspaceTool(name, params, organizationId, grant.access_token, executionContext);
    }
    if (name === 'github_list_repositories') {
      const q = new URLSearchParams({ per_page: String(Math.min(params.limit || 50, 100)), visibility: params.visibility || 'all', sort: 'updated' });
      const rows = await providerFetch('github', organizationId, `/user/repos?${q}`);
      return { success: true, repositories: rows.map(r => ({ fullName: r.full_name, private: r.private, defaultBranch: r.default_branch, url: r.html_url })) };
    }
    if (name === 'github_get_repository') {
      const row = await providerFetch('github', organizationId, `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}`);
      return { success: true, repository: { fullName: row.full_name, private: row.private, defaultBranch: row.default_branch, language: row.language, archived: row.archived, url: row.html_url } };
    }
    if (name === 'github_list_branches') {
      const q = new URLSearchParams({ per_page: String(Math.min(params.limit || 100, 100)) });
      const rows = await providerFetch('github', organizationId, `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/branches?${q}`);
      return { success: true, branches: rows.map(b => ({ name: b.name, sha: b.commit?.sha, protected: b.protected })) };
    }
    if (name === 'github_list_files') {
      const encodedPath = String(params.path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
      const q = params.ref ? `?ref=${encodeURIComponent(params.ref)}` : '';
      const suffix = encodedPath ? `/contents/${encodedPath}` : '/contents';
      const rows = await providerFetch('github', organizationId, `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}${suffix}${q}`);
      const items = Array.isArray(rows) ? rows : [rows];
      return { success: true, files: items.map(item => ({ name: item.name, path: item.path, type: item.type, sha: item.sha, size: item.size, url: item.html_url })) };
    }
    if (name === 'github_search_code') {
      const q = new URLSearchParams({ q: `${params.query} repo:${params.owner}/${params.repo}`, per_page: String(Math.min(params.limit || 30, 100)) });
      const row = await providerFetch('github', organizationId, `/search/code?${q}`);
      return { success: true, totalCount: row.total_count || 0, matches: (row.items || []).map(item => ({ name: item.name, path: item.path, sha: item.sha, url: item.html_url })) };
    }
    if (name === 'github_get_file') {
      const q = params.ref ? `?ref=${encodeURIComponent(params.ref)}` : '';
      const row = await providerFetch('github', organizationId, `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/contents/${params.path.split('/').map(encodeURIComponent).join('/')}${q}`);
      return { success: true, path: row.path, sha: row.sha, content: Buffer.from(row.content || '', 'base64').toString('utf8') };
    }
    if (name === 'github_put_file') {
      const body = { message: params.message, content: Buffer.from(params.content).toString('base64'), ...(params.branch ? { branch: params.branch } : {}), ...(params.sha ? { sha: params.sha } : {}) };
      const row = await providerFetch('github', organizationId, `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/contents/${params.path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: JSON.stringify(body) });
      return { success: true, commit: row.commit?.html_url, sha: row.content?.sha };
    }
    if (name === 'vercel_list_projects') {
      const q = new URLSearchParams({ limit: String(Math.min(params.limit || 50, 100)), ...(params.teamId ? { teamId: params.teamId } : {}) });
      const row = await providerFetch('vercel', organizationId, `/v9/projects?${q}`);
      return { success: true, projects: (row.projects || []).map(p => ({ id: p.id, name: p.name, framework: p.framework, updatedAt: p.updatedAt })) };
    }
    if (name === 'vercel_create_project') {
      const q = params.teamId ? `?teamId=${encodeURIComponent(params.teamId)}` : '';
      const row = await providerFetch('vercel', organizationId, `/v10/projects${q}`, { method: 'POST', body: JSON.stringify({ name: params.name, ...(params.framework ? { framework: params.framework } : {}), ...(params.gitRepository ? { gitRepository: params.gitRepository } : {}) }) });
      return { success: true, project: { id: row.id, name: row.name, framework: row.framework } };
    }
    if (name === 'vercel_list_deployments') {
      const q = new URLSearchParams({ limit: String(Math.min(params.limit || 20, 100)), ...(params.projectId ? { projectId: params.projectId } : {}), ...(params.teamId ? { teamId: params.teamId } : {}) });
      const row = await providerFetch('vercel', organizationId, `/v6/deployments?${q}`);
      return { success: true, deployments: (row.deployments || []).map(d => ({ id: d.uid, name: d.name, url: d.url, state: d.state, created: d.created })) };
    }
    if (name === 'vercel_create_deployment') {
      const q = params.teamId ? `?teamId=${encodeURIComponent(params.teamId)}` : '';
      const [org, repo] = params.repo.split('/');
      if (!org || !repo) throw new Error('repo must be owner/repository');
      const productionTarget = params.target === 'production' ? { target: 'production' } : {};
      const row = await providerFetch('vercel', organizationId, `/v13/deployments${q}`, { method: 'POST', body: JSON.stringify({ name: params.name, ...productionTarget, gitSource: { type: 'github', org, repo, ref: params.ref || 'main' } }) });
      return {
        success: true,
        id: row.id,
        deploymentId: row.id,
        url: row.url,
        state: row.readyState,
        deployment: { id: row.id, url: row.url, readyState: row.readyState },
      };
    }
    if (name === 'vercel_wait_for_deployment') {
      return await waitForVercelDeployment(params, organizationId);
    }
    if (name === 'heygen_list_avatars') {
      const q = new URLSearchParams({
        limit: String(Math.min(Math.max(Number(params.limit || 20), 1), 50)),
        ownership: params.ownership || 'private',
        ...(params.token ? { token: params.token } : {}),
      });
      const row = await providerFetch('heygen', organizationId, `/v3/avatars?${q}`);
      const data = row.data || [];
      const agentWords = String(executionContext.agentName || '').toLowerCase().split(/\s+/).filter(Boolean);
      const selfMatches = data.filter(avatar => {
        const name = String(avatar.name || '').toLowerCase();
        return agentWords.length > 0 && (
          agentWords.every(word => name.includes(word))
          || name === agentWords[0]
        );
      }).sort((a, b) => {
        const aFull = agentWords.every(word => String(a.name || '').toLowerCase().includes(word)) ? 1 : 0;
        const bFull = agentWords.every(word => String(b.name || '').toLowerCase().includes(word)) ? 1 : 0;
        return bFull - aFull;
      });
      return {
        success: true,
        avatars: data.map(a => ({
          id: a.id, name: a.name, status: a.status, consentStatus: a.consent_status,
          defaultVoiceId: a.default_voice_id, previewImageUrl: a.preview_image_url,
          previewVideoUrl: a.preview_video_url, looksCount: a.looks_count,
        })),
        recommendedForActiveAgent: selfMatches.map(a => ({
          id: a.id,
          name: a.name,
          defaultVoiceId: a.default_voice_id || null,
          previewImageUrl: a.preview_image_url || null,
        })),
        hasMore: !!row.has_more,
        nextToken: row.next_token || null,
      };
    }
    if (name === 'heygen_list_voices') {
      const q = new URLSearchParams({
        limit: String(Math.min(Math.max(Number(params.limit || 50), 1), 100)),
        ...(params.ownership ? { ownership: params.ownership } : {}),
        ...(params.language ? { language: params.language } : {}),
        ...(params.token ? { token: params.token } : {}),
      });
      const row = await providerFetch('heygen', organizationId, `/v3/voices?${q}`);
      const data = row.data || [];
      return {
        success: true,
        voices: data.map(v => ({
          id: v.id || v.voice_id, name: v.name, language: v.language, gender: v.gender,
          previewAudioUrl: v.preview_audio_url, status: v.status,
        })),
        hasMore: !!row.has_more,
        nextToken: row.next_token || null,
      };
    }
    if (name === 'heygen_create_video') {
      const row = await providerFetch('heygen', organizationId, '/v3/videos', {
        method: 'POST',
        body: JSON.stringify({
          type: 'avatar',
          avatar_id: params.avatarId,
          voice_id: params.voiceId,
          script: params.script,
          title: params.title,
          aspect_ratio: params.aspectRatio || '16:9',
          output_format: 'mp4',
          engine: { type: params.engine || 'avatar_iv' },
          ...(params.motionPrompt ? { motion_prompt: params.motionPrompt } : {}),
        }),
      });
      const video = row.data || row;
      return { success: true, videoId: video.id || video.video_id, status: video.status || 'pending' };
    }
    if (name === 'heygen_get_video') {
      const row = await providerFetch('heygen', organizationId, `/v3/videos/${encodeURIComponent(params.videoId)}`);
      const video = row.data || row;
      return {
        success: true,
        video: {
          id: video.id || video.video_id || params.videoId,
          status: video.status,
          videoUrl: video.video_url || video.url || null,
          thumbnailUrl: video.thumbnail_url || null,
          duration: video.duration || null,
          error: video.error || null,
        },
      };
    }
    if (name.startsWith('bloom_studio_')) {
      const { executeBloomStudioTool } = await import('./bloom-studio-tools.js');
      return await executeBloomStudioTool(name, params, organizationId, executionContext);
    }
    if (name.startsWith('hyperframes_')) {
      const workspaceRoot = process.env.HYPERFRAMES_WORKSPACE_ROOT
        || path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/app/desktop-builds', 'hyperframes');
      const tenantRoot = path.join(workspaceRoot, String(organizationId));
      if (!['hyperframes_list_projects', 'hyperframes_catalog'].includes(name)) {
        const requestedProject = String(params.project || '').toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(requestedProject)) {
          throw new Error('Invalid HyperFrames project slug');
        }
      }
      await fs.mkdir(tenantRoot, { recursive: true });

      if (name === 'hyperframes_list_projects') {
        const entries = await fs.readdir(tenantRoot, { withFileTypes: true });
        const projects = [];
        for (const entry of entries.filter(item => item.isDirectory()).slice(0, 100)) {
          const projectRoot = path.join(tenantRoot, entry.name);
          const [hasIndex, hasBrief, hasConfig, stats] = await Promise.all([
            fs.access(path.join(projectRoot, 'index.html')).then(() => true).catch(() => false),
            fs.access(path.join(projectRoot, 'BRIEF.md')).then(() => true).catch(() => false),
            fs.access(path.join(projectRoot, 'hyperframes.json')).then(() => true).catch(() => false),
            fs.stat(projectRoot),
          ]);
          projects.push({ project: entry.name, hasIndex, hasBrief, hasConfig, updatedAt: stats.mtime.toISOString() });
        }
        projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const templateRoot = process.env.HYPERFRAMES_TEMPLATE_ROOT || path.join(process.cwd(), 'hyperframes-templates');
        const templates = [];
        try {
          const templateEntries = await fs.readdir(templateRoot, { withFileTypes: true });
          for (const entry of templateEntries.filter(item => item.isDirectory()).slice(0, 100)) {
            const manifestPath = path.join(templateRoot, entry.name, 'template.json');
            const manifest = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => ({}));
            templates.push({ template: entry.name, name: manifest.name || entry.name, description: manifest.description || '', readOnly: true });
          }
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        return { success: true, projects, templates };
      }

      if (name === 'hyperframes_catalog') {
        const { stdout } = await execFileAsync('npx', ['--yes', 'hyperframes@latest', 'catalog', '--json'], {
          cwd: tenantRoot,
          timeout: 2 * 60 * 1000,
          maxBuffer: 4 * 1024 * 1024,
        });
        let catalog;
        try { catalog = JSON.parse(stdout); } catch { catalog = { raw: stdout.slice(-20000) }; }
        const query = String(params.query || '').trim().toLowerCase();
        if (query && Array.isArray(catalog)) {
          catalog = catalog.filter(item => JSON.stringify(item).toLowerCase().includes(query));
        } else if (query && Array.isArray(catalog?.items)) {
          catalog.items = catalog.items.filter(item => JSON.stringify(item).toLowerCase().includes(query));
        }
        return { success: true, count: Array.isArray(catalog) ? catalog.length : catalog?.items?.length || null, catalog };
      }

      if (name === 'hyperframes_clone_template') {
        const template = String(params.template || '').toLowerCase();
        const project = String(params.project || '').toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(template)) throw new Error('Invalid HyperFrames template slug');
        if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(project)) throw new Error('Invalid HyperFrames project slug');
        const templateRoot = process.env.HYPERFRAMES_TEMPLATE_ROOT || path.join(process.cwd(), 'hyperframes-templates');
        const source = path.join(templateRoot, template);
        const target = path.join(tenantRoot, project);
        if (!source.startsWith(`${templateRoot}${path.sep}`) || !target.startsWith(`${tenantRoot}${path.sep}`)) {
          throw new Error('Unsafe HyperFrames template path');
        }
        const sourceExists = await fs.access(source).then(() => true).catch(() => false);
        if (!sourceExists) return { success: false, error: `Approved HyperFrames template not found: ${template}` };
        const targetExists = await fs.access(target).then(() => true).catch(() => false);
        if (targetExists) return { success: false, error: `Tenant HyperFrames project already exists: ${project}` };
        await fs.cp(source, target, { recursive: true, errorOnExist: true });
        return {
          success: true,
          template,
          project,
          warning: 'Replace any template media references with tenant-owned assets before validation or rendering.',
        };
      }

      const slug = String(params.project || '').toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) throw new Error('Invalid HyperFrames project slug');
      const root = path.join(tenantRoot, slug);
      await fs.mkdir(root, { recursive: true });
      if (name === 'hyperframes_add') {
        const item = String(params.item || '').trim();
        if (!/^[a-z0-9][a-z0-9-]{0,100}$/i.test(item)) throw new Error('Invalid HyperFrames catalog item name');
        const { stdout, stderr } = await execFileAsync('npx', ['--yes', 'hyperframes@latest', 'add', item], {
          cwd: root,
          timeout: 3 * 60 * 1000,
          maxBuffer: 4 * 1024 * 1024,
        });
        return { success: true, project: slug, item, stdout: stdout.slice(-12000), stderr: stderr.slice(-4000) };
      }
      if (name === 'hyperframes_read_project') {
        const requested = Array.isArray(params.paths) && params.paths.length
          ? params.paths
          : ['BRIEF.md', 'STORYBOARD.md', 'hyperframes.json', 'package.json', 'index.html'];
        const files = [];
        let totalBytes = 0;
        for (const requestedPath of requested.slice(0, 30)) {
          const relative = path.normalize(String(requestedPath)).replace(/^(\.\.(\/|\\|$))+/, '');
          const target = path.join(root, relative);
          if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe project path: ${requestedPath}`);
          try {
            const stat = await fs.stat(target);
            if (!stat.isFile()) continue;
            if (stat.size > 300_000 || totalBytes + stat.size > 1_000_000) {
              files.push({ path: relative, bytes: stat.size, skipped: 'File exceeds safe text read limit' });
              continue;
            }
            const content = await fs.readFile(target, 'utf8');
            totalBytes += stat.size;
            files.push({ path: relative, bytes: stat.size, content });
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
        return {
          success: true,
          project: slug,
          files,
          missing: requested.filter(item => !files.some(file => file.path === path.normalize(String(item)))),
        };
      }
      if (name === 'hyperframes_write_project') {
        for (const file of params.files || []) {
          const relative = path.normalize(file.path).replace(/^(\.\.(\/|\\|$))+/, '');
          const target = path.join(root, relative);
          if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe project path: ${file.path}`);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, file.content, 'utf8');
        }
        const hasIndex = await fs.access(path.join(root, 'index.html')).then(() => true).catch(() => false);
        return {
          success: true,
          project: slug,
          filesWritten: params.files.length,
          hasIndex,
          ...(hasIndex ? {} : { warning: 'Project is not runnable yet: add a root index.html before check, snapshot, or render.' }),
        };
      }
      const hasIndex = await fs.access(path.join(root, 'index.html')).then(() => true).catch(() => false);
      if (params.action !== 'init' && !hasIndex) {
        return { success: false, error: 'Hyperframes project requires a root index.html. Create or rename the standalone composition entry file, then retry.' };
      }
      let args;
      if (params.action === 'init') {
        args = ['--yes', 'hyperframes@latest', 'init', '.', '--non-interactive', '--example=blank'];
      } else if (params.action === 'upgrade-check') {
        args = ['--yes', 'hyperframes@latest', 'upgrade', '--project', '.', '--check'];
      } else if (params.action === 'upgrade') {
        args = ['--yes', 'hyperframes@latest', 'upgrade', '--project', '.'];
      } else {
        args = ['--yes', 'hyperframes@latest', params.action];
        if (params.action === 'check') args.push('--json');
        if (params.composition) args.push('--composition', params.composition);
        if (params.output) args.push('--output', params.output);
        if (params.action === 'render') args.push('--quality', 'high');
      }
      const { stdout, stderr } = await execFileAsync('npx', args, { cwd: root, timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
      let artifact = null;
      if (params.action === 'render') {
        if (!params.output || !String(params.output).toLowerCase().endsWith('.mp4')) {
          return { success: false, error: 'Hyperframes render requires an explicit .mp4 output filename so the real video can be saved as an artifact.' };
        }
        const relativeOutput = path.normalize(String(params.output)).replace(/^(\.\.(\/|\\|$))+/, '');
        const outputPath = path.join(root, relativeOutput);
        if (!outputPath.startsWith(`${root}${path.sep}`)) {
          return { success: false, error: `Unsafe Hyperframes output path: ${params.output}` };
        }
        const rendered = await fs.readFile(outputPath);
        if (!rendered.length) return { success: false, error: `Hyperframes render returned success but ${params.output} is empty.` };
        const port = process.env.PORT || 3000;
        const response = await fetch(`http://localhost:${port}/api/files/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: path.basename(relativeOutput),
            description: `HyperFrames render from tenant project ${slug}`,
            fileType: 'binary',
            mimeType: 'video/mp4',
            content: rendered.toString('base64'),
            sessionId: executionContext.sessionId || null,
            organizationId,
            metadata: { hyperframesProject: slug, composition: params.composition || 'index.html' },
          }),
        });
        const saved = await response.json().catch(() => ({}));
        if (!response.ok || !saved.success || !saved.artifact?.id) {
          return { success: false, error: saved.error || `Rendered MP4 could not be saved as an artifact (HTTP ${response.status}).` };
        }
        artifact = {
          ...saved.artifact,
          mimeType: 'video/mp4',
          bytes: rendered.length,
        };
      }
      return { success: true, project: slug, stdout: stdout.slice(-12000), stderr: stderr.slice(-4000), ...(artifact ? { artifact } : {}) };
    }
    return { success: false, error: `Unknown developer tool: ${name}` };
  } catch (error) {
    const diagnostic = [
      error?.message,
      error?.stdout && String(error.stdout),
      error?.stderr && String(error.stderr),
    ].filter(Boolean).join('\n').slice(-20000);
    return { success: false, error: diagnostic || 'Developer tool failed without diagnostic output.' };
  }
}
