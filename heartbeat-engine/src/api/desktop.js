// Desktop Control API — mailbox pattern for Sarah to control BLOOM Desktop
// Mirrors the push-screenshot pattern from browser.js (outbound only, no open ports)
// Desktop polls GET /api/desktop/pending, executes tools, POSTs results back

import express from 'express';
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

export default router;
