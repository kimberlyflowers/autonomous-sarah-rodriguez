// BLOOM Managed Website Agent
// Uses Claude Managed Agents API (beta) — NOT the Messages API.
// Anthropic manages the agent harness, container, tool execution, and session state.
//
// Architecture:
//   Cowork / heartbeat task
//       → runWebsiteBuild(brief) — creates a Managed Agent session
//       → Claude runs autonomously in a cloud container
//       → Claude calls GHL tools via /website-mcp (our MCP server)
//       → Claude writes files, generates images, publishes to GHL
//       → Session streams events back; posts progress to conference channel
//
// One-time setup:
//   node src/scripts/setup-website-agent.js
//   → Creates Agent + Environment on Anthropic platform
//   → Prints BLOOM_WEBSITE_AGENT_ID and BLOOM_WEBSITE_ENVIRONMENT_ID
//   → Set those as Railway env vars on autonomous-sarah-rodriguez

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from '../logging/logger.js';
import { createClient } from '@supabase/supabase-js';

const logger = createLogger('managed-website-agent');
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Anthropic client with Managed Agents beta header ─────────────────────────
function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({
    apiKey: key,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' }
  });
}

// ── Load website-creation.md skill as system prompt ───────────────────────────
function getSystemPrompt() {
  try {
    const skillPath = join(__dirname, '../skills/catalog/website-creation.md');
    const raw = readFileSync(skillPath, 'utf-8');
    // Strip YAML frontmatter (---...---) and return content only
    const content = raw.replace(/^---[\s\S]*?---\n/, '').trim();
    return `${content}\n\n## TOOL USAGE NOTE\nUse get_layout_blueprint(style_id) to get the real HTML structure for the requested design style BEFORE writing any code. Do NOT invent a layout from scratch — always start from the blueprint. Post progress updates to the conference channel using bloom_post_progress so the operator can see what you are building.`;
  } catch {
    logger.warn('Could not load website-creation.md skill, using fallback prompt');
    return `You are BLOOM's professional website builder. Build conversion-optimized, mobile-first websites with brand kit styling, AI-generated images, CRM-connected forms, and GHL publishing. Always call get_layout_blueprint first to get the correct HTML structure for the design style requested.`;
  }
}

// ── Supabase client (for posting conference channel progress) ─────────────────
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function postProgress(orgId, message) {
  try {
    const supabase = getSupabase();
    await supabase.from('conference_messages').insert({
      org_id: orgId,
      role: 'assistant',
      content: message,
      sender_type: 'claude',
      message_type: 'update',
      metadata: { sender_label: 'BLOOM Website Builder', source: 'managed-website-agent' }
    });
  } catch (e) {
    logger.warn('Failed to post progress to conference', { error: e.message });
  }
}

// ── ONE-TIME SETUP ────────────────────────────────────────────────────────────
// Call this ONCE via the setup script to create the Agent and Environment.
// Store returned IDs as Railway env vars:
//   BLOOM_WEBSITE_AGENT_ID
//   BLOOM_WEBSITE_ENVIRONMENT_ID

export async function setupWebsiteAgent() {
  const client = getClient();
  const bloomUrl = process.env.BLOOM_APP_URL ||
    'https://autonomous-sarah-rodriguez-production.up.railway.app';

  logger.info('Creating BLOOM Website Builder managed agent...');

  const agent = await client.beta.agents.create({
    name: 'BLOOM Website Builder',
    model: { id: 'claude-sonnet-4-6' },
    system: getSystemPrompt(),
    tools: [
      { type: 'agent_toolset_20260401' } // bash, file ops, web search, web fetch
    ],
    mcp_servers: [
      {
        type: 'url',
        url: `${bloomUrl}/website-mcp`,
        name: 'bloom-website-tools'
        // Provides: get_layout_blueprint, ghl_create_page, ghl_update_page,
        //           ghl_publish_page, ghl_list_forms, ghl_list_calendars,
        //           image_generate, bloom_post_progress
      }
    ]
  });

  logger.info('Creating cloud environment (unrestricted networking for GHL API)...');

  const environment = await client.beta.environments.create({
    name: 'bloom-website-env',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' }
    }
  });

  const result = {
    agentId: agent.id,
    environmentId: environment.id,
    mcpUrl: `${bloomUrl}/website-mcp`,
    envVarsToSet: {
      BLOOM_WEBSITE_AGENT_ID: agent.id,
      BLOOM_WEBSITE_ENVIRONMENT_ID: environment.id
    }
  };

  logger.info('✅ Setup complete — set these Railway env vars:', result.envVarsToSet);
  return result;
}

// ── RUN A WEBSITE BUILD ───────────────────────────────────────────────────────
// Creates a new Managed Agent session and streams build events.
// Returns { sessionId, output, toolCalls, status } when complete.
// Fires onEvent(event) in real time for SSE/websocket callers.

export async function runWebsiteBuild(brief, options = {}) {
  const { onEvent = null, orgId = null } = options;
  const client = getClient();

  const agentId = process.env.BLOOM_WEBSITE_AGENT_ID;
  const environmentId = process.env.BLOOM_WEBSITE_ENVIRONMENT_ID;

  if (!agentId || !environmentId) {
    const err = new Error(
      'Website agent not configured. Run: node src/scripts/setup-website-agent.js'
    );
    err.useFallback = true;
    throw err;
  }

  logger.info('Starting website build session...', { briefLength: brief.length });

  if (orgId) {
    await postProgress(orgId, `🏗️ **Website Builder starting...** Creating new build session.`);
  }

  // Create session
  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
    title: `Website Build — ${new Date().toISOString().slice(0, 16)}`
  });

  logger.info('Session created', { sessionId: session.id });

  if (orgId) {
    await postProgress(orgId,
      `🤖 **Session started** (ID: \`${session.id}\`)\nClaude is now planning the website build...`
    );
  }

  let finalOutput = '';
  let toolCalls = [];

  try {
    // Open stream BEFORE sending the first message (required by the API)
    const stream = client.beta.sessions.events.stream(session.id);

    // Send the build brief as the first user event
    await client.beta.sessions.events.send(session.id, {
      events: [{
        type: 'user.message',
        content: [{ type: 'text', text: brief }]
      }]
    });

    // Process streaming events
    for await (const event of stream) {
      logger.debug('Session event received', { type: event.type });

      if (onEvent) onEvent(event);

      switch (event.type) {
        case 'agent.message':
          for (const block of event.content || []) {
            if (block.type === 'text') finalOutput += block.text;
          }
          break;

        case 'agent.tool_use':
          toolCalls.push({ name: event.name, input: event.input });
          logger.info(`Claude using tool: ${event.name}`);
          if (orgId && event.name !== 'bloom_post_progress') {
            // Show tool usage in conference (skip bloom_post_progress to avoid loops)
            await postProgress(orgId, `🔧 Using tool: \`${event.name}\``);
          }
          break;

        case 'session.status_idle':
          logger.info('Website build complete', { sessionId: session.id });
          if (orgId) {
            await postProgress(orgId, `✅ **Website build complete!**\n\n${finalOutput.slice(0, 500)}${finalOutput.length > 500 ? '...' : ''}`);
          }
          return {
            sessionId: session.id,
            output: finalOutput,
            toolCalls,
            status: 'complete'
          };

        case 'session.status_error':
          throw new Error(`Managed Agent session error: ${event.error || 'Unknown'}`);
      }
    }
  } catch (err) {
    logger.error('Website build failed', { sessionId: session.id, error: err.message });
    if (orgId) {
      await postProgress(orgId,
        `❌ **Website build failed:** ${err.message}\n\nFalling back to standard task executor.`
      );
    }
    err.sessionId = session.id;
    err.useFallback = true;
    throw err;
  }

  return { sessionId: session.id, output: finalOutput, toolCalls, status: 'complete' };
}

// ── CHECK SESSION STATUS ──────────────────────────────────────────────────────
export async function getSessionStatus(sessionId) {
  const client = getClient();
  try {
    const session = await client.beta.sessions.retrieve(sessionId);
    return {
      sessionId: session.id,
      status: session.status,
      title: session.title,
      createdAt: session.created_at,
      updatedAt: session.updated_at
    };
  } catch (err) {
    logger.error('Failed to retrieve session', { sessionId, error: err.message });
    throw err;
  }
}

// ── STEER A RUNNING SESSION ───────────────────────────────────────────────────
// Send a follow-up instruction to guide Claude mid-build
export async function steerSession(sessionId, message) {
  const client = getClient();
  await client.beta.sessions.events.send(sessionId, {
    events: [{
      type: 'user.message',
      content: [{ type: 'text', text: message }]
    }]
  });
  logger.info('Steering message sent', { sessionId });
  return { sessionId, sent: true };
}

// ── INTERRUPT A BUILD ─────────────────────────────────────────────────────────
export async function interruptSession(sessionId) {
  const client = getClient();
  await client.beta.sessions.events.send(sessionId, {
    events: [{ type: 'user.interrupt' }]
  });
  logger.info('Session interrupted', { sessionId });
  return { sessionId, interrupted: true };
}

// ── CONVENIENCE EXPORT ────────────────────────────────────────────────────────
// Drop-in replacement for claude-website-agent.js runWebsiteTask()
export async function runWebsiteTask(task, context = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY not configured');
    err.useFallback = true;
    throw err;
  }
  if (!process.env.BLOOM_WEBSITE_AGENT_ID) {
    const err = new Error('BLOOM_WEBSITE_AGENT_ID not set — run setup-website-agent.js first');
    err.useFallback = true;
    throw err;
  }
  return runWebsiteBuild(task, { orgId: context.orgId || null });
}
