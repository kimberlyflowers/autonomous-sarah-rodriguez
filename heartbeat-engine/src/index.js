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

// Dashboard API routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/agent', agentRoutes);

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

  logger.info('✅ All cron schedules configured');
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
