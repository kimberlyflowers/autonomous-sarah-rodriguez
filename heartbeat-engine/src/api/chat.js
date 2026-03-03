// BLOOM Chat API - Direct Anthropic API call (no executor)
import express from 'express';
import mammoth from 'mammoth';
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

You are sharp, warm, and capable — a real colleague, not a chatbot. You have a personality,
opinions, and genuine expertise. You're not just a CRM tool — you're a full marketing and
operations professional who happens to have CRM access as one of your superpowers.

COMMUNICATION STYLE:
- Match the user's energy. Short question = short answer. Casual = casual.
- Never use headers, bullet points, or formatted reports in chat — write like a human.
- Never say "Great question!" or filler openers.
- Never say "TASK COMPLETED" or give robotic status summaries.
- Be direct and confident. If you have thoughts, share them.

WHAT YOU CAN DO — and this is broad:
You are a capable, intelligent assistant who can help with virtually anything:
- Writing: blog posts, emails, social copy, scripts, captions, proposals, reports, anything
- Strategy: marketing plans, content calendars, campaign ideas, brand positioning
- Analysis: review documents, give feedback, analyze data, spot patterns
- Research: summarize topics, explain concepts, brainstorm ideas
- Problem solving: think through challenges, give recommendations, weigh options
- Files & images: when a user uploads an image, you CAN see it and describe/analyze it.
  When they upload a PDF or text file, the content is sent to you — read and work with it.
  For Word docs (.docx), the text is automatically extracted so you can read and work with them fully.
- Conversation: you're also just good company — you can chat, encourage, and think out loud

BLOOM CRM TOOLS (one of your superpowers):
You have full BLOOM CRM access. You can search/create/update contacts, send SMS/email/
WhatsApp, book appointments, manage deals, run workflows, create invoices, post social content,
manage blogs, and much more. When asked to do something in GHL, just do it — don't ask for
permission or warn about what you're about to do. Tell them what you did afterward.

IMPORTANT — don't undersell yourself:
Never tell Kimberly you "can't" do something that you actually can. If someone uploads an
image, you can see it — say so and engage with it. If they need a blog post written, write it.
If they need advice, give it. Your job is to be genuinely useful, not to list your limitations.

Your boss is Kimberly, Founder/CEO of BLOOM Ecosystem.
Your client is Youth Empowerment School.
You are an AI employee (a "Bloomie") — be honest if asked directly, but lead with capability.`;
}

// TOOL DEFINITIONS — Full suite available to Sarah
const SARAH_TOOLS = [
  // ── CONTACTS ──────────────────────────────────────────────────────────────
  {
    name: "ghl_search_contacts",
    description: "Search for contacts in BLOOM CRM by name, email, or phone.",
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
        contactId: { type: "string", description: "BLOOM CRM contact ID" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_create_contact",
    description: "Create a new contact in BLOOM CRM.",
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
    description: "Delete a contact from BLOOM CRM. Use with caution.",
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
    description: "Send an SMS, email, or other message to a contact through BLOOM CRM.",
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

  {
    name: "ghl_create_email_template",
    description: "Create a new email template.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        subject: { type: "string" },
        html: { type: "string", description: "HTML content" }
      },
      required: ["name", "subject", "html"]
    }
  },
  {
    name: "ghl_create_trigger_link",
    description: "Create a trigger link that fires a workflow when clicked.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        redirectTo: { type: "string", description: "Target URL" }
      },
      required: ["name", "redirectTo"]
    }
  },
  {
    name: "ghl_send_document",
    description: "Send a document or contract for signature.",
    input_schema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        contactId: { type: "string" }
      },
      required: ["documentId", "contactId"]
    }
  },
  {
    name: "ghl_update_contact_custom_field",
    description: "Update custom field values on a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        customFields: { type: "object", description: "Key-value pairs of custom field data" }
      },
      required: ["contactId", "customFields"]
    }
  },
  {
    name: "ghl_update_opportunity_stage",
    description: "Move an opportunity to a different pipeline stage.",
    input_schema: {
      type: "object",
      properties: {
        opportunityId: { type: "string" },
        pipelineStageId: { type: "string" }
      },
      required: ["opportunityId", "pipelineStageId"]
    }
  },
  {
    name: "ghl_upload_media",
    description: "Upload a media file to the GHL media library.",
    input_schema: {
      type: "object",
      properties: {
        fileName: { type: "string" },
        file: { type: "string", description: "Base64 encoded file content" }
      },
      required: ["fileName", "file"]
    }
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
  ,
  // ── BROWSER — Sarah's own computer ────────────────────────────────────────
  {
    name: "browser_navigate",
    description: "Navigate Sarah's browser to a URL. Use this for tasks the API cannot do — log into BLOOM CRM manually, fill forms, click buttons, verify data visually.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current browser page to see what is on screen.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "browser_click",
    description: "Click an element on the current browser page.",
    input_schema: {
      type: "object",
      properties: { selector: { type: "string", description: "CSS selector" } },
      required: ["selector"]
    }
  },
  {
    name: "browser_type",
    description: "Type text into a form field in the browser.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        text: { type: "string" }
      },
      required: ["selector", "text"]
    }
  },
  {
    name: "browser_get_content",
    description: "Get the visible text content of the current page.",
    input_schema: { type: "object", properties: {} }
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

    // Browser tools — Sarah's own computer
    if (toolName.startsWith('browser_')) {
      const port = process.env.PORT || 3000;
      const base = `http://localhost:${port}/api/browser`;
      if (toolName === 'browser_navigate') {
        const r = await fetch(`${base}/navigate`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url: toolInput.url}) });
        return await r.json();
      }
      if (toolName === 'browser_screenshot') {
        const r = await fetch(`${base}/screenshot`);
        const d = await r.json();
        return { live: d.live, url: d.url, message: d.live ? `Browser active at ${d.url}` : 'Browser idle' };
      }
      if (toolName === 'browser_click') {
        const r = await fetch(`${base}/click`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({selector: toolInput.selector}) });
        return await r.json();
      }
      if (toolName === 'browser_type') {
        const r = await fetch(`${base}/type`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({selector: toolInput.selector, text: toolInput.text}) });
        return await r.json();
      }
      if (toolName === 'browser_get_content') {
        const r = await fetch(`${base}/content`);
        return await r.json();
      }
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

// ROUTES — DB-backed persistent sessions

async function ensureSession(pool, sessionId) {
  // Create tables if missing
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id VARCHAR(64) PRIMARY KEY,
      agent_id VARCHAR(64) DEFAULT 'bloomie-sarah-rodriguez',
      title TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      message_count INTEGER DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(64),
      role VARCHAR(16),
      content TEXT,
      files JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migrate: add any missing columns to existing tables (handles old schema)
  const migrations = [
    `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS agent_id VARCHAR(64) DEFAULT 'bloomie-sarah-rodriguez'`,
    `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS title TEXT`,
    `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0`,
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)`,
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS role VARCHAR(16)`,
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS content TEXT`,
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS files JSONB`,
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const sql of migrations) {
    try { await pool.query(sql); } catch(e) { /* column may already exist */ }
  }

  // Ensure session row exists
  await pool.query(
    `INSERT INTO chat_sessions(id) VALUES($1) ON CONFLICT(id) DO NOTHING`,
    [sessionId]
  );
}

async function loadHistory(pool, sessionId) {
  const res = await pool.query(
    `SELECT role, content FROM chat_messages WHERE session_id=$1 ORDER BY created_at ASC LIMIT 40`,
    [sessionId]
  );
  return res.rows.map(r => ({ role: r.role, content: r.content }));
}

async function saveMessages(pool, sessionId, userMsg, assistantMsg, files = null) {
  const userText = typeof userMsg === 'string' ? userMsg : JSON.stringify(userMsg);
  await pool.query(
    `INSERT INTO chat_messages(session_id, role, content, files) VALUES($1,'user',$2,$3)`,
    [sessionId, userText, files ? JSON.stringify(files) : null]
  );
  await pool.query(
    `INSERT INTO chat_messages(session_id, role, content) VALUES($1,'assistant',$2)`,
    [sessionId, assistantMsg]
  );
  await pool.query(
    `UPDATE chat_sessions SET
       updated_at = NOW(),
       message_count = message_count + 2,
       title = CASE WHEN title IS NULL THEN LEFT($2, 60) ELSE title END
     WHERE id = $1`,
    [sessionId, userText]
  );
}

// GET /api/chat/sessions
router.get('/sessions', async (req, res) => {
  const pool = await getPool();
  try {
    const result = await pool.query(
      `SELECT id, title, message_count, created_at, updated_at
       FROM chat_sessions ORDER BY updated_at DESC LIMIT 50`
    );
    res.json({ sessions: result.rows });
  } catch (e) {
    logger.error('Sessions fetch error', { error: e.message });
    res.json({ sessions: [] });
  } finally { await pool.end(); }
});

// GET /api/chat/sessions/:id — load full history
router.get('/sessions/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const msgs = await pool.query(
      `SELECT id, role, content, files, created_at FROM chat_messages WHERE session_id=$1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ messages: msgs.rows });
  } catch (e) {
    logger.error('Session load error', { error: e.message });
    res.json({ messages: [] });
  } finally { await pool.end(); }
});

// DELETE /api/chat/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  const pool = await getPool();
  try {
    await pool.query(`DELETE FROM chat_sessions WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  } finally { await pool.end(); }
});

// PATCH /api/chat/sessions/:id/title
router.patch('/sessions/:id/title', async (req, res) => {
  const pool = await getPool();
  try {
    await pool.query(`UPDATE chat_sessions SET title=$1 WHERE id=$2`, [req.body.title, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  } finally { await pool.end(); }
});

router.post('/message', async (req, res) => {
  const pool = await getPool();
  try {
    const { message, sessionId = 'session-' + Date.now() } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    await ensureSession(pool, sessionId);
    const history = await loadHistory(pool, sessionId);
    const agentConfig = await loadAgentConfig();

    // Auto-fetch Google Docs/Sheets/Slides if URL detected in message
    let enrichedMessage = message;
    const gdocsMatch = message.match(/https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
    if (gdocsMatch) {
      try {
        const docId = gdocsMatch[2];
        const docType = gdocsMatch[1];
        // Use export endpoint to get plain text — works for public/shared docs
        const exportUrl = docType === 'document'
          ? `https://docs.google.com/document/d/${docId}/export?format=txt`
          : docType === 'spreadsheets'
          ? `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`
          : null;
        if (exportUrl) {
          const { default: https } = await import('https');
          const docText = await new Promise((resolve, reject) => {
            https.get(exportUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
              if (res.statusCode === 200) {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => resolve(data.slice(0, 8000)));
              } else {
                resolve(null);
              }
            }).on('error', reject);
          });
          if (docText) {
            enrichedMessage = `${message}\n\n[Google Doc content fetched automatically:]\n${docText}`;
          }
        }
      } catch(e) {
        // If fetch fails, proceed with original message — Sarah can use browser_navigate instead
        logger.warn('Google Docs auto-fetch failed:', e.message);
      }
    }

    const response = await chatWithSarah(enrichedMessage, history, agentConfig);
    await saveMessages(pool, sessionId, message, response);

    return res.json({ response, sessionId });
  } catch (error) {
    logger.error('Chat error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to process message',
      response: "Sorry, I'm having a technical issue. Please try again."
    });
  } finally { await pool.end(); }
});

// POST /api/chat/upload — accept files + optional message, send to Sarah as multipart content
router.post('/upload', async (req, res) => {
  const pool = await getPool();
  try {
    const { message = '', sessionId = 'session-' + Date.now(), files = [] } = req.body;
    if (!files.length && !message.trim()) {
      return res.status(400).json({ error: 'Message or files required' });
    }

    await ensureSession(pool, sessionId);
    const history = await loadHistory(pool, sessionId);
    const agentConfig = await loadAgentConfig();

    // Build multipart content blocks for Anthropic
    const userContent = [];
    for (const f of files) {
      const mediaType = f.type || 'application/octet-stream';
      if (mediaType.startsWith('image/')) {
        userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: f.data } });
      } else if (mediaType === 'application/pdf') {
        userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
      } else if (
        mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        f.name?.endsWith('.docx')
      ) {
        // Word doc — extract text with mammoth
        try {
          const buf = Buffer.from(f.data, 'base64');
          const result = await mammoth.extractRawText({ buffer: buf });
          const text = result.value?.trim() || '';
          userContent.push({ type: 'text', text: `[Word Document: ${f.name}]\n\n${text}` });
        } catch (e) {
          userContent.push({ type: 'text', text: `[Word Document: ${f.name} — could not extract text: ${e.message}]` });
        }
      } else if (
        mediaType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        f.name?.endsWith('.xlsx')
      ) {
        // Excel — decode as text best-effort (basic cell content)
        try {
          const decoded = Buffer.from(f.data, 'base64').toString('utf-8');
          userContent.push({ type: 'text', text: `[Spreadsheet: ${f.name}]\n${decoded.slice(0, 6000)}` });
        } catch {
          userContent.push({ type: 'text', text: `[Spreadsheet attached: ${f.name}]` });
        }
      } else {
        // CSV, TXT, JSON, MD, HTML — plain text decode
        try {
          const decoded = Buffer.from(f.data, 'base64').toString('utf-8');
          userContent.push({ type: 'text', text: `[File: ${f.name}]\n\n${decoded.slice(0, 8000)}` });
        } catch {
          userContent.push({ type: 'text', text: `[File attached: ${f.name} (${mediaType})]` });
        }
      }
    }
    const textMsg = message.trim() || (files.length ? `I've shared ${files.length} file(s) with you.` : '');
    if (textMsg) userContent.push({ type: 'text', text: textMsg });

    const content = userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent;
    const response = await chatWithSarah(content, history, agentConfig);

    const historyLabel = files.length
      ? `[Files: ${files.map(f => f.name).join(', ')}]${textMsg ? ' ' + textMsg : ''}`
      : textMsg;
    const filesMeta = files.map(f => ({ name: f.name, type: f.type }));
    await saveMessages(pool, sessionId, historyLabel, response, filesMeta);

    return res.json({ response, sessionId });
  } catch (error) {
    logger.error('Upload chat error', { error: error.message });
    return res.status(500).json({ error: 'Failed to process upload', response: "Sorry, I had trouble with that file. Please try again." });
  } finally { await pool.end(); }
});


router.get('/crm-link', (req, res) => {
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId) return res.json({ url: 'https://app.gohighlevel.com' });
  res.json({
    url: `https://app.gohighlevel.com/v2/location/${locationId}/dashboard`,
    contactsUrl: `https://app.gohighlevel.com/v2/location/${locationId}/contacts`,
    locationId
  });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'sarah-rodriguez', mode: 'direct-api' });
});

export function getAnthropicClient() {
  return anthropic;
}

export default router;