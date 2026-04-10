// BLOOM Comms MCP Server
// Exposes communication tools to Cowork (and any MCP client) via Streamable HTTP.
// Add to Cowork: Customize → Connectors → + → paste your Railway URL + /comms-mcp
// Connector URL: https://autonomous-sarah-rodriguez-production.up.railway.app/comms-mcp
//
// HARD LIMITS (enforced in code):
//   - NEVER impersonate a Bloomie by name
//   - NEVER post to a different org than calling context
//   - NEVER post as the client
//   - NEVER edit already-posted messages
//   - NEVER access operator_channel from non-admin (requires MCP_ADMIN_SECRET header)

import express from 'express';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('comms-mcp-server');
const router = express.Router();

// ── Bloomie name denylist — cannot be used as sender_label ───────────────────
// Prevents impersonation of named agents in any write tool
const BLOOMIE_NAMES = [
  'sarah', 'sarah rodriguez', 'sarah-rodriguez',
  'marcus', 'marcus chen', 'marcus-chen',
  'alex', 'alex kim', 'alex-kim',
  'bloom', 'bloomie',
];

function isBloomieImpersonation(label) {
  if (!label) return false;
  const lower = label.toLowerCase().trim();
  return BLOOMIE_NAMES.some(name => lower === name || lower.startsWith(name + ' ') || lower.endsWith(' ' + name));
}

// ── Supabase client ──────────────────────────────────────────────────────────
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

// ── Auth middleware ──────────────────────────────────────────────────────────
// Same pattern as mcp.js — IP allowlist in production via Anthropic infra.
// MCP_API_KEY is optional and only checked in dev.
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

// ── Admin secret check (for operator_channel access) ────────────────────────
function isAdminRequest(args) {
  const adminSecret = process.env.MCP_ADMIN_SECRET;
  if (!adminSecret) return true; // No secret configured — open (Railway env should set this)
  return args.admin_secret === adminSecret;
}

// ── Tool registry ─────────────────────────────────────────────────────────────
const TOOLS = [
  // ─ READ TOOLS ──────────────────────────────────────────────────────────────
  {
    name: 'bloom_get_conversation',
    description: 'Read messages from a specific conversation thread (session). Use to review what has been said in a live chat.',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string', description: 'UUID of the session/conversation to read' },
        org_id: { type: 'string', description: 'Organization ID — must match the session org' },
        limit: { type: 'number', default: 50, description: 'Max messages to return (1–100, default 50)' }
      },
      required: ['conversation_id', 'org_id']
    }
  },
  {
    name: 'bloom_list_active_conversations',
    description: 'List active conversation sessions for an org. Optionally filter by agent or status.',
    inputSchema: {
      type: 'object',
      properties: {
        org_id: { type: 'string', description: 'Organization ID' },
        agent_id: { type: 'string', description: 'Filter by agent UUID (optional)' },
        status: { type: 'string', enum: ['active', 'closed', 'all'], default: 'active', description: 'Session status filter' },
        limit: { type: 'number', default: 20, description: 'Max sessions to return (1–50)' }
      },
      required: ['org_id']
    }
  },
  {
    name: 'bloom_get_agent_status',
    description: 'Get the current status, role, and task context for a specific Bloomie agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'UUID of the agent' },
        org_id: { type: 'string', description: 'Organization ID — must match the agent org' }
      },
      required: ['agent_id', 'org_id']
    }
  },
  {
    name: 'bloom_get_operator_history',
    description: 'Read messages from the operator_channel table. ADMIN ONLY — requires admin_secret.',
    inputSchema: {
      type: 'object',
      properties: {
        org_id: { type: 'string', description: 'Organization ID' },
        limit: { type: 'number', default: 30, description: 'Max messages to return (1–100)' },
        before: { type: 'string', description: 'ISO timestamp — return messages before this time (for pagination)' },
        admin_secret: { type: 'string', description: 'MCP_ADMIN_SECRET — required for operator_channel access' }
      },
      required: ['org_id', 'admin_secret']
    }
  },
  // ─ WRITE TOOLS ─────────────────────────────────────────────────────────────
  {
    name: 'bloom_post_to_chat',
    description: `Post a message into a live conversation thread. Use to inject a system note, update, or alert into an active session.

LIMITS: Cannot impersonate a Bloomie by name. Cannot post as sender_type "client". Cannot edit existing messages.`,
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string', description: 'UUID of the session to post into' },
        org_id: { type: 'string', description: 'Organization ID — must match the session org' },
        content: { type: 'string', description: 'Message content to post (max 10000 chars)' },
        sender_label: { type: 'string', description: 'Display name for the message sender (e.g. "BLOOM System", "Cowork")' },
        sender_type: { type: 'string', enum: ['claude', 'system', 'operator'], default: 'system', description: 'Type of sender — cannot be "client"' },
        notify_agent: { type: 'boolean', default: false, description: 'If true, broadcasts SSE event to notify active dashboard listeners' }
      },
      required: ['conversation_id', 'org_id', 'content', 'sender_label']
    }
  },
  {
    name: 'bloom_post_to_conference',
    description: `Broadcast a message to the org-wide conference channel (PM Mode / standup feed).

LIMITS: Cannot impersonate a Bloomie by name. Cannot post as sender_type "client".`,
    inputSchema: {
      type: 'object',
      properties: {
        org_id: { type: 'string', description: 'Organization ID' },
        content: { type: 'string', description: 'Message content (max 10000 chars)' },
        sender_label: { type: 'string', description: 'Display name (e.g. "Cowork", "BLOOM Ops", "Claude PM")' },
        message_type: { type: 'string', enum: ['message', 'alert', 'standup', 'update'], default: 'message', description: 'Type of conference message' },
        action_items: { type: 'array', items: { type: 'string' }, description: 'Optional list of action items appended to the message in the metadata' }
      },
      required: ['org_id', 'content', 'sender_label']
    }
  },
  {
    name: 'bloom_post_to_operator',
    description: `Post a message to the operator_channel (private operator log). ADMIN ONLY — requires admin_secret.

LIMITS: role must be "operator" or "claude". Cannot edit existing messages.`,
    inputSchema: {
      type: 'object',
      properties: {
        org_id: { type: 'string', description: 'Organization ID' },
        content: { type: 'string', description: 'Message content (max 10000 chars)' },
        role: { type: 'string', enum: ['operator', 'claude'], default: 'claude', description: 'Sender role — operator or claude' },
        admin_secret: { type: 'string', description: 'MCP_ADMIN_SECRET — required for operator_channel access' }
      },
      required: ['org_id', 'content', 'role', 'admin_secret']
    }
  },
  {
    name: 'bloom_send_agent_instruction',
    description: `Send a directive to a specific Bloomie agent by posting an instruction message into their active session.
If no active session exists for this agent in the org, a new instruction session is created.

LIMITS: Cannot impersonate a Bloomie. Instruction is posted as a system-level message, not as the agent itself.`,
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'UUID of the target agent' },
        org_id: { type: 'string', description: 'Organization ID — must match the agent org' },
        instruction: { type: 'string', description: 'The directive or instruction to send to the agent (max 5000 chars)' },
        priority: { type: 'string', enum: ['normal', 'high', 'urgent'], default: 'normal', description: 'Priority level — annotated in the message metadata' },
        context: { type: 'string', description: 'Optional background context to include with the instruction' }
      },
      required: ['agent_id', 'org_id', 'instruction']
    }
  }
];

// ── Tool executor ──────────────────────────────────────────────────────────────
async function executeTool(name, args) {
  const supabase = getSupabase();

  // ── bloom_get_conversation ──────────────────────────────────────────────────
  if (name === 'bloom_get_conversation') {
    const { conversation_id, org_id, limit = 50 } = args;

    // Verify the session belongs to this org
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, agent_id, status, title, org_id')
      .eq('id', conversation_id)
      .single();

    if (sessionErr || !session) throw new Error(`Conversation not found: ${conversation_id}`);
    if (session.org_id !== org_id) throw new Error('Forbidden: org_id mismatch');

    const { data, error } = await supabase
      .from('messages')
      .select('id, session_id, role, content, created_at, metadata')
      .eq('session_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(Math.min(Math.max(1, parseInt(limit) || 50), 100));

    if (error) throw new Error(`Failed to load conversation: ${error.message}`);

    return {
      conversation_id,
      org_id,
      session: { title: session.title, status: session.status, agent_id: session.agent_id },
      messages: data || [],
      count: (data || []).length
    };
  }

  // ── bloom_list_active_conversations ────────────────────────────────────────
  if (name === 'bloom_list_active_conversations') {
    const { org_id, agent_id, status = 'active', limit = 20 } = args;

    let query = supabase
      .from('sessions')
      .select('id, agent_id, title, last_message_at, message_count, updated_at, created_at')
      .eq('org_id', org_id)
      .order('last_message_at', { ascending: false })
      .limit(Math.min(Math.max(1, parseInt(limit) || 20), 50));

    // sessions has no status column — use recency of last_message_at as a proxy
    if (status !== 'all') {
      // 'active' = last message within 30 days
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('last_message_at', cutoff);
    }
    if (agent_id) query = query.eq('agent_id', agent_id);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list conversations: ${error.message}`);

    return { org_id, sessions: data || [], count: (data || []).length };
  }

  // ── bloom_get_agent_status ─────────────────────────────────────────────────
  if (name === 'bloom_get_agent_status') {
    const { agent_id, org_id } = args;

    const AGENT_SELECT = 'id, name, slug, role, status, autonomy_level, organization_id';

    // Try exact UUID match first, then slug, then name (to support partial IDs and slugs)
    let data = null;

    const byId = await supabase.from('agents').select(AGENT_SELECT).eq('id', agent_id).maybeSingle();
    if (byId.data) {
      data = byId.data;
    } else {
      const bySlug = await supabase.from('agents').select(AGENT_SELECT).eq('slug', agent_id).maybeSingle();
      if (bySlug.data) {
        data = bySlug.data;
      } else {
        const byName = await supabase.from('agents').select(AGENT_SELECT).ilike('name', agent_id).maybeSingle();
        if (byName.data) data = byName.data;
      }
    }

    if (!data) throw new Error(`Agent not found: ${agent_id}`);
    if (data.organization_id !== org_id) throw new Error('Forbidden: org_id mismatch');

    return {
      agent_id: data.id,
      name: data.name,
      slug: data.slug,
      role: data.role,
      status: data.status || 'unknown',
      autonomy_level: data.autonomy_level
    };
  }

  // ── bloom_get_operator_history ─────────────────────────────────────────────
  if (name === 'bloom_get_operator_history') {
    if (!isAdminRequest(args)) {
      throw new Error('Forbidden: operator_channel requires admin_secret');
    }

    const { org_id, limit = 30, before } = args;

    let query = supabase
      .from('operator_channel')
      .select('id, org_id, content, role, metadata, created_at')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(1, parseInt(limit) || 30), 100));

    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to read operator_channel: ${error.message}`);

    return {
      org_id,
      messages: (data || []).reverse(),
      count: (data || []).length
    };
  }

  // ── bloom_post_to_chat ─────────────────────────────────────────────────────
  if (name === 'bloom_post_to_chat') {
    const { conversation_id, org_id, content, sender_label, sender_type = 'system', notify_agent = false } = args;

    // Hard limits
    if (isBloomieImpersonation(sender_label)) {
      throw new Error(`Forbidden: sender_label "${sender_label}" impersonates a Bloomie agent`);
    }
    if (sender_type === 'client') {
      throw new Error('Forbidden: cannot post as sender_type "client"');
    }
    if (!content || content.length > 10000) {
      throw new Error('content is required and must be ≤ 10000 characters');
    }

    // Verify session belongs to org
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, org_id, status')
      .eq('id', conversation_id)
      .single();

    if (sessionErr || !session) throw new Error(`Conversation not found: ${conversation_id}`);
    if (session.org_id !== org_id) throw new Error('Forbidden: org_id mismatch');

    const { data, error } = await supabase
      .from('messages')
      .insert({
        session_id: conversation_id,
        org_id,
        role: 'system',
        content,
        metadata: {
          sender_label,
          sender_type,
          source: 'bloom-comms-mcp'
        }
      })
      .select('id, created_at')
      .single();

    if (error) throw new Error(`Failed to post to chat: ${error.message}`);

    // Broadcast SSE notification if requested
    if (notify_agent) {
      try {
        const { broadcastToClients } = await import('./events.js');
        broadcastToClients?.('new_message', { session_id: conversation_id, org_id });
      } catch (sseErr) {
        logger.warn('SSE broadcast failed (non-fatal):', sseErr.message);
      }
    }

    logger.info('Posted to chat session', { conversation_id, org_id, sender_label, sender_type });
    return { success: true, id: data.id, created_at: data.created_at, conversation_id };
  }

  // ── bloom_post_to_conference ───────────────────────────────────────────────
  if (name === 'bloom_post_to_conference') {
    const { org_id, content, sender_label, message_type = 'message', action_items } = args;

    // Hard limits
    if (isBloomieImpersonation(sender_label)) {
      throw new Error(`Forbidden: sender_label "${sender_label}" impersonates a Bloomie agent`);
    }
    if (!content || content.length > 10000) {
      throw new Error('content is required and must be ≤ 10000 characters');
    }

    const metadata = {
      sender_label,
      source: 'bloom-comms-mcp',
      posted_at: new Date().toISOString()
    };
    if (action_items && Array.isArray(action_items) && action_items.length > 0) {
      metadata.action_items = action_items;
    }

    const { data, error } = await supabase
      .from('conference_messages')
      .insert({
        org_id,
        role: 'assistant',
        content,
        sender_type: 'claude',
        message_type,
        metadata
      })
      .select('id, created_at')
      .single();

    if (error) throw new Error(`Failed to post to conference: ${error.message}`);

    logger.info('Posted to conference channel', { org_id, sender_label, message_type });
    return { success: true, id: data.id, created_at: data.created_at, org_id };
  }

  // ── bloom_post_to_operator ─────────────────────────────────────────────────
  if (name === 'bloom_post_to_operator') {
    if (!isAdminRequest(args)) {
      throw new Error('Forbidden: operator_channel requires admin_secret');
    }

    const { org_id, content, role = 'claude' } = args;

    if (!['operator', 'claude'].includes(role)) {
      throw new Error('role must be "operator" or "claude"');
    }
    if (!content || content.length > 10000) {
      throw new Error('content is required and must be ≤ 10000 characters');
    }

    const { data, error } = await supabase
      .from('operator_channel')
      .insert({
        org_id,
        content,
        role,
        metadata: { source: 'bloom-comms-mcp', posted_at: new Date().toISOString() }
      })
      .select('id, created_at')
      .single();

    if (error) throw new Error(`Failed to post to operator_channel: ${error.message}`);

    logger.info('Posted to operator_channel', { org_id, role });
    return { success: true, id: data.id, created_at: data.created_at, org_id };
  }

  // ── bloom_send_agent_instruction ───────────────────────────────────────────
  if (name === 'bloom_send_agent_instruction') {
    const { agent_id, org_id, instruction, priority = 'normal', context: ctx } = args;

    if (!instruction || instruction.length > 5000) {
      throw new Error('instruction is required and must be ≤ 5000 characters');
    }

    // Verify agent belongs to org
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, organization_id')
      .eq('id', agent_id)
      .single();

    if (agentErr || !agent) throw new Error(`Agent not found: ${agent_id}`);
    if (agent.organization_id !== org_id) throw new Error('Forbidden: org_id mismatch');

    // Find most recent active session for this agent in this org
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('agent_id', agent_id)
      .eq('org_id', org_id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1);

    let sessionId;

    if (sessions && sessions.length > 0) {
      sessionId = sessions[0].id;
    } else {
      // Create a new instruction session
      const { data: newSession, error: newSessionErr } = await supabase
        .from('sessions')
        .insert({
          agent_id,
          org_id,
          status: 'active',
          title: `[Cowork Instruction] ${new Date().toISOString().slice(0, 16)}`
        })
        .select('id')
        .single();

      if (newSessionErr || !newSession) {
        throw new Error(`Failed to create instruction session: ${newSessionErr?.message}`);
      }
      sessionId = newSession.id;
    }

    // Build instruction content
    const priorityPrefix = priority !== 'normal' ? `[${priority.toUpperCase()} PRIORITY] ` : '';
    const fullContent = ctx
      ? `${priorityPrefix}${instruction}\n\n**Context:** ${ctx}`
      : `${priorityPrefix}${instruction}`;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        session_id: sessionId,
        org_id,
        role: 'system',
        content: fullContent,
        metadata: {
          sender_label: 'Cowork — Agent Instruction',
          sender_type: 'system',
          source: 'bloom-comms-mcp-instruction',
          priority,
          agent_id,
          issued_at: new Date().toISOString()
        }
      })
      .select('id, created_at')
      .single();

    if (error) throw new Error(`Failed to send agent instruction: ${error.message}`);

    // SSE broadcast so agent session picks up the message
    try {
      const { broadcastToClients } = await import('./events.js');
      broadcastToClients?.('new_message', { session_id: sessionId, org_id });
    } catch (sseErr) {
      logger.warn('SSE broadcast failed (non-fatal):', sseErr.message);
    }

    logger.info('Agent instruction sent', { agent_id, org_id, priority, session_id: sessionId });
    return {
      success: true,
      id: data.id,
      created_at: data.created_at,
      session_id: sessionId,
      agent_id,
      priority
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ── Express route — POST /comms-mcp ──────────────────────────────────────────
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
          serverInfo: { name: 'bloom-comms-mcp-server', version: '1.0.0' }
        }
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
        result: { tools: TOOLS }
      });
    }

    // tools/call
    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      const result = await executeTool(name, args || {});
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        }
      });
    }

    // Unknown method
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });

  } catch (err) {
    logger.error('Comms MCP tool error:', err);
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: err.message }
    });
  }
});

// GET /comms-mcp — health check
router.get('/', (req, res) => {
  res.json({
    name: 'bloom-comms-mcp-server',
    version: '1.0.0',
    status: 'ok',
    tools: TOOLS.map(t => t.name),
    auth: 'none',
    connector_url: 'https://autonomous-sarah-rodriguez-production.up.railway.app/comms-mcp'
  });
});

export default router;
