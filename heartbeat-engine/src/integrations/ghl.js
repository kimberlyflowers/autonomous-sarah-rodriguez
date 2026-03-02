// BLOOM Heartbeat Engine - GoHighLevel Integration
// Handles all GHL API interactions for BLOOM agents

import axios from 'axios';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('ghl');

class GHLClient {
  constructor() {
    // DEBUG: Check GHL environment variables
    console.log('DEBUG GHL: All env vars containing GHL:', Object.keys(process.env).filter(key => key.includes('GHL')));
    console.log('DEBUG GHL: GHL_API_KEY exists:', 'GHL_API_KEY' in process.env);
    console.log('DEBUG GHL: GHL_API_KEY length:', process.env.GHL_API_KEY?.length || 0);
    console.log('DEBUG GHL: GHL_LOCATION_ID exists:', 'GHL_LOCATION_ID' in process.env);
    console.log('DEBUG GHL: GHL_LOCATION_ID value:', process.env.GHL_LOCATION_ID || 'UNDEFINED');

    this.apiKey = process.env.GHL_API_KEY;
    this.locationId = process.env.GHL_LOCATION_ID;
    this.baseUrl = 'https://services.leadconnectorhq.com';

    if (!this.apiKey) {
      logger.warn('GHL_API_KEY not configured - GHL integration will be limited');
    }

    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    // Add response/error interceptors
    this.client.interceptors.response.use(
      response => {
        logger.debug('GHL API Success', {
          method: response.config.method,
          url: response.config.url,
          status: response.status
        });
        return response;
      },
      error => {
        logger.error('GHL API Error', {
          method: error.config?.method,
          url: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message
        });
        throw error;
      }
    );
  }

  // Test API connection
  async testConnection() {
    try {
      const response = await this.client.get(`/locations/${this.locationId}`);
      logger.info('✅ GHL connection test successful');
      return true;
    } catch (error) {
      logger.error('❌ GHL connection test failed:', error.message);
      return false;
    }
  }

  // Get recent contacts (within specified hours)
  async getRecentContacts(hours = 1) {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const response = await this.client.get(`/contacts/`, {
        params: {
          locationId: this.locationId,
          startAfterId: since,
          limit: 100
        }
      });

      const contacts = response.data.contacts || [];

      logger.info(`Retrieved ${contacts.length} recent contacts`, {
        hours,
        since
      });

      return contacts.map(this.formatContact);

    } catch (error) {
      logger.error('Failed to get recent contacts:', error.message);
      return [];
    }
  }

  // Get specific contact by ID
  async getContact(contactId) {
    try {
      const response = await this.client.get(`/contacts/${contactId}`);
      return this.formatContact(response.data.contact);
    } catch (error) {
      logger.error(`Failed to get contact ${contactId}:`, error.message);
      return null;
    }
  }

  // Update contact information
  async updateContact(contactId, fields) {
    try {
      const response = await this.client.put(`/contacts/${contactId}`, fields);

      logger.info('Contact updated successfully', {
        contactId,
        fields: Object.keys(fields)
      });

      return this.formatContact(response.data.contact);

    } catch (error) {
      logger.error(`Failed to update contact ${contactId}:`, error.message);
      throw error;
    }
  }

  // Get overdue follow-ups
  async getOverdueFollowups() {
    try {
      // Get tasks that are overdue
      const tasks = await this.getTasks();
      const now = new Date();

      const overdueTasks = tasks.filter(task => {
        return task.dueDate &&
               new Date(task.dueDate) < now &&
               !task.completed &&
               (task.title?.toLowerCase().includes('follow') ||
                task.body?.toLowerCase().includes('follow'));
      });

      logger.info(`Found ${overdueTasks.length} overdue follow-ups`);

      return overdueTasks;

    } catch (error) {
      logger.error('Failed to get overdue follow-ups:', error.message);
      return [];
    }
  }

  // Get upcoming appointments
  async getUpcomingAppointments(hours = 24) {
    try {
      const startTime = new Date();
      const endTime = new Date(Date.now() + hours * 60 * 60 * 1000);

      const response = await this.client.get(`/calendars/events`, {
        params: {
          locationId: this.locationId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        }
      });

      const appointments = response.data.events || [];

      logger.info(`Retrieved ${appointments.length} upcoming appointments`, {
        hours,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      });

      return appointments.map(this.formatAppointment);

    } catch (error) {
      logger.error('Failed to get upcoming appointments:', error.message);
      return [];
    }
  }

  // Get recent pipeline updates
  async getRecentPipelineUpdates(hours = 24) {
    try {
      // This would typically involve checking opportunity stage changes
      // For now, we'll return a placeholder
      logger.info('Pipeline updates check (placeholder)', { hours });
      return [];

    } catch (error) {
      logger.error('Failed to get pipeline updates:', error.message);
      return [];
    }
  }

  // Send email to contact
  async sendEmail(emailData) {
    try {
      const {
        contactId,
        templateId,
        personalization = {},
        fromName,
        subject
      } = emailData;

      const emailPayload = {
        type: 'Email',
        contactId,
        templateId,
        subject,
        emailFrom: fromName || 'Sarah Rodriguez',
        attachments: [],
        altText: '',
        ...personalization
      };

      const response = await this.client.post('/conversations/messages', emailPayload);

      logger.info('Email sent successfully', {
        contactId,
        templateId,
        messageId: response.data.messageId
      });

      return {
        id: response.data.messageId,
        contactId,
        subject,
        sent: true
      };

    } catch (error) {
      logger.error('Failed to send email:', error.message);
      throw error;
    }
  }

  // Send SMS to contact
  async sendSMS(smsData) {
    try {
      const { contactId, phone, message, fromName } = smsData;

      const smsPayload = {
        type: 'SMS',
        contactId: contactId || undefined,
        phone: phone || undefined,
        message,
        subject: fromName || 'BLOOM'
      };

      const response = await this.client.post('/conversations/messages', smsPayload);

      logger.info('SMS sent successfully', {
        contactId,
        phone,
        messageId: response.data.messageId
      });

      return {
        id: response.data.messageId,
        contactId,
        phone,
        sent: true
      };

    } catch (error) {
      logger.error('Failed to send SMS:', error.message);
      throw error;
    }
  }

  // Get tasks
  async getTasks(filters = {}) {
    try {
      const params = {
        locationId: this.locationId,
        limit: 100,
        ...filters
      };

      const response = await this.client.get('/tasks/', { params });
      const tasks = response.data.tasks || [];

      logger.info(`Retrieved ${tasks.length} tasks`);

      return tasks.map(this.formatTask);

    } catch (error) {
      logger.error('Failed to get tasks:', error.message);
      return [];
    }
  }

  // Create task
  async createTask(taskData) {
    try {
      const {
        title,
        body,
        contactId,
        dueDate,
        assignedTo,
        priority = 'MEDIUM',
        completed = false
      } = taskData;

      const taskPayload = {
        title,
        body,
        contactId,
        dueDate,
        assignedTo,
        completed
      };

      const response = await this.client.post('/tasks/', taskPayload);

      logger.info('Task created successfully', {
        taskId: response.data.id,
        title,
        assignedTo
      });

      return {
        id: response.data.id,
        title,
        created: true
      };

    } catch (error) {
      logger.error('Failed to create task:', error.message);
      throw error;
    }
  }

  // Update task
  async updateTask(taskId, updates) {
    try {
      const response = await this.client.put(`/tasks/${taskId}`, updates);

      logger.info('Task updated successfully', {
        taskId,
        updates: Object.keys(updates)
      });

      return this.formatTask(response.data.task);

    } catch (error) {
      logger.error(`Failed to update task ${taskId}:`, error.message);
      throw error;
    }
  }

  // Add note to contact
  async addNote(noteData) {
    try {
      const { contactId, body, userId } = noteData;

      const notePayload = {
        body,
        userId: userId || 'auto'
      };

      const response = await this.client.post(`/contacts/${contactId}/notes`, notePayload);

      logger.info('Note added successfully', {
        contactId,
        noteId: response.data.id
      });

      return {
        id: response.data.id,
        contactId,
        added: true
      };

    } catch (error) {
      logger.error('Failed to add note:', error.message);
      throw error;
    }
  }

  // Get appointments
  async getAppointments(filters = {}) {
    try {
      const params = {
        locationId: this.locationId,
        ...filters
      };

      const response = await this.client.get('/calendars/events', { params });
      const appointments = response.data.events || [];

      return appointments.map(this.formatAppointment);

    } catch (error) {
      logger.error('Failed to get appointments:', error.message);
      return [];
    }
  }

  // Get specific appointment
  async getAppointment(appointmentId) {
    try {
      const response = await this.client.get(`/calendars/events/${appointmentId}`);
      return this.formatAppointment(response.data.event);
    } catch (error) {
      logger.error(`Failed to get appointment ${appointmentId}:`, error.message);
      return null;
    }
  }

  // Create appointment
  async createAppointment(appointmentData) {
    try {
      const response = await this.client.post('/calendars/events', appointmentData);

      logger.info('Appointment created successfully', {
        appointmentId: response.data.id,
        title: appointmentData.title
      });

      return {
        id: response.data.id,
        created: true
      };

    } catch (error) {
      logger.error('Failed to create appointment:', error.message);
      throw error;
    }
  }

  // Update contact pipeline
  async updateContactPipeline(pipelineData) {
    try {
      const { contactId, pipelineId, stageId } = pipelineData;

      const response = await this.client.put(`/contacts/${contactId}`, {
        pipeline: {
          id: pipelineId,
          stage: stageId
        }
      });

      logger.info('Contact pipeline updated successfully', {
        contactId,
        pipelineId,
        stageId
      });

      return {
        contactId,
        pipelineId,
        stageId,
        updated: true
      };

    } catch (error) {
      logger.error('Failed to update contact pipeline:', error.message);
      throw error;
    }
  }

  // Format contact data
  formatContact(contact) {
    if (!contact) return null;

    return {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      email: contact.email,
      phone: contact.phone,
      source: contact.source,
      tags: contact.tags || [],
      customFields: contact.customField || {},
      createdAt: contact.dateAdded,
      updatedAt: contact.dateUpdated
    };
  }

  // Format task data
  formatTask(task) {
    if (!task) return null;

    return {
      id: task.id,
      title: task.title,
      body: task.body,
      contactId: task.contactId,
      dueDate: task.dueDate,
      assignedTo: task.assignedTo,
      completed: task.completed,
      completedDate: task.completedDate,
      priority: task.priority,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
  }

  // Format appointment data
  formatAppointment(appointment) {
    if (!appointment) return null;

    return {
      id: appointment.id,
      title: appointment.title,
      startDate: appointment.startTime,
      endDate: appointment.endTime,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      contactId: appointment.contactId,
      address: appointment.address,
      assignedUserId: appointment.assignedUserId,
      calendarId: appointment.calendarId,
      status: appointment.appointmentStatus,
      createdAt: appointment.dateAdded
    };
  }
}

// Create and export singleton instance
export const ghlClient = new GHLClient();