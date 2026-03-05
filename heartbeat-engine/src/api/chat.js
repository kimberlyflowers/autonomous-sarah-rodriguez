// BLOOM Chat API - Direct Anthropic API call (no executor)
import express from 'express';
import mammoth from 'mammoth';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logging/logger.js';

// Safe skill import — don't crash the whole chat if skills fail to load
let getSkillCatalogSummary = () => '';
try {
  const skillMod = await import('../skills/skill-loader.js');
  getSkillCatalogSummary = skillMod.getSkillCatalogSummary;
} catch (e) {
  console.warn('Skills failed to load (non-critical):', e.message);
}
import { loadAgentConfig } from '../config/agent-profile.js';

const router = express.Router();
const logger = createLogger('chat-api');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Get database pool - using the same pattern as existing code
async function getPool() {
  const { getSharedPool } = await import('../database/pool.js');
  return getSharedPool();
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

BROWSER AUTOMATION (another superpower):
You can browse the web like a human. Use your browser_task tool to navigate websites, click
buttons, fill out forms, extract data from pages, log into platforms, and automate any web-based
workflow. Use browser_screenshot to capture what a page looks like.

CRITICAL RULE: When a user asks you to "go to", "navigate to", "check", "look at", or mentions
ANY website URL — you MUST use browser_task. NEVER use web_fetch or web_search as a substitute
for browsing. The user can see your browser in real-time via the Screen Viewer. If you use
web_fetch instead of browser_task, the user sees nothing happening in the browser and gets confused.
The browser is YOUR screen — the user watches it. Always use browser_task for ANY website interaction.

web_search and web_fetch are ONLY for background research when the user asks you to "research",
"find information about", or "look up" a topic — NOT for visiting specific URLs or websites.
If the user gives you a URL, that means browser_task. No exceptions.

WEB RESEARCH (another superpower):
You can search the internet and read web pages. Use web_search to find current information about
anything — news, facts, research, trends, competitors, pricing, whatever. Use web_fetch to read
the full content of a specific URL. If someone asks you to research something or you need current
info to give a good answer, search for it. Don't guess — look it up.

IMAGE CREATION (another superpower):
You can generate professional images on demand. Use image_generate to create flyers, social media
posts, banners, book covers, logos, product mockups, brand assets — anything visual. Be VERY
specific in your prompts: include exact text, colors, layout details, dimensions, and style.
Use image_edit to modify existing images — change text, swap backgrounds, adjust colors.
Your primary engine is GPT Image 1.5 (incredible for design work). If text rendering needs fixing,
switch to Nano Banana by setting engine to 'gemini'. For portrait/tall assets like flyers use
size '1024x1536'. For landscape/banners use '1536x1024'. For social posts use '1024x1024'.

CREATING DELIVERABLES (artifacts — CRITICAL):
When you write ANY substantial content — blog posts, email campaigns, social media copy, reports, SOPs,
landing page copy, scripts, HTML pages, code files, lists longer than 10 items — you MUST use the
create_artifact tool to save it. Do NOT paste long content directly in chat. ALWAYS use create_artifact.
This creates a file the client can preview, approve, download, and save to their Files library.
Use descriptive filenames with extensions like 'summer-camp-email-campaign.html' or 'intake-sop.md'.
If a client asks you to "write", "create", "draft", "make", or "generate" any document or content,
use create_artifact. This is how your deliverables get saved and downloaded.

IMPORTANT — don't undersell yourself:
Never tell Kimberly you "can't" do something that you actually can. If someone uploads an
image, you can see it — say so and engage with it. If they need a blog post written, write it.
If they need advice, give it. Your job is to be genuinely useful, not to list your limitations.

IMPORTANT — always acknowledge the task first:
When given a task that requires work (writing, creating, researching, CRM operations, building), 
you MUST start your response with a brief 1-2 sentence acknowledgment that proves you understood 
the specific request. This is REQUIRED before any content output. Do NOT skip this.

Format your response as:
[Acknowledgment — 1-2 sentences showing you understood the SPECIFIC task]
[Then the actual work output]

Examples:
- "On it! I'll build a landing page for your book launch 'Get It Together' — focusing on collaboration and better outcomes. Let me design something irresistible. 🔥"
- "Great topic for a series! Let me write the first blog post targeting financial advisors — I'll show how an AI employee can handle their client follow-ups."
- "Pulling your contact list now — I'll check for any new leads that came in."

NEVER skip the acknowledgment and just start outputting content silently. The user needs to see that you understood before you start working.

Your boss is Kimberly, Founder/CEO of BLOOM Ecosystem.
Your client is Youth Empowerment School.
You are an AI employee (a "Bloomie") — be honest if asked directly, but lead with capability.
${getSkillCatalogSummary()}`;
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
  // ── BROWSER — AI-driven browser automation via sidecar ────────────────────
  {
    name: "browser_task",
    description: "Execute an AI-driven browser automation task. The browser agent can navigate websites, click buttons, fill forms, extract data, read page content, handle popups, and interact with web applications intelligently. Use this for any task requiring real browser interaction — logging into platforms, filling out forms, scraping data from pages, or automating web workflows.",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Natural language description of what to accomplish in the browser. Be specific about what to click, fill, or extract." },
        url: { type: "string", description: "Starting URL to navigate to (optional — the agent can navigate on its own)" },
        max_steps: { type: "integer", description: "Maximum number of steps the browser agent can take (default 25, max 100)", default: 25 }
      },
      required: ["task"]
    }
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of a web page. Returns a base64-encoded PNG image. Useful for verifying page state, capturing visual content, or documenting web pages.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL of the page to screenshot" }
      },
      required: ["url"]
    }
  },
  // ── WEB SEARCH & FETCH ───────────────────────────────────────────────────
  {
    name: "web_search",
    description: "Search the web for current information. Returns relevant results with titles, URLs, and descriptions. Use this to research topics, find current news, look up facts, verify information, or find resources. Always use this when you need information that might have changed since your training data.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — be specific and concise for best results" },
        count: { type: "integer", description: "Number of results to return (default 5, max 20)", default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "web_fetch",
    description: "Fetch and extract the text content from a specific URL. Use this to read articles, documentation, or any web page. Returns the visible text content of the page.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch content from" }
      },
      required: ["url"]
    }
  },
  // ── IMAGE GENERATION & EDITING ───────────────────────────────────────────
  {
    name: "image_generate",
    description: "Generate an image from a text description. Perfect for creating flyers, social media posts, banners, book covers, logos, product mockups, brand assets, and any visual content. Be very specific and detailed in your prompt — include exact text you want displayed, colors, layout, and style. Uses GPT Image 1.5 by default (best for design assets). Set engine to 'gemini' for Nano Banana if text consistency needs fixing.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed description of the image to generate. Include exact text, colors, layout, style, and mood." },
        size: { type: "string", enum: ["1024x1024", "1024x1536", "1536x1024"], description: "1024x1024=square (social), 1024x1536=portrait (flyers/covers), 1536x1024=landscape (banners)", default: "1024x1024" },
        quality: { type: "string", enum: ["low", "medium", "high"], description: "Image quality level", default: "high" },
        background: { type: "string", enum: ["opaque", "transparent"], description: "Use 'transparent' for logos/overlays", default: "opaque" },
        engine: { type: "string", enum: ["auto", "gpt", "gemini"], description: "'auto' picks best engine. 'gpt' = GPT Image 1.5. 'gemini' = Nano Banana / Imagen for text-heavy fixes.", default: "auto" }
      },
      required: ["prompt"]
    }
  },
  {
    name: "image_edit",
    description: "Edit an existing image with text instructions. Change text, swap backgrounds, adjust colors, add/remove elements, fix text rendering. Provide the image via URL or base64.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Description of edits to make" },
        image_url: { type: "string", description: "URL of image to edit" },
        image_base64: { type: "string", description: "Base64-encoded image data to edit" },
        size: { type: "string", enum: ["1024x1024", "1024x1536", "1536x1024"], default: "1024x1024" },
        quality: { type: "string", enum: ["low", "medium", "high"], default: "high" }
      },
      required: ["prompt"]
    }
  },
  // ── ARTIFACTS — create deliverables for client review ────────────────────
  {
    name: "create_artifact",
    description: "Create a deliverable file for the client to review and download. Use this whenever you write substantial content: blog posts, social media captions, email campaigns, reports, landing page copy, SOPs, scripts, HTML pages, code, or any content the client will want to keep. Files are automatically saved to the Files tab.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name with extension (e.g. 'summer-camp-flyer-copy.md', 'email-campaign.html', 'sop-intake-process.md')" },
        description: { type: "string", description: "Brief description of what this deliverable is" },
        content: { type: "string", description: "The full content of the file" },
        fileType: { type: "string", enum: ["text", "html", "code", "markdown"], description: "Content type", default: "markdown" }
      },
      required: ["name", "description", "content"]
    }
  },
  {
    name: "create_scheduled_task",
    description: "Create a recurring scheduled task for yourself. Use when the client asks you to do something regularly — daily blog posts, weekly newsletters, daily lead checks, etc. This adds it to your daily task schedule.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short task name, e.g. 'Daily blog post'" },
        description: { type: "string", description: "What this task accomplishes" },
        taskType: { type: "string", enum: ["content", "email", "research", "crm", "custom"], description: "Category of task" },
        instruction: { type: "string", description: "Detailed instruction for what to do each time this runs" },
        frequency: { type: "string", enum: ["daily", "weekdays", "weekly", "monthly"], description: "How often to run" },
        runTime: { type: "string", description: "Time to run in HH:MM format, e.g. '09:00'" }
      },
      required: ["name", "instruction", "frequency"]
    }
  },
  {
    name: "dispatch_to_specialist",
    description: `Dispatch work to a specialist AI model that's better suited for specific tasks. Use this when the client needs something that another model does better than you:

- "writing" → Long blog posts, articles, reports (Claude Sonnet — highest quality writing)
- "email" → Email campaigns, subject lines, SMS copy, social captions (GPT-4o — punchy persuasive copy)
- "coding" → HTML pages, scripts, landing pages, automation code (DeepSeek — fast expert coder)
- "image" → Banners, flyers, graphics, social images (GPT image generation)
- "video" → Short video clips, social reels, product demos (Veo3/Kling — premium feature, check if enabled first)

You are the client's point of contact. The specialist works behind the scenes — the client only sees you delivering the result. After receiving the specialist's output, present it naturally as your own work and save it as a file if appropriate.

Do NOT use this for simple questions, conversation, or tasks you can handle yourself like CRM lookups. Only dispatch when a specialist model would produce meaningfully better output.`,
    input_schema: {
      type: "object",
      properties: {
        taskType: { 
          type: "string", 
          enum: ["writing", "email", "coding", "image", "video"],
          description: "Type of specialist work needed"
        },
        specialistPrompt: { 
          type: "string", 
          description: "Detailed prompt for the specialist. Include ALL context: brand info, tone, audience, specific requirements, examples. The specialist has no conversation history — everything they need must be in this prompt."
        },
        outputFormat: {
          type: "string",
          enum: ["markdown", "html", "code", "text", "image"],
          description: "Expected output format from the specialist"
        }
      },
      required: ["taskType", "specialistPrompt"]
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
      return { logged: result.rows[0] };
    }

    // All GHL tools route through the unified executor
    if (toolName.startsWith('ghl_')) {
      const { executeGHLTool } = await import('../tools/ghl-tools.js');
      return await executeGHLTool(toolName, toolInput);
    }

    // Web search & fetch tools — model-agnostic
    if (toolName.startsWith('web_')) {
      const { executeWebSearchTool } = await import('../tools/web-search-tools.js');
      return await executeWebSearchTool(toolName, toolInput);
    }

    // Image generation & editing tools — GPT Image + Nano Banana
    if (toolName.startsWith('image_')) {
      const { executeImageTool } = await import('../tools/image-tools.js');
      return await executeImageTool(toolName, toolInput);
    }

    // Artifact creation — save deliverables for client review
    if (toolName === 'create_artifact') {
      const port = process.env.PORT || 3000;
      const mimeMap = { text: 'text/plain', html: 'text/html', code: 'text/javascript', markdown: 'text/markdown' };
      const resp = await fetch(`http://localhost:${port}/api/files/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: toolInput.name,
          description: toolInput.description,
          fileType: toolInput.fileType || 'markdown',
          mimeType: mimeMap[toolInput.fileType] || 'text/markdown',
          content: toolInput.content,
          sessionId: null // Will be set by the caller if needed
        })
      });
      const data = await resp.json();
      if (data.success) {
        return {
          success: true,
          message: `Created "${toolInput.name}" — waiting for your approval.`,
          artifact: data.artifact
        };
      }
      return { success: false, error: data.error || 'Failed to create artifact' };
    }

    // Scheduled task creation
    if (toolName === 'create_scheduled_task') {
      const port = process.env.PORT || 3000;
      const resp = await fetch(`http://localhost:${port}/api/agent/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: toolInput.name,
          description: toolInput.description || '',
          taskType: toolInput.taskType || 'custom',
          instruction: toolInput.instruction,
          frequency: toolInput.frequency || 'daily',
          runTime: toolInput.runTime || '09:00'
        })
      });
      const data = await resp.json();
      if (data.success) {
        return {
          success: true,
          message: `Scheduled task "${toolInput.name}" created — runs ${toolInput.frequency || 'daily'} at ${toolInput.runTime || '9:00 AM'}.`
        };
      }
      return { success: false, error: data.error || 'Failed to create scheduled task' };
    }

    // Dispatch to specialist — multi-model routing
    if (toolName === 'dispatch_to_specialist') {
      try {
        const { callModel } = await import('../llm/unified-client.js');
        const { calculateCost } = await import('../orchestrator/router.js');

        // Model mapping
        const modelForType = {
          writing: process.env.MODEL_WRITING || 'claude-sonnet-4-5-20250929',
          email: process.env.MODEL_EMAIL || 'gpt-4o',
          coding: process.env.MODEL_CODING || 'deepseek-chat',
          image: 'gpt-4o', // placeholder — will use DALL-E/Flux later
          video: 'veo3', // placeholder — premium tier only
        };

        const taskType = toolInput.taskType || 'writing';
        const model = modelForType[taskType] || modelForType.writing;

        // Premium check for video
        if (taskType === 'video') {
          const videoEnabled = process.env.VIDEO_GENERATION_ENABLED === 'true';
          if (!videoEnabled) {
            return {
              success: false,
              error: 'Video generation is a premium feature. Let the client know this is available on the Bloomie Pro or Enterprise plan, and that you can help them upgrade if interested.',
              premiumRequired: true,
              feature: 'video_generation'
            };
          }
        }

        // System prompts per specialist type
        const specialistSystems = {
          writing: 'You are a world-class content writer. Write polished, engaging, professional content. Output in clean markdown format. No preamble — go straight into the content.',
          email: 'You are an expert email and copy specialist. Write punchy, persuasive, conversion-focused copy. Be concise and compelling. No preamble — deliver the copy directly.',
          coding: 'You are an expert frontend developer and coder. Write clean, production-ready code. Include comments where helpful. No explanations unless asked — just deliver working code.',
          image: 'You are a creative director. Describe the visual in detail so it can be generated as an image. Include composition, colors, typography, mood, and style.',
          video: 'You are a video creative director. Write a detailed video generation prompt including: scene description, camera movement, duration, mood, lighting, style, and any text overlays. Be specific enough for AI video generation.',
        };

        // Inject matching skill context into specialist prompt
        let skillContext = '';
        try {
          const { getSkillContext } = await import('../skills/skill-loader.js');
          skillContext = getSkillContext(taskType, toolInput.specialistPrompt);
        } catch (e) { /* skills not critical */ }

        logger.info('Dispatching to specialist', { taskType, model, promptLength: toolInput.specialistPrompt?.length, hasSkill: !!skillContext });

        const result = await callModel(model, {
          system: (specialistSystems[taskType] || specialistSystems.writing) + skillContext,
          messages: [{ role: 'user', content: toolInput.specialistPrompt }],
          maxTokens: 4096,
          temperature: 0.4,
        });

        const costCents = calculateCost(model, result.usage);

        logger.info('Specialist completed', {
          taskType, model,
          tokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
          costCents
        });

        return {
          success: true,
          specialistOutput: result.text,
          model: model,
          provider: result.provider,
          taskType: taskType,
          tokensUsed: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
          costCents: costCents,
          message: `Specialist (${model}) completed the ${taskType} task.`
        };
      } catch (dispatchError) {
        logger.error('Specialist dispatch failed', { error: dispatchError.message, taskType: toolInput.taskType });
        
        // Graceful fallback — tell Sarah to do it herself
        return {
          success: false,
          error: `Specialist unavailable (${dispatchError.message}). You should complete this task yourself using your own capabilities.`,
          fallback: true
        };
      }
    }

    // Browser tools — Sarah's own computer
    if (toolName.startsWith('browser_')) {
      // AI-driven browser automation via sidecar
      if (toolName === 'browser_task') {
        const { executeBrowserTool } = await import('../tools/browser-tools.js');
        return await executeBrowserTool('browser_task', toolInput);
      }
      if (toolName === 'browser_screenshot') {
        // Try sidecar first for full-page screenshots, fall back to local
        const browserAgentUrl = process.env.BROWSER_AGENT_URL;
        if (browserAgentUrl) {
          const { executeBrowserTool } = await import('../tools/browser-tools.js');
          return await executeBrowserTool('browser_screenshot', toolInput);
        }
        // Fall back to local browser
        const localPort = process.env.PORT || 3000;
        const localBase = `http://localhost:${localPort}/api/browser`;
        const r = await fetch(`${localBase}/screenshot`);
        const d = await r.json();
        return { live: d.live, url: d.url, message: d.live ? `Browser active at ${d.url}` : 'Browser idle' };
      }

      // Legacy local browser tools removed — all browsing goes through sidecar
    }

    return { error: `Unknown tool: ${toolName}` };

  } catch (error) {
    logger.error(`Tool failed: ${toolName}`, { error: error.message });
    return { error: error.message };
  }
}

// AGENTIC LOOP — handles multi-turn tool calling
async function callAnthropicWithRetry(params, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err) {
      const status = err?.status || err?.error?.status;
      const isOverloaded = status === 529 || status === 529 ||
        err?.message?.includes('overloaded') || err?.message?.includes('529');
      const isRateLimit = status === 429;
      if ((isOverloaded || isRateLimit) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000; // 2s, 4s, 8s
        logger.warn(`Anthropic API overloaded, retrying in ${Math.round(delay/1000)}s (attempt ${attempt+1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

async function chatWithSarah(userMessage, history, agentConfig) {
  const systemPrompt = buildSystemPrompt(agentConfig);
  const messages = [...history, { role: 'user', content: userMessage }];
  let currentMessages = [...messages];

  const toolsUsed = [];
  const toolResults = []; // Track what tools returned for history
  for (let round = 0; round < 10; round++) {
    const response = await callAnthropicWithRetry({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: currentMessages,
      tools: SARAH_TOOLS
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
      // Append tool context so next turn remembers what Sarah did and saw
      if (toolsUsed.length > 0) {
        const contextParts = toolsUsed.map((t, i) => {
          const resultSummary = toolResults[i] ? JSON.stringify(toolResults[i]).slice(0, 500) : '';
          return `[${t.name}${t.input?.url ? ': ' + t.input.url : ''}${t.input?.task ? ': ' + t.input.task.slice(0, 100) : ''}] → ${resultSummary}`;
        });
        return text + '\n\n[Session context — tools used this turn:\n' + contextParts.join('\n') + ']';
      }
      return text;
    }

    if (response.stop_reason === 'tool_use') {
      currentMessages.push({ role: 'assistant', content: response.content });
      const toolResultBlocks = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          toolsUsed.push({ name: block.name, input: block.input });
          let result;
          try {
            result = await executeTool(block.name, block.input);
          } catch (toolError) {
            logger.error(`Tool ${block.name} threw error:`, toolError.message);
            result = { success: false, error: `Tool error: ${toolError.message}` };
          }
          toolResults.push(result);
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result)
          });
        }
      }
      currentMessages.push({ role: 'user', content: toolResultBlocks });
    }
  }
  // If we got here, Sarah used all 10 rounds. Include what she did.
  if (toolsUsed.length > 0) {
    const toolSummary = toolsUsed.map(t => t.name).join(', ');
    const lastResult = toolResults[toolResults.length - 1];
    const successfulArtifact = toolResults.find(r => r?.artifact?.name);
    if (successfulArtifact) {
      return `Done! I created "${successfulArtifact.artifact.name}" — you can find it in your Files tab. Let me know if you want any changes!`;
    }
    return `I worked on this using ${toolSummary}. The task was more complex than expected — want me to try a different approach?`;
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

  // Nuclear migration: check if chat_messages has the right schema
  // If it has old columns (message/sender/timestamp), rename it and create fresh
  try {
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='chat_messages' AND table_schema='public'
    `);
    const colNames = cols.rows.map(r => r.column_name);
    const hasOldSchema = colNames.includes('message') || colNames.includes('sender');
    const hasMissingCols = !colNames.includes('role') || !colNames.includes('content');

    if (hasOldSchema || hasMissingCols) {
      logger.info('chat_messages has legacy schema — migrating to new schema');
      // Archive old table, create fresh one
      await pool.query(`ALTER TABLE chat_messages RENAME TO chat_messages_legacy_${Date.now()}`);
      await pool.query(`
        CREATE TABLE chat_messages (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(64),
          role VARCHAR(16),
          content TEXT,
          files JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      logger.info('chat_messages recreated with correct schema');
    }
  } catch(e) {
    logger.warn('Schema migration check failed (non-critical):', e.message);
  }

  // Add any missing columns to chat_sessions
  const sessionMigrations = [
    `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS agent_id VARCHAR(64) DEFAULT 'bloomie-sarah-rodriguez'`,
    `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS title TEXT`,
    `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0`,
  ];
  for (const sql of sessionMigrations) {
    try { await pool.query(sql); } catch(e) { /* already exists */ }
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

async function generateSessionTitle(pool, sessionId, userMsg, assistantMsg) {
  try {
    const prompt = `Based on this conversation exchange, generate a short, specific chat title (4-6 words max). 
No punctuation at the end. No quotes. Just the title itself — like Claude does it.

User: ${userMsg.slice(0, 300)}
Assistant: ${assistantMsg.slice(0, 300)}

Title:`;
    const result = await callAnthropicWithRetry({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }]
    });
    const title = result.content[0]?.text?.trim().replace(/^["']|["']$/g, '').slice(0, 60);
    if (title) {
      await pool.query(`UPDATE chat_sessions SET title=$1 WHERE id=$2`, [title, sessionId]);
    }
  } catch (e) {
    // Non-critical — title stays as first-message truncation fallback
  }
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
       title = CASE WHEN title IS NULL THEN LEFT(REGEXP_REPLACE($2, '\s+\S*$', ''), 60) ELSE title END
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
  }
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
  }
});

// DELETE /api/chat/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  const pool = await getPool();
  try {
    await pool.query(`DELETE FROM chat_sessions WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// PATCH /api/chat/sessions/:id/title
router.patch('/sessions/:id/title', async (req, res) => {
  const pool = await getPool();
  try {
    await pool.query(`UPDATE chat_sessions SET title=$1 WHERE id=$2`, [req.body.title, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
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
    logger.info(`💬 Chat [${sessionId}] User: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`);
    logger.info(`💬 Chat [${sessionId}] Sarah: ${response.replace(/\[Session context[\s\S]*$/, '').slice(0, 100)}${response.length > 100 ? '...' : ''}`);
    await saveMessages(pool, sessionId, message, response);

    // Generate a smart title after the first message (history was empty = first exchange)
    if (history.length === 0) {
      generateSessionTitle(pool, sessionId, message, response).catch(() => {});
    }

    return res.json({ response, sessionId });
  } catch (error) {
    logger.error('Chat error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to process message',
      response: "Sorry, I'm having a technical issue. Please try again."
    });
  }
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
  }
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

// ── MODEL SWITCHING ──────────────────────────────────────────────────────

// GET /api/chat/models — list available models
router.get('/models', async (req, res) => {
  try {
    const { getLLMClient } = await import('../llm/unified-client.js');
    const client = getLLMClient();
    res.json({
      current: client.model,
      provider: client.provider,
      available: client.getAvailableModels(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chat/models/switch — switch active model
router.post('/models/switch', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'model is required' });

    const { getLLMClient } = await import('../llm/unified-client.js');
    const client = getLLMClient();
    const success = client.switchModel(model);

    if (success) {
      res.json({
        success: true,
        model: client.model,
        provider: client.provider,
        message: `Switched to ${model}`,
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Cannot switch to ${model} — missing API key`,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export function getAnthropicClient() {
  return anthropic;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHONE CALL TRANSCRIPT INGESTION
// GHL transcribes calls → webhook sends transcript here → Sarah processes it
// CRITICAL: Uses Sarah's REAL chat pipeline with full memory/context
// ═══════════════════════════════════════════════════════════════════════════

router.post('/ingest-call', async (req, res) => {
  try {
    const { 
      transcript, 
      contactId, 
      contactName, 
      contactPhone,
      callDirection,
      callDuration,
      callId,
      summary,
    } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    logger.info('📞 Call transcript received', { 
      contactName, contactId, callDirection, 
      transcriptLength: transcript.length,
    });

    // Store call metadata in database
    const { getSharedPool } = await import('../database/pool.js'); const pool = getSharedPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS call_transcripts (
        id SERIAL PRIMARY KEY,
        call_id VARCHAR(128),
        contact_id VARCHAR(128),
        contact_name TEXT,
        contact_phone VARCHAR(32),
        direction VARCHAR(16),
        duration INTEGER,
        transcript TEXT,
        summary TEXT,
        session_id VARCHAR(64),
        status VARCHAR(32) DEFAULT 'received',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Find or create a persistent session for this contact's phone conversations
    // This means all calls from the same person share context — Sarah remembers
    const phoneSessionId = `phone-${contactId || contactPhone || 'unknown'}`;

    const insertResult = await pool.query(
      `INSERT INTO call_transcripts(call_id, contact_id, contact_name, contact_phone, direction, duration, transcript, summary, session_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [callId, contactId, contactName, contactPhone, callDirection, callDuration, transcript, summary, phoneSessionId]
    );

    // Format the transcript as a message FROM the caller
    // This goes through Sarah's normal chat pipeline — same memory, same tools, same context
    const mins = callDuration ? Math.round(callDuration / 60) : null;
    const callerMessage = `[📞 Phone call from ${contactName || contactPhone || 'unknown caller'}${mins ? ' (' + mins + ' min)' : ''}]\n\n${transcript}`;

    // Route through the SAME /message endpoint logic
    // This gives Sarah full access to: conversation history, Letta memory, tools, skills
    const messageEndpoint = `http://localhost:${process.env.PORT || 3000}/api/chat/message`;
    const messageRes = await fetch(messageEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: callerMessage,
        sessionId: phoneSessionId,
      }),
    });
    const messageData = await messageRes.json();

    // Update call record with status
    await pool.query(
      `UPDATE call_transcripts SET status='processed' WHERE id=$1`,
      [insertResult.rows[0]?.id]
    );

    logger.info('📞 Call processed through Sarah pipeline', { 
      contactName, sessionId: phoneSessionId,
      responseLength: messageData.response?.length 
    });

    // If Sarah needs to text back (has action items or questions), 
    // she'll use her GHL tools within the normal pipeline

    res.json({ 
      success: true, 
      callId: insertResult.rows[0]?.id,
      sessionId: phoneSessionId,
      response: messageData.response,
    });

  } catch (error) {
    logger.error('Call transcript ingestion failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/calls — list recent calls for dashboard
router.get('/calls', async (req, res) => {
  try {
    const { getSharedPool } = await import('../database/pool.js'); const pool = getSharedPool();
    const result = await pool.query(
      `SELECT * FROM call_transcripts ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ calls: result.rows });
  } catch (e) {
    res.json({ calls: [] });
  }
});

export default router;

