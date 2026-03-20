// Model-Agnostic GHL API v2 Tool Definitions for Sarah Rodriguez
// Supports both Claude (tool_use) and OpenAI (function_calling) formats
// ALL endpoints verified against: marketplace.gohighlevel.com/docs

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('ghl-tools');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// Cache org GHL credentials to avoid repeated Supabase lookups (5 min TTL)
const _orgCredCache = new Map();
const CRED_CACHE_TTL = 5 * 60 * 1000;

async function getOrgGHLCredentials(orgId) {
  if (!orgId) return null;

  // Check cache
  const cached = _orgCredCache.get(orgId);
  if (cached && Date.now() - cached.fetchedAt < CRED_CACHE_TTL) {
    return cached.creds;
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data } = await sb
      .from('user_connectors')
      .select('api_key, external_account_id, connectors!inner(slug)')
      .eq('organization_id', orgId)
      .eq('connectors.slug', 'ghl')
      .eq('status', 'active')
      .limit(1)
      .single();

    if (data?.api_key) {
      const creds = { apiKey: data.api_key, locationId: data.external_account_id };
      _orgCredCache.set(orgId, { creds, fetchedAt: Date.now() });
      logger.info(`GHL credentials loaded for org ${orgId} (location: ${creds.locationId})`);
      return creds;
    }
  } catch (err) {
    logger.warn(`No GHL credentials found for org ${orgId}: ${err.message}`);
  }

  _orgCredCache.set(orgId, { creds: null, fetchedAt: Date.now() });
  return null;
}

// Generic GHL API caller — orgId triggers per-org credential lookup
async function callGHL(endpoint, method = 'GET', data = null, params = {}, orgId = null) {
  // Try org-specific credentials first, fall back to env vars
  const orgCreds = orgId ? await getOrgGHLCredentials(orgId) : null;
  const apiKey = orgCreds?.apiKey || process.env.GHL_API_KEY;
  const locationId = orgCreds?.locationId || process.env.GHL_LOCATION_ID;

  if (!apiKey) {
    throw new Error('GHL_API_KEY not configured (no org credentials and no env var)');
  }

  if (orgCreds) {
    logger.info(`Using org-specific GHL credentials (org: ${orgId}, location: ${locationId})`);
  }

  const config = {
    method,
    url: `${GHL_BASE_URL}${endpoint}`,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version': GHL_API_VERSION,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    params: {
      locationId,
      ...params
    }
  };

  if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    logger.info(`GHL API success: ${method} ${endpoint}`);
    return response.data;
  } catch (error) {
    logger.error(`GHL API error: ${method} ${endpoint}`, error.response?.data || error.message);
    throw new Error(`GHL API Error: ${error.response?.data?.message || error.message}`);
  }
}

// Resolve locationId from orgId (cached) or fall back to env var
async function resolveLocationId(orgId) {
  if (orgId) {
    const creds = await getOrgGHLCredentials(orgId);
    if (creds?.locationId) return creds.locationId;
  }
  return process.env.GHL_LOCATION_ID;
}

// Tool definitions in model-agnostic format
export const ghlToolDefinitions = {
  // CONTACTS
  ghl_search_contacts: {
    name: "ghl_search_contacts",
    description: "Search for contacts in GoHighLevel by email, phone, name, or other criteria",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (email, phone, name)" },
        limit: { type: "number", description: "Results limit (default: 20)" },
        page: { type: "number", description: "Page number (default: 1)" }
      },
      required: ["query"]
    },
    category: "contacts",
    operation: "read"
  },

  ghl_get_contact: {
    name: "ghl_get_contact",
    description: "Get detailed information about a specific contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    },
    category: "contacts",
    operation: "read"
  },

  ghl_create_contact: {
    name: "ghl_create_contact",
    description: "Create a new contact in GoHighLevel",
    parameters: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        address1: { type: "string", description: "Address line 1" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State" },
        postalCode: { type: "string", description: "Postal code" },
        website: { type: "string", description: "Website" },
        timezone: { type: "string", description: "Timezone" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to assign" },
        customFields: { type: "object", description: "Custom field values" }
      },
      required: ["firstName"]
    },
    category: "contacts",
    operation: "write"
  },

  ghl_update_contact: {
    name: "ghl_update_contact",
    description: "Update an existing contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        customFields: { type: "object", description: "Custom field values" }
      },
      required: ["contactId"]
    },
    category: "contacts",
    operation: "write"
  },

  ghl_delete_contact: {
    name: "ghl_delete_contact",
    description: "Delete a contact from GoHighLevel",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    },
    category: "contacts",
    operation: "delete"
  },

  // CONVERSATIONS
  ghl_get_conversations: {
    name: "ghl_get_conversations",
    description: "Get conversations for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        limit: { type: "number", description: "Results limit" }
      },
      required: ["contactId"]
    },
    category: "conversations",
    operation: "read"
  },

  ghl_send_message: {
    name: "ghl_send_message",
    description: "Send SMS, email, or other message to a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        type: { type: "string", enum: ["SMS", "Email", "WhatsApp", "GMB", "IG", "FB"], description: "Message type" },
        message: { type: "string", description: "Message content" },
        subject: { type: "string", description: "Email subject (for email type)" },
        html: { type: "string", description: "HTML content (for email)" }
      },
      required: ["contactId", "type", "message"]
    },
    category: "conversations",
    operation: "write"
  },

  // OWNER NOTIFICATIONS — Sarah proactively contacts the user/owner
  notify_owner: {
    name: "notify_owner",
    description: "Send a text message or make a call notification to the business owner (Kimberly). Use this proactively to: report completed work, flag blockers/walls you've hit, alert on VIP emails or urgent items, confirm task completion, or request a decision. ALWAYS use this instead of ghl_send_message when the recipient is the owner.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to send to the owner. Be concise and clear. Include what you did, what you found, or what you need." },
        type: { type: "string", enum: ["SMS", "Email"], description: "How to reach the owner. Default: SMS for quick updates, Email for detailed reports.", default: "SMS" },
        urgency: { type: "string", enum: ["normal", "urgent"], description: "urgent = VIP contact, blocker, or time-sensitive. normal = routine update.", default: "normal" }
      },
      required: ["message"]
    },
    category: "conversations",
    operation: "write"
  },

  // CALENDARS
  ghl_list_calendars: {
    name: "ghl_list_calendars",
    description: "Get all calendars for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "calendars",
    operation: "read"
  },

  ghl_get_calendar_slots: {
    name: "ghl_get_calendar_slots",
    description: "Get available time slots for a calendar",
    parameters: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID" },
        startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date (YYYY-MM-DD)" }
      },
      required: ["calendarId", "startDate", "endDate"]
    },
    category: "calendars",
    operation: "read"
  },

  ghl_create_appointment: {
    name: "ghl_create_appointment",
    description: "Book an appointment on a calendar",
    parameters: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID" },
        contactId: { type: "string", description: "Contact ID" },
        startTime: { type: "string", description: "Start time (ISO format)" },
        title: { type: "string", description: "Appointment title" },
        appointmentStatus: { type: "string", description: "Appointment status" }
      },
      required: ["calendarId", "contactId", "startTime"]
    },
    category: "calendars",
    operation: "write"
  },

  ghl_get_appointments: {
    name: "ghl_get_appointments",
    description: "Get appointments/events from calendar",
    parameters: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID" },
        startDate: { type: "string", description: "Start date" },
        endDate: { type: "string", description: "End date" }
      },
      required: ["calendarId"]
    },
    category: "calendars",
    operation: "read"
  },

  // OPPORTUNITIES
  ghl_search_opportunities: {
    name: "ghl_search_opportunities",
    description: "Search opportunities in the pipeline",
    parameters: {
      type: "object",
      properties: {
        pipelineId: { type: "string", description: "Pipeline ID" },
        status: { type: "string", description: "Opportunity status" },
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "opportunities",
    operation: "read"
  },

  ghl_get_opportunity: {
    name: "ghl_get_opportunity",
    description: "Get details of a specific opportunity",
    parameters: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "Opportunity ID" }
      },
      required: ["opportunityId"]
    },
    category: "opportunities",
    operation: "read"
  },

  ghl_create_opportunity: {
    name: "ghl_create_opportunity",
    description: "Create a new opportunity",
    parameters: {
      type: "object",
      properties: {
        pipelineId: { type: "string", description: "Pipeline ID" },
        pipelineStageId: { type: "string", description: "Pipeline stage ID" },
        contactId: { type: "string", description: "Contact ID" },
        name: { type: "string", description: "Opportunity name" },
        monetaryValue: { type: "number", description: "Monetary value" },
        assignedTo: { type: "string", description: "Assigned user ID" }
      },
      required: ["pipelineId", "contactId", "name"]
    },
    category: "opportunities",
    operation: "write"
  },

  ghl_update_opportunity: {
    name: "ghl_update_opportunity",
    description: "Update an opportunity",
    parameters: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "Opportunity ID" },
        name: { type: "string", description: "Opportunity name" },
        pipelineStageId: { type: "string", description: "Pipeline stage ID" },
        monetaryValue: { type: "number", description: "Monetary value" },
        status: { type: "string", description: "Status" }
      },
      required: ["opportunityId"]
    },
    category: "opportunities",
    operation: "write"
  },

  ghl_list_pipelines: {
    name: "ghl_list_pipelines",
    description: "Get all pipelines for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "pipelines",
    operation: "read"
  },

  ghl_update_opportunity_stage: {
    name: "ghl_update_opportunity_stage",
    description: "Move opportunity to different pipeline stage",
    parameters: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "Opportunity ID" },
        pipelineStageId: { type: "string", description: "Target pipeline stage ID" }
      },
      required: ["opportunityId", "pipelineStageId"]
    },
    category: "opportunities",
    operation: "write"
  },

  // WORKFLOWS
  ghl_list_workflows: {
    name: "ghl_list_workflows",
    description: "Get all workflows for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "workflows",
    operation: "read"
  },

  ghl_add_contact_to_workflow: {
    name: "ghl_add_contact_to_workflow",
    description: "Add a contact to a workflow",
    parameters: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow ID" },
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["workflowId", "contactId"]
    },
    category: "workflows",
    operation: "write"
  },

  ghl_remove_contact_from_workflow: {
    name: "ghl_remove_contact_from_workflow",
    description: "Remove a contact from a workflow",
    parameters: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow ID" },
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["workflowId", "contactId"]
    },
    category: "workflows",
    operation: "write"
  },

  // TASKS
  ghl_list_tasks: {
    name: "ghl_list_tasks",
    description: "Get tasks for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    },
    category: "tasks",
    operation: "read"
  },

  ghl_create_task: {
    name: "ghl_create_task",
    description: "Create a new task for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        title: { type: "string", description: "Task title" },
        body: { type: "string", description: "Task description" },
        dueDate: { type: "string", description: "Due date (ISO format)" },
        assignedTo: { type: "string", description: "Assigned user ID" }
      },
      required: ["contactId", "title"]
    },
    category: "tasks",
    operation: "write"
  },

  ghl_update_task: {
    name: "ghl_update_task",
    description: "Update or complete a task",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        taskId: { type: "string", description: "Task ID" },
        completed: { type: "boolean", description: "Mark as completed" },
        title: { type: "string", description: "Updated title" },
        dueDate: { type: "string", description: "Updated due date" }
      },
      required: ["contactId", "taskId"]
    },
    category: "tasks",
    operation: "write"
  },

  // NOTES
  ghl_get_notes: {
    name: "ghl_get_notes",
    description: "Get notes for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    },
    category: "notes",
    operation: "read"
  },

  ghl_create_note: {
    name: "ghl_create_note",
    description: "Add a note to a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        body: { type: "string", description: "Note content" },
        userId: { type: "string", description: "User ID creating the note" }
      },
      required: ["contactId", "body"]
    },
    category: "notes",
    operation: "write"
  },

  // TAGS
  ghl_add_contact_tag: {
    name: "ghl_add_contact_tag",
    description: "Add tag to a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to add" }
      },
      required: ["contactId", "tags"]
    },
    category: "tags",
    operation: "write"
  },

  ghl_remove_contact_tag: {
    name: "ghl_remove_contact_tag",
    description: "Remove tag from a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to remove" }
      },
      required: ["contactId", "tags"]
    },
    category: "tags",
    operation: "write"
  },

  ghl_list_location_tags: {
    name: "ghl_list_location_tags",
    description: "List all tags for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "tags",
    operation: "read"
  },

  // CUSTOM FIELDS
  ghl_get_custom_fields: {
    name: "ghl_get_custom_fields",
    description: "Get all custom fields for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "custom_fields",
    operation: "read"
  },

  ghl_update_contact_custom_field: {
    name: "ghl_update_contact_custom_field",
    description: "Update custom field value for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        customFields: { type: "object", description: "Custom field key-value pairs" }
      },
      required: ["contactId", "customFields"]
    },
    category: "custom_fields",
    operation: "write"
  },

  // USERS & LOCATION
  ghl_list_users: {
    name: "ghl_list_users",
    description: "Get all users in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "users",
    operation: "read"
  },

  ghl_get_location_info: {
    name: "ghl_get_location_info",
    description: "Get location information and settings",
    parameters: { type: "object", properties: {}, required: [] },
    category: "locations",
    operation: "read"
  },

  // CAMPAIGNS
  ghl_list_campaigns: {
    name: "ghl_list_campaigns",
    description: "Get all campaigns",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Campaign status filter" }
      }
    },
    category: "campaigns",
    operation: "read"
  },

  // FORMS
  ghl_list_forms: {
    name: "ghl_list_forms",
    description: "Get all forms for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "forms",
    operation: "read"
  },

  ghl_get_form_submissions: {
    name: "ghl_get_form_submissions",
    description: "Get submissions for a specific form",
    parameters: {
      type: "object",
      properties: {
        formId: { type: "string", description: "Form ID" },
        limit: { type: "number", description: "Results limit" },
        startAt: { type: "string", description: "Start date filter" },
        endAt: { type: "string", description: "End date filter" }
      },
      required: ["formId"]
    },
    category: "forms",
    operation: "read"
  },

  // SURVEYS
  ghl_list_surveys: {
    name: "ghl_list_surveys",
    description: "List surveys in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "surveys",
    operation: "read"
  },

  ghl_get_survey_submissions: {
    name: "ghl_get_survey_submissions",
    description: "Get survey submissions",
    parameters: {
      type: "object",
      properties: {
        surveyId: { type: "string", description: "Survey ID" },
        limit: { type: "number", description: "Results limit" }
      },
      required: ["surveyId"]
    },
    category: "surveys",
    operation: "read"
  },

  // INVOICES
  ghl_list_invoices: {
    name: "ghl_list_invoices",
    description: "List invoices for the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue"], description: "Invoice status" }
      }
    },
    category: "invoices",
    operation: "read"
  },

  ghl_get_invoice: {
    name: "ghl_get_invoice",
    description: "Get a specific invoice",
    parameters: {
      type: "object",
      properties: {
        invoiceId: { type: "string", description: "Invoice ID" }
      },
      required: ["invoiceId"]
    },
    category: "invoices",
    operation: "read"
  },

  ghl_create_invoice: {
    name: "ghl_create_invoice",
    description: "Create a new invoice",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        title: { type: "string", description: "Invoice title" },
        dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
        items: { type: "array", description: "Invoice line items" }
      },
      required: ["contactId", "title", "items"]
    },
    category: "invoices",
    operation: "write"
  },

  ghl_send_invoice: {
    name: "ghl_send_invoice",
    description: "Send an invoice to the contact",
    parameters: {
      type: "object",
      properties: {
        invoiceId: { type: "string", description: "Invoice ID" }
      },
      required: ["invoiceId"]
    },
    category: "invoices",
    operation: "write"
  },

  // PRODUCTS
  ghl_list_products: {
    name: "ghl_list_products",
    description: "List products in the location",
    parameters: { type: "object", properties: { limit: { type: "number" } } },
    category: "products",
    operation: "read"
  },

  ghl_create_product: {
    name: "ghl_create_product",
    description: "Create a new product",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Product name" },
        description: { type: "string", description: "Product description" },
        price: { type: "number", description: "Product price" }
      },
      required: ["name", "price"]
    },
    category: "products",
    operation: "write"
  },

  // PAYMENTS
  ghl_list_payments: {
    name: "ghl_list_payments",
    description: "List payment transactions",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date filter" },
        endDate: { type: "string", description: "End date filter" }
      }
    },
    category: "payments",
    operation: "read"
  },

  // FUNNELS
  ghl_list_funnels: {
    name: "ghl_list_funnels",
    description: "List funnels in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "funnels",
    operation: "read"
  },

  ghl_get_funnel_pages: {
    name: "ghl_get_funnel_pages",
    description: "Get pages for a specific funnel",
    parameters: {
      type: "object",
      properties: {
        funnelId: { type: "string", description: "Funnel ID" }
      },
      required: ["funnelId"]
    },
    category: "funnels",
    operation: "read"
  },

  // MEDIA
  ghl_list_media: {
    name: "ghl_list_media",
    description: "List media files in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "media",
    operation: "read"
  },

  ghl_upload_media: {
    name: "ghl_upload_media",
    description: "Upload a media file",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File base64 content" },
        fileName: { type: "string", description: "File name" }
      },
      required: ["file", "fileName"]
    },
    category: "media",
    operation: "write"
  },

  // EMAIL BUILDER
  ghl_list_email_templates: {
    name: "ghl_list_email_templates",
    description: "List email templates",
    parameters: { type: "object", properties: {}, required: [] },
    category: "email_builder",
    operation: "read"
  },

  ghl_create_email_template: {
    name: "ghl_create_email_template",
    description: "Create a new email template as a DRAFT in the CRM. Always create as draft first so the user can review. Use Inter font for headings. Include hero image and Bloomie Staffing CTA.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template name (internal reference)" },
        subject: { type: "string", description: "Email subject line. 6-10 words, front-load value." },
        previewText: { type: "string", description: "Preview text (first 90 chars after subject)" },
        html: { type: "string", description: "Full HTML email content with Inter font, hero image, and CTA" },
        imageUrl: { type: "string", description: "Hero image URL" },
        type: { type: "string", enum: ["newsletter", "promotional", "welcome", "re-engagement", "blog-announcement"], description: "Email type" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" }
      },
      required: ["name", "subject", "html"]
    },
    category: "email_builder",
    operation: "write"
  },

  // SOCIAL PLANNER
  ghl_list_social_posts: {
    name: "ghl_list_social_posts",
    description: "List social media posts",
    parameters: { type: "object", properties: {}, required: [] },
    category: "social_planner",
    operation: "read"
  },

  ghl_create_social_post: {
    name: "ghl_create_social_post",
    description: "Create a new social media post",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Post content" },
        platforms: { type: "array", items: { type: "string" }, description: "Target platforms" },
        scheduledDate: { type: "string", description: "Scheduled date/time (ISO format)" }
      },
      required: ["content", "platforms"]
    },
    category: "social_planner",
    operation: "write"
  },

  // BLOG POSTS
  ghl_list_blog_posts: {
    name: "ghl_list_blog_posts",
    description: "List blog posts",
    parameters: { type: "object", properties: {}, required: [] },
    category: "blog",
    operation: "read"
  },

  ghl_create_blog_post: {
    name: "ghl_create_blog_post",
    description: "Create a new blog post as draft in the CRM. Always create as draft first so the user can review before publishing. After creating, send the user the blog URL for review.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Post title" },
        content: { type: "string", description: "Full HTML content of the blog post. Use Inter font for headings (font-family: 'Inter', sans-serif; font-weight: 700)." },
        status: { type: "string", enum: ["draft", "published"], description: "Post status. Always use 'draft' unless user explicitly says to publish." },
        imageUrl: { type: "string", description: "Featured image URL (use a generated image URL)" },
        slug: { type: "string", description: "URL slug (lowercase, hyphenated, keyword-rich)" },
        metaTitle: { type: "string", description: "SEO meta title (under 65 chars)" },
        metaDescription: { type: "string", description: "SEO meta description (150-160 chars)" },
        tags: { type: "array", items: { type: "string" }, description: "Blog post tags/categories" }
      },
      required: ["title", "content"]
    },
    category: "blog",
    operation: "write"
  },

  // DOCUMENTS/CONTRACTS
  ghl_list_documents: {
    name: "ghl_list_documents",
    description: "List documents and contracts",
    parameters: { type: "object", properties: {}, required: [] },
    category: "documents",
    operation: "read"
  },

  ghl_send_document: {
    name: "ghl_send_document",
    description: "Send a document for signature",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID" },
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["documentId", "contactId"]
    },
    category: "documents",
    operation: "write"
  },

  // TRIGGER LINKS
  ghl_list_trigger_links: {
    name: "ghl_list_trigger_links",
    description: "List trigger links",
    parameters: { type: "object", properties: {}, required: [] },
    category: "trigger_links",
    operation: "read"
  },

  ghl_create_trigger_link: {
    name: "ghl_create_trigger_link",
    description: "Create a trigger link",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Link name" },
        redirectTo: { type: "string", description: "Target URL" }
      },
      required: ["name", "redirectTo"]
    },
    category: "trigger_links",
    operation: "write"
  },

  // PHONE / VOICE
  ghl_list_phone_numbers: {
    name: "ghl_list_phone_numbers",
    description: "List phone numbers for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "phone_system",
    operation: "read"
  },

  // COURSES
  ghl_list_courses: {
    name: "ghl_list_courses",
    description: "List courses in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "courses",
    operation: "read"
  }
};

// ─────────────────────────────────────────────
// EXECUTORS — All verified against official GHL API v2 docs
// Source: marketplace.gohighlevel.com/docs
// ─────────────────────────────────────────────
export const ghlExecutors = {

  // CONTACTS
  // POST /contacts/search — requires page + pageLimit in body
  ghl_search_contacts: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/contacts/search', 'POST', {
      locationId,
      page: params.page || 1,
      pageLimit: params.limit || 20,
      query: params.query
    }, null, params._orgId);
  },

  // GET /contacts/{contactId}
  ghl_get_contact: async (params) => {
    return await callGHL(`/contacts/${params.contactId}`, 'GET', null, {}, params._orgId);
  },

  // POST /contacts/
  ghl_create_contact: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    const { _orgId, ...contactData } = params;
    return await callGHL('/contacts/', 'POST', { locationId, ...contactData }, {}, _orgId);
  },

  // PUT /contacts/{contactId}
  ghl_update_contact: async (params) => {
    const { contactId, _orgId, ...updateData } = params;
    return await callGHL(`/contacts/${contactId}`, 'PUT', updateData, {}, _orgId);
  },

  // DELETE /contacts/{contactId}
  ghl_delete_contact: async (params) => {
    return await callGHL(`/contacts/${params.contactId}`, 'DELETE', null, {}, params._orgId);
  },

  // CONVERSATIONS
  // GET /conversations/search?locationId=&contactId=
  ghl_get_conversations: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/conversations/search', 'GET', null, { locationId, contactId: params.contactId, limit: params.limit || 20 });
  },

  // POST /conversations/messages
  ghl_send_message: async (params) => {
    return await callGHL('/conversations/messages', 'POST', params);
  },

  // OWNER NOTIFICATIONS
  notify_owner: async (params) => {
    // Look up owner contact ID from Supabase organizations table
    // This scales to all clients — no Railway env var needed per client
    let ownerContactId = process.env.OWNER_GHL_CONTACT_ID; // fallback for legacy
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const orgId = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
      const { data: org } = await supabase
        .from('organizations')
        .select('owner_ghl_contact_id, owner_name')
        .eq('id', orgId)
        .single();
      if (org?.owner_ghl_contact_id) {
        ownerContactId = org.owner_ghl_contact_id;
        logger.info('notify_owner: contact ID loaded from Supabase', { owner: org.owner_name });
      }
    } catch (e) {
      logger.warn('notify_owner: Supabase lookup failed, falling back to env var', { error: e.message });
    }

    if (!ownerContactId) {
      throw new Error('notify_owner: no owner_ghl_contact_id found in Supabase organizations table or OWNER_GHL_CONTACT_ID env var');
    }
    const locationId = await resolveLocationId(params._orgId);
    const messageType = params.type || 'SMS';

    logger.info('notify_owner firing', { urgency: params.urgency, type: messageType, preview: params.message.slice(0, 80) });

    // Step 1: Find or create a conversation for this contact
    // GHL requires a conversationId to send messages — can't send directly to contactId
    let conversationId;
    try {
      const searchResult = await callGHL('/conversations/search', 'GET', null, {
        locationId,
        contactId: ownerContactId,
        limit: 1
      });
      const existing = searchResult?.conversations?.[0];
      if (existing?.id) {
        conversationId = existing.id;
        logger.info('notify_owner: found existing conversation', { conversationId });
      }
    } catch (e) {
      logger.warn('notify_owner: conversation search failed, will create new', { error: e.message });
    }

    // Step 2: Create conversation if none exists
    if (!conversationId) {
      try {
        const created = await callGHL('/conversations/', 'POST', {
          locationId,
          contactId: ownerContactId
        });
        conversationId = created?.id || created?.conversation?.id;
        logger.info('notify_owner: created new conversation', { conversationId });
      } catch (e) {
        throw new Error(`notify_owner: failed to create conversation — ${e.message}`);
      }
    }

    if (!conversationId) {
      throw new Error('notify_owner: could not find or create a GHL conversation for owner contact');
    }

    // Step 3: Send the message to the conversation
    const payload = {
      type: messageType,
      message: params.message,
      conversationId,
      contactId: ownerContactId,
    };
    if (messageType === 'Email') {
      payload.subject = params.urgency === 'urgent' ? '🚨 URGENT — Sarah Rodriguez Update' : '📋 Sarah Rodriguez Update';
    }

    const result = await callGHL('/conversations/messages', 'POST', payload);
    logger.info('notify_owner: message sent', { conversationId, messageType, result });
    return result;
  },

  // CALENDARS
  // GET /calendars/?locationId=
  ghl_list_calendars: async (params) => {
    return await callGHL('/calendars/');
  },

  // GET /calendars/{calendarId}/free-slots
  ghl_get_calendar_slots: async (params) => {
    return await callGHL(`/calendars/${params.calendarId}/free-slots`, 'GET', null, {
      startDate: params.startDate,
      endDate: params.endDate
    });
  },

  // POST /calendars/events/appointments
  ghl_create_appointment: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/calendars/events/appointments', 'POST', { locationId, ...params });
  },

  // GET /calendars/events?calendarId=&locationId=&startTime=&endTime=
  ghl_get_appointments: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/calendars/events', 'GET', null, {
      locationId,
      calendarId: params.calendarId,
      startTime: params.startDate,
      endTime: params.endDate
    });
  },

  // OPPORTUNITIES
  // POST /opportunities/search — requires location_id in body
  ghl_search_opportunities: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/opportunities/search', 'POST', {
      location_id: locationId,
      page: 1,
      pageLimit: params.limit || 20,
      ...(params.query && { query: params.query }),
      ...(params.pipelineId && { pipelineId: params.pipelineId }),
      ...(params.status && { status: params.status })
    }, null);
  },

  // GET /opportunities/{id}
  ghl_get_opportunity: async (params) => {
    return await callGHL(`/opportunities/${params.opportunityId}`);
  },

  // POST /opportunities/
  ghl_create_opportunity: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/opportunities/', 'POST', { locationId, ...params });
  },

  // PUT /opportunities/{id}
  ghl_update_opportunity: async (params) => {
    const { opportunityId, ...updateData } = params;
    return await callGHL(`/opportunities/${opportunityId}`, 'PUT', updateData);
  },

  // GET /opportunities/pipelines?locationId=
  ghl_list_pipelines: async (params) => {
    return await callGHL('/opportunities/pipelines');
  },

  // PUT /opportunities/{id} with pipelineStageId
  ghl_update_opportunity_stage: async (params) => {
    return await callGHL(`/opportunities/${params.opportunityId}`, 'PUT', { pipelineStageId: params.pipelineStageId });
  },

  // WORKFLOWS
  // GET /workflows/?locationId=
  ghl_list_workflows: async (params) => {
    return await callGHL('/workflows/');
  },

  // POST /contacts/{contactId}/workflow/{workflowId}
  ghl_add_contact_to_workflow: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/workflow/${params.workflowId}`, 'POST', {});
  },

  // DELETE /contacts/{contactId}/workflow/{workflowId}
  ghl_remove_contact_from_workflow: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/workflow/${params.workflowId}`, 'DELETE');
  },

  // TASKS
  // GET /contacts/{contactId}/tasks
  ghl_list_tasks: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/tasks`);
  },

  // POST /contacts/{contactId}/tasks
  ghl_create_task: async (params) => {
    const { contactId, ...taskData } = params;
    return await callGHL(`/contacts/${contactId}/tasks`, 'POST', taskData);
  },

  // PUT /contacts/{contactId}/tasks/{taskId}
  ghl_update_task: async (params) => {
    const { contactId, taskId, ...updateData } = params;
    return await callGHL(`/contacts/${contactId}/tasks/${taskId}`, 'PUT', updateData);
  },

  // NOTES
  // GET /contacts/{contactId}/notes
  ghl_get_notes: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/notes`);
  },

  // POST /contacts/{contactId}/notes
  ghl_create_note: async (params) => {
    const { contactId, ...noteData } = params;
    return await callGHL(`/contacts/${contactId}/notes`, 'POST', noteData);
  },

  // TAGS
  // POST /contacts/{contactId}/tags
  ghl_add_contact_tag: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/tags`, 'POST', { tags: params.tags });
  },

  // DELETE /contacts/{contactId}/tags
  ghl_remove_contact_tag: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/tags`, 'DELETE', { tags: params.tags });
  },

  // GET /locations/{locationId}/tags
  ghl_list_location_tags: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL(`/locations/${locationId}/tags`);
  },

  // CUSTOM FIELDS
  // GET /custom-fields/?locationId=&model=contact
  ghl_get_custom_fields: async (params) => {
    return await callGHL('/custom-fields/', 'GET', null, { model: 'contact' });
  },

  // PUT /contacts/{contactId}
  ghl_update_contact_custom_field: async (params) => {
    const { contactId, customFields } = params;
    return await callGHL(`/contacts/${contactId}`, 'PUT', { customFields });
  },

  // USERS & LOCATION
  // GET /users/search?locationId=
  ghl_list_users: async (params) => {
    return await callGHL('/users/search');
  },

  // GET /locations/{locationId}
  ghl_get_location_info: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL(`/locations/${locationId}`);
  },

  // CAMPAIGNS
  // GET /campaigns/?locationId=
  ghl_list_campaigns: async (params) => {
    return await callGHL('/campaigns/', 'GET', null, params);
  },

  // FORMS
  // GET /forms/?locationId=
  ghl_list_forms: async (params) => {
    return await callGHL('/forms/');
  },

  // GET /forms/submissions?locationId=&formId=
  ghl_get_form_submissions: async (params) => {
    const { formId, ...queryParams } = params;
    return await callGHL('/forms/submissions', 'GET', null, { formId, ...queryParams });
  },

  // SURVEYS
  // GET /surveys/?locationId=
  ghl_list_surveys: async (params) => {
    return await callGHL('/surveys/');
  },

  // GET /surveys/submissions?locationId=&surveyId=
  ghl_get_survey_submissions: async (params) => {
    return await callGHL('/surveys/submissions', 'GET', null, { surveyId: params.surveyId });
  },

  // INVOICES
  // GET /invoices/?locationId=
  ghl_list_invoices: async (params) => {
    return await callGHL('/invoices/', 'GET', null, params);
  },

  // GET /invoices/{invoiceId}
  ghl_get_invoice: async (params) => {
    return await callGHL(`/invoices/${params.invoiceId}`);
  },

  // POST /invoices/
  ghl_create_invoice: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/invoices/', 'POST', { locationId, ...params });
  },

  // POST /invoices/{invoiceId}/send
  ghl_send_invoice: async (params) => {
    return await callGHL(`/invoices/${params.invoiceId}/send`, 'POST', {});
  },

  // PRODUCTS
  // GET /products/?locationId=
  ghl_list_products: async (params) => {
    return await callGHL('/products/', 'GET', null, params);
  },

  // POST /products/
  ghl_create_product: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/products/', 'POST', { locationId, ...params });
  },

  // PAYMENTS
  // GET /payments/transactions?locationId=
  ghl_list_payments: async (params) => {
    return await callGHL('/payments/transactions', 'GET', null, params);
  },

  // FUNNELS
  // GET /funnels/funnel/list?locationId=
  ghl_list_funnels: async (params) => {
    return await callGHL('/funnels/funnel/list');
  },

  // GET /funnels/page?funnelId=
  ghl_get_funnel_pages: async (params) => {
    return await callGHL('/funnels/page', 'GET', null, { funnelId: params.funnelId });
  },

  // MEDIA
  // GET /medias/files?locationId=
  ghl_list_media: async (params) => {
    return await callGHL('/medias/files');
  },

  // POST /medias/upload-file
  ghl_upload_media: async (params) => {
    return await callGHL('/medias/upload-file', 'POST', params);
  },

  // EMAIL BUILDER
  // GET /emails/builder?locationId=
  ghl_list_email_templates: async (params) => {
    return await callGHL('/emails/builder');
  },

  // POST /emails/builder
  ghl_create_email_template: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/emails/builder', 'POST', { locationId, ...params });
  },

  // SOCIAL PLANNER
  // GET /social-media-posting/{locationId}/posts
  ghl_list_social_posts: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL(`/social-media-posting/${locationId}/posts`);
  },

  // POST /social-media-posting/{locationId}/posts
  ghl_create_social_post: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL(`/social-media-posting/${locationId}/posts`, 'POST', params);
  },

  // BLOG POSTS
  // GET /blogs/posts?locationId=
  ghl_list_blog_posts: async (params) => {
    return await callGHL('/blogs/posts');
  },

  // POST /blogs/posts
  ghl_create_blog_post: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/blogs/posts', 'POST', { locationId, ...params });
  },

  // DOCUMENTS/CONTRACTS
  // GET /proposals/?locationId=
  ghl_list_documents: async (params) => {
    return await callGHL('/proposals/');
  },

  // POST /proposals/send
  ghl_send_document: async (params) => {
    return await callGHL('/proposals/send', 'POST', params);
  },

  // TRIGGER LINKS
  // GET /links/?locationId=
  ghl_list_trigger_links: async (params) => {
    return await callGHL('/links/');
  },

  // POST /links/
  ghl_create_trigger_link: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/links/', 'POST', { locationId, ...params });
  },

  // PHONE SYSTEM
  // GET /phone-system/numbers?locationId=
  ghl_list_phone_numbers: async (params) => {
    return await callGHL('/phone-system/numbers');
  },

  // COURSES
  // GET /courses/?locationId=
  ghl_list_courses: async (params) => {
    return await callGHL('/courses/');
  }
};

// Execute any GHL tool by name
// orgId is optional — when provided, credentials are loaded from Supabase per org
export async function executeGHLTool(toolName, parameters, orgId = null) {
  const startTime = Date.now();
  logger.info(`Executing GHL tool: ${toolName}`, { orgId, params: parameters });

  if (!ghlExecutors[toolName]) {
    throw new Error(`Unknown GHL tool: ${toolName}`);
  }

  try {
    // Inject _orgId into params so executors can pass it to callGHL
    const paramsWithOrg = { ...parameters, _orgId: orgId };
    const result = await ghlExecutors[toolName](paramsWithOrg);
    const duration = Date.now() - startTime;
    logger.info(`GHL tool completed: ${toolName} (${duration}ms)`);
    return { success: true, data: result, executionTime: duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`GHL tool failed: ${toolName} (${duration}ms)`, error.message);
    return { success: false, error: error.message, executionTime: duration };
  }
}
