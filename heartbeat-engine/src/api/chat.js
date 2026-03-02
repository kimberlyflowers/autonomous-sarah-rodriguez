// BLOOM Chat API - Direct Anthropic API call (no executor)
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logging/logger.js';
import { loadAgentConfig } from '../config/agent-profile.js';
import { createPool } from '../../database/setup.js';

const router = express.Router();
const logger = createLogger('chat-api');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// SYSTEM PROMPT — goes directly into API "system" parameter
function buildSystemPrompt(agentConfig) {
  return `You are Sarah Rodriguez, Content & Digital Marketing Executive at BLOOM Ecosystem.

You are warm, professional, and conversational. Talk like a real colleague.
Keep responses concise — match the user's energy. Short question = short answer.
Casual greeting = 1-2 sentences. Only give detail when asked for detail.
NEVER use headers, bullet points, or formatted reports in chat.
NEVER say "TASK COMPLETED" or give status summaries.
NEVER start with "Great question!" or filler phrases.

You have tools for GoHighLevel CRM and task management. When asked to do
something, use your tools to actually do it. Tell the user what you did
in plain conversational language.

Your boss is Kimberly, Founder/CEO of BLOOM Ecosystem.
Your client is Youth Empowerment School.
You are an AI employee (a "Bloomie") — be honest if asked directly.`;
}

// TOOL DEFINITIONS — Claude Code: verify these match your actual GHL tools
const SARAH_TOOLS = [
  {
    name: "ghl_search_contacts",
    description: "Search for contacts in GoHighLevel CRM. Use when asked to find or look up a person.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term - name, email, or phone" }
      },
      required: ["query"]
    }
  },
  {
    name: "ghl_create_contact",
    description: "Create a new contact in GoHighLevel. Use when asked to add a new lead or person.",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to apply" }
      },
      required: ["firstName", "lastName"]
    }
  },
  {
    name: "ghl_get_contact",
    description: "Get full details for a contact by ID.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "GoHighLevel contact ID" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_update_contact",
    description: "Update a contact's information in GoHighLevel.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID to update" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_list_pipelines",
    description: "List all pipelines in GoHighLevel.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_opportunities",
    description: "List opportunities/deals in GoHighLevel.",
    input_schema: {
      type: "object",
      properties: {
        pipelineId: { type: "string", description: "Pipeline ID to filter by" }
      },
      required: []
    }
  },
  {
    name: "bloom_log",
    description: "Log an action or observation to the activity log.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["action", "observation", "error", "decision"] },
        message: { type: "string" }
      },
      required: ["type", "message"]
    }
  }
];

// TOOL EXECUTION — maps tool names to actual functions
async function executeTool(toolName, toolInput) {
  logger.info(`Executing tool: ${toolName}`, { input: toolInput });
  try {
    switch (toolName) {
      case 'ghl_search_contacts':
      case 'ghl_create_contact':
      case 'ghl_get_contact':
      case 'ghl_update_contact':
      case 'ghl_list_pipelines':
      case 'ghl_list_opportunities': {
        const { executeGHLTool } = await import('../tools/ghl-tools.js');
        return await executeGHLTool(toolName, toolInput);
      }
      case 'bloom_log': {
        const pool = createPool();
        const result = await pool.query(
          'INSERT INTO action_log (action_type, description, input_data) VALUES ($1, $2, $3) RETURNING *',
          [toolInput.type, toolInput.message, JSON.stringify(toolInput)]
        );
        await pool.end();
        return { logged: result.rows[0] };
      }
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    logger.error(`Tool failed: ${toolName}`, { error: error.message });
    return { error: error.message };
  }
}

// AGENTIC LOOP — handles multi-turn tool calling
async function chatWithSarah(userMessage, history, agentConfig) {
  const systemPrompt = buildSystemPrompt(agentConfig);
  const messages = [...history, { role: 'user', content: userMessage }];
  let currentMessages = [...messages];

  for (let round = 0; round < 10; round++) {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: currentMessages,
      tools: SARAH_TOOLS
    });

    if (response.stop_reason === 'end_turn') {
      return response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    }

    if (response.stop_reason === 'tool_use') {
      currentMessages.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result)
          });
        }
      }
      currentMessages.push({ role: 'user', content: toolResults });
    }
  }
  return "I got a bit carried away. Let me know if you need me to try a simpler approach.";
}

// ROUTES
const conversations = new Map();

router.post('/message', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    if (!conversations.has(sessionId)) conversations.set(sessionId, []);
    const history = conversations.get(sessionId);
    const agentConfig = await loadAgentConfig();

    const response = await chatWithSarah(message, history, agentConfig);

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: response });
    if (history.length > 40) conversations.set(sessionId, history.slice(-40));

    return res.json({ response, sessionId });
  } catch (error) {
    logger.error('Chat error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to process message',
      response: "Sorry, I'm having a technical issue. Please try again."
    });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'sarah-rodriguez', mode: 'direct-api' });
});

export default router;