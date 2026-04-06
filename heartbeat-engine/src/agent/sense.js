// BLOOM Heartbeat Engine - Environment Sensing
// Checks GHL, email, tasks, calendar for agent decision-making

import { createLogger } from '../logging/logger.js';
import { ghlClient } from '../integrations/ghl.js';
import { emailClient } from '../integrations/email.js';

const logger = createLogger('sense');

export async function sense(agentConfig, trigger = {}) {
  logger.info('🔍 Sensing environment...', {
    agent: agentConfig.agentId,
    trigger: trigger.type || 'scheduled'
  });

  const environment = {
    timestamp: new Date().toISOString(),
    trigger,
    ghl: {},
    email: {},
    tasks: {},
    calendar: {},
    inboundReplies: [],
    bloomieChats: { pending: 0, chats: [] },
    alerts: []
  };

  try {
    // Check GoHighLevel for client activity
    environment.ghl = await senseGHL(agentConfig);

    // Check for inbound replies to messages Sarah sent
    environment.inboundReplies = await senseInboundReplies(agentConfig);

    // Check email for new messages
    environment.email = await senseEmail(agentConfig);

    // Check pending tasks
    environment.tasks = await senseTasks(agentConfig);

    // Check calendar for upcoming events
    environment.calendar = await senseCalendar(agentConfig);

    // Check Bloomie chats for unanswered visitor messages
    environment.bloomieChats = await senseBloomieChats();

    // Generate environment alerts
    environment.alerts = generateEnvironmentAlerts(environment);

    logger.info('Environment sensing complete', {
      ghlItems: Object.keys(environment.ghl).length,
      emailItems: environment.email.unread?.length || 0,
      taskItems: environment.tasks.pending?.length || 0,
      calendarItems: environment.calendar.upcoming?.length || 0,
      inboundReplies: environment.inboundReplies.length,
      bloomieChats: environment.bloomieChats?.pending || 0,
      alerts: environment.alerts.length
    });

    return environment;

  } catch (error) {
    logger.error('Environment sensing failed:', error);
    environment.alerts.push({
      type: 'SYSTEM_ERROR',
      message: `Failed to sense environment: ${error.message}`,
      urgency: 'HIGH'
    });
    return environment;
  }
}

// Sense GoHighLevel activity
async function senseGHL(agentConfig) {
  try {
    logger.info('Checking GoHighLevel...');

    const ghl = {
      newInquiries: [],
      overdueFollowups: [],
      upcomingAppointments: [],
      recentContacts: [],
      pipelineUpdates: []
    };

    // Check for new contacts in last hour
    const recentContacts = await ghlClient.getRecentContacts(1); // last 1 hour
    ghl.recentContacts = recentContacts;

    // Find new enrollment inquiries
    ghl.newInquiries = recentContacts.filter(contact =>
      contact.tags?.includes('enrollment_inquiry') ||
      contact.source?.includes('enrollment') ||
      contact.customFields?.inquiry_type === 'enrollment'
    );

    // Check for overdue follow-ups
    const overdueFollowups = await ghlClient.getOverdueFollowups();
    ghl.overdueFollowups = overdueFollowups;

    // Check upcoming appointments (next 2 hours)
    const upcomingAppointments = await ghlClient.getUpcomingAppointments(2);
    ghl.upcomingAppointments = upcomingAppointments;

    // Check recent pipeline movements
    const pipelineUpdates = await ghlClient.getRecentPipelineUpdates(24); // last 24 hours
    ghl.pipelineUpdates = pipelineUpdates;

    logger.info('GHL sensing complete', {
      newInquiries: ghl.newInquiries.length,
      overdueFollowups: ghl.overdueFollowups.length,
      upcomingAppointments: ghl.upcomingAppointments.length,
      pipelineUpdates: ghl.pipelineUpdates.length
    });

    return ghl;

  } catch (error) {
    logger.error('GHL sensing failed:', error);
    return {
      error: error.message,
      newInquiries: [],
      overdueFollowups: [],
      upcomingAppointments: [],
      recentContacts: [],
      pipelineUpdates: []
    };
  }
}

// Sense email activity
async function senseEmail(agentConfig) {
  try {
    logger.info('Checking email...');

    const email = {
      unread: [],
      urgent: [],
      fromClients: [],
      spam: []
    };

    // This is a placeholder - actual email integration would depend on email provider
    // For now, we'll simulate or integrate with GHL's email system

    // In a real implementation, this would check:
    // - Unread emails in the last hour
    // - Emails from known clients
    // - Emails with urgent keywords
    // - Bounce notifications

    logger.info('Email sensing complete (placeholder)', {
      unread: email.unread.length,
      urgent: email.urgent.length,
      fromClients: email.fromClients.length
    });

    return email;

  } catch (error) {
    logger.error('Email sensing failed:', error);
    return {
      error: error.message,
      unread: [],
      urgent: [],
      fromClients: [],
      spam: []
    };
  }
}

// Sense pending tasks
async function senseTasks(agentConfig) {
  try {
    logger.info('Checking tasks...');

    const tasks = {
      pending: [],
      overdue: [],
      assigned: [],
      completed: []
    };

    // Check GHL tasks assigned to agent or general queue
    const ghlTasks = await ghlClient.getTasks();

    tasks.pending = ghlTasks.filter(task =>
      task.status === 'pending' || task.status === 'open'
    );

    tasks.overdue = ghlTasks.filter(task =>
      task.dueDate && new Date(task.dueDate) < new Date()
    );

    tasks.assigned = ghlTasks.filter(task =>
      task.assignedTo?.includes('Sarah') ||
      task.assignedTo?.includes('sarah') ||
      task.assignedTo?.includes(agentConfig.name.toLowerCase())
    );

    // Check recently completed tasks (for context)
    tasks.completed = ghlTasks.filter(task =>
      task.status === 'completed' &&
      task.completedDate &&
      new Date(task.completedDate) > new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24 hours
    );

    logger.info('Task sensing complete', {
      pending: tasks.pending.length,
      overdue: tasks.overdue.length,
      assigned: tasks.assigned.length,
      completed: tasks.completed.length
    });

    return tasks;

  } catch (error) {
    logger.error('Task sensing failed:', error);
    return {
      error: error.message,
      pending: [],
      overdue: [],
      assigned: [],
      completed: []
    };
  }
}

// Sense calendar activity
async function senseCalendar(agentConfig) {
  try {
    logger.info('Checking calendar...');

    const calendar = {
      upcoming: [],
      today: [],
      needsPrep: [],
      conflicts: []
    };

    // Check GHL calendar/appointments
    const appointments = await ghlClient.getAppointments({
      startDate: new Date(),
      endDate: new Date(Date.now() + 48 * 60 * 60 * 1000) // next 48 hours
    });

    calendar.upcoming = appointments;

    // Filter for today's appointments
    const today = new Date().toDateString();
    calendar.today = appointments.filter(apt =>
      new Date(apt.startDate).toDateString() === today
    );

    // Find appointments that need preparation (starting in next 2 hours)
    const prepWindow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    calendar.needsPrep = appointments.filter(apt =>
      new Date(apt.startDate) <= prepWindow &&
      new Date(apt.startDate) > new Date() &&
      !apt.prepCompleted
    );

    // Check for scheduling conflicts
    calendar.conflicts = findCalendarConflicts(appointments);

    logger.info('Calendar sensing complete', {
      upcoming: calendar.upcoming.length,
      today: calendar.today.length,
      needsPrep: calendar.needsPrep.length,
      conflicts: calendar.conflicts.length
    });

    return calendar;

  } catch (error) {
    logger.error('Calendar sensing failed:', error);
    return {
      error: error.message,
      upcoming: [],
      today: [],
      needsPrep: [],
      conflicts: []
    };
  }
}

// Generate environment-based alerts
function generateEnvironmentAlerts(environment) {
  const alerts = [];

  // High-priority inquiries
  if (environment.ghl.newInquiries?.length > 0) {
    alerts.push({
      type: 'NEW_INQUIRIES',
      message: `${environment.ghl.newInquiries.length} new enrollment inquiries`,
      urgency: 'MEDIUM',
      count: environment.ghl.newInquiries.length
    });
  }

  // Overdue follow-ups
  if (environment.ghl.overdueFollowups?.length > 0) {
    alerts.push({
      type: 'OVERDUE_FOLLOWUPS',
      message: `${environment.ghl.overdueFollowups.length} overdue follow-ups`,
      urgency: 'HIGH',
      count: environment.ghl.overdueFollowups.length
    });
  }

  // Upcoming appointments needing prep
  if (environment.calendar.needsPrep?.length > 0) {
    alerts.push({
      type: 'APPOINTMENTS_NEED_PREP',
      message: `${environment.calendar.needsPrep.length} appointments need preparation`,
      urgency: 'MEDIUM',
      count: environment.calendar.needsPrep.length
    });
  }

  // Calendar conflicts
  if (environment.calendar.conflicts?.length > 0) {
    alerts.push({
      type: 'CALENDAR_CONFLICTS',
      message: `${environment.calendar.conflicts.length} scheduling conflicts detected`,
      urgency: 'HIGH',
      count: environment.calendar.conflicts.length
    });
  }

  // Inbound replies — contacts who replied to Sarah's outbound messages
  if (environment.inboundReplies?.length > 0) {
    alerts.push({
      type: 'INBOUND_REPLIES',
      message: `${environment.inboundReplies.length} contact(s) replied to your messages`,
      urgency: 'HIGH',
      count: environment.inboundReplies.length,
      replies: environment.inboundReplies
    });
  }

  // Unanswered Bloomie chats — visitors waiting for a response
  if (environment.bloomieChats?.pending > 0) {
    alerts.push({
      type: 'BLOOMIE_CHATS_PENDING',
      message: `${environment.bloomieChats.pending} Bloomie chat(s) with unanswered visitor messages`,
      urgency: 'MEDIUM',
      count: environment.bloomieChats.pending,
      chats: environment.bloomieChats.chats
    });
  }

  // System errors
  const hasErrors = [
    environment.ghl.error,
    environment.email.error,
    environment.tasks.error,
    environment.calendar.error
  ].filter(Boolean);

  if (hasErrors.length > 0) {
    alerts.push({
      type: 'SYSTEM_ERRORS',
      message: `${hasErrors.length} system sensing errors`,
      urgency: 'HIGH',
      errors: hasErrors
    });
  }

  return alerts;
}

// Sense inbound replies — contacts who replied to messages Sarah sent
async function senseInboundReplies(agentConfig) {
  try {
    logger.info('Checking for inbound replies...');
    const replies = await ghlClient.getUnreadInboundMessages();
    logger.info('Inbound reply check complete', { count: replies.length });
    return replies;
  } catch (error) {
    logger.error('Inbound reply sensing failed:', error.message);
    return [];
  }
}

// Sense Bloomie chats — check for recent visitor conversations that may need attention
async function senseBloomieChats() {
  try {
    logger.info('Checking Bloomie chats for unanswered messages...');
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_KEY;
    if (!sbUrl || !sbKey) return { pending: 0, chats: [] };

    // Get chats updated in the last 30 minutes that might need follow-up
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const res = await fetch(
      `${sbUrl}/rest/v1/bloomie_chats?updated_at=gte.${since}&order=updated_at.desc&limit=20&select=session_id,mode,employee,messages,visitor_name,visitor_email,updated_at`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    );
    if (!res.ok) { logger.warn('Bloomie chat check failed:', res.status); return { pending: 0, chats: [] }; }

    const chats = await res.json();
    // Find chats where the last message is from a user (unanswered)
    const pending = chats.filter(ch => {
      const msgs = typeof ch.messages === 'string' ? JSON.parse(ch.messages) : (ch.messages || []);
      if (msgs.length === 0) return false;
      return msgs[msgs.length - 1].role === 'user';
    });

    logger.info('Bloomie chat check complete', { total: chats.length, pending: pending.length });
    return { pending: pending.length, chats: pending };
  } catch (error) {
    logger.error('Bloomie chat sensing failed:', error.message);
    return { pending: 0, chats: [] };
  }
}

// Helper to find calendar conflicts
function findCalendarConflicts(appointments) {
  const conflicts = [];

  for (let i = 0; i < appointments.length; i++) {
    for (let j = i + 1; j < appointments.length; j++) {
      const apt1 = appointments[i];
      const apt2 = appointments[j];

      const start1 = new Date(apt1.startDate);
      const end1 = new Date(apt1.endDate);
      const start2 = new Date(apt2.startDate);
      const end2 = new Date(apt2.endDate);

      // Check for overlap
      if (start1 < end2 && start2 < end1) {
        conflicts.push({
          appointment1: apt1,
          appointment2: apt2,
          overlapStart: new Date(Math.max(start1.getTime(), start2.getTime())),
          overlapEnd: new Date(Math.min(end1.getTime(), end2.getTime()))
        });
      }
    }
  }

  return conflicts;
}