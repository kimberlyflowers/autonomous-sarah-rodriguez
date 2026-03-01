// BLOOM Heartbeat Engine - Trust Graduation System
// Defines autonomy levels and scope checking for agent actions

import { createLogger } from '../logging/logger.js';

const logger = createLogger('autonomy');

// Trust Graduation Levels - visible to both client and agent
export const autonomyLevels = {
  1: {
    level: 1,
    name: 'Observer',
    description: 'Can check systems and report findings. Cannot take action.',
    allowed: [
      'read_ghl',
      'read_email',
      'read_calendar',
      'read_tasks',
      'generate_reports',
      'log_interaction',
      'send_notification'
    ],
    blocked: [
      'send_email',
      'create_task',
      'update_contact',
      'modify_calendar',
      'send_sms',
      'update_pipeline',
      'create_appointment',
      'delete_data'
    ],
    escalation: 'all_actions', // escalate everything that requires action
    maxDailyActions: 0, // read-only
    requiresApproval: true,
    graduationCriteria: {
      cyclesRequired: 50,
      successRateThreshold: 0.95,
      appropriateEscalationRate: 0.8,
      timeInLevel: '7 days'
    }
  },

  2: {
    level: 2,
    name: 'Assistant',
    description: 'Can handle routine tasks with guardrails. Escalates edge cases.',
    allowed: [
      'read_ghl',
      'read_email',
      'read_calendar',
      'read_tasks',
      'send_followup_email',
      'create_internal_task',
      'update_task_status',
      'send_reminder',
      'log_interaction',
      'send_notification',
      'schedule_reminder'
    ],
    blocked: [
      'send_cold_email',
      'delete_contact',
      'modify_pricing',
      'access_billing',
      'update_pipeline',
      'create_appointment',
      'bulk_operations'
    ],
    escalation: 'non_routine', // escalate anything outside normal patterns
    maxDailyActions: 10,
    requiresApproval: false,
    graduationCriteria: {
      cyclesRequired: 100,
      successRateThreshold: 0.92,
      appropriateEscalationRate: 0.75,
      timeInLevel: '14 days'
    }
  },

  3: {
    level: 3,
    name: 'Operator',
    description: 'Can execute most operations. Logs everything for review.',
    allowed: [
      'read_ghl',
      'read_email',
      'read_calendar',
      'read_tasks',
      'send_email',
      'create_task',
      'update_contact',
      'create_appointment',
      'send_reminder',
      'generate_reports',
      'update_pipeline',
      'log_interaction',
      'send_notification',
      'schedule_reminder',
      'send_followup_email',
      'update_task_status',
      'send_appointment_reminder'
    ],
    blocked: [
      'delete_contact',
      'modify_pricing',
      'access_billing',
      'bulk_operations',
      'delete_data',
      'modify_integrations'
    ],
    escalation: 'high_stakes_only', // only escalate significant decisions
    maxDailyActions: 50,
    requiresApproval: false,
    graduationCriteria: {
      cyclesRequired: 200,
      successRateThreshold: 0.90,
      appropriateEscalationRate: 0.70,
      timeInLevel: '30 days'
    }
  },

  4: {
    level: 4,
    name: 'Partner',
    description: 'Full operational autonomy. Weekly review instead of per-action.',
    allowed: [
      'all_operations'
    ],
    blocked: [
      'delete_data',
      'modify_billing',
      'change_agent_config',
      'access_sensitive_data',
      'modify_integrations'
    ],
    escalation: 'critical_only', // only escalate critical issues
    maxDailyActions: 100,
    requiresApproval: false,
    graduationCriteria: {
      cyclesRequired: 500,
      successRateThreshold: 0.88,
      appropriateEscalationRate: 0.65,
      timeInLevel: '60 days'
    }
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
    // Get today's action count
    const { createPool } = await import('../../database/setup.js');
    const pool = createPool();

    const result = await pool.query(`
      SELECT COUNT(*) as action_count
      FROM action_log
      WHERE agent_id = $1
        AND timestamp >= CURRENT_DATE
        AND timestamp < CURRENT_DATE + INTERVAL '1 day'
    `, [agentId]);

    await pool.end();

    const todayActions = parseInt(result.rows[0].action_count);
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
  const { createPool } = await import('../../database/setup.js');
  const pool = createPool();

  const timeInLevelDays = parseDurationDays(timeInLevelStr);
  const sinceDate = new Date(Date.now() - timeInLevelDays * 24 * 60 * 60 * 1000);

  // Get heartbeat cycle metrics
  const cycleResult = await pool.query(`
    SELECT
      COUNT(*) as total_cycles,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_cycles,
      AVG(duration_ms) as avg_duration
    FROM heartbeat_cycles
    WHERE agent_id = $1 AND started_at >= $2
  `, [agentId, sinceDate]);

  // Get action metrics
  const actionResult = await pool.query(`
    SELECT
      COUNT(*) as total_actions,
      COUNT(CASE WHEN success = true THEN 1 END) as successful_actions
    FROM action_log
    WHERE agent_id = $1 AND timestamp >= $2
  `, [agentId, sinceDate]);

  // Get escalation metrics
  const escalationResult = await pool.query(`
    SELECT COUNT(*) as total_escalations
    FROM handoff_log
    WHERE agent_id = $1 AND timestamp >= $2
  `, [agentId, sinceDate]);

  await pool.end();

  const cycles = cycleResult.rows[0];
  const actions = actionResult.rows[0];
  const escalations = escalationResult.rows[0];

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