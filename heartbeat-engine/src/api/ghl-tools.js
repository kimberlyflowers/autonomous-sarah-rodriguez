// GoHighLevel API v2 Integration Layer for Sarah Rodriguez
// ALL endpoints verified against: marketplace.gohighlevel.com/docs

import axios from 'axios';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('ghl-tools');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

async function callGHL(endpoint, method = 'GET', data = null, params = {}) {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey) throw new Error('GHL_API_KEY environment variable not configured');

  const config = {
    method,
    url: `${GHL_BASE_URL}${endpoint}`,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version': GHL_API_VERSION,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    params: { locationId, ...params }
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
        limit: { type: "number", description: "Results limit (default: 20)" },
        page: { type: "number", description: "Page number (default: 1)" }
      },
      required: ["query"]
    }
  },
  {
    name: "ghl_get_contact",
    description: "Get detailed information about a specific contact",
    input_schema: {
      type: "object",
      properties: { contactId: { type: "string", description: "Contact ID" } },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_create_contact",
    description: "Create a new contact in GHL",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string" }, lastName: { type: "string" },
        email: { type: "string" }, phone: { type: "string" },
        address1: { type: "string" }, city: { type: "string" },
        state: { type: "string" }, postalCode: { type: "string" },
        website: { type: "string" }, tags: { type: "array", items: { type: "string" } },
        customFields: { type: "object" }
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
        contactId: { type: "string" }, firstName: { type: "string" },
        lastName: { type: "string" }, email: { type: "string" },
        phone: { type: "string" }, tags: { type: "array", items: { type: "string" } },
        customFields: { type: "object" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_delete_contact",
    description: "Delete a contact from GHL",
    input_schema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_add_contact_tags",
    description: "Add tags to a contact",
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
    name: "ghl_remove_contact_tags",
    description: "Remove tags from a contact",
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
    name: "ghl_add_contact_note",
    description: "Add a note to a contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        body: { type: "string" },
        userId: { type: "string" }
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
        contactId: { type: "string" }, title: { type: "string" },
        body: { type: "string" }, dueDate: { type: "string" },
        assignedTo: { type: "string" }
      },
      required: ["contactId", "title"]
    }
  }
];

export const conversationTools = [
  {
    name: "ghl_get_conversations",
    description: "Get conversations for a contact",
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
    description: "Send SMS, email, or other message to a contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        type: { type: "string", enum: ["SMS", "Email", "WhatsApp", "GMB", "IG", "FB"] },
        message: { type: "string" },
        subject: { type: "string" },
        html: { type: "string" }
      },
      required: ["contactId", "type", "message"]
    }
  },
  {
    name: "ghl_search_conversations",
    description: "Search conversations by contact or text",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" }
      }
    }
  }
];

export const calendarTools = [
  {
    name: "ghl_list_calendars",
    description: "Get all calendars for the location",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_calendar_slots",
    description: "Get available time slots for a calendar",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" }
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
        calendarId: { type: "string" }, contactId: { type: "string" },
        startTime: { type: "string" }, title: { type: "string" },
        appointmentStatus: { type: "string" }
      },
      required: ["calendarId", "contactId", "startTime"]
    }
  },
  {
    name: "ghl_get_appointments",
    description: "Get appointments/events from calendar",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" }
      },
      required: ["calendarId"]
    }
  }
];

export const opportunityTools = [
  {
    name: "ghl_search_opportunities",
    description: "Search opportunities in the pipeline",
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
    description: "Get details of a specific opportunity",
    input_schema: {
      type: "object",
      properties: { opportunityId: { type: "string" } },
      required: ["opportunityId"]
    }
  },
  {
    name: "ghl_create_opportunity",
    description: "Create a new opportunity",
    input_schema: {
      type: "object",
      properties: {
        pipelineId: { type: "string" }, pipelineStageId: { type: "string" },
        contactId: { type: "string" }, name: { type: "string" },
        monetaryValue: { type: "number" }, assignedTo: { type: "string" }
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
        opportunityId: { type: "string" }, name: { type: "string" },
        pipelineStageId: { type: "string" }, monetaryValue: { type: "number" },
        status: { type: "string" }
      },
      required: ["opportunityId"]
    }
  },
  {
    name: "ghl_get_pipelines",
    description: "Get all pipelines for the location",
    input_schema: { type: "object", properties: {}, required: [] }
  }
];

export const workflowTools = [
  {
    name: "ghl_list_workflows",
    description: "Get all workflows for the location",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_add_contact_to_workflow",
    description: "Add a contact to a workflow",
    input_schema: {
      type: "object",
      properties: {
        workflowId: { type: "string" },
        contactId: { type: "string" }
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
        workflowId: { type: "string" },
        contactId: { type: "string" }
      },
      required: ["workflowId", "contactId"]
    }
  }
];

export const formsTools = [
  {
    name: "ghl_get_forms",
    description: "Get all forms for the location",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_form_submissions",
    description: "Get submissions for a specific form",
    input_schema: {
      type: "object",
      properties: {
        formId: { type: "string" }, limit: { type: "number" },
        startAt: { type: "string" }, endAt: { type: "string" }
      },
      required: ["formId"]
    }
  }
];

export const mediaTools = [
  {
    name: "ghl_upload_media",
    description: "Upload a file to GHL media library",
    input_schema: {
      type: "object",
      properties: {
        fileName: { type: "string" },
        fileBase64: { type: "string" }
      },
      required: ["fileName", "fileBase64"]
    }
  },
  {
    name: "ghl_list_media",
    description: "List files in media library",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } }
    }
  }
];

export const emailTools = [
  {
    name: "ghl_get_email_campaigns",
    description: "Get all email campaigns",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string" }
      }
    }
  },
  {
    name: "ghl_list_email_templates",
    description: "List email templates",
    input_schema: { type: "object", properties: {}, required: [] }
  }
];

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

export async function executeGHLTool(toolName, parameters) {
  const startTime = Date.now();
  logger.info(`Executing GHL tool: ${toolName}`, parameters);
  const locationId = process.env.GHL_LOCATION_ID;

  try {
    let result;

    // ── CONTACTS ──────────────────────────────────────────────
    if (toolName === 'ghl_search_contacts') {
      // POST /contacts/search — requires page + pageLimit
      result = await callGHL('/contacts/search', 'POST', {
        locationId, page: parameters.page || 1,
        pageLimit: parameters.limit || 20, query: parameters.query
      }, null);

    } else if (toolName === 'ghl_get_contact') {
      result = await callGHL(`/contacts/${parameters.contactId}`);

    } else if (toolName === 'ghl_create_contact') {
      result = await callGHL('/contacts/', 'POST', { locationId, ...parameters });

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
      const { contactId, ...noteData } = parameters;
      result = await callGHL(`/contacts/${contactId}/notes`, 'POST', noteData);

    } else if (toolName === 'ghl_create_contact_task') {
      const { contactId, ...taskData } = parameters;
      result = await callGHL(`/contacts/${contactId}/tasks`, 'POST', taskData);

    // ── CONVERSATIONS ─────────────────────────────────────────
    } else if (toolName === 'ghl_get_conversations') {
      // GET /conversations/search?locationId=&contactId=
      result = await callGHL('/conversations/search', 'GET', null, {
        locationId, contactId: parameters.contactId, limit: parameters.limit || 20
      });

    } else if (toolName === 'ghl_send_message') {
      // POST /conversations/messages
      result = await callGHL('/conversations/messages', 'POST', parameters);

    } else if (toolName === 'ghl_search_conversations') {
      // GET /conversations/search?locationId=
      result = await callGHL('/conversations/search', 'GET', null, { locationId, ...parameters });

    // ── CALENDARS ─────────────────────────────────────────────
    } else if (toolName === 'ghl_list_calendars') {
      result = await callGHL('/calendars/');

    } else if (toolName === 'ghl_get_calendar_slots') {
      result = await callGHL(`/calendars/${parameters.calendarId}/free-slots`, 'GET', null, {
        startDate: parameters.startDate, endDate: parameters.endDate
      });

    } else if (toolName === 'ghl_create_appointment') {
      // POST /calendars/events/appointments
      result = await callGHL('/calendars/events/appointments', 'POST', { locationId, ...parameters });

    } else if (toolName === 'ghl_get_appointments') {
      // GET /calendars/events?locationId=&calendarId=&startTime=&endTime=
      result = await callGHL('/calendars/events', 'GET', null, {
        locationId, calendarId: parameters.calendarId,
        startTime: parameters.startDate, endTime: parameters.endDate
      });

    // ── OPPORTUNITIES ─────────────────────────────────────────
    } else if (toolName === 'ghl_search_opportunities') {
      // POST /opportunities/search — uses location_id not locationId
      result = await callGHL('/opportunities/search', 'POST', {
        location_id: locationId, page: 1, pageLimit: parameters.limit || 20,
        ...(parameters.query && { query: parameters.query }),
        ...(parameters.pipelineId && { pipelineId: parameters.pipelineId }),
        ...(parameters.status && { status: parameters.status })
      }, null);

    } else if (toolName === 'ghl_get_opportunity') {
      result = await callGHL(`/opportunities/${parameters.opportunityId}`);

    } else if (toolName === 'ghl_create_opportunity') {
      result = await callGHL('/opportunities/', 'POST', { locationId, ...parameters });

    } else if (toolName === 'ghl_update_opportunity') {
      const { opportunityId, ...updateData } = parameters;
      result = await callGHL(`/opportunities/${opportunityId}`, 'PUT', updateData);

    } else if (toolName === 'ghl_get_pipelines') {
      result = await callGHL('/opportunities/pipelines');

    // ── WORKFLOWS ─────────────────────────────────────────────
    } else if (toolName === 'ghl_list_workflows') {
      result = await callGHL('/workflows/');

    } else if (toolName === 'ghl_add_contact_to_workflow') {
      // POST /contacts/{contactId}/workflow/{workflowId}
      result = await callGHL(`/contacts/${parameters.contactId}/workflow/${parameters.workflowId}`, 'POST', {});

    } else if (toolName === 'ghl_remove_contact_from_workflow') {
      // DELETE /contacts/{contactId}/workflow/{workflowId}
      result = await callGHL(`/contacts/${parameters.contactId}/workflow/${parameters.workflowId}`, 'DELETE');

    // ── FORMS ─────────────────────────────────────────────────
    } else if (toolName === 'ghl_get_forms') {
      result = await callGHL('/forms/');

    } else if (toolName === 'ghl_get_form_submissions') {
      // GET /forms/submissions?locationId=&formId=
      result = await callGHL('/forms/submissions', 'GET', null, { formId: parameters.formId, ...parameters });

    // ── MEDIA ─────────────────────────────────────────────────
    } else if (toolName === 'ghl_upload_media') {
      result = await callGHL('/medias/upload-file', 'POST', parameters);

    } else if (toolName === 'ghl_list_media') {
      result = await callGHL('/medias/files');

    // ── EMAIL ─────────────────────────────────────────────────
    } else if (toolName === 'ghl_get_email_campaigns') {
      result = await callGHL('/campaigns/', 'GET', null, parameters);

    } else if (toolName === 'ghl_list_email_templates') {
      result = await callGHL('/emails/builder');

    } else {
      throw new Error(`Unknown GHL tool: ${toolName}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`GHL tool completed: ${toolName} (${duration}ms)`);
    return { success: true, data: result, executionTime: duration };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`GHL tool failed: ${toolName} (${duration}ms)`, error.message);
    return { success: false, error: error.message, executionTime: duration };
  }
}
