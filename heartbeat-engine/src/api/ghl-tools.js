// GoHighLevel API v2 Integration Layer for Sarah Rodriguez
// Provides comprehensive tool_use functions for Claude to interact with GHL

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
    logger.info(`GHL API call successful: ${method} ${endpoint}`);
    return response.data;
  } catch (error) {
    logger.error(`GHL API error: ${method} ${endpoint}`, error.response?.data || error.message);
    throw new Error(`GHL API Error: ${error.response?.data?.message || error.message}`);
  }
}

// CONTACTS Tools
export const contactTools = [
  {
    name: "ghl_search_contacts",
    description: "Search for contacts in GHL by email, phone, name, or other criteria",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (email, phone, name)" },
        limit: { type: "number", description: "Results limit (default: 100)" },
        startAfter: { type: "string", description: "Pagination cursor" }
      },
      required: ["query"]
    }
  },
  {
    name: "ghl_get_contact",
    description: "Get detailed information about a specific contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_create_contact",
    description: "Create a new contact in GHL",
    input_schema: {
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
    }
  },
  {
    name: "ghl_update_contact",
    description: "Update an existing contact",
    input_schema: {
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
    }
  },
  {
    name: "ghl_delete_contact",
    description: "Delete a contact from GHL",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_add_contact_tags",
    description: "Add tags to a contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to add" }
      },
      required: ["contactId", "tags"]
    }
  },
  {
    name: "ghl_remove_contact_tags",
    description: "Remove tags from a contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to remove" }
      },
      required: ["contactId", "tags"]
    }
  },
  {
    name: "ghl_add_contact_note",
    description: "Add a note to a contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        body: { type: "string", description: "Note content" },
        userId: { type: "string", description: "User ID creating the note" }
      },
      required: ["contactId", "body"]
    }
  },
  {
    name: "ghl_create_contact_task",
    description: "Create a task for a contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        title: { type: "string", description: "Task title" },
        body: { type: "string", description: "Task description" },
        dueDate: { type: "string", description: "Due date (ISO format)" },
        assignedTo: { type: "string", description: "Assigned user ID" }
      },
      required: ["contactId", "title"]
    }
  }
];

// CONVERSATIONS Tools
export const conversationTools = [
  {
    name: "ghl_get_conversations",
    description: "Get conversations for a contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        limit: { type: "number", description: "Results limit" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_send_message",
    description: "Send SMS, email, or other message to a contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        type: { type: "string", enum: ["SMS", "Email", "WhatsApp", "GMB", "IG", "FB"], description: "Message type" },
        message: { type: "string", description: "Message content" },
        subject: { type: "string", description: "Email subject (for email type)" },
        html: { type: "string", description: "HTML content (for email)" }
      },
      required: ["contactId", "type", "message"]
    }
  },
  {
    name: "ghl_search_conversations",
    description: "Search conversations by text content",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Results limit" }
      },
      required: ["query"]
    }
  }
];

// CALENDAR Tools
export const calendarTools = [
  {
    name: "ghl_list_calendars",
    description: "Get all calendars for the location",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "ghl_get_calendar_slots",
    description: "Get available time slots for a calendar",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID" },
        startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date (YYYY-MM-DD)" }
      },
      required: ["calendarId", "startDate", "endDate"]
    }
  },
  {
    name: "ghl_create_appointment",
    description: "Book an appointment on a calendar",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID" },
        contactId: { type: "string", description: "Contact ID" },
        startTime: { type: "string", description: "Start time (ISO format)" },
        title: { type: "string", description: "Appointment title" },
        appointmentStatus: { type: "string", description: "Appointment status" }
      },
      required: ["calendarId", "contactId", "startTime"]
    }
  },
  {
    name: "ghl_get_appointments",
    description: "Get appointments from calendar",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID" },
        startDate: { type: "string", description: "Start date" },
        endDate: { type: "string", description: "End date" }
      },
      required: ["calendarId"]
    }
  }
];

// OPPORTUNITIES Tools
export const opportunityTools = [
  {
    name: "ghl_search_opportunities",
    description: "Search opportunities in the pipeline",
    input_schema: {
      type: "object",
      properties: {
        pipelineId: { type: "string", description: "Pipeline ID" },
        status: { type: "string", description: "Opportunity status" },
        q: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Results limit" }
      }
    }
  },
  {
    name: "ghl_get_opportunity",
    description: "Get details of a specific opportunity",
    input_schema: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "Opportunity ID" }
      },
      required: ["opportunityId"]
    }
  },
  {
    name: "ghl_create_opportunity",
    description: "Create a new opportunity",
    input_schema: {
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
    }
  },
  {
    name: "ghl_update_opportunity",
    description: "Update an opportunity",
    input_schema: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "Opportunity ID" },
        name: { type: "string", description: "Opportunity name" },
        pipelineStageId: { type: "string", description: "Pipeline stage ID" },
        monetaryValue: { type: "number", description: "Monetary value" },
        status: { type: "string", description: "Status" }
      },
      required: ["opportunityId"]
    }
  },
  {
    name: "ghl_get_pipelines",
    description: "Get all pipelines for the location",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// WORKFLOWS Tools
export const workflowTools = [
  {
    name: "ghl_list_workflows",
    description: "Get all workflows for the location",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "ghl_add_contact_to_workflow",
    description: "Add a contact to a workflow",
    input_schema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow ID" },
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["workflowId", "contactId"]
    }
  },
  {
    name: "ghl_remove_contact_from_workflow",
    description: "Remove a contact from a workflow",
    input_schema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow ID" },
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["workflowId", "contactId"]
    }
  }
];

// FORMS/SURVEYS Tools
export const formsTools = [
  {
    name: "ghl_get_forms",
    description: "Get all forms for the location",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "ghl_get_form_submissions",
    description: "Get submissions for a specific form",
    input_schema: {
      type: "object",
      properties: {
        formId: { type: "string", description: "Form ID" },
        limit: { type: "number", description: "Results limit" },
        page: { type: "number", description: "Page number" }
      },
      required: ["formId"]
    }
  }
];

// MEDIA Tools
export const mediaTools = [
  {
    name: "ghl_upload_media",
    description: "Upload a file to GHL media library",
    input_schema: {
      type: "object",
      properties: {
        fileName: { type: "string", description: "File name" },
        fileBase64: { type: "string", description: "File content as base64" }
      },
      required: ["fileName", "fileBase64"]
    }
  },
  {
    name: "ghl_list_media",
    description: "List files in media library",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        altId: { type: "string", description: "Alternative ID for filtering" }
      }
    }
  }
];

// EMAIL CAMPAIGNS Tools
export const emailTools = [
  {
    name: "ghl_get_email_campaigns",
    description: "Get all email campaigns",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Campaign type" },
        status: { type: "string", description: "Campaign status" }
      }
    }
  },
  {
    name: "ghl_send_email_campaign",
    description: "Send an email to contacts",
    input_schema: {
      type: "object",
      properties: {
        emails: { type: "array", items: { type: "string" }, description: "Email addresses" },
        subject: { type: "string", description: "Email subject" },
        html: { type: "string", description: "HTML content" },
        attachments: { type: "array", description: "Email attachments" }
      },
      required: ["emails", "subject", "html"]
    }
  }
];

// Combine all tools into categories
export const allGHLTools = [
  ...contactTools,
  ...conversationTools,
  ...calendarTools,
  ...opportunityTools,
  ...workflowTools,
  ...formsTools,
  ...mediaTools,
  ...emailTools
];

// Tool execution handler
export async function executeGHLTool(toolName, parameters) {
  const startTime = Date.now();
  logger.info(`Executing GHL tool: ${toolName}`, parameters);

  try {
    let result;

    // CONTACTS
    if (toolName === 'ghl_search_contacts') {
      const locationId = process.env.GHL_LOCATION_ID;
      result = await callGHL('/contacts/search', 'POST', { locationId, query: parameters.query }, null);
    } else if (toolName === 'ghl_get_contact') {
      result = await callGHL(`/contacts/${parameters.contactId}`);
    } else if (toolName === 'ghl_create_contact') {
      result = await callGHL('/contacts', 'POST', parameters);
    } else if (toolName === 'ghl_update_contact') {
      const { contactId, ...updateData } = parameters;
      result = await callGHL(`/contacts/${contactId}`, 'PUT', updateData);
    } else if (toolName === 'ghl_delete_contact') {
      result = await callGHL(`/contacts/${parameters.contactId}`, 'DELETE');
    } else if (toolName === 'ghl_add_contact_tags') {
      result = await callGHL(`/contacts/${parameters.contactId}/tags`, 'POST', { tags: parameters.tags });
    } else if (toolName === 'ghl_remove_contact_tags') {
      result = await callGHL(`/contacts/${parameters.contactId}/tags`, 'DELETE', { tags: parameters.tags });
    } else if (toolName === 'ghl_add_contact_note') {
      result = await callGHL(`/contacts/${parameters.contactId}/notes`, 'POST', parameters);
    } else if (toolName === 'ghl_create_contact_task') {
      result = await callGHL(`/contacts/${parameters.contactId}/tasks`, 'POST', parameters);

    // CONVERSATIONS
    } else if (toolName === 'ghl_get_conversations') {
      result = await callGHL(`/conversations`, 'GET', null, parameters);
    } else if (toolName === 'ghl_send_message') {
      result = await callGHL('/conversations/messages', 'POST', parameters);
    } else if (toolName === 'ghl_search_conversations') {
      result = await callGHL('/conversations/search', 'GET', null, parameters);

    // CALENDAR
    } else if (toolName === 'ghl_list_calendars') {
      result = await callGHL('/calendars');
    } else if (toolName === 'ghl_get_calendar_slots') {
      result = await callGHL(`/calendars/${parameters.calendarId}/free-slots`, 'GET', null, parameters);
    } else if (toolName === 'ghl_create_appointment') {
      result = await callGHL(`/calendars/${parameters.calendarId}/appointments`, 'POST', parameters);
    } else if (toolName === 'ghl_get_appointments') {
      result = await callGHL(`/calendars/${parameters.calendarId}/appointments`, 'GET', null, parameters);

    // OPPORTUNITIES
    } else if (toolName === 'ghl_search_opportunities') {
      const locationId = process.env.GHL_LOCATION_ID;
      result = await callGHL('/opportunities/search', 'POST', { location_id: locationId, query: parameters.query }, null);
    } else if (toolName === 'ghl_get_opportunity') {
      result = await callGHL(`/opportunities/${parameters.opportunityId}`);
    } else if (toolName === 'ghl_create_opportunity') {
      result = await callGHL('/opportunities', 'POST', parameters);
    } else if (toolName === 'ghl_update_opportunity') {
      const { opportunityId, ...updateData } = parameters;
      result = await callGHL(`/opportunities/${opportunityId}`, 'PUT', updateData);
    } else if (toolName === 'ghl_get_pipelines') {
      result = await callGHL('/opportunities/pipelines');

    // WORKFLOWS
    } else if (toolName === 'ghl_list_workflows') {
      result = await callGHL('/workflows');
    } else if (toolName === 'ghl_add_contact_to_workflow') {
      result = await callGHL(`/workflows/${parameters.workflowId}/subscribers`, 'POST', { contactId: parameters.contactId });
    } else if (toolName === 'ghl_remove_contact_from_workflow') {
      result = await callGHL(`/workflows/${parameters.workflowId}/subscribers/${parameters.contactId}`, 'DELETE');

    // FORMS
    } else if (toolName === 'ghl_get_forms') {
      result = await callGHL('/forms');
    } else if (toolName === 'ghl_get_form_submissions') {
      result = await callGHL(`/forms/${parameters.formId}/submissions`, 'GET', null, parameters);

    // MEDIA
    } else if (toolName === 'ghl_upload_media') {
      result = await callGHL('/media/upload-file', 'POST', parameters);
    } else if (toolName === 'ghl_list_media') {
      result = await callGHL('/media', 'GET', null, parameters);

    // EMAIL
    } else if (toolName === 'ghl_get_email_campaigns') {
      result = await callGHL('/campaigns', 'GET', null, parameters);
    } else if (toolName === 'ghl_send_email_campaign') {
      result = await callGHL('/campaigns/send', 'POST', parameters);

    } else {
      throw new Error(`Unknown GHL tool: ${toolName}`);
    }

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