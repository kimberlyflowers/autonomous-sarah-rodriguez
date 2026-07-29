// Desktop Control API — mailbox pattern for Sarah to control BLOOM Desktop
// Mirrors the push-screenshot pattern from browser.js (outbound only, no open ports)
// Desktop polls GET /api/desktop/pending, executes tools, POSTs results back
// v2.0 — Now stores capabilities (tool catalog) from registration

import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { createLogger } from '../logging/logger.js';
import { getBrowserService } from '../browser/browser-service.js';

const router = express.Router();
const logger = createLogger('desktop-api');

// In-memory command queue keyed by sessionId
// Structure: { [sessionId]: { commands: [], registeredAt: Date, lastSeen: Date, capabilities: {} } }
const sessions = new Map();

// Allow long browser/desktop commands to finish without making a visibly
// running desktop disappear from the command bridge mid-task.
const STALE_THRESHOLD_MS = 5 * 60_000;
// Presence shown to Chat must be much fresher than the eventual cleanup
// threshold. Otherwise a crashed or sleeping desktop can be advertised as
// connected for several minutes and every command will simply time out.
const ACTIVE_THRESHOLD_MS = 15_000;
function isSessionActive(session, now = Date.now()) {
  return !!session && now - session.lastSeen <= ACTIVE_THRESHOLD_MS;
}
function pruneStale() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastSeen > STALE_THRESHOLD_MS) {
      sessions.delete(id);
      logger.info(`Pruned stale desktop session: ${id}`);
    }
  }
}
const staleDesktopTimer = setInterval(pruneStale, 10_000);
staleDesktopTimer.unref?.();

// ─────────────────────────────────────────────
// POST /api/desktop/register
// Desktop calls this on startup to announce itself
// Body: { sessionId, hostname?, platform?, version?, capabilities? }
// capabilities: { tools: [...], toolCount, categories, systemPromptInjection }
// ─────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { sessionId, hostname, platform, version, appVersion, capabilities, orgId, userId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  let identity = await resolveAuthenticatedDesktopIdentity(req);
  if (!identity.success) {
    identity = await resolveStoredDesktopIdentity(sessionId, orgId, userId);
  }
  if (!identity.success) return res.status(identity.status).json({ error: identity.error });

  const existing = sessions.get(sessionId);
  sessions.set(sessionId, {
    commands: existing?.commands || [],
    registeredAt: existing?.registeredAt || new Date().toISOString(),
    lastSeen: Date.now(),
    hostname: hostname || existing?.hostname || 'unknown',
    platform: platform || existing?.platform || 'unknown',
    version: version || appVersion || existing?.version || 'unknown',
    orgId: identity.orgId,
    userId: identity.userId,
    agentId: identity.agentId,
    capabilities: capabilities || existing?.capabilities || null
  });

  const registered = sessions.get(sessionId);
  const toolCount = registered.capabilities?.toolCount || 'unknown';
  logger.info(`Desktop registered: ${sessionId} (${registered.platform}) v${registered.version} | ${toolCount} tools`);
  res.json({ success: true, sessionId });
});

// ─────────────────────────────────────────────
// GET /api/desktop/status
// Sarah (or dashboard) checks if a desktop is connected
// Query: ?sessionId=xxx
// ─────────────────────────────────────────────
router.get('/status', (req, res) => {
  const { sessionId, orgId, userId } = req.query;
  const now = Date.now();
  if (!sessionId) {
    // Return all active sessions (for dashboard)
    const active = [];
    for (const [id, s] of sessions) {
      if (!isSessionActive(s, now)) continue;
      if (orgId && s.orgId !== orgId) continue;
      if (userId && s.userId !== userId) continue;
      active.push({
        sessionId: id,
        hostname: s.hostname,
        platform: s.platform,
        version: s.version,
        orgId: s.orgId,
        userId: s.userId,
        agentId: s.agentId,
        registeredAt: s.registeredAt,
        lastSeenAt: new Date(s.lastSeen).toISOString(),
        pendingCommands: s.commands.length,
        hasCapabilities: !!s.capabilities,
        toolCount: s.capabilities?.toolCount || 0
      });
    }
    return res.json({ sessions: active });
  }

  const session = sessions.get(sessionId);
  if (!isSessionActive(session, now)) return res.json({ connected: false });
  res.json({
    connected: true,
    hostname: session.hostname,
    platform: session.platform,
    version: session.version,
    lastSeenAt: new Date(session.lastSeen).toISOString(),
    pendingCommands: session.commands.length,
    hasCapabilities: !!session.capabilities,
    toolCount: session.capabilities?.toolCount || 0
  });
});

// ─────────────────────────────────────────────
// GET /api/desktop/capabilities
// Returns the tool catalog and system prompt injection
// from the currently connected desktop
// ─────────────────────────────────────────────
router.get('/capabilities', (req, res) => {
  const { sessionId, orgId, userId } = req.query;
  let session;

  if (sessionId) {
    session = sessions.get(sessionId);
  } else {
    // Return first active session's capabilities
    for (const [, s] of sessions) {
      if (orgId && s.orgId !== orgId) continue;
      if (userId && s.userId !== userId) continue;
      if (s.capabilities) { session = s; break; }
    }
  }

  if (!session || !session.capabilities) {
    return res.json({ available: false, message: 'No desktop with capabilities connected' });
  }

  res.json({
    available: true,
    platform: session.platform,
    version: session.version,
    ...session.capabilities
  });
});

// ─────────────────────────────────────────────
// POST /api/desktop/command
// Sarah drops a command into the mailbox
// Body: { sessionId, commandId, tool, args }
// All 42 bloom_* tools are supported
// ─────────────────────────────────────────────
router.post('/command', (req, res) => {
  const { sessionId, commandId, tool, args } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  if (!tool) return res.status(400).json({ error: 'tool required' });
  if (!commandId) return res.status(400).json({ error: 'commandId required' });

  const session = sessions.get(sessionId);
  if (!isSessionActive(session)) {
    return res.status(404).json({ error: 'Desktop session not found or not connected', sessionId });
  }

  const command = { commandId, tool, args: args || {}, queuedAt: Date.now() };
  session.commands.push(command);
  logger.info(`Queued command ${commandId} (${tool}) for session ${sessionId}`);
  res.json({ success: true, commandId, queuedAt: command.queuedAt });
});

// ─────────────────────────────────────────────
// GET /api/desktop/pending
// Desktop polls this every ~1s to pick up commands
// Query: ?sessionId=xxx
// Returns: { commands: [...], count: N }
// Clears the queue after returning (each command delivered once)
// ─────────────────────────────────────────────
router.get('/pending', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const session = sessions.get(sessionId);
  if (!session) {
    // Session not found — tell Desktop to re-register (Railway redeploy wiped in-memory sessions)
    return res.json({ commands: [], count: 0, sessionLost: true });
  }

  // Update heartbeat
  session.lastSeen = Date.now();

  // Drain the queue
  const commands = session.commands.splice(0);
  res.json({ commands, count: commands.length });
});

// ─────────────────────────────────────────────
// POST /api/desktop/result
// Desktop posts back the result of an executed command
// Body: { sessionId, commandId, tool, success, result, error? }
// ─────────────────────────────────────────────
// Store results in memory for Sarah to pick up
const results = new Map(); // commandId → result

router.post('/result', (req, res) => {
  const { sessionId, commandId, tool, success, result, error } = req.body;
  if (!commandId) return res.status(400).json({ error: 'commandId required' });

  const payload = { sessionId, commandId, tool, success, result, error, receivedAt: Date.now() };
  results.set(commandId, payload);
  logger.info(`Result received for command ${commandId} (${tool}): ${success ? 'OK' : 'FAILED'}`);

  // Mirror BLOOM Desktop browser evidence into the dashboard's Live panel.
  // Desktop result envelopes vary slightly by tool/version, so inspect the
  // nested result chain and use the first concrete URL/screenshot we find.
  if (String(tool || '').startsWith('bloom_browser_') && success !== false) {
    const candidates = [result, result?.result, result?.result?.result].filter(Boolean);
    const browserUrl = candidates
      .map(item => item?.url || item?.currentUrl || item?.current_url || item?.url_final)
      .find(Boolean);
    const screenshotData = candidates
      .map(item => item?.screenshot_base64 || item?.screenshot || item?.image_base64 || item?.image)
      .find(value => typeof value === 'string' && value.length > 100);
    const browser = getBrowserService();
    browser.isRunning = true;
    if (browserUrl) browser.currentUrl = browserUrl;
    if (screenshotData) {
      browser.lastScreenshot = screenshotData.replace(/^data:image\/[^;]+;base64,/, '');
      browser.lastScreenshotTime = Date.now();
      browser.emit('screenshot', {
        data: browser.lastScreenshot,
        url: browser.currentUrl || '',
        timestamp: Date.now(),
      });
    } else {
      browser.emit('status', {
        type: 'status',
        live: true,
        url: browser.currentUrl || null,
      });
    }
  }

  // Long model/tool turns may not collect the result immediately. Keep it long
  // enough for retry/resume behavior instead of deleting valid evidence after
  // one minute.
  setTimeout(() => results.delete(commandId), 10 * 60_000);

  res.json({ success: true });
});

// ─────────────────────────────────────────────
// GET /api/desktop/result/:commandId
// Sarah polls for the result of a specific command
// ─────────────────────────────────────────────
router.get('/result/:commandId', (req, res) => {
  const { commandId } = req.params;
  const result = results.get(commandId);
  if (!result) return res.json({ ready: false });
  res.json({ ready: true, ...result });
});

// ─────────────────────────────────────────────
// GET /api/desktop/download/:platform
// Authenticated download of BLOOM Desktop app
// :platform = "mac-arm64" | "mac-intel" | "windows"
// Requires: Authorization header with valid Supabase JWT
// ─────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://njfhzabmaxhfzekbzpzz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZmh6YWJtYXhoZnpla2J6cHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjYwMjMsImV4cCI6MjA4ODQwMjAyM30.QPTQhnlfZtmfQVm75GqG0Oazmyb7USjYBdLEy_G-iqU';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

async function resolveAuthenticatedDesktopIdentity(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { success: false, status: 401, error: 'Authenticated desktop session required' };
  }
  try {
    const token = authHeader.slice('Bearer '.length);
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) return { success: false, status: 401, error: 'Invalid desktop session' };

    const dbClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: membership, error: membershipError } = await dbClient
      .from('organization_members')
      .select('organization_id, organizations(id, name)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return { success: false, status: 403, error: 'No active BLOOM organization for this desktop user' };
    }
    const { data: agent } = await dbClient
      .from('agents')
      .select('id, name')
      .eq('organization_id', membership.organization_id)
      .limit(1)
      .maybeSingle();
    return {
      success: true,
      status: 200,
      userId: user.id,
      email: user.email,
      orgId: membership.organization_id,
      orgName: membership.organizations?.name || 'BLOOM',
      agentId: agent?.id || null,
      agentName: agent?.name || null,
    };
  } catch (error) {
    logger.error('Desktop identity resolution failed', { error: error.message });
    return { success: false, status: 500, error: 'Desktop identity resolution failed' };
  }
}

async function resolveStoredDesktopIdentity(sessionId, claimedOrgId, claimedUserId) {
  if (!SUPABASE_SERVICE_KEY || !sessionId || !claimedOrgId || !claimedUserId) {
    return { success: false, status: 401, error: 'Invalid desktop session' };
  }
  try {
    const dbClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data: stored, error } = await dbClient
      .from('desktop_sessions')
      .select('id, user_id, organization_id, hostname, platform, status')
      .eq('user_id', claimedUserId)
      .eq('organization_id', claimedOrgId)
      .maybeSingle();
    const recognizedStoredSessionId = stored && (
      sessionId === stored.id ||
      sessionId === `desktop-${stored.user_id}`
    );
    let recoveredUserId = stored?.user_id;
    let recoveredOrgId = stored?.organization_id;
    if (!stored && sessionId === `desktop-${claimedUserId}`) {
      const { data: membership, error: membershipError } = await dbClient
        .from('organization_members')
        .select('user_id, organization_id')
        .eq('user_id', claimedUserId)
        .eq('organization_id', claimedOrgId)
        .maybeSingle();
      if (!membershipError && membership) {
        recoveredUserId = membership.user_id;
        recoveredOrgId = membership.organization_id;
      }
    }
    if (
      error ||
      !recoveredUserId ||
      !recoveredOrgId ||
      (stored && (!recognizedStoredSessionId || stored.status === 'revoked'))
    ) {
      return { success: false, status: 401, error: 'Invalid desktop session' };
    }
    const { data: agent } = await dbClient
      .from('agents')
      .select('id, name')
      .eq('organization_id', recoveredOrgId)
      .limit(1)
      .maybeSingle();
    if (stored) {
      await dbClient
        .from('desktop_sessions')
        .update({ status: 'online', last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', stored.id);
    }
    logger.info('Recovered authenticated desktop registration from durable tenant session', {
      sessionId,
      orgId: recoveredOrgId,
      userId: recoveredUserId,
    });
    return {
      success: true,
      status: 200,
      userId: recoveredUserId,
      orgId: recoveredOrgId,
      agentId: agent?.id || null,
      agentName: agent?.name || null,
    };
  } catch (error) {
    logger.error('Stored desktop identity recovery failed', { error: error.message });
    return { success: false, status: 500, error: 'Desktop identity recovery failed' };
  }
}

router.get('/identity', async (req, res) => {
  const identity = await resolveAuthenticatedDesktopIdentity(req);
  if (!identity.success) return res.status(identity.status).json({ error: identity.error });
  res.json(identity);
});

// Download file metadata — updated when new builds are uploaded
const DOWNLOAD_FILES = {
  'mac-arm64': {
    filename: 'BLOOM-Desktop-Mac-ARM64.dmg',
    contentType: 'application/x-apple-diskimage',
  },
  'mac-intel': {
    filename: 'BLOOM-Desktop-Mac-Intel.dmg',
    contentType: 'application/x-apple-diskimage',
  },
  'windows': {
    filename: 'BLOOM-Desktop-Windows.exe',
    contentType: 'application/x-msdownload',
  },
};

// Directory where desktop builds are stored on Railway
const BUILDS_DIR = process.env.DESKTOP_BUILDS_DIR || '/app/desktop-builds';

// Short-lived download tokens (valid 60s)
const downloadTokens = new Map();

// POST /api/desktop/download-token/:platform
// Dashboard calls this with auth header → gets a one-time token
// Then navigates browser to /api/desktop/download/:platform?token=xxx
router.post('/download-token/:platform', async (req, res) => {
  const { platform } = req.params;
  const fileInfo = DOWNLOAD_FILES[platform];
  if (!fileInfo) return res.status(400).json({ error: 'Invalid platform' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    // Verify user JWT with anon key
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return res.status(401).json({ error: 'Invalid session.' });

    // Use service key to query org membership (bypasses RLS)
    const dbKey = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
    const dbClient = createClient(SUPABASE_URL, dbKey);
    const { data: membership } = await dbClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!membership) return res.status(403).json({ error: 'No active BLOOM organization.' });

    // Generate one-time download token
    const token = crypto.randomBytes(32).toString('hex');
    downloadTokens.set(token, { platform, userId: user.id, email: user.email, orgId: membership.organization_id, createdAt: Date.now() });
    setTimeout(() => downloadTokens.delete(token), 60000); // expires in 60s

    logger.info(`Download token issued: ${platform} for ${user.email}`);
    res.json({ token, downloadUrl: `/api/desktop/download/${platform}?token=${token}` });
  } catch (err) {
    logger.error('Token error:', err.message);
    res.status(500).json({ error: 'Failed to generate download token.' });
  }
});

// GET /api/desktop/download/:platform?token=xxx
// Direct browser navigation — streams the file as a download
router.get('/download/:platform', (req, res) => {
  const { platform } = req.params;
  const { token } = req.query;
  const fileInfo = DOWNLOAD_FILES[platform];

  if (!fileInfo) return res.status(400).json({ error: 'Invalid platform' });
  if (!token) return res.status(401).json({ error: 'Download token required. Use the dashboard to download.' });

  const tokenData = downloadTokens.get(token);
  if (!tokenData || tokenData.platform !== platform) {
    return res.status(401).json({ error: 'Invalid or expired download token.' });
  }

  // Don't consume immediately — allow retry within 60s TTL
  logger.info(`Download token used: ${token.substring(0, 8)}... for ${platform}`);

  const filePath = path.join(BUILDS_DIR, fileInfo.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `${platform} build not yet available.` });
  }

  try {
    const stat = fs.statSync(filePath);
    logger.info(`Desktop download starting: ${platform} by ${tokenData.email} (${Math.round(stat.size/1024/1024)}MB)`);

    // Disable request timeout for large file downloads
    req.setTimeout(0);
    res.setTimeout(0);

    res.writeHead(200, {
      'Content-Type': fileInfo.contentType,
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${fileInfo.filename}"`,
      'X-Accel-Buffering': 'no',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    // Flush headers immediately so Railway proxy doesn't timeout waiting for first byte
    res.flushHeaders();

    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on('error', (err) => {
      logger.error(`Stream error for ${platform}: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: 'File stream failed' });
    });
    stream.pipe(res);
  } catch (err) {
    logger.error(`Download serve error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed: ' + err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/desktop/downloads
// Returns available platforms and whether builds exist
// (Used by dashboard to show/hide download buttons)
// ─────────────────────────────────────────────
router.get('/downloads', async (req, res) => {
  const available = {};
  for (const [platform, info] of Object.entries(DOWNLOAD_FILES)) {
    const filePath = path.join(BUILDS_DIR, info.filename);
    const exists = fs.existsSync(filePath);
    available[platform] = {
      available: exists,
      filename: info.filename,
      size: exists ? fs.statSync(filePath).size : null,
    };
  }

  res.json({ platforms: available });
});

// ─────────────────────────────────────────────
// POST /api/desktop/upload-build
// Upload a desktop build (admin only, protected by API key)
// Body: multipart form with "file" field and "platform" field
// ─────────────────────────────────────────────
const upload = multer({
  dest: '/tmp/bloom-uploads/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

router.post('/upload-build', upload.single('file'), async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.DESKTOP_ADMIN_KEY || 'bloom-desktop-admin-2024';

  if (adminKey !== expectedKey) {
    return res.status(401).json({ error: 'Admin key required' });
  }

  const { platform } = req.body;
  const fileInfo = DOWNLOAD_FILES[platform];
  if (!fileInfo) {
    return res.status(400).json({ error: 'Invalid platform', validPlatforms: Object.keys(DOWNLOAD_FILES) });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Ensure builds directory exists
  if (!fs.existsSync(BUILDS_DIR)) {
    fs.mkdirSync(BUILDS_DIR, { recursive: true });
  }

  // Move uploaded file to builds directory (copyFileSync + unlinkSync to handle cross-device)
  const destPath = path.join(BUILDS_DIR, fileInfo.filename);
  fs.copyFileSync(req.file.path, destPath);
  try { fs.unlinkSync(req.file.path); } catch {};

  const stat = fs.statSync(destPath);
  logger.info(`Desktop build uploaded: ${platform} (${Math.round(stat.size / 1024 / 1024)}MB)`);

  res.json({
    success: true,
    platform,
    filename: fileInfo.filename,
    size: stat.size,
  });
});

export default router;
