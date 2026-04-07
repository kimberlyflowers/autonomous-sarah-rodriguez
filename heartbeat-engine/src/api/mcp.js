// BLOOM MCP Server
// Exposes tech ticket tools to Cowork (and any MCP client) via Streamable HTTP.
// Add to Cowork: Customize → Connectors → + → paste your Railway URL + /mcp
// Auth: set MCP_API_KEY in Railway env vars, then paste the same key into Cowork connector settings.

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('mcp-server');
const router = express.Router();

// ── Supabase client ──────────────────────────────────────────────────────────
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

// ── Auth middleware ──────────────────────────────────────────────────────────
// Cowork sends the key as Bearer token or x-api-key header.
// Set MCP_API_KEY in Railway env vars. If not set, the endpoint is open (dev only).
function authMiddleware(req, res, next) {
  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey) return next(); // no key configured = open

  const authHeader = req.headers['authorization'] || '';
  const keyHeader = req.headers['x-api-key'] || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : keyHeader;

  if (provided !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized — invalid MCP_API_KEY' });
  }
  next();
}

// ── Build the MCP server (one per process, shared across requests) ───────────
function buildMcpServer() {
  const server = new McpServer({
    name: 'bloom-mcp-server',
    version: '1.0.0'
  });

  // ── Tool: bloom_get_tickets ────────────────────────────────────────────────
  server.registerTool(
    'bloom_get_tickets',
    {
      title: 'Get BLOOM Tech Tickets',
      description: `List tech tickets filed by BLOOM agents (Bloomies).
Use this to see what's broken, what needs fixing, or what has been resolved.

Args:
  - status ('open' | 'in_progress' | 'resolved' | 'wont_fix' | 'all'): Filter by status (default: 'open')
  - severity ('critical' | 'high' | 'medium' | 'low' | 'all'): Filter by severity (default: 'all')
  - limit (number): Max results to return, 1-50 (default: 20)

Returns: Array of tickets with id, title, description, severity, status, reported_by, affected_task, error_message, created_at`,
      inputSchema: {
        status: z.enum(['open', 'in_progress', 'resolved', 'wont_fix', 'all']).default('open')
          .describe("Filter by ticket status. Use 'all' to see everything."),
        severity: z.enum(['critical', 'high', 'medium', 'low', 'all']).default('all')
          .describe("Filter by severity level."),
        limit: z.number().int().min(1).max(50).default(20)
          .describe("Max number of tickets to return.")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ status, severity, limit }) => {
      const supabase = getSupabase();
      let query = supabase
        .from('tech_tickets')
        .select('id, title, description, severity, category, status, reported_by, affected_task, error_message, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status !== 'all') query = query.eq('status', status);
      if (severity !== 'all') query = query.eq('severity', severity);

      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch tickets: ${error.message}`);

      const tickets = data || [];
      if (!tickets.length) {
        return { content: [{ type: 'text', text: `No tickets found (status=${status}, severity=${severity})` }] };
      }

      const output = tickets.map(t => ({
        id: t.id,
        title: t.title,
        severity: t.severity,
        status: t.status,
        category: t.category,
        reported_by: t.reported_by,
        affected_task: t.affected_task || null,
        error_message: t.error_message || null,
        description: t.description,
        created_at: t.created_at,
        age_minutes: Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000)
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: { tickets: output, count: output.length }
      };
    }
  );

  // ── Tool: bloom_get_ticket_detail ──────────────────────────────────────────
  server.registerTool(
    'bloom_get_ticket_detail',
    {
      title: 'Get BLOOM Ticket Detail',
      description: `Get full detail for a specific tech ticket by ID, including resolution notes if resolved.

Args:
  - ticket_id (string): UUID of the ticket

Returns: Full ticket object including description, error_message, resolution, resolved_by, resolved_at`,
      inputSchema: {
        ticket_id: z.string().uuid().describe('UUID of the tech ticket to retrieve')
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ ticket_id }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('tech_tickets')
        .select('*')
        .eq('id', ticket_id)
        .single();

      if (error || !data) {
        throw new Error(`Ticket not found: ${ticket_id}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data
      };
    }
  );

  // ── Tool: bloom_create_ticket ──────────────────────────────────────────────
  server.registerTool(
    'bloom_create_ticket',
    {
      title: 'Create BLOOM Tech Ticket',
      description: `File a new tech ticket for a BLOOM system issue. Use this when you spot a bug, broken tool, failed integration, or anything that needs a fix.

Args:
  - title (string): Short summary of the issue (max 200 chars)
  - description (string): Full description of what happened and what was expected
  - severity ('critical' | 'high' | 'medium' | 'low'): How urgent is this?
    - critical = system is down or Bloomie can't function
    - high = major feature broken, workaround exists
    - medium = annoying but Bloomie can continue
    - low = minor issue, cosmetic, or nice-to-have fix
  - category ('bug' | 'tool_failure' | 'integration' | 'performance' | 'config' | 'other')
  - reported_by (string): Agent name or ID filing the ticket (e.g. 'sarah-rodriguez', 'marcus-chen')
  - affected_task (string, optional): Name of the scheduled task that was running when issue occurred
  - error_message (string, optional): Raw error text if available

Returns: Created ticket with id you can reference for updates`,
      inputSchema: {
        title: z.string().min(5).max(200).describe('Short description of the issue'),
        description: z.string().min(10).describe('Full details: what happened, what was expected, reproduction steps if known'),
        severity: z.enum(['critical', 'high', 'medium', 'low']).describe('Urgency level'),
        category: z.enum(['bug', 'tool_failure', 'integration', 'performance', 'config', 'other']).default('bug'),
        reported_by: z.string().describe('Agent ID or name filing this ticket'),
        affected_task: z.string().optional().describe('Scheduled task name that was running, if applicable'),
        error_message: z.string().optional().describe('Raw error message or stack trace snippet')
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async ({ title, description, severity, category, reported_by, affected_task, error_message }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('tech_tickets')
        .insert({
          title,
          description,
          severity,
          category,
          reported_by,
          affected_task: affected_task || null,
          error_message: error_message || null,
          status: 'open'
        })
        .select('id, title, severity, status, created_at')
        .single();

      if (error) throw new Error(`Failed to create ticket: ${error.message}`);

      logger.info('Tech ticket created', { id: data.id, title, severity, reported_by });

      return {
        content: [{ type: 'text', text: `Ticket created: ${data.id}\nTitle: ${data.title}\nSeverity: ${data.severity}\nStatus: open` }],
        structuredContent: data
      };
    }
  );

  // ── Tool: bloom_resolve_ticket ─────────────────────────────────────────────
  server.registerTool(
    'bloom_resolve_ticket',
    {
      title: 'Resolve BLOOM Tech Ticket',
      description: `Mark a tech ticket as resolved and record how it was fixed. Call this after you've fixed the issue in the codebase or config.

Args:
  - ticket_id (string): UUID of the ticket to resolve
  - resolution (string): What you did to fix it — be specific so Bloomies learn from this
  - resolved_by (string): Who fixed it (e.g. 'cowork', 'kimberly', 'claude')
  - status ('resolved' | 'wont_fix'): Use 'wont_fix' if it's not worth addressing

Returns: Updated ticket confirming resolution`,
      inputSchema: {
        ticket_id: z.string().uuid().describe('UUID of the ticket to resolve'),
        resolution: z.string().min(10).describe('Description of what was done to fix the issue'),
        resolved_by: z.string().describe("Who fixed it — e.g. 'cowork', 'kimberly', 'claude'"),
        status: z.enum(['resolved', 'wont_fix']).default('resolved')
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ ticket_id, resolution, resolved_by, status }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('tech_tickets')
        .update({
          status,
          resolution,
          resolved_by,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', ticket_id)
        .select('id, title, status, resolved_by, resolved_at')
        .single();

      if (error || !data) throw new Error(`Failed to resolve ticket ${ticket_id}: ${error?.message}`);

      logger.info('Tech ticket resolved', { id: ticket_id, resolved_by, status });

      return {
        content: [{ type: 'text', text: `Ticket ${data.id} marked as ${status}.\nResolved by: ${resolved_by}\nResolution: ${resolution}` }],
        structuredContent: data
      };
    }
  );

  // ── Tool: bloom_update_ticket_status ──────────────────────────────────────
  server.registerTool(
    'bloom_update_ticket_status',
    {
      title: 'Update BLOOM Ticket Status',
      description: `Update the status of a ticket as you work on it (e.g., mark it in_progress so Bloomies know it's being handled).

Args:
  - ticket_id (string): UUID of the ticket
  - status ('open' | 'in_progress'): New status
  - note (string, optional): Optional note about current progress

Returns: Confirmation of status change`,
      inputSchema: {
        ticket_id: z.string().uuid().describe('UUID of the ticket to update'),
        status: z.enum(['open', 'in_progress']).describe('New status'),
        note: z.string().optional().describe('Optional progress note appended to description')
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ ticket_id, status, note }) => {
      const supabase = getSupabase();

      const updatePayload = {
        status,
        updated_at: new Date().toISOString()
      };

      if (note) {
        // Append note to description
        const { data: existing } = await supabase
          .from('tech_tickets')
          .select('description')
          .eq('id', ticket_id)
          .single();
        if (existing) {
          updatePayload.description = `${existing.description}\n\n[Update ${new Date().toISOString()}]: ${note}`;
        }
      }

      const { data, error } = await supabase
        .from('tech_tickets')
        .update(updatePayload)
        .eq('id', ticket_id)
        .select('id, title, status, updated_at')
        .single();

      if (error || !data) throw new Error(`Failed to update ticket ${ticket_id}: ${error?.message}`);

      return {
        content: [{ type: 'text', text: `Ticket ${data.id} status → ${status}${note ? `\nNote: ${note}` : ''}` }],
        structuredContent: data
      };
    }
  );

  return server;
}

const mcpServer = buildMcpServer();

// ── Express route — POST /mcp ────────────────────────────────────────────────
// Stateless: new transport per request as required by Streamable HTTP spec.
// Force-set Accept header so the SDK doesn't reject Cowork's requests.
router.post('/', authMiddleware, async (req, res) => {
  try {
    // The MCP SDK requires Accept: application/json, text/event-stream.
    // Cowork (and some other clients) don't always send this — patch it in.
    if (!req.headers['accept'] || !req.headers['accept'].includes('text/event-stream')) {
      req.headers['accept'] = 'application/json, text/event-stream';
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true
    });
    res.on('close', () => transport.close());
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP server error', message: err.message });
    }
  }
});

// GET /mcp — health check so Cowork can verify the endpoint is reachable
router.get('/', (req, res) => {
  res.json({
    name: 'bloom-mcp-server',
    version: '1.0.0',
    status: 'ok',
    tools: ['bloom_get_tickets', 'bloom_get_ticket_detail', 'bloom_create_ticket', 'bloom_resolve_ticket', 'bloom_update_ticket_status'],
    auth: process.env.MCP_API_KEY ? 'api-key-required' : 'open'
  });
});

export default router;
