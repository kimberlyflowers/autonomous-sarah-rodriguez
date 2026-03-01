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