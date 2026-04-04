// BLOOM Heartbeat Engine - Main Entry Point
// Autonomous agent infrastructure for BLOOM Staffing

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logging/logger.js';
import { runHeartbeat } from './heartbeat.js';
import { loadAgentConfig } from './config/agent-profile.js';
import { cronSchedules } from './config/cron-schedules.js';
import { testDatabaseConnection } from './database/auto-setup.js';
import { testLettaConnection } from './memory/letta-client.js';
import { ensureDatabaseExists } from './database/auto-setup.js';
import dashboardRoutes from './api/dashboard.js';
import filesRoutes from './api/files.js';
import agentRoutes from './api/agent.js';
import chatRoutes from './api/chat.js';
import eventRoutes from './api/events.js';
import executeRoutes from './api/execute.js';
import browserRoutes from './api/browser.js';
import skillsRoutes from './api/skills.js';
import voiceRoutes from './api/voice.js';
import desktopRoutes from './api/desktop.js';import mobileRoutes from './api/mobile.js';import projectsRoutes from './api/projects-supabase.js'; // Supabase-based projects
import adminRoutes from './api/admin.js';
import cookieParser from 'cookie-parser';

import { createClient } from '@supabase/supabase-js';

// Get the current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('heartbeat-engine');
const app = express();
const PORT = process.env.PORT || 3000;

// Top-level Supabase client for API routes
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// Security middleware — allow external images (GHL logos, Supabase CDN, etc)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "wss:"],
      frameSrc: ["'self'", "blob:", "data:"],
    }
  }
}));
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// Increase max listeners — Winston registers listeners per logger instance,
// and we have many route modules each calling createLogger() at load time.
process.setMaxListeners(25);

// Global error handler - log but don't crash the web service
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception (non-fatal):', error);
  // Don't exit - let the service continue running for health checks
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection (non-fatal):', error);
  // Don't exit - let the service continue running for health checks
});

// Health check endpoint - always returns 200 OK for Railway
// Active connectors for an org — used by dashboard + menu
app.get('/api/connectors/active', async (req, res) => {
  try {
    // Resolve org from JWT first, fall back to query param for backward compat
    const { getUserOrgId } = await import('./api/org-boundary.js');
    const orgId = await getUserOrgId(req) || req.query.orgId;
    if (!orgId) return res.json({ connectors: [] });
    const { data, error } = await supabase
      .from('user_connectors')
      .select('connector_id, connectors(slug, name)')
      .eq('organization_id', orgId)
      .eq('status', 'active');
    if (error) return res.json({ connectors: [] });
    const connectors = (data || []).map(r => ({
      slug: r.connectors?.slug,
      name: r.connectors?.name,
    })).filter(r => r.slug);
    res.json({ connectors });
  } catch (e) {
    res.json({ connectors: [] });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'heartbeat-engine',
    agent: {
      id: process.env.AGENT_ID || 'bloomie-sarah-rodriguez',
      name: process.env.AGENT_NAME || 'Sarah Rodriguez'
    }
  });
});

// Model status — shows current LLM model, provider, available models, and failover chain
app.get('/model-status', async (req, res) => {
  try {
    const { getLLMClient } = await import('./llm/unified-client.js');
    const llm = getLLMClient();
    res.json({
      currentModel: llm.model,
      currentProvider: llm.provider,
      failoverActive: llm.isFailoverActive,
      availableModels: llm.getAvailableModels(),
      providerHealth: llm.getProviderHealth(),
      envVars: {
        LLM_MODEL: process.env.LLM_MODEL || '(not set)',
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '(not set)',
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasDeepSeekKey: !!process.env.DEEPSEEK_API_KEY,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Detailed status endpoint with connection checks
app.get('/status', async (req, res) => {
  try {
    const dbOk = await testDatabaseConnection();
    const lettaOk = await testLettaConnection();

    const status = {
      status: 'running',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'connected' : 'disconnected',
        letta: lettaOk ? 'connected' : 'disconnected',
        heartbeat: 'running'
      },
      agent: {
        id: process.env.AGENT_ID || 'bloomie-sarah-rodriguez',
        name: process.env.AGENT_NAME || 'Sarah Rodriguez'
      }
    };

    res.json(status);
  } catch (error) {
    logger.error('Status check failed:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Image generation diagnostics — test OpenAI + Gemini image API connectivity
app.get('/image-diagnostics', async (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const results = {
    timestamp: new Date().toISOString(),
    config: {
      hasOpenAIKey: !!openaiKey,
      openaiKeyLength: openaiKey.length,
      openaiKeyPrefix: openaiKey ? openaiKey.substring(0, 8) + '...' : 'MISSING',
      openaiKeyHasWhitespace: openaiKey !== openaiKey.trim(),
      hasGeminiKey: !!geminiKey,
      geminiKeyLength: geminiKey.length,
      geminiKeyPrefix: geminiKey ? geminiKey.substring(0, 8) + '...' : 'MISSING',
      geminiKeyHasWhitespace: geminiKey !== geminiKey.trim(),
    },
    tests: {}
  };

  // Test 1: OpenAI API key validity (models endpoint — lightweight)
  if (openaiKey) {
    try {
      const modelsResp = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${openaiKey.trim()}` },
      });
      if (modelsResp.ok) {
        const modelsData = await modelsResp.json();
        const imageModels = modelsData.data?.filter(m =>
          m.id.includes('image') || m.id.includes('dall-e')
        ).map(m => m.id) || [];
        results.tests.openai_key_valid = true;
        results.tests.openai_image_models = imageModels;
        results.tests.openai_has_image_access = imageModels.length > 0;
      } else {
        const errText = await modelsResp.text();
        results.tests.openai_key_valid = false;
        results.tests.openai_key_error = `${modelsResp.status}: ${errText.substring(0, 300)}`;
      }
    } catch (e) {
      results.tests.openai_key_valid = false;
      results.tests.openai_key_error = e.message;
    }
  } else {
    results.tests.openai_key_valid = false;
    results.tests.openai_key_error = 'OPENAI_API_KEY not set';
  }

  // Test 2: Actually try a tiny image generation (only if key is valid and ?live=true)
  if (req.query.live === 'true' && openaiKey) {
    try {
      const imgResp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey.trim()}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: 'A simple blue circle on a white background',
          n: 1,
          size: '1024x1024',
          quality: 'low',
        }),
      });
      if (imgResp.ok) {
        const imgData = await imgResp.json();
        results.tests.openai_image_gen = {
          success: true,
          hasB64: !!imgData.data?.[0]?.b64_json,
          hasUrl: !!imgData.data?.[0]?.url,
          responseKeys: imgData.data?.[0] ? Object.keys(imgData.data[0]) : [],
          usage: imgData.usage || null,
        };
      } else {
        const errText = await imgResp.text();
        results.tests.openai_image_gen = {
          success: false,
          status: imgResp.status,
          error: errText.substring(0, 500),
        };
      }
    } catch (e) {
      results.tests.openai_image_gen = { success: false, error: e.message };
    }
  }

  // Test 3: Gemini key check
  if (geminiKey) {
    try {
      const gemResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey.trim()}`);
      if (gemResp.ok) {
        results.tests.gemini_key_valid = true;
        const gemData = await gemResp.json();
        const imageModels = gemData.models?.filter(m =>
          m.name?.includes('imagen') || m.supportedGenerationMethods?.includes('generateImages')
        ).map(m => m.name) || [];
        results.tests.gemini_image_models = imageModels;
      } else {
        const errText = await gemResp.text();
        results.tests.gemini_key_valid = false;
        results.tests.gemini_key_error = `${gemResp.status}: ${errText.substring(0, 300)}`;
      }
    } catch (e) {
      results.tests.gemini_key_valid = false;
      results.tests.gemini_key_error = e.message;
    }
  }

  res.json(results);
});

// GHL diagnostics — test API connectivity and blog endpoint
app.get('/ghl-diagnostics', async (req, res) => {
  const { default: axios } = await import('axios');
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const blogId = process.env.GHL_BLOG_ID || 'DHQrtpkQ3Cp7c96FCyDu';
  const results = {
    timestamp: new Date().toISOString(),
    config: {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING',
      locationId: locationId || 'MISSING',
      blogId,
      apiVersion: '2021-07-28'
    },
    tests: {}
  };

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // Test 1: List contacts (most basic GHL endpoint)
  try {
    const r = await axios.get('https://services.leadconnectorhq.com/contacts/', {
      headers, params: { locationId, limit: 1 }, timeout: 10000
    });
    results.tests.contacts = { status: 'OK', httpStatus: r.status };
  } catch (e) {
    results.tests.contacts = { status: 'FAILED', httpStatus: e.response?.status, error: e.response?.data || e.message };
  }

  // Test 2: List blog posts (GET — tests if blog endpoint exists)
  try {
    const r = await axios.get(`https://services.leadconnectorhq.com/blogs/${blogId}/posts`, {
      headers, params: { locationId, limit: 1 }, timeout: 10000
    });
    results.tests.blogList = { status: 'OK', httpStatus: r.status, responseKeys: Object.keys(r.data || {}) };
  } catch (e) {
    results.tests.blogList = { status: 'FAILED', httpStatus: e.response?.status, error: e.response?.data || e.message };
  }

  // Test 3: List email templates
  try {
    const r = await axios.get('https://services.leadconnectorhq.com/emails/builder', {
      headers, params: { locationId, limit: 1 }, timeout: 10000
    });
    results.tests.emailTemplates = { status: 'OK', httpStatus: r.status, responseKeys: Object.keys(r.data || {}) };
  } catch (e) {
    results.tests.emailTemplates = { status: 'FAILED', httpStatus: e.response?.status, error: e.response?.data || e.message };
  }

  // Test 4: Try blog post with newer API version header
  try {
    const r = await axios.get(`https://services.leadconnectorhq.com/blogs/${blogId}/posts`, {
      headers: { ...headers, 'Version': '2021-10-28' },
      params: { locationId, limit: 1 }, timeout: 10000
    });
    results.tests.blogListNewVersion = { status: 'OK', httpStatus: r.status, note: 'Works with Version 2021-10-28' };
  } catch (e) {
    results.tests.blogListNewVersion = { status: 'FAILED', httpStatus: e.response?.status, error: e.response?.data || e.message };
  }

  res.json(results);
});

// Manual heartbeat trigger (for testing)
app.post('/trigger-heartbeat', async (req, res) => {
  try {
    logger.info('Manual heartbeat trigger received');
    const agentConfig = await loadAgentConfig();
    const result = await runHeartbeat(agentConfig, { trigger: 'manual' });

    res.json({
      success: true,
      cycleId: result.cycleId,
      duration: result.duration,
      actions: result.actionsCount,
      rejections: result.rejectionsCount,
      handoffs: result.handoffsCount
    });
  } catch (error) {
    logger.error('Manual heartbeat failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Agent status endpoint
app.get('/agent/status', async (req, res) => {
  try {
    const agentConfig = await loadAgentConfig();
    res.json({
      agent: {
        id: agentConfig.agentId,
        name: agentConfig.name,
        role: agentConfig.role,
        client: agentConfig.client,
        autonomyLevel: agentConfig.currentAutonomyLevel
      },
      lastHeartbeat: agentConfig.lastHeartbeat || null,
      nextScheduled: getNextScheduledHeartbeat()
    });
  } catch (error) {
    logger.error('Agent status check failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook receiver for n8n triggers
app.post('/webhook/trigger', async (req, res) => {
  try {
    const { triggerType, data } = req.body;
    logger.info(`Webhook trigger received: ${triggerType}`, { data });

    const agentConfig = await loadAgentConfig();
    const result = await runHeartbeat(agentConfig, {
      trigger: 'webhook',
      triggerType,
      data
    });

    res.json({
      success: true,
      cycleId: result.cycleId,
      message: 'Heartbeat triggered successfully'
    });
  } catch (error) {
    logger.error('Webhook trigger failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// OAUTH CONNECTOR FLOW
// GET /oauth/connect/:slug  → redirects user to provider's auth page
// GET /oauth/callback/:slug → receives code, saves token, redirects back to dashboard
// ═══════════════════════════════════════════════════════════════
import { buildAuthUrl, handleCallback } from './integrations/oauth.js';

const DASHBOARD_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://autonomous-sarah-rodriguez-production.up.railway.app';

// Step 1 — Start OAuth: dashboard calls this with orgId in query
app.get('/oauth/connect/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const orgId = req.query.orgId || process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
    const userId = req.query.userId || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce';
    const authUrl = buildAuthUrl(slug, orgId, userId);
    logger.info(`OAuth connect: redirecting to ${slug} for org ${orgId}`);
    res.redirect(authUrl);
  } catch (err) {
    logger.error('OAuth connect error:', err);
    res.redirect(`${DASHBOARD_URL}?oauth_error=${encodeURIComponent(err.message)}`);
  }
});

// Step 2 — Callback: provider redirects here with code
app.get('/oauth/callback/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      logger.warn(`OAuth callback error for ${slug}: ${error}`);
      return res.redirect(`${DASHBOARD_URL}?oauth_error=${encodeURIComponent(error)}&slug=${slug}`);
    }

    if (!code || !state) {
      return res.redirect(`${DASHBOARD_URL}?oauth_error=missing_code&slug=${slug}`);
    }

    const result = await handleCallback(slug, code, state);
    logger.info(`✅ OAuth success: ${result.connector}`);

    // Redirect back to dashboard Customize page with success flag
    res.redirect(`${DASHBOARD_URL}?oauth_success=${slug}&connector=${encodeURIComponent(result.connector)}`);
  } catch (err) {
    logger.error('OAuth callback error:', err);
    res.redirect(`${DASHBOARD_URL}?oauth_error=${encodeURIComponent(err.message)}&slug=${req.params.slug}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// GHL INBOUND SMS/EMAIL WEBHOOK
// Receives ALL inbound texts to BLOOM's GHL number.
// Routes each message to the correct Bloomie based on who is texting.
//
// Routing logic:
//   1. Look up incomingContactId in organizations.owner_ghl_contact_id
//   2. Find which org owns that contact → get their agent_id
//   3. Route message to that agent's session
//
// Example:
//   Dad texts in → matches YES School org → routes to Jonathan
//   Kimberly texts in → matches BLOOM org → routes to Sarah
//   Unknown contact → routes to BLOOM default agent (Sarah)
//
// GHL Workflow: Trigger = "Inbound Message" → Webhook POST to:
// https://autonomous-sarah-rodriguez-production.up.railway.app/webhook/ghl-inbound
// ═══════════════════════════════════════════════════════════════
app.post('/webhook/ghl-inbound', async (req, res) => {
  try {
    const body = req.body;

    // Normalize GHL payload — they use different field names depending on trigger type
    const incomingContactId = body.contactId || body.contact_id || body.contact?.id || '';
    const messageText       = body.message || body.body || body.text || body.messageText || '';
    const contactName       = body.contactName || body.contact?.name || 'Unknown';
    const contactPhone      = body.phone || body.contact?.phone || '';

    logger.info('📱 GHL inbound message received', { incomingContactId, contactName, preview: messageText.slice(0, 60) });

    if (!messageText) {
      logger.warn('GHL inbound: no message text found', { body: JSON.stringify(body).slice(0, 200) });
      return res.json({ success: true, skipped: 'no message text' });
    }

    // ── ROUTE TO CORRECT BLOOMIE ──────────────────────────────────────────
    // Look up which org this contact belongs to, then get that org's agent
    let agentId   = process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003'; // default: Sarah
    let orgId     = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
    let agentName = 'Sarah';

    if (incomingContactId) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

        // Find org whose owner matches this contact ID
        const { data: org } = await supabase
          .from('organizations')
          .select('id, name, owner_ghl_contact_id')
          .eq('owner_ghl_contact_id', incomingContactId)
          .single();

        if (org) {
          // Found matching org — get their assigned agent
          const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('organization_id', org.id)
            .single();

          if (agent) {
            agentId   = agent.id;
            agentName = agent.name;
            orgId     = org.id;
            logger.info(`📱 Routed to ${agentName} for org: ${org.name}`, { agentId, orgId });
          }
        } else {
          logger.info('📱 No matching org found for contact — routing to default agent (Sarah)', { incomingContactId });
        }
      } catch (e) {
        logger.warn('📱 Supabase routing lookup failed — using default agent', { error: e.message });
      }
    }

    // ── SEND TO AGENT'S CHAT PIPELINE ─────────────────────────────────────
    // Each owner gets their own persistent SMS session per agent
    const sessionId = `sms-${agentId}-${incomingContactId || contactPhone}`;
    const port      = process.env.PORT || 3000;

    const messageRes = await fetch(`http://localhost:${port}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message:   `[📱 SMS from ${contactName}]: ${messageText}`,
        sessionId,
        agentId,
        orgId,
      }),
    });

    const result = await messageRes.json();

    logger.info('📱 Inbound SMS processed', { 
      agent: agentName, sessionId, 
      responseLength: result.response?.length 
    });

    return res.json({ success: true, sessionId, agent: agentName });

  } catch (error) {
    logger.error('GHL inbound webhook failed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Dashboard API routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/projects', projectsRoutes);

// Chat API routes
app.use('/api/chat', chatRoutes);

// Events API routes (SSE)
app.use('/api/events', eventRoutes);

// Agentic execution API routes
app.use('/api/execute', executeRoutes);
app.use('/api/browser', browserRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/voice', voiceRoutes);

app.use('/api/desktop', desktopRoutes);app.use('/api/mobile', mobileRoutes);// ── PUBLIC SITES — clean URLs for published pages (/p/summer-camp) ──────────
const servePublishedPage = async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data, error } = await supabase
      .from('artifacts')
      .select('name, file_type, content, storage_path')
      .eq('slug', req.params.slug)
      .eq('published', true)
      .maybeSingle();
    if (error || !data) {
      return res.status(404).send(`<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a1a;color:#fff;margin:0"><div style="text-align:center"><h1 style="font-size:48px;margin:0">404</h1><p style="color:#888;margin-top:8px">This page doesn't exist or has been unpublished.</p></div></body></html>`);
    }
    const file = { name: data.name, file_type: data.file_type, content_text: data.content };
    if (file.file_type === 'html' && file.content_text) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(file.content_text);
    }
    if (file.file_type === 'markdown' && file.content_text) {
      const md = file.content_text
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '<br/><br/>')
        .replace(/\n/g, '<br/>');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${file.name}</title><style>body{max-width:800px;margin:40px auto;padding:0 20px;font-family:Georgia,serif;line-height:1.8;color:#1a1a1a}h1,h2,h3{font-family:system-ui,sans-serif}h1{font-size:2em;border-bottom:2px solid #eee;padding-bottom:8px}</style></head><body>${md}</body></html>`);
    }
    return res.status(404).send('Page not found');
  } catch (e) {
    return res.status(500).send('Server error');
  }
};
// ── FORM SUBMISSION → GHL CONTACT — receives form data from Bloomie-built websites ──────────
app.post('/api/forms/submit', async (req, res) => {
  // Allow cross-origin form submissions from published sites
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { firstName, lastName, name, email, phone, message, source, tags, customFields, ...extra } = req.body;

    // Parse name if only "name" provided (not firstName/lastName)
    let fName = firstName || '';
    let lName = lastName || '';
    if (!fName && name) {
      const parts = name.trim().split(/\s+/);
      fName = parts[0] || '';
      lName = parts.slice(1).join(' ') || '';
    }

    if (!email && !phone) {
      return res.status(400).json({ success: false, error: 'Email or phone is required' });
    }

    const apiKey = process.env.GHL_API_KEY;
    const locationId = process.env.GHL_LOCATION_ID;
    if (!apiKey) {
      logger.error('GHL_API_KEY not configured — form submission cannot create contact');
      return res.status(500).json({ success: false, error: 'CRM not configured' });
    }

    // Build GHL contact payload
    const contactData = {
      locationId,
      firstName: fName,
      lastName: lName,
      ...(email && { email }),
      ...(phone && { phone }),
      source: source || 'Bloomie Website Form',
      tags: tags || ['website-lead'],
    };

    // Add any extra fields as custom fields or notes
    const extraFields = { ...extra };
    if (message) extraFields.message = message;

    // Create contact in GHL
    const { default: axios } = await import('axios');
    const ghlRes = await axios({
      method: 'POST',
      url: 'https://services.leadconnectorhq.com/contacts/',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
      },
      data: contactData
    });

    const contactId = ghlRes.data?.contact?.id;
    logger.info(`Form submission → GHL contact created: ${contactId}`, { email, source: contactData.source });

    // If there's a message or extra fields, add as a note
    if (Object.keys(extraFields).length > 0 && contactId) {
      const noteBody = Object.entries(extraFields)
        .map(([k, v]) => `**${k}**: ${v}`)
        .join('\n');
      try {
        await axios({
          method: 'POST',
          url: `https://services.leadconnectorhq.com/contacts/${contactId}/notes`,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json',
          },
          data: { body: `Website Form Submission:\n${noteBody}`, userId: locationId }
        });
      } catch (noteErr) {
        logger.warn('Failed to add form note to contact:', noteErr.message);
      }
    }

    res.json({ success: true, contactId, message: 'Thank you! We\'ll be in touch soon.' });
  } catch (err) {
    // GHL returns 400 if contact already exists — try to update instead
    if (err.response?.status === 400 || err.response?.status === 422) {
      logger.info('Contact may already exist — form submission noted');
      return res.json({ success: true, message: 'Thank you! We\'ll be in touch soon.' });
    }
    logger.error('Form submission error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});
// CORS preflight for form submissions
app.options('/api/forms/submit', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.get('/p/:slug', servePublishedPage);
app.get('/s/:slug', servePublishedPage);

// Admin panel — BLOOM Command Center
app.use('/admin', adminRoutes);

// Serve React static files
app.use(express.static(path.join(__dirname, '../dashboard/dist')));

// Catch-all handler for React Router (must be last)
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '../dashboard/dist/index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

async function startHeartbeatEngine() {
  logger.info('🚀 Starting BLOOM Heartbeat Engine...');

  try {
    // Start web server first so health check works
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🌐 Heartbeat engine listening on port ${PORT}`);
      logger.info('✅ BLOOM Heartbeat Engine started - health endpoint ready');
    });

    // Auto-setup database if needed
    logger.info('🔧 Auto-setup: Ensuring database and schema exist...');
    const dbSetupOk = await ensureDatabaseExists().catch((error) => {
      logger.error('Database auto-setup failed:', error);
      return false;
    });

    if (dbSetupOk) {
      logger.info('✅ Database auto-setup completed successfully');
    } else {
      logger.warn('⚠️  Database auto-setup had issues - will retry on next startup');
    }

    // Test connections (non-blocking)
    logger.info('🔧 Testing connections...');
    const dbOk = dbSetupOk && await testDatabaseConnection().catch(() => false);
    const lettaOk = await testLettaConnection().catch(() => false);

    if (!dbOk) {
      logger.warn('⚠️  Database connection failed - agent will retry periodically');
      logger.warn('   Database operations will be limited until connection is restored');
    } else {
      logger.info('✅ Database connection successful');
    }

    if (!lettaOk) {
      logger.warn('⚠️  Letta connection failed - memory will be limited to fallback');
      logger.warn('   Agent will use database-only memory until Letta is available');
    } else {
      logger.info('✅ Letta memory server connection successful');
    }

    // Load agent configuration (with fallback)
    let agentConfig;
    try {
      agentConfig = await loadAgentConfig();
      logger.info(`👩‍💼 Agent loaded: ${agentConfig.name} (Level ${agentConfig.currentAutonomyLevel})`);
    } catch (error) {
      logger.warn('⚠️  Failed to load agent config from database, using defaults:', error.message);
      // Continue with default config if database is unavailable
      agentConfig = {
        agentId: process.env.AGENT_ID || 'bloomie-sarah-rodriguez',
        name: process.env.AGENT_NAME || 'Sarah Rodriguez',
        currentAutonomyLevel: parseInt(process.env.AUTONOMY_LEVEL || '1'),
        client: 'BLOOM Ecosystem'
      };
    }

    // Schedule heartbeat cron jobs (only if database is working)
    if (dbOk) {
      setupCronSchedules(agentConfig);
      logger.info('🕐 Heartbeat schedules activated');
    } else {
      logger.warn('⚠️  Heartbeat schedules disabled until database connection is restored');
    }

    logger.info('🎯 BLOOM Autonomous Agent infrastructure ready');

    // Auto-launch browser service so Screen Viewer is live from startup
    try {
      const { getBrowserService } = await import('./browser/browser-service.js');
      const browserSvc = getBrowserService();
      await browserSvc.launch();
      logger.info('🌐 Browser service launched — Screen Viewer active');
    } catch (browserErr) {
      logger.warn('⚠️  Browser service auto-launch failed (non-critical):', browserErr.message);
    }

  } catch (error) {
    logger.error('Failed to start heartbeat engine:', error);
    // Don't exit - let the health endpoint still work
    logger.error('❌ Starting in degraded mode - health endpoint available, core functions disabled');
  }
}

function setupCronSchedules(agentConfig) {
  logger.info('⏰ Setting up cron schedules...');

  // Main operational heartbeat - every 30 minutes during business hours
  cron.schedule(cronSchedules.operational.cron, async () => {
    try {
      logger.info('🔄 Operational heartbeat triggered');
      await runHeartbeat(agentConfig, {
        trigger: 'scheduled',
        type: 'operational'
      });
    } catch (error) {
      logger.error('Operational heartbeat failed:', error);
    }
  }, {
    timezone: "America/New_York"
  });

  // Light check - every 2 hours outside business hours
  cron.schedule(cronSchedules.overnight.cron, async () => {
    try {
      logger.info('🌙 Overnight check triggered');
      await runHeartbeat(agentConfig, {
        trigger: 'scheduled',
        type: 'overnight'
      });
    } catch (error) {
      logger.error('Overnight check failed:', error);
    }
  }, {
    timezone: "America/New_York"
  });

  // Daily summary - every morning at 7:30am
  cron.schedule(cronSchedules.dailySummary.cron, async () => {
    try {
      logger.info('📊 Daily summary triggered');
      await runHeartbeat(agentConfig, {
        trigger: 'scheduled',
        type: 'daily_summary'
      });
    } catch (error) {
      logger.error('Daily summary failed:', error);
    }
  }, {
    timezone: "America/New_York"
  });

  // Weekly report - Friday at 5pm
  cron.schedule(cronSchedules.weeklyReport.cron, async () => {
    try {
      logger.info('📋 Weekly report triggered');
      await runHeartbeat(agentConfig, {
        trigger: 'scheduled',
        type: 'weekly_report'
      });
    } catch (error) {
      logger.error('Weekly report failed:', error);
    }
  }, {
    timezone: "America/New_York"
  });

  // ── Sidecar warmup ping ─────────────────────────────────────────────────
  // Keeps the browser-use Python sidecar warm on Railway so it never cold-starts.
  // Without this, every first scrape costs 20-30s waiting for the container to wake.
  // Runs every 10 minutes — lightweight GET to /health, no browser launched.
  cron.schedule('*/10 * * * *', async () => {
    const url = process.env.BROWSER_AGENT_URL || 'http://sweet-nature.railway.internal:8080';
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        logger.debug('🌐 Sidecar ping OK');
      } else {
        logger.warn(`⚠️  Sidecar ping returned ${res.status}`);
      }
    } catch (e) {
      logger.debug(`Sidecar ping failed (may be starting up): ${e.message}`);
    }
  });

  // ── Scheduled task runner ────────────────────────────────────────────────
  // Polls the scheduled_tasks table every minute.
  // When a task is due (next_run_at <= now, status=active), executes it via chat
  // and writes the result to task_runs so Sarah remembers what she did overnight.
  cron.schedule('* * * * *', async () => {
    try {
      await runScheduledTasks(agentConfig);
    } catch (e) {
      logger.error('Scheduled task runner error:', e.message);
    }
  }, { timezone: 'America/Chicago' });

  logger.info('✅ All cron schedules configured');
}

// ── Scheduled Task Runner ──────────────────────────────────────────────────
async function runScheduledTasks(agentConfig) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  // Find tasks that are due now
  let dueTasks;
  try {
    const { data, error } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('status', 'active')
      .not('next_run_at', 'is', null)
      .lte('next_run_at', new Date().toISOString())
      .order('next_run_at', { ascending: true })
      .limit(5);
    if (error) throw new Error(error.message);
    dueTasks = data || [];
  } catch (e) {
    logger.debug('Scheduled task query failed:', e.message);
    return;
  }

  if (!dueTasks || dueTasks.length === 0) return;
  logger.info(`⏰ Running ${dueTasks.length} scheduled task(s)`);

  for (const task of dueTasks) {
    const startedAt = new Date().toISOString();

    // Calculate next_run_at based on frequency
    const nextRunOffsets = { every_10_min: 600000, every_30_min: 1800000, hourly: 3600000, daily: 86400000, weekdays: 86400000, weekly: 604800000, monthly: 2592000000 };
    const nextRunAt = new Date(Date.now() + (nextRunOffsets[task.frequency] || 86400000)).toISOString();

    // Mark as running — prevent double-execution
    try {
      await supabase.from('scheduled_tasks').update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt,
        run_count: (task.run_count || 0) + 1
      }).eq('id', task.id);
    } catch (e) {
      logger.warn('Could not update scheduled task timing:', e.message);
      continue;
    }

    // Execute the task through Sarah's agent executor
    let output = '';
    let success = false;
    try {
      logger.info(`▶ Running task: ${task.name} — "${task.instruction.slice(0, 80)}"`);
      const { AgentExecutor } = await import('./agent/executor.js');
      // MULTI-TENANT: Use the task's own agent_id, not the hardcoded agentConfig
      const executor = new AgentExecutor(task.agent_id || agentConfig?.agentId || 'bloomie-sarah-rodriguez', agentConfig);
      const result = await executor.executeTask(task.instruction, { trigger: 'scheduled', taskId: task.id, taskName: task.name, taskType: task.task_type, orgId: task.organization_id });
      output = typeof result === 'string' ? result : result?.response || JSON.stringify(result);

      // Check inner result status — executor may return without throwing but still report failure
      const innerStatus = (typeof result === 'object') ? (result?.status || result?.error) : null;
      if (innerStatus === 'failed' || (result?.error && !result?.response)) {
        success = false;
        logger.error(`❌ Task inner failure: ${task.name}`, { innerStatus, error: result?.error });
      } else {
        success = true;
        logger.info(`✅ Task complete: ${task.name}`);
      }
    } catch (e) {
      output = `Task failed: ${e.message}`;
      logger.error(`❌ Task failed: ${task.name}`, e.message);
    }

    // Write result to task_runs
    try {
      await supabase.from('task_runs').insert({
        scheduled_task_id: task.id,
        agent_id: task.agent_id,
        organization_id: task.organization_id,
        task_id: task.task_id,
        task_name: task.name,
        task_type: task.task_type,
        instruction: task.instruction,
        status: success ? 'completed' : 'failed',
        result: success ? output : null,
        error: success ? null : output,
        started_at: startedAt,
        completed_at: new Date().toISOString()
      });
    } catch (e) {
      logger.warn('Could not write task_run record:', e.message);
    }
  }
}

function getNextScheduledHeartbeat() {
  // Calculate next operational heartbeat (every 30 min during business hours)
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(30 * Math.ceil(now.getMinutes() / 30));
  nextHour.setSeconds(0);

  return nextHour.toISOString();
}

// Graceful shutdown for Railway
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the engine
startHeartbeatEngine();// Railway rebuild trigger Fri Mar  6 09:33:57 UTC 2026
