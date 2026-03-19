// Desktop Control API — mailbox pattern for Sarah to control BLOOM Desktop
// Mirrors the push-screenshot pattern from browser.js (outbound only, no open ports)
// Desktop polls GET /api/desktop/pending, executes tools, POSTs results back

import express from 'express';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('desktop-api');

// In-memory command queue keyed by sessionId
// Structure: { [sessionId]: { commands: [], registeredAt: Date, lastSeen: Date } }
const sessions = new Map();

// Clean up sessions not seen in 30 seconds
const STALE_THRESHOLD_MS = 30_000;
function pruneStale() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastSeen > STALE_THRESHOLD_MS) {
      sessions.delete(id);
      logger.info(`Pruned stale desktop session: ${id}`);
    }
  }
}
setInterval(pruneStale, 10_000);

// ─────────────────────────────────────────────
// POST /api/desktop/register
// Desktop calls this on startup to announce itself
// Body: { sessionId, hostname?, platform? }
// ─────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { sessionId, hostname, platform } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  sessions.set(sessionId, {
    commands: [],
    registeredAt: new Date().toISOString(),
    lastSeen: Date.now(),
    hostname: hostname || 'unknown',
    platform: platform || 'unknown'
  });

  logger.info(`Desktop registered: ${sessionId} (${hostname || 'unknown'})`);
  res.json({ success: true, sessionId });
});

// ─────────────────────────────────────────────
// GET /api/desktop/status
// Sarah (or dashboard) checks if a desktop is connected
// Query: ?sessionId=xxx
// ─────────────────────────────────────────────
router.get('/status', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    // Return all active sessions (for dashboard)
    const active = [];
    for (const [id, s] of sessions) {
      active.push({ sessionId: id, hostname: s.hostname, platform: s.platform, registeredAt: s.registeredAt, pendingCommands: s.commands.length });
    }
    return res.json({ sessions: active });
  }
  const session = sessions.get(sessionId);
  if (!session) return res.json({ connected: false });
  res.json({ connected: true, hostname: session.hostname, platform: session.platform, pendingCommands: session.commands.length });
});

// ─────────────────────────────────────────────
// POST /api/desktop/command
// Sarah drops a command into the mailbox
// Body: { sessionId, commandId, tool, args }
// Tools: bloom_click, bloom_double_click, bloom_move_mouse, bloom_scroll,
//        bloom_drag, bloom_type_text, bloom_key_press, bloom_take_screenshot,
//        bloom_get_screen_info
// ─────────────────────────────────────────────
router.post('/command', (req, res) => {
  const { sessionId, commandId, tool, args } = req.body;

  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  if (!tool) return res.status(400).json({ error: 'tool required' });
  if (!commandId) return res.status(400).json({ error: 'commandId required' });

  const session = sessions.get(sessionId);
  if (!session) {
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

  // Auto-prune results after 60s
  setTimeout(() => results.delete(commandId), 60_000);

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

router.get('/download/:platform', async (req, res) => {
  const { platform } = req.params;
  const fileInfo = DOWNLOAD_FILES[platform];

  if (!fileInfo) {
    return res.status(400).json({
      error: 'Invalid platform',
      validPlatforms: Object.keys(DOWNLOAD_FILES),
    });
  }

  // Verify auth — must have a valid Supabase JWT
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Sign in to your BLOOM dashboard to download.' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
    }

    // User is authenticated — check if they have an org membership (paying client)
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!membership) {
      return res.status(403).json({ error: 'No active BLOOM organization found.' });
    }

    logger.info(`Desktop download: ${platform} by ${user.email} (org: ${membership.organization_id})`);

    // Serve the file from local builds directory
    const filePath = path.join(BUILDS_DIR, fileInfo.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: `${platform} build not yet available. Check back soon.`,
        platform,
      });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', fileInfo.contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    logger.error('Download error:', err.message);
    res.status(500).json({ error: 'Download failed. Please try again.' });
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
