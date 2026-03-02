// Model-Agnostic GHL API v2 Tool Definitions for Sarah Rodriguez
// Supports both Claude (tool_use) and OpenAI (function_calling) formats

import axios from 'axios';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('ghl-tools');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// Generic GHL API caller
async function callGHL(endpoint, method = 'GET', data = null, params = {}) {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey) {
    throw new Error('GHL_API_KEY environment variable not configured');
  }

  const config = {
    method,
    url: `${GHL_BASE_URL}${endpoint}`,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version': GHL_API_VERSION,
      'Content-Type': 'application/json'
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
        limit: { type: "number", description: "Results limit (default: 100)" },
        startAfter: { type: "string", description: "Pagination cursor" }
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

  // CALENDARS
  ghl_list_calendars: {
    name: "ghl_list_calendars",
    description: "Get all calendars for the location",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
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

  // OPPORTUNITIES
  ghl_search_opportunities: {
    name: "ghl_search_opportunities",
    description: "Search opportunities in the pipeline",
    parameters: {
      type: "object",
      properties: {
        pipelineId: { type: "string", description: "Pipeline ID" },
        status: { type: "string", description: "Opportunity status" },
        q: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Results limit" }
      }
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

  // WORKFLOWS
  ghl_list_workflows: {
    name: "ghl_list_workflows",
    description: "Get all workflows for the location",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
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

  // FORMS
  ghl_get_forms: {
    name: "ghl_get_forms",
    description: "Get all forms for the location",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
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
        page: { type: "number", description: "Page number" }
      },
      required: ["formId"]
    },
    category: "forms",
    operation: "read"
  },

  // PIPELINES & STAGES
  ghl_list_pipelines: {
    name: "ghl_list_pipelines",
    description: "Get all pipelines for the location",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    category: "pipelines",
    operation: "read"
  },

  ghl_get_pipeline_stages: {
    name: "ghl_get_pipeline_stages",
    description: "Get stages for a specific pipeline",
    parameters: {
      type: "object",
      properties: {
        pipelineId: { type: "string", description: "Pipeline ID" }
      },
      required: ["pipelineId"]
    },
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

  // TASKS
  ghl_list_tasks: {
    name: "ghl_list_tasks",
    description: "Get tasks for contacts or opportunities",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID to filter tasks" },
        opportunityId: { type: "string", description: "Opportunity ID to filter tasks" },
        completed: { type: "boolean", description: "Filter by completion status" },
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "tasks",
    operation: "read"
  },

  ghl_create_task: {
    name: "ghl_create_task",
    description: "Create a new task",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        contactId: { type: "string", description: "Associated contact ID" },
        opportunityId: { type: "string", description: "Associated opportunity ID" },
        dueDate: { type: "string", description: "Due date (ISO format)" },
        assignedTo: { type: "string", description: "Assigned user ID" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority" }
      },
      required: ["title"]
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
        taskId: { type: "string", description: "Task ID" },
        completed: { type: "boolean", description: "Mark as completed" },
        title: { type: "string", description: "Updated title" },
        description: { type: "string", description: "Updated description" },
        dueDate: { type: "string", description: "Updated due date" }
      },
      required: ["taskId"]
    },
    category: "tasks",
    operation: "write"
  },

  // NOTES
  ghl_get_notes: {
    name: "ghl_get_notes",
    description: "Get notes for a contact or opportunity",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        opportunityId: { type: "string", description: "Opportunity ID" },
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "notes",
    operation: "read"
  },

  ghl_create_note: {
    name: "ghl_create_note",
    description: "Add a note to a contact or opportunity",
    parameters: {
      type: "object",
      properties: {
        body: { type: "string", description: "Note content" },
        contactId: { type: "string", description: "Contact ID" },
        opportunityId: { type: "string", description: "Opportunity ID" },
        userId: { type: "string", description: "User ID creating the note" }
      },
      required: ["body"]
    },
    category: "notes",
    operation: "write"
  },

  // TAGS
  ghl_get_contact_tags: {
    name: "ghl_get_contact_tags",
    description: "Get all available tags for contacts",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    category: "tags",
    operation: "read"
  },

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

  // CUSTOM FIELDS
  ghl_get_custom_fields: {
    name: "ghl_get_custom_fields",
    description: "Get all custom fields for the location",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
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

  // USERS & LOCATIONS
  ghl_list_users: {
    name: "ghl_list_users",
    description: "Get all users in the location",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    category: "users",
    operation: "read"
  },

  ghl_get_location_info: {
    name: "ghl_get_location_info",
    description: "Get location information and settings",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    category: "locations",
    operation: "read"
  },

  // CAMPAIGNS
  ghl_list_campaigns: {
    name: "ghl_list_campaigns",
    description: "Get email and SMS campaigns",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["email", "sms"], description: "Campaign type" },
        status: { type: "string", enum: ["draft", "scheduled", "sending", "sent"], description: "Campaign status" }
      }
    },
    category: "campaigns",
    operation: "read"
  },

  ghl_get_campaign_stats: {
    name: "ghl_get_campaign_stats",
    description: "Get statistics for a campaign",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID" }
      },
      required: ["campaignId"]
    },
    category: "campaigns",
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
        offset: { type: "number", description: "Pagination offset" },
        startDate: { type: "string", description: "Start date filter (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date filter (YYYY-MM-DD)" },
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue"], description: "Invoice status" }
      }
    },
    category: "invoices",
    operation: "read"
  },

  ghl_get_invoice: {
    name: "ghl_get_invoice",
    description: "Get detailed information about a specific invoice",
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
        number: { type: "string", description: "Invoice number" },
        dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              price: { type: "number" }
            }
          },
          description: "Invoice line items"
        },
        notes: { type: "string", description: "Invoice notes" }
      },
      required: ["contactId", "title", "items"]
    },
    category: "invoices",
    operation: "write"
  },

  ghl_update_invoice: {
    name: "ghl_update_invoice",
    description: "Update an existing invoice",
    parameters: {
      type: "object",
      properties: {
        invoiceId: { type: "string", description: "Invoice ID" },
        title: { type: "string", description: "Invoice title" },
        dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
        items: { type: "array", description: "Updated line items" },
        notes: { type: "string", description: "Invoice notes" }
      },
      required: ["invoiceId"]
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

  ghl_void_invoice: {
    name: "ghl_void_invoice",
    description: "Void an invoice",
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

  // ESTIMATES
  ghl_list_estimates: {
    name: "ghl_list_estimates",
    description: "List estimates for the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        offset: { type: "number", description: "Pagination offset" },
        status: { type: "string", enum: ["draft", "sent", "accepted", "declined"], description: "Estimate status" }
      }
    },
    category: "estimates",
    operation: "read"
  },

  ghl_get_estimate: {
    name: "ghl_get_estimate",
    description: "Get detailed information about a specific estimate",
    parameters: {
      type: "object",
      properties: {
        estimateId: { type: "string", description: "Estimate ID" }
      },
      required: ["estimateId"]
    },
    category: "estimates",
    operation: "read"
  },

  ghl_create_estimate: {
    name: "ghl_create_estimate",
    description: "Create a new estimate",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        title: { type: "string", description: "Estimate title" },
        number: { type: "string", description: "Estimate number" },
        validUntil: { type: "string", description: "Valid until date (YYYY-MM-DD)" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              price: { type: "number" }
            }
          },
          description: "Estimate line items"
        },
        notes: { type: "string", description: "Estimate notes" }
      },
      required: ["contactId", "title", "items"]
    },
    category: "estimates",
    operation: "write"
  },

  ghl_update_estimate: {
    name: "ghl_update_estimate",
    description: "Update an existing estimate",
    parameters: {
      type: "object",
      properties: {
        estimateId: { type: "string", description: "Estimate ID" },
        title: { type: "string", description: "Estimate title" },
        validUntil: { type: "string", description: "Valid until date (YYYY-MM-DD)" },
        items: { type: "array", description: "Updated line items" },
        notes: { type: "string", description: "Estimate notes" }
      },
      required: ["estimateId"]
    },
    category: "estimates",
    operation: "write"
  },

  ghl_send_estimate: {
    name: "ghl_send_estimate",
    description: "Send an estimate to the contact",
    parameters: {
      type: "object",
      properties: {
        estimateId: { type: "string", description: "Estimate ID" }
      },
      required: ["estimateId"]
    },
    category: "estimates",
    operation: "write"
  },

  // PRODUCTS
  ghl_list_products: {
    name: "ghl_list_products",
    description: "List products in the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        offset: { type: "number", description: "Pagination offset" }
      }
    },
    category: "products",
    operation: "read"
  },

  ghl_get_product: {
    name: "ghl_get_product",
    description: "Get detailed information about a specific product",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product ID" }
      },
      required: ["productId"]
    },
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
        price: { type: "number", description: "Product price" },
        currency: { type: "string", description: "Currency code (USD, EUR, etc.)" },
        category: { type: "string", description: "Product category" },
        isActive: { type: "boolean", description: "Whether product is active" },
        image: { type: "string", description: "Product image URL" }
      },
      required: ["name", "price"]
    },
    category: "products",
    operation: "write"
  },

  ghl_update_product: {
    name: "ghl_update_product",
    description: "Update an existing product",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product ID" },
        name: { type: "string", description: "Product name" },
        description: { type: "string", description: "Product description" },
        price: { type: "number", description: "Product price" },
        isActive: { type: "boolean", description: "Whether product is active" }
      },
      required: ["productId"]
    },
    category: "products",
    operation: "write"
  },

  ghl_delete_product: {
    name: "ghl_delete_product",
    description: "Delete a product",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product ID" }
      },
      required: ["productId"]
    },
    category: "products",
    operation: "delete"
  },

  // PAYMENTS
  ghl_list_payments: {
    name: "ghl_list_payments",
    description: "List payments for the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        offset: { type: "number", description: "Pagination offset" },
        startDate: { type: "string", description: "Start date filter (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date filter (YYYY-MM-DD)" },
        status: { type: "string", enum: ["pending", "succeeded", "failed", "refunded"], description: "Payment status" }
      }
    },
    category: "payments",
    operation: "read"
  },

  ghl_get_payment: {
    name: "ghl_get_payment",
    description: "Get detailed information about a specific payment",
    parameters: {
      type: "object",
      properties: {
        paymentId: { type: "string", description: "Payment ID" }
      },
      required: ["paymentId"]
    },
    category: "payments",
    operation: "read"
  },

  ghl_refund_payment: {
    name: "ghl_refund_payment",
    description: "Refund a payment",
    parameters: {
      type: "object",
      properties: {
        paymentId: { type: "string", description: "Payment ID" },
        amount: { type: "number", description: "Refund amount (optional, full refund if not specified)" },
        reason: { type: "string", description: "Refund reason" }
      },
      required: ["paymentId"]
    },
    category: "payments",
    operation: "write"
  },

  // FORMS
  ghl_list_forms: {
    name: "ghl_list_forms",
    description: "List forms in the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        type: { type: "string", enum: ["survey", "form"], description: "Form type filter" }
      }
    },
    category: "forms",
    operation: "read"
  },

  ghl_get_form: {
    name: "ghl_get_form",
    description: "Get detailed information about a specific form",
    parameters: {
      type: "object",
      properties: {
        formId: { type: "string", description: "Form ID" }
      },
      required: ["formId"]
    },
    category: "forms",
    operation: "read"
  },

  ghl_get_form_submissions: {
    name: "ghl_get_form_submissions",
    description: "Get form submissions for a specific form",
    parameters: {
      type: "object",
      properties: {
        formId: { type: "string", description: "Form ID" },
        limit: { type: "number", description: "Results limit" },
        startDate: { type: "string", description: "Start date filter (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date filter (YYYY-MM-DD)" }
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
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "surveys",
    operation: "read"
  },

  ghl_get_survey: {
    name: "ghl_get_survey",
    description: "Get detailed information about a specific survey",
    parameters: {
      type: "object",
      properties: {
        surveyId: { type: "string", description: "Survey ID" }
      },
      required: ["surveyId"]
    },
    category: "surveys",
    operation: "read"
  },

  ghl_get_survey_submissions: {
    name: "ghl_get_survey_submissions",
    description: "Get survey submissions for a specific survey",
    parameters: {
      type: "object",
      properties: {
        surveyId: { type: "string", description: "Survey ID" },
        limit: { type: "number", description: "Results limit" },
        startDate: { type: "string", description: "Start date filter (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date filter (YYYY-MM-DD)" }
      },
      required: ["surveyId"]
    },
    category: "surveys",
    operation: "read"
  },

  // FUNNELS
  ghl_list_funnels: {
    name: "ghl_list_funnels",
    description: "List funnels in the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        category: { type: "string", description: "Funnel category filter" }
      }
    },
    category: "funnels",
    operation: "read"
  },

  ghl_get_funnel: {
    name: "ghl_get_funnel",
    description: "Get detailed information about a specific funnel",
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

  // WEBSITES/PAGES
  ghl_list_websites: {
    name: "ghl_list_websites",
    description: "List websites in the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "websites",
    operation: "read"
  },

  ghl_get_website: {
    name: "ghl_get_website",
    description: "Get detailed information about a specific website",
    parameters: {
      type: "object",
      properties: {
        websiteId: { type: "string", description: "Website ID" }
      },
      required: ["websiteId"]
    },
    category: "websites",
    operation: "read"
  },

  ghl_list_pages: {
    name: "ghl_list_pages",
    description: "List pages for a website",
    parameters: {
      type: "object",
      properties: {
        websiteId: { type: "string", description: "Website ID" },
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "websites",
    operation: "read"
  },

  // MEDIA/FILES
  ghl_list_media: {
    name: "ghl_list_media",
    description: "List media files in the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        type: { type: "string", enum: ["image", "video", "audio", "document"], description: "Media type filter" }
      }
    },
    category: "media",
    operation: "read"
  },

  ghl_upload_media: {
    name: "ghl_upload_media",
    description: "Upload a media file",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path or base64 content" },
        fileName: { type: "string", description: "File name" },
        folder: { type: "string", description: "Folder to upload to" }
      },
      required: ["file", "fileName"]
    },
    category: "media",
    operation: "write"
  },

  ghl_delete_media: {
    name: "ghl_delete_media",
    description: "Delete a media file",
    parameters: {
      type: "object",
      properties: {
        mediaId: { type: "string", description: "Media file ID" }
      },
      required: ["mediaId"]
    },
    category: "media",
    operation: "delete"
  },

  // COURSES
  ghl_list_courses: {
    name: "ghl_list_courses",
    description: "List courses in the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        published: { type: "boolean", description: "Filter by published status" }
      }
    },
    category: "courses",
    operation: "read"
  },

  ghl_get_course: {
    name: "ghl_get_course",
    description: "Get detailed information about a specific course",
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Course ID" }
      },
      required: ["courseId"]
    },
    category: "courses",
    operation: "read"
  },

  ghl_get_course_lessons: {
    name: "ghl_get_course_lessons",
    description: "Get lessons for a specific course",
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Course ID" }
      },
      required: ["courseId"]
    },
    category: "courses",
    operation: "read"
  },

  ghl_enroll_contact_in_course: {
    name: "ghl_enroll_contact_in_course",
    description: "Enroll a contact in a course",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        courseId: { type: "string", description: "Course ID" }
      },
      required: ["contactId", "courseId"]
    },
    category: "courses",
    operation: "write"
  },

  // EMAIL BUILDER
  ghl_list_email_templates: {
    name: "ghl_list_email_templates",
    description: "List email templates",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        category: { type: "string", description: "Template category filter" }
      }
    },
    category: "email_builder",
    operation: "read"
  },

  ghl_get_email_template: {
    name: "ghl_get_email_template",
    description: "Get detailed information about a specific email template",
    parameters: {
      type: "object",
      properties: {
        templateId: { type: "string", description: "Email template ID" }
      },
      required: ["templateId"]
    },
    category: "email_builder",
    operation: "read"
  },

  ghl_create_email_template: {
    name: "ghl_create_email_template",
    description: "Create a new email template",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template name" },
        subject: { type: "string", description: "Email subject" },
        html: { type: "string", description: "HTML content" },
        text: { type: "string", description: "Plain text content" },
        category: { type: "string", description: "Template category" }
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
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        status: { type: "string", enum: ["draft", "scheduled", "published"], description: "Post status" },
        platform: { type: "string", enum: ["facebook", "instagram", "twitter", "linkedin"], description: "Social platform" }
      }
    },
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
        scheduledDate: { type: "string", description: "Scheduled date/time (ISO format)" },
        media: { type: "array", items: { type: "string" }, description: "Media file IDs" }
      },
      required: ["content", "platforms"]
    },
    category: "social_planner",
    operation: "write"
  },

  ghl_schedule_social_post: {
    name: "ghl_schedule_social_post",
    description: "Schedule a social media post",
    parameters: {
      type: "object",
      properties: {
        postId: { type: "string", description: "Post ID" },
        scheduledDate: { type: "string", description: "Scheduled date/time (ISO format)" }
      },
      required: ["postId", "scheduledDate"]
    },
    category: "social_planner",
    operation: "write"
  },

  // BLOG POSTS
  ghl_list_blog_posts: {
    name: "ghl_list_blog_posts",
    description: "List blog posts",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        status: { type: "string", enum: ["draft", "published"], description: "Post status" },
        category: { type: "string", description: "Post category filter" }
      }
    },
    category: "blog",
    operation: "read"
  },

  ghl_get_blog_post: {
    name: "ghl_get_blog_post",
    description: "Get detailed information about a specific blog post",
    parameters: {
      type: "object",
      properties: {
        postId: { type: "string", description: "Blog post ID" }
      },
      required: ["postId"]
    },
    category: "blog",
    operation: "read"
  },

  ghl_create_blog_post: {
    name: "ghl_create_blog_post",
    description: "Create a new blog post",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Post title" },
        content: { type: "string", description: "Post content (HTML)" },
        excerpt: { type: "string", description: "Post excerpt" },
        category: { type: "string", description: "Post category" },
        tags: { type: "array", items: { type: "string" }, description: "Post tags" },
        featuredImage: { type: "string", description: "Featured image URL" },
        publishDate: { type: "string", description: "Publish date (ISO format)" }
      },
      required: ["title", "content"]
    },
    category: "blog",
    operation: "write"
  },

  ghl_update_blog_post: {
    name: "ghl_update_blog_post",
    description: "Update an existing blog post",
    parameters: {
      type: "object",
      properties: {
        postId: { type: "string", description: "Blog post ID" },
        title: { type: "string", description: "Post title" },
        content: { type: "string", description: "Post content (HTML)" },
        status: { type: "string", enum: ["draft", "published"], description: "Post status" }
      },
      required: ["postId"]
    },
    category: "blog",
    operation: "write"
  },

  // DOCUMENTS/CONTRACTS
  ghl_list_documents: {
    name: "ghl_list_documents",
    description: "List documents and contracts",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        type: { type: "string", enum: ["contract", "document", "proposal"], description: "Document type" },
        status: { type: "string", enum: ["draft", "sent", "signed", "declined"], description: "Document status" }
      }
    },
    category: "documents",
    operation: "read"
  },

  ghl_get_document: {
    name: "ghl_get_document",
    description: "Get detailed information about a specific document",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID" }
      },
      required: ["documentId"]
    },
    category: "documents",
    operation: "read"
  },

  ghl_send_document_for_signature: {
    name: "ghl_send_document_for_signature",
    description: "Send a document for signature",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID" },
        contactId: { type: "string", description: "Contact ID to send to" },
        message: { type: "string", description: "Message to include with document" }
      },
      required: ["documentId", "contactId"]
    },
    category: "documents",
    operation: "write"
  },

  // CUSTOM VALUES
  ghl_list_custom_values: {
    name: "ghl_list_custom_values",
    description: "List custom values in the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "custom_values",
    operation: "read"
  },

  ghl_create_custom_value: {
    name: "ghl_create_custom_value",
    description: "Create a new custom value",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Custom value name" },
        dataType: { type: "string", enum: ["TEXT", "LARGE_TEXT", "NUMBER", "MONETARY", "DATE", "PHONE", "EMAIL"], description: "Data type" },
        isRequired: { type: "boolean", description: "Whether the field is required" }
      },
      required: ["name", "dataType"]
    },
    category: "custom_values",
    operation: "write"
  },

  ghl_delete_custom_value: {
    name: "ghl_delete_custom_value",
    description: "Delete a custom value",
    parameters: {
      type: "object",
      properties: {
        customValueId: { type: "string", description: "Custom value ID" }
      },
      required: ["customValueId"]
    },
    category: "custom_values",
    operation: "delete"
  },

  // LOCATION TAGS
  ghl_list_location_tags: {
    name: "ghl_list_location_tags",
    description: "List location tags",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "location_tags",
    operation: "read"
  },

  ghl_create_location_tag: {
    name: "ghl_create_location_tag",
    description: "Create a new location tag",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Tag name" },
        color: { type: "string", description: "Tag color (hex code)" }
      },
      required: ["name"]
    },
    category: "location_tags",
    operation: "write"
  },

  ghl_delete_location_tag: {
    name: "ghl_delete_location_tag",
    description: "Delete a location tag",
    parameters: {
      type: "object",
      properties: {
        tagId: { type: "string", description: "Tag ID" }
      },
      required: ["tagId"]
    },
    category: "location_tags",
    operation: "delete"
  },

  // BUSINESSES
  ghl_list_businesses: {
    name: "ghl_list_businesses",
    description: "List businesses/sub-accounts",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "businesses",
    operation: "read"
  },

  ghl_get_business: {
    name: "ghl_get_business",
    description: "Get detailed information about a specific business",
    parameters: {
      type: "object",
      properties: {
        businessId: { type: "string", description: "Business ID" }
      },
      required: ["businessId"]
    },
    category: "businesses",
    operation: "read"
  },

  // TRIGGER LINKS
  ghl_list_trigger_links: {
    name: "ghl_list_trigger_links",
    description: "List trigger links",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "trigger_links",
    operation: "read"
  },

  ghl_create_trigger_link: {
    name: "ghl_create_trigger_link",
    description: "Create a new trigger link",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Trigger link name" },
        url: { type: "string", description: "Target URL" },
        workflowId: { type: "string", description: "Workflow ID to trigger" }
      },
      required: ["name", "url"]
    },
    category: "trigger_links",
    operation: "write"
  },

  // VOICE AI & PHONE SYSTEM
  ghl_list_voice_calls: {
    name: "ghl_list_voice_calls",
    description: "List voice calls",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        startDate: { type: "string", description: "Start date filter (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date filter (YYYY-MM-DD)" },
        direction: { type: "string", enum: ["inbound", "outbound"], description: "Call direction" }
      }
    },
    category: "voice_ai",
    operation: "read"
  },

  ghl_get_call_recording: {
    name: "ghl_get_call_recording",
    description: "Get call recording URL",
    parameters: {
      type: "object",
      properties: {
        callId: { type: "string", description: "Call ID" }
      },
      required: ["callId"]
    },
    category: "voice_ai",
    operation: "read"
  },

  ghl_list_phone_numbers: {
    name: "ghl_list_phone_numbers",
    description: "List phone numbers for the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "phone_system",
    operation: "read"
  },

  // CUSTOM OBJECTS
  ghl_list_custom_objects: {
    name: "ghl_list_custom_objects",
    description: "List custom objects in the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "custom_objects",
    operation: "read"
  },

  ghl_create_custom_object_record: {
    name: "ghl_create_custom_object_record",
    description: "Create a record in a custom object",
    parameters: {
      type: "object",
      properties: {
        objectId: { type: "string", description: "Custom object ID" },
        data: { type: "object", description: "Record data" }
      },
      required: ["objectId", "data"]
    },
    category: "custom_objects",
    operation: "write"
  },

  ghl_get_custom_object_records: {
    name: "ghl_get_custom_object_records",
    description: "Get records from a custom object",
    parameters: {
      type: "object",
      properties: {
        objectId: { type: "string", description: "Custom object ID" },
        limit: { type: "number", description: "Results limit" }
      },
      required: ["objectId"]
    },
    category: "custom_objects",
    operation: "read"
  },

  // USERS (EXPANDED)
  ghl_get_user: {
    name: "ghl_get_user",
    description: "Get detailed information about a specific user",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "User ID" }
      },
      required: ["userId"]
    },
    category: "users",
    operation: "read"
  },

  ghl_update_user: {
    name: "ghl_update_user",
    description: "Update user information",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "User ID" },
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" }
      },
      required: ["userId"]
    },
    category: "users",
    operation: "write"
  }
};

// Tool execution handlers
export const ghlExecutors = {
  ghl_search_contacts: async (params) => {
    return await callGHL('/contacts/search', 'GET', null, params);
  },

  ghl_get_contact: async (params) => {
    return await callGHL(`/contacts/${params.contactId}`);
  },

  ghl_create_contact: async (params) => {
    return await callGHL('/contacts', 'POST', params);
  },

  ghl_update_contact: async (params) => {
    const { contactId, ...updateData } = params;
    return await callGHL(`/contacts/${contactId}`, 'PUT', updateData);
  },

  ghl_delete_contact: async (params) => {
    return await callGHL(`/contacts/${params.contactId}`, 'DELETE');
  },

  ghl_get_conversations: async (params) => {
    return await callGHL('/conversations/search', 'GET', null, params);
  },

  ghl_send_message: async (params) => {
    return await callGHL('/conversations/messages', 'POST', params);
  },

  ghl_list_calendars: async (params) => {
    return await callGHL('/calendars');
  },

  ghl_get_calendar_slots: async (params) => {
    return await callGHL(`/calendars/${params.calendarId}/free-slots`, 'GET', null, params);
  },

  ghl_create_appointment: async (params) => {
    return await callGHL(`/calendars/${params.calendarId}/appointments`, 'POST', params);
  },

  ghl_search_opportunities: async (params) => {
    return await callGHL('/opportunities/search', 'GET', null, params);
  },

  ghl_create_opportunity: async (params) => {
    return await callGHL('/opportunities', 'POST', params);
  },

  ghl_list_workflows: async (params) => {
    return await callGHL('/workflows');
  },

  ghl_add_contact_to_workflow: async (params) => {
    return await callGHL(`/workflows/${params.workflowId}/subscribers`, 'POST', { contactId: params.contactId });
  },

  ghl_get_forms: async (params) => {
    return await callGHL('/forms');
  },

  ghl_get_form_submissions: async (params) => {
    return await callGHL(`/forms/${params.formId}/submissions`, 'GET', null, params);
  },

  // PIPELINES & STAGES
  ghl_list_pipelines: async (params) => {
    return await callGHL('/opportunities/pipelines');
  },

  ghl_get_pipeline_stages: async (params) => {
    return await callGHL(`/opportunities/pipelines/${params.pipelineId}/stages`);
  },

  ghl_update_opportunity_stage: async (params) => {
    const { opportunityId, pipelineStageId } = params;
    return await callGHL(`/opportunities/${opportunityId}`, 'PUT', { pipelineStageId });
  },

  // TASKS
  ghl_list_tasks: async (params) => {
    return await callGHL('/tasks', 'GET', null, params);
  },

  ghl_create_task: async (params) => {
    return await callGHL('/tasks', 'POST', params);
  },

  ghl_update_task: async (params) => {
    const { taskId, ...updateData } = params;
    return await callGHL(`/tasks/${taskId}`, 'PUT', updateData);
  },

  // NOTES
  ghl_get_notes: async (params) => {
    if (params.contactId) {
      return await callGHL(`/contacts/${params.contactId}/notes`, 'GET', null, params);
    } else if (params.opportunityId) {
      return await callGHL(`/opportunities/${params.opportunityId}/notes`, 'GET', null, params);
    } else {
      return await callGHL('/notes', 'GET', null, params);
    }
  },

  ghl_create_note: async (params) => {
    if (params.contactId) {
      return await callGHL(`/contacts/${params.contactId}/notes`, 'POST', params);
    } else if (params.opportunityId) {
      return await callGHL(`/opportunities/${params.opportunityId}/notes`, 'POST', params);
    } else {
      return await callGHL('/notes', 'POST', params);
    }
  },

  // TAGS
  ghl_get_contact_tags: async (params) => {
    return await callGHL('/contacts/tags');
  },

  ghl_add_contact_tag: async (params) => {
    const { contactId, tags } = params;
    return await callGHL(`/contacts/${contactId}/tags`, 'POST', { tags });
  },

  ghl_remove_contact_tag: async (params) => {
    const { contactId, tags } = params;
    return await callGHL(`/contacts/${contactId}/tags`, 'DELETE', { tags });
  },

  // CUSTOM FIELDS
  ghl_get_custom_fields: async (params) => {
    return await callGHL('/custom-fields');
  },

  ghl_update_contact_custom_field: async (params) => {
    const { contactId, customFields } = params;
    return await callGHL(`/contacts/${contactId}`, 'PUT', { customFields });
  },

  // USERS & LOCATIONS
  ghl_list_users: async (params) => {
    return await callGHL('/users');
  },

  ghl_get_location_info: async (params) => {
    return await callGHL('/locations/search', 'GET', null, { limit: 1 });
  },

  // CAMPAIGNS
  ghl_list_campaigns: async (params) => {
    return await callGHL('/campaigns', 'GET', null, params);
  },

  ghl_get_campaign_stats: async (params) => {
    return await callGHL(`/campaigns/${params.campaignId}/stats`);
  },

  // INVOICES
  ghl_list_invoices: async (params) => {
    return await callGHL('/invoices', 'GET', null, params);
  },

  ghl_get_invoice: async (params) => {
    return await callGHL(`/invoices/${params.invoiceId}`);
  },

  ghl_create_invoice: async (params) => {
    return await callGHL('/invoices', 'POST', params);
  },

  ghl_update_invoice: async (params) => {
    const { invoiceId, ...updateData } = params;
    return await callGHL(`/invoices/${invoiceId}`, 'PUT', updateData);
  },

  ghl_send_invoice: async (params) => {
    return await callGHL(`/invoices/${params.invoiceId}/send`, 'POST');
  },

  ghl_void_invoice: async (params) => {
    return await callGHL(`/invoices/${params.invoiceId}/void`, 'POST');
  },

  // ESTIMATES
  ghl_list_estimates: async (params) => {
    return await callGHL('/estimates', 'GET', null, params);
  },

  ghl_get_estimate: async (params) => {
    return await callGHL(`/estimates/${params.estimateId}`);
  },

  ghl_create_estimate: async (params) => {
    return await callGHL('/estimates', 'POST', params);
  },

  ghl_update_estimate: async (params) => {
    const { estimateId, ...updateData } = params;
    return await callGHL(`/estimates/${estimateId}`, 'PUT', updateData);
  },

  ghl_send_estimate: async (params) => {
    return await callGHL(`/estimates/${params.estimateId}/send`, 'POST');
  },

  // PRODUCTS
  ghl_list_products: async (params) => {
    return await callGHL('/products', 'GET', null, params);
  },

  ghl_get_product: async (params) => {
    return await callGHL(`/products/${params.productId}`);
  },

  ghl_create_product: async (params) => {
    return await callGHL('/products', 'POST', params);
  },

  ghl_update_product: async (params) => {
    const { productId, ...updateData } = params;
    return await callGHL(`/products/${productId}`, 'PUT', updateData);
  },

  ghl_delete_product: async (params) => {
    return await callGHL(`/products/${params.productId}`, 'DELETE');
  },

  // PAYMENTS
  ghl_list_payments: async (params) => {
    return await callGHL('/payments', 'GET', null, params);
  },

  ghl_get_payment: async (params) => {
    return await callGHL(`/payments/${params.paymentId}`);
  },

  ghl_refund_payment: async (params) => {
    const { paymentId, amount, reason } = params;
    return await callGHL(`/payments/${paymentId}/refunds`, 'POST', { amount, reason });
  },

  // FORMS
  ghl_list_forms: async (params) => {
    return await callGHL('/forms', 'GET', null, params);
  },

  ghl_get_form: async (params) => {
    return await callGHL(`/forms/${params.formId}`);
  },

  ghl_get_form_submissions: async (params) => {
    const { formId, ...queryParams } = params;
    return await callGHL(`/forms/${formId}/submissions`, 'GET', null, queryParams);
  },

  // SURVEYS
  ghl_list_surveys: async (params) => {
    return await callGHL('/surveys', 'GET', null, params);
  },

  ghl_get_survey: async (params) => {
    return await callGHL(`/surveys/${params.surveyId}`);
  },

  ghl_get_survey_submissions: async (params) => {
    const { surveyId, ...queryParams } = params;
    return await callGHL(`/surveys/${surveyId}/submissions`, 'GET', null, queryParams);
  },

  // FUNNELS
  ghl_list_funnels: async (params) => {
    return await callGHL('/funnels', 'GET', null, params);
  },

  ghl_get_funnel: async (params) => {
    return await callGHL(`/funnels/${params.funnelId}`);
  },

  ghl_get_funnel_pages: async (params) => {
    return await callGHL(`/funnels/${params.funnelId}/pages`);
  },

  // WEBSITES/PAGES
  ghl_list_websites: async (params) => {
    return await callGHL('/websites', 'GET', null, params);
  },

  ghl_get_website: async (params) => {
    return await callGHL(`/websites/${params.websiteId}`);
  },

  ghl_list_pages: async (params) => {
    const { websiteId, ...queryParams } = params;
    return await callGHL(`/websites/${websiteId}/pages`, 'GET', null, queryParams);
  },

  // MEDIA/FILES
  ghl_list_media: async (params) => {
    return await callGHL('/medias', 'GET', null, params);
  },

  ghl_upload_media: async (params) => {
    const { file, fileName, folder } = params;
    // Note: This would need proper file upload handling in a real implementation
    return await callGHL('/medias/upload-file', 'POST', { file, fileName, folder });
  },

  ghl_delete_media: async (params) => {
    return await callGHL(`/medias/${params.mediaId}`, 'DELETE');
  },

  // COURSES
  ghl_list_courses: async (params) => {
    return await callGHL('/courses', 'GET', null, params);
  },

  ghl_get_course: async (params) => {
    return await callGHL(`/courses/${params.courseId}`);
  },

  ghl_get_course_lessons: async (params) => {
    return await callGHL(`/courses/${params.courseId}/lessons`);
  },

  ghl_enroll_contact_in_course: async (params) => {
    const { contactId, courseId } = params;
    return await callGHL(`/courses/${courseId}/enrollments`, 'POST', { contactId });
  },

  // EMAIL BUILDER
  ghl_list_email_templates: async (params) => {
    return await callGHL('/emails/templates', 'GET', null, params);
  },

  ghl_get_email_template: async (params) => {
    return await callGHL(`/emails/templates/${params.templateId}`);
  },

  ghl_create_email_template: async (params) => {
    return await callGHL('/emails/templates', 'POST', params);
  },

  // SOCIAL PLANNER
  ghl_list_social_posts: async (params) => {
    return await callGHL('/social-media-posting', 'GET', null, params);
  },

  ghl_create_social_post: async (params) => {
    return await callGHL('/social-media-posting', 'POST', params);
  },

  ghl_schedule_social_post: async (params) => {
    const { postId, scheduledDate } = params;
    return await callGHL(`/social-media-posting/${postId}/schedule`, 'PUT', { scheduledDate });
  },

  // BLOG POSTS
  ghl_list_blog_posts: async (params) => {
    return await callGHL('/blogs', 'GET', null, params);
  },

  ghl_get_blog_post: async (params) => {
    return await callGHL(`/blogs/${params.postId}`);
  },

  ghl_create_blog_post: async (params) => {
    return await callGHL('/blogs', 'POST', params);
  },

  ghl_update_blog_post: async (params) => {
    const { postId, ...updateData } = params;
    return await callGHL(`/blogs/${postId}`, 'PUT', updateData);
  },

  // DOCUMENTS/CONTRACTS
  ghl_list_documents: async (params) => {
    return await callGHL('/documents', 'GET', null, params);
  },

  ghl_get_document: async (params) => {
    return await callGHL(`/documents/${params.documentId}`);
  },

  ghl_send_document_for_signature: async (params) => {
    const { documentId, contactId, message } = params;
    return await callGHL(`/documents/${documentId}/send`, 'POST', { contactId, message });
  },

  // CUSTOM VALUES
  ghl_list_custom_values: async (params) => {
    return await callGHL('/custom-values', 'GET', null, params);
  },

  ghl_create_custom_value: async (params) => {
    return await callGHL('/custom-values', 'POST', params);
  },

  ghl_delete_custom_value: async (params) => {
    return await callGHL(`/custom-values/${params.customValueId}`, 'DELETE');
  },

  // LOCATION TAGS
  ghl_list_location_tags: async (params) => {
    return await callGHL('/tags', 'GET', null, params);
  },

  ghl_create_location_tag: async (params) => {
    return await callGHL('/tags', 'POST', params);
  },

  ghl_delete_location_tag: async (params) => {
    return await callGHL(`/tags/${params.tagId}`, 'DELETE');
  },

  // BUSINESSES
  ghl_list_businesses: async (params) => {
    return await callGHL('/locations', 'GET', null, params);
  },

  ghl_get_business: async (params) => {
    return await callGHL(`/locations/${params.businessId}`);
  },

  // TRIGGER LINKS
  ghl_list_trigger_links: async (params) => {
    return await callGHL('/links', 'GET', null, params);
  },

  ghl_create_trigger_link: async (params) => {
    return await callGHL('/links', 'POST', params);
  },

  // VOICE AI & PHONE SYSTEM
  ghl_list_voice_calls: async (params) => {
    return await callGHL('/voice/calls', 'GET', null, params);
  },

  ghl_get_call_recording: async (params) => {
    return await callGHL(`/voice/calls/${params.callId}/recording`);
  },

  ghl_list_phone_numbers: async (params) => {
    return await callGHL('/phone-numbers', 'GET', null, params);
  },

  // CUSTOM OBJECTS
  ghl_list_custom_objects: async (params) => {
    return await callGHL('/custom-objects', 'GET', null, params);
  },

  ghl_create_custom_object_record: async (params) => {
    const { objectId, data } = params;
    return await callGHL(`/custom-objects/${objectId}/records`, 'POST', data);
  },

  ghl_get_custom_object_records: async (params) => {
    const { objectId, ...queryParams } = params;
    return await callGHL(`/custom-objects/${objectId}/records`, 'GET', null, queryParams);
  },

  // USERS (EXPANDED)
  ghl_get_user: async (params) => {
    return await callGHL(`/users/${params.userId}`);
  },

  ghl_update_user: async (params) => {
    const { userId, ...updateData } = params;
    return await callGHL(`/users/${userId}`, 'PUT', updateData);
  }
};

// Execute any GHL tool by name
export async function executeGHLTool(toolName, parameters) {
  const startTime = Date.now();
  logger.info(`Executing GHL tool: ${toolName}`, parameters);

  if (!ghlExecutors[toolName]) {
    throw new Error(`Unknown GHL tool: ${toolName}`);
  }

  try {
    const result = await ghlExecutors[toolName](parameters);
    const duration = Date.now() - startTime;

    logger.info(`GHL tool completed: ${toolName} (${duration}ms)`);

    return {
      success: true,
      data: result,
      executionTime: duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`GHL tool failed: ${toolName} (${duration}ms)`, error.message);

    return {
      success: false,
      error: error.message,
      executionTime: duration
    };
  }
}