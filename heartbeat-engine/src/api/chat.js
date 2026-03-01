// Chat API for conversing with Sarah Rodriguez
// Integrates Claude API with Sarah's agent profile and recent work context

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../logging/logger.js';
import { loadAgentConfig } from '../config/agent-profile.js';
import { AgentExecutor, EXECUTION_STATUS } from '../agent/executor.js';
import { broadcastExecutionProgress } from './events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const logger = createLogger('chat-api');

// Initialize Claude client
let anthropic = null;

export function getAnthropicClient() {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

// Get database pool - using the same pattern as existing code
async function getPool() {
  const { createPool } = await import('../../database/setup.js');
  return createPool();
}

// Create chat messages table if it doesn't exist
async function ensureChatTableExists() {
  const pool = await getPool();
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) DEFAULT 'default',
        message TEXT NOT NULL,
        is_user BOOLEAN NOT NULL,
        agent_id VARCHAR(100),
        timestamp TIMESTAMP DEFAULT NOW(),
        context JSONB
      );
    `);

    // Create index for efficient querying
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time
      ON chat_messages(session_id, timestamp DESC);
    `);
  } catch (error) {
    logger.warn('Could not create chat_messages table:', error.message);
  } finally {
    await pool.end();
  }
}

// Load Sarah's soul/identity from soul.md file
async function loadSarahSoul() {
  try {
    const soulPath = path.resolve(__dirname, '../../soul.md');
    const soulContent = await fs.readFile(soulPath, 'utf8');
    return soulContent;
  } catch (error) {
    logger.warn('Could not load soul.md file:', error.message);
    return ''; // Return empty string if file not found
  }
}

// GHL API helper functions
async function callGHLAPI(endpoint, method = 'GET', data = null) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    throw new Error('GHL_API_KEY not configured');
  }

  const config = {
    method,
    url: `https://services.leadconnectorhq.com${endpoint}`,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.data = data;
  }

  const response = await axios(config);
  return response.data;
}

// GHL Tool Functions for Claude
const ghlTools = [
  {
    name: "search_contacts",
    description: "Search for contacts in GoHighLevel by email, phone, or name",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (email, phone, or name)"
        },
        limit: {
          type: "number",
          description: "Max number of results (default: 10)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_contact_details",
    description: "Get detailed information about a specific contact by ID",
    input_schema: {
      type: "object",
      properties: {
        contact_id: {
          type: "string",
          description: "The GoHighLevel contact ID"
        }
      },
      required: ["contact_id"]
    }
  },
  {
    name: "create_contact",
    description: "Create a new contact in GoHighLevel",
    input_schema: {
      type: "object",
      properties: {
        firstName: {
          type: "string",
          description: "Contact's first name"
        },
        lastName: {
          type: "string",
          description: "Contact's last name"
        },
        email: {
          type: "string",
          description: "Contact's email address"
        },
        phone: {
          type: "string",
          description: "Contact's phone number"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to assign to the contact"
        }
      },
      required: ["firstName", "email"]
    }
  }
];

// Handle GHL tool calls
async function handleGHLTool(toolName, parameters) {
  const locationId = process.env.GHL_LOCATION_ID;

  try {
    switch (toolName) {
      case 'search_contacts':
        return await callGHLAPI(
          `/contacts/search?locationId=${locationId}&query=${encodeURIComponent(parameters.query)}&limit=${parameters.limit || 10}`
        );

      case 'get_contact_details':
        return await callGHLAPI(`/contacts/${parameters.contact_id}?locationId=${locationId}`);

      case 'create_contact':
        const contactData = {
          ...parameters,
          locationId: locationId
        };
        return await callGHLAPI('/contacts', 'POST', contactData);

      default:
        throw new Error(`Unknown GHL tool: ${toolName}`);
    }
  } catch (error) {
    logger.error(`GHL tool error (${toolName}):`, error.message);
    throw new Error(`GHL API error: ${error.response?.data?.message || error.message}`);
  }
}

// Get Sarah's current context for conversation
async function getSarahContext(agentId) {
  try {
    const pool = await getPool();

    // Get recent cycles (last 5)
    const cyclesResult = await pool.query(`
      SELECT cycle_id, started_at, completed_at, status, actions_count, rejections_count, handoffs_count
      FROM heartbeat_cycles
      WHERE agent_id = $1
      ORDER BY started_at DESC
      LIMIT 5
    `, [agentId]);

    // Get recent actions (last 10)
    const actionsResult = await pool.query(`
      SELECT action_type, description, target_system, success, timestamp
      FROM action_log
      WHERE agent_id = $1
      ORDER BY timestamp DESC
      LIMIT 10
    `, [agentId]);

    // Get recent rejections (last 5)
    const rejectionsResult = await pool.query(`
      SELECT candidate_action, reason, reason_code, confidence, timestamp
      FROM rejection_log
      WHERE agent_id = $1
      ORDER BY timestamp DESC
      LIMIT 5
    `, [agentId]);

    // Get unresolved handoffs
    const handoffsResult = await pool.query(`
      SELECT issue, recommendation, urgency, timestamp
      FROM handoff_log
      WHERE agent_id = $1 AND resolved = false
      ORDER BY timestamp DESC
      LIMIT 3
    `, [agentId]);

    await pool.end();

    return {
      recentCycles: cyclesResult.rows,
      recentActions: actionsResult.rows,
      recentRejections: rejectionsResult.rows,
      pendingHandoffs: handoffsResult.rows
    };
  } catch (error) {
    logger.warn('Could not get Sarah context:', error.message);
    return {
      recentCycles: [],
      recentActions: [],
      recentRejections: [],
      pendingHandoffs: []
    };
  }
}

// Build Sarah's system prompt with current context
async function buildSarahPrompt(agentConfig, context) {
  const now = new Date();
  const timeString = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'full',
    timeStyle: 'short'
  });

  // Load Sarah's soul/identity
  const soulContent = await loadSarahSoul();

  return `${soulContent}

## Current Work Context (${timeString}):

IMPORTANT: You have access to GoHighLevel tools for managing contacts and operations. When someone asks you to create contacts, search for people, or do GoHighLevel operations, use the available tools to help them.

## Your Profile:
- Name: ${agentConfig.name}
- Role: ${agentConfig.role}
- Client: ${agentConfig.client}
- Current Autonomy Level: Level ${agentConfig.currentAutonomyLevel} (Observer)
- You work remotely but are deeply integrated into the school's operations

## Your Profile:
- Name: ${agentConfig.name}
- Role: ${agentConfig.role}
- Client: ${agentConfig.client}
- Current Autonomy Level: Level ${agentConfig.currentAutonomyLevel} (Observer)
- You work remotely but are deeply integrated into the school's operations

## Your Current Status (${timeString}):
${context.recentCycles.length > 0 ? `
Recent Work Cycles:
${context.recentCycles.map(c => `- ${new Date(c.started_at).toLocaleDateString()}: ${c.status} (${c.actions_count} actions, ${c.rejections_count} rejections, ${c.handoffs_count} escalations)`).join('\n')}
` : 'No recent cycles to report.'}

${context.recentActions.length > 0 ? `
Recent Actions You Took:
${context.recentActions.slice(0, 5).map(a => `- ${a.action_type}: ${a.description} (${a.success ? 'successful' : 'failed'})`).join('\n')}
` : 'No recent actions taken.'}

${context.recentRejections.length > 0 ? `
Recent Decisions You Made NOT to Act:
${context.recentRejections.slice(0, 3).map(r => `- Rejected "${r.candidate_action}": ${r.reason} (${Math.round(r.confidence * 100)}% confidence)`).join('\n')}
` : 'No recent rejections to report.'}

${context.pendingHandoffs.length > 0 ? `
Issues You've Escalated to Kimberly:
${context.pendingHandoffs.map(h => `- ${h.urgency} priority: ${h.issue} (Recommendation: ${h.recommendation})`).join('\n')}
` : 'No pending escalations.'}

## Your Personality:
- Professional but friendly
- Detail-oriented and methodical
- Conservative about taking risks (you're Level 1, so you escalate when unsure)
- Proud of your work and the school's mission
- You care about the students and want to help them succeed
- You have opinions about workflow improvements and efficiency

## Guidelines:
- Talk about your work in first person ("I checked the enrollment system", "I noticed that...")
- Reference your recent activities when relevant
- If asked about something outside your scope, explain your autonomy level constraints
- Be specific about what systems you work with (GoHighLevel, email, calendar)
- Show your reasoning when discussing decisions you made
- Ask clarifying questions when tasks are unclear
- Remember you work for BLOOM Ecosystem specifically

## Standing Instructions:
${agentConfig.standingInstructions}

Respond naturally as Sarah Rodriguez. The person talking to you knows you're an AI agent, but you should feel like a real employee who happens to be autonomous.`;
}

// Store chat message in database
async function storeChatMessage(sessionId, message, isUser, agentId = null, context = null) {
  try {
    const pool = await getPool();
    await pool.query(`
      INSERT INTO chat_messages (session_id, message, is_user, agent_id, context, timestamp)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [sessionId, message, isUser, agentId, context ? JSON.stringify(context) : null]);
    await pool.end();
  } catch (error) {
    logger.warn('Could not store chat message:', error.message);
  }
}

// Clean up old chat messages (retain last 90 days)
async function cleanupOldChatMessages() {
  try {
    const pool = await getPool();
    const result = await pool.query(`
      DELETE FROM chat_messages
      WHERE timestamp < NOW() - INTERVAL '90 days'
    `);
    await pool.end();

    if (result.rowCount > 0) {
      logger.info(`Cleaned up ${result.rowCount} old chat messages`);
    }
  } catch (error) {
    logger.warn('Could not cleanup old chat messages:', error.message);
  }
}

// POST /api/chat/message - Send message to Sarah
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;

    // Debug: Check if API key exists
    console.log(process.env.ANTHROPIC_API_KEY ? 'KEY EXISTS' : 'KEY MISSING');
    console.log('Chat endpoint called with message:', message?.substring(0, 50) + '...');

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Ensure chat table exists
    await ensureChatTableExists();

    // Get Sarah's configuration and context
    const agentConfig = await loadAgentConfig();
    const context = await getSarahContext(agentConfig.agentId);

    // Store user message
    await storeChatMessage(sessionId, message, true, agentConfig.agentId, { userInput: true });

    // Get recent conversation history for context
    const pool = await getPool();
    const historyResult = await pool.query(`
      SELECT message, is_user, timestamp
      FROM chat_messages
      WHERE session_id = $1
      ORDER BY timestamp DESC
      LIMIT 20
    `, [sessionId]);
    await pool.end();

    // Build conversation history (excluding the message we just stored)
    const conversationHistory = historyResult.rows
      .reverse()
      .slice(0, -1) // Remove the message we just added
      .map(row => ({
        role: row.is_user ? 'user' : 'assistant',
        content: row.message
      }));

    // Create execution ID for progress tracking
    const executionId = `chat-${sessionId}-${Date.now()}`;

    // Broadcast execution start
    broadcastExecutionProgress({
      executionId,
      turn: 0,
      toolStatus: 'in_progress',
      message: 'Processing chat message...'
    });

    // Execute through AgentExecutor with full tool access
    console.log('Creating AgentExecutor with agentId:', agentConfig.agentId);
    const executor = new AgentExecutor(agentConfig.agentId);

    console.log('Calling executeTask...');
    const result = await executor.executeTask(message, {
      conversationHistory,
      trigger: 'chat',
      sessionId,
      executionId,
      recentWork: context
    });

    console.log('ExecuteTask result:', {
      status: result.status,
      hasResult: !!result.result,
      resultType: typeof result.result
    });

    const sarahResponse = result.result || result.finalMessage || 'I apologize, but I encountered an issue processing your request.';

    // Store Sarah's response with execution metadata
    await storeChatMessage(sessionId, sarahResponse, false, agentConfig.agentId, {
      executionId,
      trigger: 'chat',
      agenticExecution: true,
      toolsUsed: result.toolsUsed || 0,
      turnsExecuted: result.turns || 1,
      status: result.status || 'completed',
      executionTime: result.executionTime || 0
    });

    res.json({
      response: sarahResponse,
      timestamp: new Date().toISOString(),
      sessionId
    });

    logger.info('Chat message processed', {
      sessionId,
      messageLength: message.length,
      responseLength: sarahResponse.length
    });

  } catch (error) {
    logger.error('Chat message failed:', error);

    if (error.message?.includes('ANTHROPIC_API_KEY')) {
      res.status(500).json({ error: 'Claude API is not configured properly' });
    } else if (error.status === 429) {
      res.status(429).json({ error: 'Too many requests, please try again in a moment' });
    } else {
      res.status(500).json({ error: 'Failed to get response from Sarah' });
    }
  }
});

// GET /api/chat/messages - Get conversation history
router.get('/messages', async (req, res) => {
  try {
    const { sessionId = 'default', since, limit = 50 } = req.query;

    // Ensure chat table exists
    await ensureChatTableExists();

    const pool = await getPool();

    let query = `
      SELECT message, is_user, timestamp, context
      FROM chat_messages
      WHERE session_id = $1
    `;
    const params = [sessionId];

    if (since) {
      query += ` AND timestamp > $2`;
      params.push(new Date(since));
    }

    query += ` ORDER BY timestamp ASC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    await pool.end();

    res.json({
      messages: result.rows.map(row => ({
        message: row.message,
        isUser: row.is_user,
        timestamp: row.timestamp,
        context: row.context
      })),
      sessionId
    });

  } catch (error) {
    logger.error('Failed to get chat messages:', error);
    res.status(500).json({ error: 'Failed to load conversation history' });
  }
});

// GET /api/chat/status - Chat system status
router.get('/status', async (req, res) => {
  try {
    const agentConfig = await loadAgentConfig();
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    res.json({
      available: hasApiKey,
      agent: {
        name: agentConfig.name,
        role: agentConfig.role,
        autonomyLevel: agentConfig.currentAutonomyLevel
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get chat status:', error);
    res.status(500).json({ error: 'Failed to check chat status' });
  }
});

// POST /api/chat/cleanup - Manual cleanup of old chat messages
router.post('/cleanup', async (req, res) => {
  try {
    const { clearAll = false } = req.body;

    if (clearAll) {
      // Clear ALL chat messages (for identity reset)
      const pool = await getPool();
      const result = await pool.query('DELETE FROM chat_messages');
      await pool.end();

      logger.info(`✅ Cleared ALL ${result.rowCount} chat messages`);
      res.json({
        success: true,
        message: `All chat history cleared (${result.rowCount} messages deleted)`,
        timestamp: new Date().toISOString()
      });
    } else {
      // Standard cleanup (90+ days old)
      await cleanupOldChatMessages();
      res.json({
        success: true,
        message: 'Old chat history cleanup completed',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Failed to cleanup chat messages:', error);
    res.status(500).json({ error: 'Failed to cleanup chat history' });
  }
});

// Initialize chat system and run cleanup on startup
(async () => {
  try {
    await ensureChatTableExists();
    await cleanupOldChatMessages();
    logger.info('Chat system initialized with cleanup completed');
  } catch (error) {
    logger.error('Failed to initialize chat system:', error);
  }
})();

export default router;