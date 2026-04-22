// BLOOM GHL MCP Proxy
// The Anthropic Managed Agents API does not support custom headers in mcp_servers config.
// This proxy sits between the Managed Agent and GHL's official MCP server,
// injecting the Private Integration Token (PIT) and locationId before forwarding.
//
// Connector URL for Managed Agent: https://your-railway-url.up.railway.app/ghl-mcp
// Forwards to: https://services.leadconnectorhq.com/mcp/

import express from 'express';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('ghl-mcp-proxy');
const router = express.Router();

const GHL_MCP_URL = 'https://services.leadconnectorhq.com/mcp/';

// ── Forward any MCP request to GHL with auth injected ────────────────────────
router.post('/', async (req, res) => {
  const pit = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!pit) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: { code: -32000, message: 'GHL_PRIVATE_INTEGRATION_TOKEN not configured' }
    });
  }

  try {
    const response = await fetch(GHL_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pit}`,
        ...(locationId ? { 'locationId': locationId } : {})
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    // Log tool calls for debugging (skip tools/list to reduce noise)
    if (req.body?.method === 'tools/call') {
      logger.info('GHL tool call forwarded', {
        tool: req.body?.params?.name,
        status: response.status
      });
    }

    return res.status(response.status).json(data);

  } catch (err) {
    logger.error('GHL MCP proxy error', { error: err.message });
    return res.json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: { code: -32000, message: `GHL MCP proxy error: ${err.message}` }
    });
  }
});

// GET health check
router.get('/', (req, res) => {
  res.json({
    name: 'bloom-ghl-mcp-proxy',
    version: '1.0.0',
    status: 'ok',
    forwards_to: GHL_MCP_URL,
    auth: 'PIT injected server-side',
    connector_url: `${process.env.BLOOM_APP_URL || 'https://autonomous-sarah-rodriguez-production.up.railway.app'}/ghl-mcp`
  });
});

export default router;
