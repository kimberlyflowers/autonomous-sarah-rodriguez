// Server-Sent Events (SSE) API for real-time dashboard updates
// Provides live updates when new heartbeat cycles complete or data changes

import express from 'express';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('events-api');

// Store active SSE connections
const activeConnections = new Set();

// Middleware to handle SSE setup
function setupSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection confirmation
  res.write('data: {"type":"connected","timestamp":"' + new Date().toISOString() + '"}\n\n');

  return res;
}

// Send event to all connected clients
function broadcastToClients(eventType, data = {}) {
  const message = JSON.stringify({
    type: eventType,
    timestamp: new Date().toISOString(),
    data
  });

  logger.debug(`Broadcasting event: ${eventType} to ${activeConnections.size} clients`);

  // Send to all active connections
  for (const connection of activeConnections) {
    try {
      connection.write(`data: ${message}\n\n`);
    } catch (error) {
      // Remove dead connections
      logger.debug('Removing dead SSE connection');
      activeConnections.delete(connection);
    }
  }
}

// GET /api/events/dashboard - SSE endpoint for dashboard updates
router.get('/dashboard', (req, res) => {
  const clientId = req.ip + ':' + Date.now();
  logger.info(`SSE client connected: ${clientId}`);

  // Setup SSE
  setupSSE(res);

  // Add to active connections
  activeConnections.add(res);

  // Send periodic heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write('data: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n');
    } catch (error) {
      // Connection is dead
      clearInterval(heartbeatInterval);
      activeConnections.delete(res);
      logger.debug(`SSE client disconnected: ${clientId}`);
    }
  }, 30000); // 30 second heartbeat

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    activeConnections.delete(res);
    logger.info(`SSE client disconnected: ${clientId}`);
  });

  req.on('error', (error) => {
    clearInterval(heartbeatInterval);
    activeConnections.delete(res);
    logger.warn(`SSE client error: ${clientId}`, error.message);
  });
});

// Function to trigger dashboard refresh (called from heartbeat completion)
export function triggerDashboardRefresh(data = {}) {
  broadcastToClients('dashboard_refresh', data);
}

// Function to trigger specific data updates
export function triggerDataUpdate(updateType, data = {}) {
  broadcastToClients(`data_update_${updateType}`, data);
}

// GET /api/events/status - Get current SSE status
router.get('/status', (req, res) => {
  res.json({
    activeConnections: activeConnections.size,
    timestamp: new Date().toISOString()
  });
});

// Manual trigger endpoint for testing (only in development)
if (process.env.NODE_ENV === 'development') {
  router.post('/trigger/:eventType', (req, res) => {
    const { eventType } = req.params;
    const data = req.body || {};

    logger.info(`Manual trigger: ${eventType}`, data);
    broadcastToClients(eventType, data);

    res.json({
      success: true,
      eventType,
      data,
      sentTo: activeConnections.size
    });
  });
}

export default router;