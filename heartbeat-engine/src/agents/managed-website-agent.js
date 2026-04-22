// BLOOM Managed Website Agent — Multi-Tenant
// Uses Claude Managed Agents API (beta).
//
// Multi-tenancy model:
//   - One Managed Agent per org, created lazily on first use, cached in managed_website_agents table
//   - Each agent's GHL MCP URL is /ghl-mcp/{orgId} — org-specific, no shared PITs
//   - Org's GHL PIT lives in organization_ghl_credentials Supabase table
//
// Progress reporting:
//   - All build updates post to the build's own chat session (messages table)
//   - NOT the conference channel — that's for Sarah + Marcus operator comms
//
// Entry point: chat.js detects sessionType='website_build' → calls runWebsiteBuild()

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from '../logging/logger.js';
import { createClient } from '@supabase/supabase-js';

const logger = createLogger('managed-website-agent');
const __dirname = dirname(fileURLToPath(import.meta.url));

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({
    apiKey: key,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' }
  });
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function getSystemPrompt() {
  try {
    const skillPath = join(__dirname, '../skills/catalog/website-creation.md');
    const raw = readFileSync(skillPath, 'utf-8');
    const content = raw.replace(/^---[\s\S]*?---\n/, '').trim();
    return `${content}\n\n## TOOL USAGE NOTE\nAlways call get_layout_blueprint(style_id) FIRST before writing any HTML — this gives you the real structural blueprint. Post updates using bloom_post_progress so the user can follow along in their chat session.`;
  } catch {
    return `You are BLOOM's professional website builder. Build conversion-optimized, mobile-first websites. Always call get_layout_blueprint first to get the correct HTML structure.`;
  }
}

// ── Post a progress message to the build's own chat session ──────────────────
// This shows up in the user's dedicated website build chat thread — NOT conference.
async function postToBuildSession(sessionId, message) {
  if (!sessionId) return;
  try {
    const supabase = getSupabase();
    await supabase.from('messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: message,
      metadata: { sender_label: 'BLOOM Website Builder', source: 'managed-website-agent', type: 'build_progress' }
    });
  } catch (e) {
    logger.warn('Failed to post build progress to session', { sessionId, error: e.message });
  }
}

// ── Get or create the Managed Agent for an org ───────────────────────────────
// One agent per org, stored in managed_website_agents Supabase table.
// Created lazily on first website build, reused for all subsequent builds.
async function getOrCreateAgentForOrg(orgId) {
  const supabase = getSupabase();
  const client = getClient();
  const bloomUrl = process.env.BLOOM_APP_URL ||
    'https://autonomous-sarah-rodriguez-production.up.railway.app';

  // Check if this org already has an agent
  const { data: existing } = await supabase
    .from('managed_website_agents')
    .select('agent_id, environment_id')
    .eq('org_id', orgId)
    .single();

  if (existing?.agent_id) {
    logger.info('Reusing existing agent for org', { orgId, agentId: existing.agent_id });
    return { agentId: existing.agent_id, environmentId: existing.environment_id };
  }

  // Create a new agent for this org
  // The GHL MCP URL is org-specific — proxy looks up this org's PIT from Supabase
  logger.info('Creating new Managed Agent for org', { orgId });

  const agent = await client.beta.agents.create({
    name: `BLOOM Website Builder — ${orgId}`,
    model: { id: 'claude-sonnet-4-6' },
    system: getSystemPrompt(),
    tools: [{ type: 'agent_toolset_20260401' }],
    mcp_servers: [
      {
        type: 'url',
        url: `${bloomUrl}/ghl-mcp/${orgId}`,  // org-specific — proxy injects this org's PIT
        name: 'ghl-tools'
      },
      {
        type: 'url',
        url: `${bloomUrl}/website-mcp`,
        name: 'bloom-website-tools'
      }
    ]
  });

  // Create the cloud environment (shared across this org's builds)
  const environment = await client.beta.environments.create({
    name: `bloom-website-env-${orgId}`,
    config: { type: 'cloud', networking: { type: 'unrestricted' } }
  });

  // Cache in Supabase
  await supabase.from('managed_website_agents').insert({
    org_id: orgId,
    agent_id: agent.id,
    environment_id: environment.id
  });

  logger.info('Agent created and cached for org', { orgId, agentId: agent.id });
  return { agentId: agent.id, environmentId: environment.id };
}

// ── RUN A WEBSITE BUILD ───────────────────────────────────────────────────────
// Creates a Managed Agent session for this org and streams the build.
// Progress posts go to the build's own chat session (chatSessionId), not conference.
export async function runWebsiteBuild(brief, options = {}) {
  const { orgId = null, chatSessionId = null, onEvent = null } = options;

  if (!orgId) {
    const err = new Error('orgId is required for website builds — cannot determine which GHL account to use');
    err.useFallback = true;
    throw err;
  }

  const client = getClient();

  logger.info('Starting website build', { orgId, chatSessionId });

  if (chatSessionId) {
    await postToBuildSession(chatSessionId, `🏗️ **Website Builder starting...** I'll ask you a few questions before we build.`);
  }

  // Get or create this org's Managed Agent
  let agentId, environmentId;
  try {
    ({ agentId, environmentId } = await getOrCreateAgentForOrg(orgId));
  } catch (err) {
    logger.error('Failed to get/create agent for org', { orgId, error: err.message });
    err.useFallback = true;
    throw err;
  }

  // Create session
  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
    title: `Website Build — ${new Date().toISOString().slice(0, 16)}`
  });

  logger.info('Session created', { sessionId: session.id, orgId, chatSessionId });

  if (chatSessionId) {
    await postToBuildSession(chatSessionId,
      `🤖 **Ready to build!** Session \`${session.id.slice(0, 8)}...\` — starting pre-build questions now.`
    );
  }

  let finalOutput = '';
  let toolCalls = [];

  try {
    const stream = client.beta.sessions.events.stream(session.id);

    await client.beta.sessions.events.send(session.id, {
      events: [{ type: 'user.message', content: [{ type: 'text', text: brief }] }]
    });

    for await (const event of stream) {
      if (onEvent) onEvent(event);

      switch (event.type) {
        case 'agent.message':
          for (const block of event.content || []) {
            if (block.type === 'text') finalOutput += block.text;
          }
          break;

        case 'agent.tool_use':
          toolCalls.push({ name: event.name, input: event.input });
          logger.info(`Tool used: ${event.name}`, { orgId });
          // Show tool usage in the build chat session (skip bloom_post_progress to avoid loops)
          if (chatSessionId && event.name !== 'bloom_post_progress' && event.name !== 'task_progress') {
            await postToBuildSession(chatSessionId, `🔧 \`${event.name}\``);
          }
          break;

        case 'session.status_idle':
          logger.info('Website build complete', { sessionId: session.id, orgId });
          if (chatSessionId) {
            await postToBuildSession(chatSessionId,
              `✅ **Website build complete!**\n\n${finalOutput.slice(0, 800)}${finalOutput.length > 800 ? '...' : ''}`
            );
          }
          return { sessionId: session.id, output: finalOutput, toolCalls, status: 'complete' };

        case 'session.status_error':
          throw new Error(`Managed Agent session error: ${event.error || 'Unknown'}`);
      }
    }
  } catch (err) {
    logger.error('Website build failed', { sessionId: session.id, orgId, error: err.message });
    if (chatSessionId) {
      await postToBuildSession(chatSessionId,
        `❌ **Website build encountered an issue:** ${err.message}\n\nFalling back to Sarah for this request.`
      );
    }
    err.sessionId = session.id;
    err.useFallback = true;
    throw err;
  }

  return { sessionId: session.id, output: finalOutput, toolCalls, status: 'complete' };
}

// ── SESSION CONTROLS ──────────────────────────────────────────────────────────
export async function getSessionStatus(sessionId) {
  const client = getClient();
  const session = await client.beta.sessions.retrieve(sessionId);
  return { sessionId: session.id, status: session.status, title: session.title };
}

export async function steerSession(sessionId, message) {
  const client = getClient();
  await client.beta.sessions.events.send(sessionId, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: message }] }]
  });
  return { sessionId, sent: true };
}

export async function interruptSession(sessionId) {
  const client = getClient();
  await client.beta.sessions.events.send(sessionId, {
    events: [{ type: 'user.interrupt' }]
  });
  return { sessionId, interrupted: true };
}

// ── DROP-IN REPLACEMENT for claude-website-agent.js ──────────────────────────
export async function runWebsiteTask(task, context = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY not configured');
    err.useFallback = true;
    throw err;
  }
  return runWebsiteBuild(task, {
    orgId: context.orgId || null,
    chatSessionId: context.sessionId || null
  });
}

// ── ONE-TIME SETUP (kept for backward compatibility) ─────────────────────────
// With per-org agents, setup now happens lazily. This function exists for
// testing — call it manually to pre-create an agent for a specific org.
export async function setupWebsiteAgentForOrg(orgId) {
  if (!orgId) throw new Error('orgId required');
  const result = await getOrCreateAgentForOrg(orgId);
  logger.info('Setup complete for org', { orgId, ...result });
  return result;
}
