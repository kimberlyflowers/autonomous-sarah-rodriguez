// BLOOM Ops MCP Server
// Exposes Railway, GitHub, and BLOOM health tools to Cowork via Streamable HTTP.
// Add to Cowork: Customize → Connectors → + → paste your Railway URL + /ops-mcp
// Connector URL: https://autonomous-sarah-rodriguez-production.up.railway.app/ops-mcp
//
// Required env vars: RAILWAY_API_TOKEN, GITHUB_TOKEN
// Optional env vars: BLOOM_APP_URL (defaults to production Railway URL)

import express from 'express';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('ops-mcp-server');
const router = express.Router();

// ── Railway GraphQL client ───────────────────────────────────────────────────
const RAILWAY_API_URL = 'https://backboard.railway.app/graphql/v2';

async function railwayQuery(query, variables = {}) {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error('RAILWAY_API_TOKEN is not set');

  const res = await fetch(RAILWAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Railway API error (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Railway GraphQL error: ${json.errors.map(e => e.message).join('; ')}`);
  }
  return json.data;
}

// ── GitHub REST client ───────────────────────────────────────────────────────
const GITHUB_API_URL = 'https://api.github.com';

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  return {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'bloom-ops-mcp-server/1.0',
  };
}

async function githubGet(path) {
  const res = await fetch(`${GITHUB_API_URL}${path}`, { headers: githubHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${text}`);
  }
  return res.json();
}

async function githubPut(path, body) {
  const res = await fetch(`${GITHUB_API_URL}${path}`, {
    method: 'PUT',
    headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${text}`);
  }
  return res.json();
}

async function githubPost(path, body) {
  const res = await fetch(`${GITHUB_API_URL}${path}`, {
    method: 'POST',
    headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${text}`);
  }
  return res.json();
}

// ── BLOOM app URL ────────────────────────────────────────────────────────────
const BLOOM_APP_URL =
  process.env.BLOOM_APP_URL || 'https://autonomous-sarah-rodriguez-production.up.railway.app';

// ── Auth middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const apiKey = process.env.MCP_API_KEY;
  const isDev = process.env.NODE_ENV !== 'production';
  if (apiKey && isDev) {
    const authHeader = req.headers['authorization'] || '';
    const keyHeader = req.headers['x-api-key'] || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : keyHeader;
    if (provided && provided !== apiKey) {
      return res.status(401).json({ error: 'Unauthorized — invalid MCP_API_KEY' });
    }
  }
  next();
}

// ── Tool registry ────────────────────────────────────────────────────────────
const TOOLS = [
  // ─ RAILWAY TOOLS ───────────────────────────────────────────────────────────
  {
    name: 'railway_get_services',
    description: 'List all services in a Railway project. Returns service IDs, names, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Railway project UUID' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'railway_get_deployments',
    description: 'List recent deployments for a Railway service. Returns deployment IDs, status, and timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Railway service UUID' },
        environmentId: { type: 'string', description: 'Railway environment UUID' },
        limit: { type: 'number', default: 5, description: 'Max deployments to return (default 5)' },
      },
      required: ['serviceId', 'environmentId'],
    },
  },
  {
    name: 'railway_get_logs',
    description: 'Fetch recent deploy logs for a Railway deployment. Returns log lines with timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: { type: 'string', description: 'Railway deployment UUID' },
        limit: { type: 'number', default: 100, description: 'Max log lines (default 100)' },
      },
      required: ['deploymentId'],
    },
  },
  {
    name: 'railway_restart_service',
    description: 'Redeploy the latest deployment of a Railway service. Triggers a new deployment using the same image/config.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Railway service UUID' },
        environmentId: { type: 'string', description: 'Railway environment UUID' },
      },
      required: ['serviceId', 'environmentId'],
    },
  },
  {
    name: 'railway_get_domains',
    description: 'List all custom domains attached to a Railway service in an environment.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Railway service UUID' },
        environmentId: { type: 'string', description: 'Railway environment UUID' },
      },
      required: ['serviceId', 'environmentId'],
    },
  },
  {
    name: 'railway_add_domain',
    description: "Add a custom domain to a Railway service. You'll still need to configure DNS records.",
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Railway service UUID' },
        environmentId: { type: 'string', description: 'Railway environment UUID' },
        domain: { type: 'string', description: 'The custom domain to add (e.g. app.example.com)' },
      },
      required: ['serviceId', 'environmentId', 'domain'],
    },
  },
  {
    name: 'railway_remove_domain',
    description: 'Remove a custom domain from a Railway service.',
    inputSchema: {
      type: 'object',
      properties: {
        domainId: { type: 'string', description: 'Railway custom domain UUID to remove' },
      },
      required: ['domainId'],
    },
  },
  {
    name: 'railway_get_env_vars',
    description: 'List all environment variables for a Railway service. Sensitive values are redacted.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Railway service UUID' },
        environmentId: { type: 'string', description: 'Railway environment UUID' },
      },
      required: ['serviceId', 'environmentId'],
    },
  },
  {
    name: 'railway_set_env_var',
    description: 'Create or update an environment variable on a Railway service. Triggers a redeploy.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Railway service UUID' },
        environmentId: { type: 'string', description: 'Railway environment UUID' },
        name: { type: 'string', description: 'Variable name' },
        value: { type: 'string', description: 'Variable value' },
      },
      required: ['serviceId', 'environmentId', 'name', 'value'],
    },
  },
  // ─ GITHUB TOOLS ────────────────────────────────────────────────────────────
  {
    name: 'github_get_file',
    description: 'Read the contents of a file from a GitHub repository. Returns the decoded file content and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner (user or org)' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path relative to repo root' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA (default: repo default branch)' },
      },
      required: ['owner', 'repo', 'path'],
    },
  },
  {
    name: 'github_list_files',
    description: 'List files and directories at a given path in a GitHub repository. Returns names, types, and sizes.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', default: '', description: 'Directory path (empty string for repo root)' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_update_file',
    description: 'Create a new file or update an existing file in a GitHub repository. Requires the file SHA for updates.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path relative to repo root' },
        content: { type: 'string', description: 'New file content (plain text — will be base64-encoded automatically)' },
        message: { type: 'string', description: 'Commit message' },
        sha: { type: 'string', description: 'Current file SHA (required for updates, omit for new files)' },
        branch: { type: 'string', description: 'Target branch (default: repo default branch)' },
      },
      required: ['owner', 'repo', 'path', 'content', 'message'],
    },
  },
  {
    name: 'github_create_branch',
    description: 'Create a new branch in a GitHub repository from an existing branch or commit SHA.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'New branch name' },
        from: { type: 'string', default: 'main', description: 'Source branch or commit SHA (default: main)' },
      },
      required: ['owner', 'repo', 'branch'],
    },
  },
  {
    name: 'github_get_commits',
    description: 'List recent commits on a branch. Returns commit SHA, message, author, and timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', default: 'main', description: 'Branch name (default: main)' },
        limit: { type: 'number', default: 10, description: 'Max commits to return (default 10)' },
      },
      required: ['owner', 'repo'],
    },
  },
  // ─ BLOOM HEALTH TOOLS ──────────────────────────────────────────────────────
  {
    name: 'bloom_get_health',
    description: 'Check the health of the BLOOM Heartbeat Engine. Returns service status, uptime, and version info.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'bloom_get_agent_status',
    description: 'Get the current status of a BLOOM agent including active sessions, autonomy level, and last heartbeat.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent UUID (defaults to primary agent from env)' },
      },
      required: [],
    },
  },
  {
    name: 'bloom_tail_logs',
    description: 'Fetch recent application logs from the BLOOM Heartbeat Engine. Useful for debugging issues and monitoring activity.',
    inputSchema: {
      type: 'object',
      properties: {
        lines: { type: 'number', default: 50, description: 'Number of recent log lines to return (default 50)' },
        filter: { type: 'string', description: 'Optional text filter to match log lines' },
      },
      required: [],
    },
  },
];

// ── Tool executor ────────────────────────────────────────────────────────────
async function executeTool(name, args) {
  // ── railway_get_services ───────────────────────────────────────────────────
  if (name === 'railway_get_services') {
    const { projectId } = args;
    const data = await railwayQuery(
      `query ($projectId: String!) {
        project(id: $projectId) {
          services { edges { node { id name updatedAt } } }
        }
      }`,
      { projectId }
    );
    const services = data.project.services.edges.map(e => e.node);
    return { content: [{ type: 'text', text: JSON.stringify(services, null, 2) }] };
  }

  // ── railway_get_deployments ────────────────────────────────────────────────
  if (name === 'railway_get_deployments') {
    const { serviceId, environmentId, limit = 5 } = args;
    const data = await railwayQuery(
      `query ($serviceId: String!, $environmentId: String!, $limit: Int!) {
        deployments(
          first: $limit
          input: { serviceId: $serviceId, environmentId: $environmentId }
        ) {
          edges { node { id status createdAt updatedAt staticUrl } }
        }
      }`,
      { serviceId, environmentId, limit }
    );
    const deployments = data.deployments.edges.map(e => e.node);
    return { content: [{ type: 'text', text: JSON.stringify(deployments, null, 2) }] };
  }

  // ── railway_get_logs ───────────────────────────────────────────────────────
  if (name === 'railway_get_logs') {
    const { deploymentId, limit = 100 } = args;
    const data = await railwayQuery(
      `query ($deploymentId: String!, $limit: Int!) {
        deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
          timestamp message severity
        }
      }`,
      { deploymentId, limit }
    );
    const lines = (data.deploymentLogs || [])
      .map(l => `[${l.severity}] ${l.timestamp} ${l.message}`)
      .join('\n');
    return { content: [{ type: 'text', text: lines || 'No logs found.' }] };
  }

  // ── railway_restart_service ────────────────────────────────────────────────
  if (name === 'railway_restart_service') {
    const { serviceId, environmentId } = args;
    const data = await railwayQuery(
      `mutation ($serviceId: String!, $environmentId: String!) {
        serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
      }`,
      { serviceId, environmentId }
    );
    return {
      content: [{
        type: 'text',
        text: data.serviceInstanceRedeploy
          ? 'Service redeployment triggered successfully.'
          : 'Redeploy request returned false — check service status.',
      }],
    };
  }

  // ── railway_get_domains ────────────────────────────────────────────────────
  if (name === 'railway_get_domains') {
    const { serviceId, environmentId } = args;
    const data = await railwayQuery(
      `query ($serviceId: String!, $environmentId: String!) {
        customDomains(serviceId: $serviceId, environmentId: $environmentId) {
          id domain status { dnsRecords { hostlabel type requiredValue } certificateStatus }
        }
      }`,
      { serviceId, environmentId }
    );
    return { content: [{ type: 'text', text: JSON.stringify(data.customDomains, null, 2) }] };
  }

  // ── railway_add_domain ─────────────────────────────────────────────────────
  if (name === 'railway_add_domain') {
    const { serviceId, environmentId, domain } = args;
    const data = await railwayQuery(
      `mutation ($serviceId: String!, $environmentId: String!, $domain: String!) {
        customDomainCreate(input: { serviceId: $serviceId, environmentId: $environmentId, domain: $domain }) {
          id domain
        }
      }`,
      { serviceId, environmentId, domain }
    );
    return {
      content: [{
        type: 'text',
        text: `Domain added: ${data.customDomainCreate.domain} (ID: ${data.customDomainCreate.id}). Configure DNS records to complete setup.`,
      }],
    };
  }

  // ── railway_remove_domain ──────────────────────────────────────────────────
  if (name === 'railway_remove_domain') {
    const { domainId } = args;
    await railwayQuery(
      `mutation ($domainId: String!) {
        customDomainDelete(id: $domainId)
      }`,
      { domainId }
    );
    return { content: [{ type: 'text', text: `Domain ${domainId} removed.` }] };
  }

  // ── railway_get_env_vars ───────────────────────────────────────────────────
  if (name === 'railway_get_env_vars') {
    const { serviceId, environmentId } = args;
    const data = await railwayQuery(
      `query ($serviceId: String!, $environmentId: String!) {
        variables(serviceId: $serviceId, environmentId: $environmentId)
      }`,
      { serviceId, environmentId }
    );
    const vars = Object.entries(data.variables || {}).map(([key, val]) => {
      const isSensitive = /key|token|secret|password/i.test(key);
      return { name: key, value: isSensitive ? String(val).substring(0, 4) + '****' : val };
    });
    return { content: [{ type: 'text', text: JSON.stringify(vars, null, 2) }] };
  }

  // ── railway_set_env_var ────────────────────────────────────────────────────
  if (name === 'railway_set_env_var') {
    const { serviceId, environmentId, name: varName, value } = args;
    await railwayQuery(
      `mutation ($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }`,
      { input: { serviceId, environmentId, name: varName, value } }
    );
    return { content: [{ type: 'text', text: `Environment variable ${varName} set successfully.` }] };
  }

  // ── github_get_file ────────────────────────────────────────────────────────
  if (name === 'github_get_file') {
    const { owner, repo, path, ref } = args;
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const data = await githubGet(`/repos/${owner}/${repo}/contents/${path}${query}`);
    let content;
    if (data.content && data.encoding === 'base64') {
      content = Buffer.from(data.content, 'base64').toString('utf-8');
    } else {
      content = data.content ?? '(binary or empty file)';
    }
    return {
      content: [{
        type: 'text',
        text: `## ${data.path}\n**SHA:** ${data.sha} | **Size:** ${data.size} bytes\n\n\`\`\`\n${content}\n\`\`\``,
      }],
    };
  }

  // ── github_list_files ──────────────────────────────────────────────────────
  if (name === 'github_list_files') {
    const { owner, repo, path = '', ref } = args;
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const data = await githubGet(`/repos/${owner}/${repo}/contents/${path}${query}`);
    const listing = (Array.isArray(data) ? data : [data]).map(item => ({
      name: item.name,
      path: item.path,
      type: item.type,
      size: item.size,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(listing, null, 2) }] };
  }

  // ── github_update_file ─────────────────────────────────────────────────────
  if (name === 'github_update_file') {
    const { owner, repo, path, content, message, sha, branch } = args;
    const body = {
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
    };
    if (sha) body.sha = sha;
    if (branch) body.branch = branch;
    const data = await githubPut(`/repos/${owner}/${repo}/contents/${path}`, body);
    return {
      content: [{
        type: 'text',
        text: `File ${data.content.path} committed.\nCommit: ${data.commit.sha}\nMessage: ${data.commit.message}`,
      }],
    };
  }

  // ── github_create_branch ───────────────────────────────────────────────────
  if (name === 'github_create_branch') {
    const { owner, repo, branch, from = 'main' } = args;
    const refData = await githubGet(`/repos/${owner}/${repo}/git/ref/heads/${from}`);
    const data = await githubPost(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: refData.object.sha,
    });
    return { content: [{ type: 'text', text: `Branch created: ${data.ref} at ${data.object.sha}` }] };
  }

  // ── github_get_commits ─────────────────────────────────────────────────────
  if (name === 'github_get_commits') {
    const { owner, repo, branch = 'main', limit = 10 } = args;
    const data = await githubGet(
      `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`
    );
    const commits = (Array.isArray(data) ? data : []).map(c => ({
      sha: c.sha.substring(0, 7),
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(commits, null, 2) }] };
  }

  // ── bloom_get_health ───────────────────────────────────────────────────────
  if (name === 'bloom_get_health') {
    try {
      const res = await fetch(`${BLOOM_APP_URL}/health`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        return {
          content: [{
            type: 'text',
            text: `BLOOM health check FAILED — HTTP ${res.status}: ${await res.text()}`,
          }],
        };
      }
      const data = await res.json();
      return { content: [{ type: 'text', text: `BLOOM Health: OK\n${JSON.stringify(data, null, 2)}` }] };
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: `BLOOM health check FAILED — could not reach ${BLOOM_APP_URL}/health: ${err.message}`,
        }],
      };
    }
  }

  // ── bloom_get_agent_status ─────────────────────────────────────────────────
  // Fixed: /api/agent/status never existed — now calls /api/agent/list + /api/agent/tasks/runs
  if (name === 'bloom_get_agent_status') {
    const agentId = args.agentId || process.env.BLOOM_AGENT_ID || null;
    const orgId = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';
    const headers = { 'x-organization-id': orgId, 'x-service-key': serviceKey };
    try {
      // /api/agent/list — exists, returns all agents for the org
      const listRes = await fetch(`${BLOOM_APP_URL}/api/agent/list`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      if (!listRes.ok) {
        return { content: [{ type: 'text', text: `Agent list failed — HTTP ${listRes.status}: ${await listRes.text()}` }] };
      }
      const listData = await listRes.json();
      const agents = listData.agents || [];
      const target = agentId
        ? agents.find(a => a.id === agentId || (a.name || '').toLowerCase().includes(agentId.toLowerCase()))
        : agents[0];

      // /api/agent/tasks/runs — exists, returns recent task executions with status + result
      const runsUrl = `${BLOOM_APP_URL}/api/agent/tasks/runs${agentId ? '?agentId=' + agentId : ''}`;
      const runsRes = await fetch(runsUrl, { headers, signal: AbortSignal.timeout(10000) });
      const runsData = runsRes.ok ? await runsRes.json() : { runs: [] };
      const recentRuns = (runsData.runs || []).slice(0, 5).map(r => ({
        taskName: r.taskName,
        status: r.status,
        time: r.time,
        duration: r.duration,
        result: r.result ? String(r.result).substring(0, 200) : null,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({
          agent: target || null,
          allAgents: agents.map(a => ({ id: a.id, name: a.name, role: a.role, autonomy_level: a.autonomy_level })),
          recentTaskRuns: recentRuns,
        }, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Agent status check failed: ${err.message}` }] };
    }
  }

  // ── bloom_tail_logs ────────────────────────────────────────────────────────
  // Fixed: /api/dashboard/logs never existed — now calls /api/agent/tasks/runs
  // which returns real task execution records with status, result, timestamps
  if (name === 'bloom_tail_logs') {
    const { lines = 50, filter } = args;
    const orgId = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';
    const headers = { 'x-organization-id': orgId, 'x-service-key': serviceKey };
    try {
      // /api/agent/tasks/runs — exists, returns task execution log with status + results
      const runsRes = await fetch(`${BLOOM_APP_URL}/api/agent/tasks/runs`, {
        headers, signal: AbortSignal.timeout(15000),
      });
      if (!runsRes.ok) {
        return { content: [{ type: 'text', text: `Log fetch failed — HTTP ${runsRes.status}: ${await runsRes.text()}` }] };
      }
      const runsData = await runsRes.json();
      let runs = runsData.runs || [];

      // Apply filter if provided
      if (filter) {
        const f = filter.toLowerCase();
        runs = runs.filter(r =>
          (r.taskName || '').toLowerCase().includes(f) ||
          (r.status || '').toLowerCase().includes(f) ||
          (r.result || '').toLowerCase().includes(f)
        );
      }

      const logLines = runs.slice(0, lines).map(r =>
        `[${(r.status || 'unknown').toUpperCase()}] ${r.time || r.startedAt || ''} | ${r.taskName || 'Unknown Task'} | ${r.duration || ''} | ${r.result ? String(r.result).substring(0, 150) : 'no result'}`
      ).join('\n');

      return { content: [{ type: 'text', text: logLines || 'No task runs found.' }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Log fetch failed: ${err.message}` }] };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ── Express route — POST /ops-mcp ────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};

  try {
    // initialize — required first handshake
    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'bloom-ops-mcp-server', version: '1.0.0' },
        },
      });
    }

    // notifications/initialized — no response needed
    if (method === 'notifications/initialized') {
      return res.status(204).end();
    }

    // tools/list
    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0', id,
        result: { tools: TOOLS },
      });
    }

    // tools/call
    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      const result = await executeTool(name, args || {});
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      });
    }

    // Unknown method
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });

  } catch (err) {
    logger.error('Ops MCP tool error:', err);
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: err.message },
    });
  }
});

// GET /ops-mcp — health check
router.get('/', (req, res) => {
  res.json({
    name: 'bloom-ops-mcp-server',
    version: '1.0.0',
    status: 'ok',
    tools: TOOLS.map(t => t.name),
    auth: 'none',
    connector_url: 'https://autonomous-sarah-rodriguez-production.up.railway.app/ops-mcp',
  });
});

export default router;
