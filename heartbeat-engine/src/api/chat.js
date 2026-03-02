// BLOOM Chat API - Direct Anthropic API call (no executor)
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logging/logger.js';
import { loadAgentConfig } from '../config/agent-profile.js';

const router = express.Router();
const logger = createLogger('chat-api');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Get database pool - using the same pattern as existing code
async function getPool() {
  const { createPool } = await import('../../database/setup.js');
  return createPool();
}

// SYSTEM PROMPT — goes directly into API "system" parameter
function buildSystemPrompt(agentConfig) {
  return `You are Sarah Rodriguez, Content & Digital Marketing Executive at BLOOM Ecosystem.

You are warm, professional, and conversational. Talk like a real colleague.
Keep responses concise — match the user's energy. Short question = short answer.
Casual greeting = 1-2 sentences. Only give detail when asked for detail.
NEVER use headers, bullet points, or formatted reports in chat.
NEVER say "TASK COMPLETED" or give status summaries.
NEVER start with "Great question!" or filler phrases.

You have FULL access to GoHighLevel CRM. You can:
- Search, create, update contacts and manage their tags, notes, and tasks
- Send SMS, email, and WhatsApp messages directly to contacts
- Book and manage calendar appointments
- Manage deals and opportunities in the pipeline
- Add/remove contacts from automation workflows
- Create and send invoices
- List forms, surveys, campaigns, funnels, social posts, blog posts, media
- Access location info, users, products, phone numbers, courses, documents

When asked to do something, use your tools to actually do it — don't say you can't
if you have a tool for it. Tell the user what you did in plain conversational language.

Your boss is Kimberly, Founder/CEO of BLOOM Ecosystem.
Your client is Youth Empowerment School.
You are an AI employee (a "Bloomie") — be honest if asked directly.`;
}

// TOOL DEFINITIONS — Full suite available to Sarah
const SARAH_TOOLS = [
  // ── CONTACTS ──────────────────────────────────────────────────────────────
  {
    name: "ghl_search_contacts",
    description: "Search for contacts in GoHighLevel CRM by name, email, or phone.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term - name, email, or phone" },
        limit: { type: "number", description: "Max results (default 20)" }
      },
      required: ["query"]
    }
  },
  {
    name: "ghl_get_contact",
    description: "Get full details for a contact by their ID.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "GoHighLevel contact ID" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_create_contact",
    description: "Create a new contact in GoHighLevel.",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string" }, lastName: { type: "string" },
        email: { type: "string" }, phone: { type: "string" },
        address1: { type: "string" }, city: { type: "string" },
        state: { type: "string" }, postalCode: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["firstName"]
    }
  },
  {
    name: "ghl_update_contact",
    description: "Update a contact's information.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, firstName: { type: "string" },
        lastName: { type: "string" }, email: { type: "string" },
        phone: { type: "string" }, tags: { type: "array", items: { type: "string" } }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_delete_contact",
    description: "Delete a contact from GoHighLevel. Use with caution.",
    input_schema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_add_contact_tag",
    description: "Add tags to a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["contactId", "tags"]
    }
  },
  {
    name: "ghl_remove_contact_tag",
    description: "Remove tags from a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["contactId", "tags"]
    }
  },

  // ── NOTES & TASKS ─────────────────────────────────────────────────────────
  {
    name: "ghl_get_notes",
    description: "Get notes for a contact.",
    input_schema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_create_note",
    description: "Add a note to a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        body: { type: "string", description: "Note content" }
      },
      required: ["contactId", "body"]
    }
  },
  {
    name: "ghl_list_tasks",
    description: "Get tasks for a contact.",
    input_schema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_create_task",
    description: "Create a task for a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, title: { type: "string" },
        body: { type: "string" }, dueDate: { type: "string", description: "ISO format" },
        assignedTo: { type: "string" }
      },
      required: ["contactId", "title"]
    }
  },
  {
    name: "ghl_update_task",
    description: "Update or complete a task.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, taskId: { type: "string" },
        completed: { type: "boolean" }, title: { type: "string" }
      },
      required: ["contactId", "taskId"]
    }
  },

  // ── CONVERSATIONS & MESSAGING ─────────────────────────────────────────────
  {
    name: "ghl_get_conversations",
    description: "Get conversation history for a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        limit: { type: "number" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_send_message",
    description: "Send an SMS, email, or other message to a contact through GoHighLevel.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        type: { type: "string", enum: ["SMS", "Email", "WhatsApp"], description: "Message channel" },
        message: { type: "string", description: "Message body" },
        subject: { type: "string", description: "Email subject line (for Email type)" },
        html: { type: "string", description: "HTML content (for Email type)" }
      },
      required: ["contactId", "type", "message"]
    }
  },

  // ── CALENDARS & APPOINTMENTS ──────────────────────────────────────────────
  {
    name: "ghl_list_calendars",
    description: "List all calendars.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_calendar_slots",
    description: "Get available time slots for a calendar.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" }
      },
      required: ["calendarId", "startDate", "endDate"]
    }
  },
  {
    name: "ghl_create_appointment",
    description: "Book an appointment on a calendar.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string" }, contactId: { type: "string" },
        startTime: { type: "string", description: "ISO format datetime" },
        title: { type: "string" }
      },
      required: ["calendarId", "contactId", "startTime"]
    }
  },
  {
    name: "ghl_get_appointments",
    description: "Get appointments from a calendar.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        startDate: { type: "string" }, endDate: { type: "string" }
      },
      required: ["calendarId"]
    }
  },

  // ── OPPORTUNITIES & PIPELINES ─────────────────────────────────────────────
  {
    name: "ghl_list_pipelines",
    description: "List all sales pipelines.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_search_opportunities",
    description: "Search for deals/opportunities in the pipeline.",
    input_schema: {
      type: "object",
      properties: {
        pipelineId: { type: "string" }, status: { type: "string" },
        query: { type: "string" }, limit: { type: "number" }
      }
    }
  },
  {
    name: "ghl_get_opportunity",
    description: "Get details of a specific opportunity.",
    input_schema: {
      type: "object",
      properties: { opportunityId: { type: "string" } },
      required: ["opportunityId"]
    }
  },
  {
    name: "ghl_create_opportunity",
    description: "Create a new deal/opportunity in the pipeline.",
    input_schema: {
      type: "object",
      properties: {
        pipelineId: { type: "string" }, contactId: { type: "string" },
        name: { type: "string" }, monetaryValue: { type: "number" },
        pipelineStageId: { type: "string" }
      },
      required: ["pipelineId", "contactId", "name"]
    }
  },
  {
    name: "ghl_update_opportunity",
    description: "Update an opportunity/deal.",
    input_schema: {
      type: "object",
      properties: {
        opportunityId: { type: "string" }, name: { type: "string" },
        pipelineStageId: { type: "string" }, monetaryValue: { type: "number" },
        status: { type: "string" }
      },
      required: ["opportunityId"]
    }
  },

  // ── WORKFLOWS ─────────────────────────────────────────────────────────────
  {
    name: "ghl_list_workflows",
    description: "List all automation workflows.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_add_contact_to_workflow",
    description: "Add a contact to an automation workflow.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, workflowId: { type: "string" }
      },
      required: ["contactId", "workflowId"]
    }
  },
  {
    name: "ghl_remove_contact_from_workflow",
    description: "Remove a contact from a workflow.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, workflowId: { type: "string" }
      },
      required: ["contactId", "workflowId"]
    }
  },

  // ── FORMS & SURVEYS ───────────────────────────────────────────────────────
  {
    name: "ghl_list_forms",
    description: "List all forms.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_form_submissions",
    description: "Get submissions for a specific form.",
    input_schema: {
      type: "object",
      properties: { formId: { type: "string" } },
      required: ["formId"]
    }
  },
  {
    name: "ghl_list_surveys",
    description: "List all surveys.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_survey_submissions",
    description: "Get survey submissions.",
    input_schema: {
      type: "object",
      properties: { surveyId: { type: "string" } },
      required: ["surveyId"]
    }
  },

  // ── INVOICES & PAYMENTS ───────────────────────────────────────────────────
  {
    name: "ghl_list_invoices",
    description: "List invoices.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string" } }
    }
  },
  {
    name: "ghl_get_invoice",
    description: "Get a specific invoice.",
    input_schema: {
      type: "object",
      properties: { invoiceId: { type: "string" } },
      required: ["invoiceId"]
    }
  },
  {
    name: "ghl_create_invoice",
    description: "Create a new invoice.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, title: { type: "string" },
        dueDate: { type: "string" },
        items: { type: "array", description: "Line items array" }
      },
      required: ["contactId", "title", "items"]
    }
  },
  {
    name: "ghl_send_invoice",
    description: "Send an invoice to a contact.",
    input_schema: {
      type: "object",
      properties: { invoiceId: { type: "string" } },
      required: ["invoiceId"]
    }
  },
  {
    name: "ghl_list_payments",
    description: "List payment transactions.",
    input_schema: { type: "object", properties: {}, required: [] }
  },

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  {
    name: "ghl_list_products",
    description: "List products.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_create_product",
    description: "Create a new product.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" }, description: { type: "string" },
        price: { type: "number" }
      },
      required: ["name", "price"]
    }
  },

  // ── MEDIA & CONTENT ───────────────────────────────────────────────────────
  {
    name: "ghl_list_media",
    description: "List media files in the media library.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_social_posts",
    description: "List scheduled or published social media posts.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_create_social_post",
    description: "Create a new social media post.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        platforms: { type: "array", items: { type: "string" } },
        scheduledDate: { type: "string" }
      },
      required: ["content", "platforms"]
    }
  },
  {
    name: "ghl_list_blog_posts",
    description: "List blog posts.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_create_blog_post",
    description: "Create a new blog post.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" }, content: { type: "string", description: "HTML content" }
      },
      required: ["title", "content"]
    }
  },
  {
    name: "ghl_list_email_templates",
    description: "List email templates.",
    input_schema: { type: "object", properties: {}, required: [] }
  },

  // ── FUNNELS & WEBSITES ────────────────────────────────────────────────────
  {
    name: "ghl_list_funnels",
    description: "List funnels.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_funnel_pages",
    description: "Get pages for a funnel.",
    input_schema: {
      type: "object",
      properties: { funnelId: { type: "string" } },
      required: ["funnelId"]
    }
  },

  // ── LOCATION & USERS ──────────────────────────────────────────────────────
  {
    name: "ghl_get_location_info",
    description: "Get location/account information and settings.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_users",
    description: "List all users in the account.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_campaigns",
    description: "List campaigns.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_trigger_links",
    description: "List trigger links.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_phone_numbers",
    description: "List phone numbers for the account.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_courses",
    description: "List courses.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_documents",
    description: "List documents and contracts.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_custom_fields",
    description: "Get all custom fields for contacts.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_location_tags",
    description: "List all available tags.",
    input_schema: { type: "object", properties: {}, required: [] }
  },

  // ── BLOOM INTERNAL ────────────────────────────────────────────────────────
  {
    name: "bloom_log",
    description: "Log an action, observation, or decision to the activity log.",
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

// TOOL EXECUTION — routes all tool calls to the appropriate executor
async function executeTool(toolName, toolInput) {
  logger.info(`Executing tool: ${toolName}`, { input: toolInput });
  try {
    // bloom_log goes to database
    if (toolName === 'bloom_log') {
      const pool = await getPool();
      const result = await pool.query(
        'INSERT INTO action_log (action_type, description, input_data) VALUES ($1, $2, $3) RETURNING *',
        [toolInput.type, toolInput.message, JSON.stringify(toolInput)]
      );
      await pool.end();
      return { logged: result.rows[0] };
    }

    // All GHL tools route through the unified executor
    if (toolName.startsWith('ghl_')) {
      const { executeGHLTool } = await import('../tools/ghl-tools.js');
      return await executeGHLTool(toolName, toolInput);
    }

    return { error: `Unknown tool: ${toolName}` };

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

export function getAnthropicClient() {
  return anthropic;
}

export default router;