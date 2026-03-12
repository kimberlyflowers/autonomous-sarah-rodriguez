// BLOOM Heartbeat Engine - Trust Graduation System
// Defines autonomy levels and scope checking for agent actions

import { createLogger } from '../logging/logger.js';

const logger = createLogger('autonomy');

// Trust Graduation Levels - visible to both client and agent
export const autonomyLevels = {
  1: {
    level: 1,
    name: 'Assistant',
    description: 'Handles routine operations autonomously. Escalates edge cases and high-stakes decisions.',
    allowed: [
      'read_ghl',
      'read_email',
      'read_calendar',
      'read_tasks',
      'send_followup_email',
      'send_email',
      'create_task',
      'update_task_status',
      'create_internal_task',
      'update_contact',
      'create_contact',
      'create_appointment',
      'send_reminder',
      'log_interaction',
      'send_notification',
      'schedule_reminder',
      'send_appointment_reminder',
      'add_contact_tag',
      'remove_contact_tag',
      'add_contact_to_workflow',
      'send_sms',
      'generate_reports'
    ],
    blocked: [
      'delete_contact',
      'modify_pricing',
      'access_billing',
      'bulk_operations',
      'delete_data',
      'modify_integrations'
    ],
    escalation: 'non_routine',
    maxDailyActions: 100,
    requiresApproval: false,
    graduationCriteria: {
      cyclesRequired: 100,
      successRateThreshold: 0.92,
      appropriateEscalationRate: 0.75,
      timeInLevel: '14 days'
    }
  },

  2: {
    level: 2,
    name: 'Partner',
    description: 'Full operational autonomy including pipeline and opportunity management. Weekly review.',
    allowed: [
      'read_ghl',
      'read_email',
      'read_calendar',
      'read_tasks',
      'send_email',
      'send_followup_email',
      'send_cold_email',
      'create_task',
      'update_task_status',
      'update_contact',
      'create_contact',
      'create_appointment',
      'send_reminder',
      'generate_reports',
      'update_pipeline',
      'create_opportunity',
      'update_opportunity',
      'log_interaction',
      'send_notification',
      'schedule_reminder',
      'send_appointment_reminder',
      'add_contact_tag',
      'remove_contact_tag',
      'add_contact_to_workflow',
      'remove_contact_from_workflow',
      'send_sms',
      'send_invoice',
      'create_invoice',
      'upload_media',
      'create_note',
      'create_social_post',
      'create_blog_post'
    ],
    blocked: [
      'delete_contact',
      'modify_pricing',
      'access_billing',
      'bulk_operations',
      'delete_data',
      'modify_integrations'
    ],
    escalation: 'high_stakes_only',
    maxDailyActions: 500,
    requiresApproval: false,
    graduationCriteria: {
      cyclesRequired: 300,
      successRateThreshold: 0.90,
      appropriateEscalationRate: 0.70,
      timeInLevel: '30 days'
    }
  },

  3: {
    level: 3,
    name: 'Operator',
    description: 'Reserved for future expansion. Full autonomous operations.',
    allowed: [
      'all_operations'
    ],
    blocked: [
      'delete_data',
      'modify_billing',
      'change_agent_config',
      'modify_integrations'
    ],
    escalation: 'critical_only',
    maxDailyActions: 2000,
    requiresApproval: false,
    graduationCriteria: {
      cyclesRequired: 500,
      successRateThreshold: 0.88,
      appropriateEscalationRate: 0.65,
      timeInLevel: '60 days'
    }
  },

  4: {
    level: 4,
    name: 'Admin',
    description: 'Internal use only. Full system access.',
    allowed: [
      'all_operations'
    ],
    blocked: [],
    escalation: 'critical_only',
    maxDailyActions: 9999,
    requiresApproval: false,
    graduationCriteria: null
  }
};

// Check if an action is within the agent's current autonomy scope
export function isWithinScope(decision, currentLevel) {
  const level = autonomyLevels[currentLevel];

  if (!level) {
    logger.error('Invalid autonomy level:', currentLevel);
    return false;
  }

  // If agent has 'all_operations' permission (level 4)
  if (level.allowed.includes('all_operations')) {
    return !level.blocked.includes(decision.action_type);
  }

  // Check if action is explicitly allowed
  const isAllowed = level.allowed.includes(decision.action_type);
  const isBlocked = level.blocked.includes(decision.action_type);

  if (isBlocked) {
    logger.info('Action blocked by autonomy level', {
      action: decision.action_type,
      level: level.name,
      reason: 'Explicitly blocked'
    });
    return false;
  }

  if (!isAllowed) {
    logger.info('Action not allowed by autonomy level', {
      action: decision.action_type,
      level: level.name,
      allowed: level.allowed
    });
    return false;
  }

  return true;
}

// Check if agent has reached daily action limit
export async function checkDailyActionLimit(agentId, currentLevel) {
  const level = autonomyLevels[currentLevel];

  if (!level || level.maxDailyActions === 0) {
    return level?.maxDailyActions === 0 ? false : true; // Observer level = no actions allowed
  }

  try {
    // Get today's action count from Supabase
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);
    const { count } = await supabase
      .from('action_log')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    const todayActions = count || 0;
    const limitReached = todayActions >= level.maxDailyActions;

    if (limitReached) {
      logger.warn('Daily action limit reached', {
        agentId,
        level: level.name,
        todayActions,
        maxAllowed: level.maxDailyActions
      });
    }

    return !limitReached;

  } catch (error) {
    logger.error('Failed to check daily action limit:', error);
    // Default to allowing action if check fails
    return true;
  }
}

// Get autonomy level details
export function getAutonomyLevel(level) {
  return autonomyLevels[level] || autonomyLevels[1]; // Default to Observer
}

// Check if agent is ready for graduation to next level
export async function checkGraduationEligibility(agentId, currentLevel) {
  const level = autonomyLevels[currentLevel];
  const nextLevel = autonomyLevels[currentLevel + 1];

  if (!level || !nextLevel) {
    logger.info('No graduation available from level', currentLevel);
    return {
      eligible: false,
      reason: 'Already at maximum level or invalid level'
    };
  }

  try {
    const metrics = await calculateGraduationMetrics(agentId, level.graduationCriteria.timeInLevel);

    const eligible =
      metrics.totalCycles >= level.graduationCriteria.cyclesRequired &&
      metrics.successRate >= level.graduationCriteria.successRateThreshold &&
      metrics.escalationAppropriatenessRate >= level.graduationCriteria.appropriateEscalationRate &&
      metrics.timeInLevel >= parseDurationDays(level.graduationCriteria.timeInLevel);

    logger.info('Graduation eligibility check', {
      agentId,
      currentLevel: level.name,
      nextLevel: nextLevel.name,
      eligible,
      metrics
    });

    return {
      eligible,
      currentLevel: level.name,
      nextLevel: nextLevel.name,
      metrics,
      criteria: level.graduationCriteria,
      meetsRequirements: {
        cycles: metrics.totalCycles >= level.graduationCriteria.cyclesRequired,
        successRate: metrics.successRate >= level.graduationCriteria.successRateThreshold,
        escalationRate: metrics.escalationAppropriatenessRate >= level.graduationCriteria.appropriateEscalationRate,
        timeInLevel: metrics.timeInLevel >= parseDurationDays(level.graduationCriteria.timeInLevel)
      }
    };

  } catch (error) {
    logger.error('Failed to check graduation eligibility:', error);
    return {
      eligible: false,
      reason: `Error checking metrics: ${error.message}`
    };
  }
}

// Calculate metrics for graduation assessment
async function calculateGraduationMetrics(agentId, timeInLevelStr) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const timeInLevelDays = parseDurationDays(timeInLevelStr);
  const sinceDate = new Date(Date.now() - timeInLevelDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: cycleRows } = await supabase
    .from('heartbeat_cycles')
    .select('status, duration_ms')
    .eq('agent_id', agentId)
    .gte('started_at', sinceDate);

  const { data: actionRows } = await supabase
    .from('action_log')
    .select('success')
    .eq('agent_id', agentId)
    .gte('created_at', sinceDate);

  const { count: totalEscalations } = await supabase
    .from('handoff_log')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .gte('created_at', sinceDate);

  const cycleData = cycleRows || [];
  const actionData = actionRows || [];

  const cycles = {
    total_cycles: cycleData.length,
    completed_cycles: cycleData.filter(r => r.status === 'completed').length,
    avg_duration: cycleData.length ? cycleData.reduce((s, r) => s + (r.duration_ms || 0), 0) / cycleData.length : 0
  };
  const actions = {
    total_actions: actionData.length,
    successful_actions: actionData.filter(r => r.success).length
  };
  const escalations = { total_escalations: totalEscalations || 0 };

  return {
    totalCycles: parseInt(cycles.total_cycles),
    completedCycles: parseInt(cycles.completed_cycles),
    cycleSuccessRate: cycles.total_cycles > 0 ?
      parseInt(cycles.completed_cycles) / parseInt(cycles.total_cycles) : 0,
    totalActions: parseInt(actions.total_actions),
    successfulActions: parseInt(actions.successful_actions),
    successRate: actions.total_actions > 0 ?
      parseInt(actions.successful_actions) / parseInt(actions.total_actions) : 0,
    totalEscalations: parseInt(escalations.total_escalations),
    escalationRate: cycles.total_cycles > 0 ?
      parseInt(escalations.total_escalations) / parseInt(cycles.total_cycles) : 0,
    // Note: Escalation appropriateness would need human feedback scoring
    escalationAppropriatenessRate: 0.8, // Placeholder - would be calculated from human feedback
    timeInLevel: timeInLevelDays,
    avgCycleDuration: parseInt(cycles.avg_duration) || 0
  };
}

// Parse duration string to days
function parseDurationDays(durationStr) {
  const match = durationStr.match(/(\d+)\s*(days?|weeks?|months?)/i);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'day':
    case 'days':
      return value;
    case 'week':
    case 'weeks':
      return value * 7;
    case 'month':
    case 'months':
      return value * 30;
    default:
      return 0;
  }
}

// Get escalation policy for current level
export function getEscalationPolicy(level) {
  const levelConfig = autonomyLevels[level];
  return levelConfig ? levelConfig.escalation : 'all_actions';
}