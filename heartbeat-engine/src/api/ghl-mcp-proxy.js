// BLOOM GHL MCP Proxy — Multi-Tenant
// Route: /ghl-mcp/:orgId
//
// Each org has its own GHL Private Integration Token (PIT) stored in Supabase.
// When the Managed Website Agent calls a GHL tool, it hits /ghl-mcp/{orgId}.
// This proxy looks up that org's PIT from Supabase and injects it before
// forwarding the request to GHL's official MCP server.
//
// NO env vars for PITs — fully multi-tenant via Supabase.
// Each org's Managed Agent is created with its own /ghl-mcp/{orgId} URL.

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('ghl-mcp-proxy');
const router = express.Router();

const GHL_MCP_URL = 'https://services.leadconnectorhq.com/mcp/';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// GHL connector ID — the 'ghl' connector in the connectors table
const GHL_CONNECTOR_ID = 'd2bbdfe4-f1f1-46a5-9084-ab4422766835';

// Cache PIT lookups in memory for 5 minutes to reduce Supabase reads
const pitCache = new Map(); // orgId → { pit, locationId, expiresAt }

async function getPitForOrg(orgId) {
  // Check memory cache first
  const cached = pitCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return { pit: cached.pit, locationId: cached.locationId };
  }

  // Read PIT from user_connectors (same table used by all connectors)
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_connectors')
    .select('api_key, external_account_id')
    .eq('connector_id', GHL_CONNECTOR_ID)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data?.api_key) {
    throw new Error(
      `No GHL credentials found for org ${orgId}. ` +
      `Please connect your GHL account in Settings → Integrations.`
    );
  }

  // Cache for 5 minutes
  pitCache.set(orgId, {
    pit: data.api_key,
    locationId: data.external_account_id,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  return { pit: data.api_key, locationId: data.external_account_id };
}

// ── POST /ghl-mcp/:orgId — forward MCP request with org's PIT injected ────────
router.post('/:orgId', async (req, res) => {
  const { orgId } = req.params;

  if (!orgId) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: { code: -32000, message: 'orgId is required in URL: /ghl-mcp/{orgId}' }
    });
  }

  let pit, locationId;
  try {
    ({ pit, locationId } = await getPitForOrg(orgId));
  } catch (err) {
    logger.error('GHL credential lookup failed', { orgId, error: err.message });
    return res.status(403).json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: { code: -32000, message: `GHL credentials not configured for this organization: ${err.message}` }
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

    if (req.body?.method === 'tools/call') {
      logger.info('GHL tool call proxied', {
        orgId,
        tool: req.body?.params?.name,
        status: response.status
      });
    }

    return res.status(response.status).json(data);

  } catch (err) {
    logger.error('GHL MCP proxy error', { orgId, error: err.message });
    return res.json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: { code: -32000, message: `GHL MCP proxy error: ${err.message}` }
    });
  }
});

// ── GET /ghl-mcp/:orgId — health check ───────────────────────────────────────
router.get('/:orgId', async (req, res) => {
  const { orgId } = req.params;
  const bloomUrl = process.env.BLOOM_APP_URL || 'https://autonomous-sarah-rodriguez-production.up.railway.app';

  let credStatus = 'unchecked';
  try {
    await getPitForOrg(orgId);
    credStatus = 'configured';
  } catch {
    credStatus = 'missing — add to organization_ghl_credentials table';
  }

  res.json({
    name: 'bloom-ghl-mcp-proxy',
    version: '2.0.0',
    status: 'ok',
    orgId,
    credentials: credStatus,
    forwards_to: GHL_MCP_URL,
    connector_url: `${bloomUrl}/ghl-mcp/${orgId}`
  });
});

// ── GET /ghl-mcp — base health check ─────────────────────────────────────────
router.get('/', (req, res) => {
  res.json({
    name: 'bloom-ghl-mcp-proxy',
    version: '2.0.0',
    status: 'ok',
    usage: 'GET/POST /ghl-mcp/{orgId}',
    note: 'Each org has its own PIT stored in organization_ghl_credentials (Supabase). No env vars for PITs.'
  });
});

export default router;
