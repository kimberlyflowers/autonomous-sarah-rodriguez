// BLOOM Heartbeat Engine - Action Execution
// Executes approved actions from agent decisions

import { createLogger } from '../logging/logger.js';
import { ghlClient } from '../integrations/ghl.js';
import { emailClient } from '../integrations/email.js';

const logger = createLogger('act');

export async function act(decision, agentConfig) {
  const startTime = Date.now();

  logger.info(`🚀 Executing action: ${decision.action_type}`, {
    description: decision.description,
    target: decision.target_system,
    confidence: decision.confidence
  });

  try {
    let result = {};

    switch (decision.action_type) {
      case 'send_followup_email':
        result = await executeFollowupEmail(decision, agentConfig);
        break;

      case 'create_task':
        result = await executeCreateTask(decision, agentConfig);
        break;

      case 'update_contact':
        result = await executeUpdateContact(decision, agentConfig);
        break;

      case 'schedule_reminder':
        result = await executeScheduleReminder(decision, agentConfig);
        break;

      case 'send_appointment_reminder':
        result = await executeSendAppointmentReminder(decision, agentConfig);
        break;

      case 'update_pipeline':
        result = await executeUpdatePipeline(decision, agentConfig);
        break;

      case 'log_interaction':
        result = await executeLogInteraction(decision, agentConfig);
        break;

      case 'send_notification':
        result = await executeSendNotification(decision, agentConfig);
        break;

      case 'create_appointment':
        result = await executeCreateAppointment(decision, agentConfig);
        break;

      case 'update_task_status':
        result = await executeUpdateTaskStatus(decision, agentConfig);
        break;

      default:
        throw new Error(`Unknown action type: ${decision.action_type}`);
    }

    const duration = Date.now() - startTime;
    result.duration = duration;
    result.success = result.success !== false; // Default to true unless explicitly false

    logger.info(`✅ Action completed: ${decision.action_type}`, {
      success: result.success,
      duration: `${duration}ms`
    });

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(`❌ Action failed: ${decision.action_type}`, error, {
      duration: `${duration}ms`,
      input: decision.input_data
    });

    return {
      success: false,
      error: error.message,
      duration,
      action_type: decision.action_type
    };
  }
}

// Execute follow-up email
async function executeFollowupEmail(decision, agentConfig) {
  const { contact_id, template, personalization } = decision.input_data;

  logger.info('Sending follow-up email...', {
    contactId: contact_id,
    template
  });

  try {
    // Get contact details
    const contact = await ghlClient.getContact(contact_id);
    if (!contact) {
      throw new Error(`Contact not found: ${contact_id}`);
    }

    // Send email via GHL
    const emailResult = await ghlClient.sendEmail({
      contactId: contact_id,
      templateId: template,
      personalization: personalization || {},
      fromName: agentConfig.name,
      subject: generateSubject(template, contact, personalization)
    });

    // Log the interaction in GHL
    await ghlClient.addNote({
      contactId: contact_id,
      body: `Follow-up email sent by ${agentConfig.name}\nTemplate: ${template}\nPersonalization: ${personalization}`,
      userId: agentConfig.ghlUserId || 'auto'
    });

    return {
      success: true,
      emailId: emailResult.id,
      contact: contact.name,
      subject: emailResult.subject
    };

  } catch (error) {
    throw new Error(`Failed to send follow-up email: ${error.message}`);
  }
}

// Execute task creation
async function executeCreateTask(decision, agentConfig) {
  const { title, description, due_date, assigned_to, contact_id } = decision.input_data;

  logger.info('Creating task...', {
    title,
    assignedTo: assigned_to
  });

  try {
    const taskResult = await ghlClient.createTask({
      title,
      body: description,
      dueDate: due_date,
      assignedTo: assigned_to || agentConfig.ghlUserId,
      contactId: contact_id,
      completed: false,
      priority: decision.urgency || 'MEDIUM'
    });

    return {
      success: true,
      taskId: taskResult.id,
      title,
      dueDate: due_date
    };

  } catch (error) {
    throw new Error(`Failed to create task: ${error.message}`);
  }
}

// Execute contact update
async function executeUpdateContact(decision, agentConfig) {
  const { contact_id, fields } = decision.input_data;

  logger.info('Updating contact...', {
    contactId: contact_id,
    fields: Object.keys(fields)
  });

  try {
    const updateResult = await ghlClient.updateContact(contact_id, fields);

    // Log the update
    const fieldsList = Object.entries(fields)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    await ghlClient.addNote({
      contactId: contact_id,
      body: `Contact updated by ${agentConfig.name}\nFields updated: ${fieldsList}`,
      userId: agentConfig.ghlUserId || 'auto'
    });

    return {
      success: true,
      contactId: contact_id,
      updatedFields: Object.keys(fields)
    };

  } catch (error) {
    throw new Error(`Failed to update contact: ${error.message}`);
  }
}

// Execute reminder scheduling
async function executeScheduleReminder(decision, agentConfig) {
  const { contact_id, reminder_type, schedule_time, message } = decision.input_data;

  logger.info('Scheduling reminder...', {
    contactId: contact_id,
    type: reminder_type,
    scheduleTime: schedule_time
  });

  try {
    // This could be implemented as a GHL workflow trigger or task
    const reminderResult = await ghlClient.createTask({
      title: `${reminder_type} - Reminder`,
      body: message,
      dueDate: schedule_time,
      contactId: contact_id,
      assignedTo: agentConfig.ghlUserId,
      completed: false
    });

    return {
      success: true,
      reminderId: reminderResult.id,
      scheduleTime: schedule_time,
      type: reminder_type
    };

  } catch (error) {
    throw new Error(`Failed to schedule reminder: ${error.message}`);
  }
}

// Execute appointment reminder
async function executeSendAppointmentReminder(decision, agentConfig) {
  const { contact_id, appointment_id, reminder_type } = decision.input_data;

  logger.info('Sending appointment reminder...', {
    contactId: contact_id,
    appointmentId: appointment_id,
    type: reminder_type
  });

  try {
    // Get appointment details
    const appointment = await ghlClient.getAppointment(appointment_id);
    if (!appointment) {
      throw new Error(`Appointment not found: ${appointment_id}`);
    }

    // Get contact details
    const contact = await ghlClient.getContact(contact_id);

    // Send reminder via GHL (SMS or email based on preference)
    let reminderResult;
    if (reminder_type === 'sms' && contact.phone) {
      reminderResult = await ghlClient.sendSMS({
        contactId: contact_id,
        message: generateAppointmentReminderMessage(appointment, contact)
      });
    } else {
      reminderResult = await ghlClient.sendEmail({
        contactId: contact_id,
        templateId: 'appointment_reminder',
        personalization: {
          appointment_date: appointment.startTime,
          appointment_title: appointment.title,
          appointment_location: appointment.address
        }
      });
    }

    // Log the reminder
    await ghlClient.addNote({
      contactId: contact_id,
      body: `Appointment reminder sent by ${agentConfig.name}\nType: ${reminder_type}\nAppointment: ${appointment.title} on ${appointment.startTime}`,
      userId: agentConfig.ghlUserId || 'auto'
    });

    return {
      success: true,
      reminderId: reminderResult.id,
      type: reminder_type,
      appointmentDate: appointment.startTime
    };

  } catch (error) {
    throw new Error(`Failed to send appointment reminder: ${error.message}`);
  }
}

// Execute pipeline update
async function executeUpdatePipeline(decision, agentConfig) {
  const { contact_id, stage_id, pipeline_id } = decision.input_data;

  logger.info('Updating pipeline stage...', {
    contactId: contact_id,
    stageId: stage_id,
    pipelineId: pipeline_id
  });

  try {
    const updateResult = await ghlClient.updateContactPipeline({
      contactId: contact_id,
      pipelineId: pipeline_id,
      stageId: stage_id
    });

    // Log the pipeline movement
    await ghlClient.addNote({
      contactId: contact_id,
      body: `Pipeline updated by ${agentConfig.name}\nMoved to stage: ${stage_id}`,
      userId: agentConfig.ghlUserId || 'auto'
    });

    return {
      success: true,
      contactId: contact_id,
      newStage: stage_id,
      pipeline: pipeline_id
    };

  } catch (error) {
    throw new Error(`Failed to update pipeline: ${error.message}`);
  }
}

// Execute interaction logging
async function executeLogInteraction(decision, agentConfig) {
  const { contact_id, interaction_type, details } = decision.input_data;

  if (!contact_id || contact_id === 'undefined') {
    logger.warn('log_interaction skipped: contact_id is missing', { interaction_type });
    return { success: false, skipped: true, reason: 'contact_id missing' };
  }

  logger.info('Logging interaction...', {
    contactId: contact_id,
    type: interaction_type
  });

  try {
    const noteResult = await ghlClient.addNote({
      contactId: contact_id,
      body: `${interaction_type} logged by ${agentConfig.name}\n\nDetails:\n${details}`,
      userId: agentConfig.ghlUserId || 'auto'
    });

    return {
      success: true,
      noteId: noteResult.id,
      interactionType: interaction_type
    };

  } catch (error) {
    throw new Error(`Failed to log interaction: ${error.message}`);
  }
}

// Execute notification sending
async function executeSendNotification(decision, agentConfig) {
  const { recipient, method, message, urgency } = decision.input_data;

  logger.info('Sending notification...', {
    recipient,
    method,
    urgency
  });

  try {
    let notificationResult;

    if (method === 'email') {
      // Send email notification (to human contact)
      notificationResult = await emailClient.sendEmail({
        to: recipient,
        from: agentConfig.notificationEmail || 'notifications@bloomiestaffing.com',
        subject: `Agent Notification - ${urgency}`,
        body: message,
        fromName: agentConfig.name
      });
    } else if (method === 'ghl_notification') {
      // Create GHL task for human attention
      notificationResult = await ghlClient.createTask({
        title: `Agent Notification - ${urgency}`,
        body: message,
        assignedTo: recipient,
        priority: urgency,
        completed: false
      });
    }

    return {
      success: true,
      notificationId: notificationResult?.id,
      method,
      recipient
    };

  } catch (error) {
    throw new Error(`Failed to send notification: ${error.message}`);
  }
}

// Execute appointment creation
async function executeCreateAppointment(decision, agentConfig) {
  const { contact_id, title, start_time, duration, location } = decision.input_data;

  logger.info('Creating appointment...', {
    contactId: contact_id,
    title,
    startTime: start_time
  });

  try {
    const appointmentResult = await ghlClient.createAppointment({
      contactId: contact_id,
      calendarId: agentConfig.defaultCalendarId,
      title,
      startTime: start_time,
      endTime: new Date(new Date(start_time).getTime() + duration * 60000).toISOString(),
      address: location,
      assignedUserId: agentConfig.ghlUserId
    });

    // Send confirmation email
    await ghlClient.sendEmail({
      contactId: contact_id,
      templateId: 'appointment_confirmation',
      personalization: {
        appointment_date: start_time,
        appointment_title: title,
        appointment_location: location
      }
    });

    return {
      success: true,
      appointmentId: appointmentResult.id,
      title,
      startTime: start_time
    };

  } catch (error) {
    throw new Error(`Failed to create appointment: ${error.message}`);
  }
}

// Execute task status update
async function executeUpdateTaskStatus(decision, agentConfig) {
  const { task_id, status, notes } = decision.input_data;

  logger.info('Updating task status...', {
    taskId: task_id,
    status
  });

  try {
    const updateResult = await ghlClient.updateTask(task_id, {
      completed: status === 'completed',
      body: notes ? `${notes}\n\n---\nUpdated by ${agentConfig.name}` : undefined
    });

    return {
      success: true,
      taskId: task_id,
      newStatus: status
    };

  } catch (error) {
    throw new Error(`Failed to update task status: ${error.message}`);
  }
}

// Helper functions
function generateSubject(template, contact, personalization) {
  const subjects = {
    enrollment_followup: `Following up on your enrollment inquiry - ${contact.firstName || 'there'}`,
    appointment_reminder: `Reminder: Your appointment is coming up`,
    welcome_sequence: `Welcome to BLOOM Ecosystem, ${contact.firstName || 'there'}!`,
    payment_reminder: `Payment reminder for ${contact.firstName || 'you'}`
  };

  return subjects[template] || `Important update from ${process.env.AGENT_NAME || 'Sarah'}`;
}

function generateAppointmentReminderMessage(appointment, contact) {
  return `Hi ${contact.firstName || 'there'}!

This is a reminder that you have an appointment scheduled:

📅 ${appointment.title}
🕐 ${new Date(appointment.startTime).toLocaleString()}
📍 ${appointment.address || 'TBD'}

If you need to reschedule, please let us know as soon as possible.

- Sarah @ BLOOM Ecosystem`;
}