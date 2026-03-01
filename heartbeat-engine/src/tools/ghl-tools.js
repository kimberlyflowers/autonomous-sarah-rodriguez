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