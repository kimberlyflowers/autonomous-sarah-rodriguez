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
import projectsRoutes from './api/projects-supabase.js'; // Supabase-based projects

// Get the current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('heartbeat-engine');
const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.json({ limit: '10mb' }));

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
    const { orgId } = req.query;
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
    const authUrl = buildAuthUrl(slug, orgId);
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
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

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

// ── PUBLIC SITES — clean URLs for published pages (/p/summer-camp) ──────────
const servePublishedPage = async (req, res) => {
  try {
    const { getSharedPool } = await import('./database/pool.js');
    const pool = getSharedPool();
    const result = await pool.query(
      'SELECT name, file_type, content_text FROM artifacts WHERE slug = $1 AND published = true',
      [req.params.slug]
    );
    if (!result.rows.length) {
      return res.status(404).send(`<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a1a;color:#fff;margin:0"><div style="text-align:center"><h1 style="font-size:48px;margin:0">404</h1><p style="color:#888;margin-top:8px">This page doesn't exist or has been unpublished.</p></div></body></html>`);
    }
    const file = result.rows[0];
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
app.get('/p/:slug', servePublishedPage);
app.get('/s/:slug', servePublishedPage);

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
  const { getSharedPool } = await import('./database/pool.js');
  const pool = getSharedPool();
  if (!pool) return;

  // Find tasks that are due now
  let dueTasks;
  try {
    const result = await pool.query(`
      SELECT * FROM scheduled_tasks
      WHERE status = 'active'
        AND next_run_at IS NOT NULL
        AND next_run_at <= NOW()
      ORDER BY next_run_at ASC
      LIMIT 5
    `);
    dueTasks = result.rows;
  } catch (e) {
    logger.debug('Scheduled task query failed:', e.message);
    return;
  }

  if (!dueTasks || dueTasks.length === 0) return;

  logger.info(`⏰ Running ${dueTasks.length} scheduled task(s)`);

  for (const task of dueTasks) {
    const runId = `run_${Date.now()}`;
    const startedAt = new Date().toISOString();

    // Mark as running — prevent double-execution
    try {
      await pool.query(
        `UPDATE scheduled_tasks SET status = 'active', last_run_at = NOW(),
          next_run_at = CASE frequency
            WHEN 'daily'    THEN NOW() + INTERVAL '1 day'
            WHEN 'weekdays' THEN NOW() + INTERVAL '1 day'
            WHEN 'weekly'   THEN NOW() + INTERVAL '7 days'
            WHEN 'monthly'  THEN NOW() + INTERVAL '30 days'
            ELSE NULL END,
          run_count = run_count + 1
        WHERE id = $1`,
        [task.id]
      );
    } catch (e) {
      logger.warn('Could not update scheduled task timing:', e.message);
      continue;
    }

    // Execute the task by running it through Sarah's chat endpoint
    let output = '';
    let success = false;
    try {
      logger.info(`▶ Running task: ${task.name} — "${task.instruction.slice(0, 80)}"`);

      // Import and call the agent executor directly (avoids HTTP round-trip)
      const { AgentExecutor } = await import('./agent/executor.js');
      const executor = new AgentExecutor(agentConfig);
      const result = await executor.execute(
        task.instruction,
        [], // no conversation history for scheduled tasks
        `scheduled_task_${task.id}`
      );

      output = typeof result === 'string' ? result : result?.response || JSON.stringify(result);
      success = true;
      logger.info(`✅ Task complete: ${task.name}`);

    } catch (e) {
      output = `Task failed: ${e.message}`;
      logger.error(`❌ Task failed: ${task.name}`, e.message);
    }

    // Write result to task_runs
    try {
      await pool.query(
        `INSERT INTO task_runs (scheduled_task_id, agent_id, organization_id, status, output, error, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          task.id,
          task.agent_id,
          task.organization_id,
          success ? 'completed' : 'failed',
          success ? output : null,
          success ? null : output,
          startedAt
        ]
      );
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
