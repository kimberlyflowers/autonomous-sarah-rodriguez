// BLOOM Heartbeat Engine - Logging Configuration
// Winston-based logging with structured output for Railway logs

import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

// Custom format for agent operations
const agentFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      service,
      message,
      ...meta
    };

    // In production, use structured JSON for Railway logs
    if (isProduction) {
      return JSON.stringify(logEntry);
    }

    // In development, use readable format
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${service}] ${level.toUpperCase()}: ${message}${metaStr}`;
  })
);

export function createLogger(service) {
  return winston.createLogger({
    level: logLevel,
    format: agentFormat,
    defaultMeta: {
      service,
      agent: process.env.AGENT_ID || 'bloomie-sarah-rodriguez',
      version: '1.0.0'
    },
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true
      })
    ],
    exitOnError: false
  });
}

// Structured logging helpers for agent operations
export function logAgentAction(logger, action, result) {
  logger.info('Agent Action', {
    action_type: action.action_type,
    description: action.description,
    target_system: action.target_system,
    success: result?.success || false,
    duration: result?.duration,
    event_type: 'agent_action'
  });
}

export function logAgentRejection(logger, candidate, reason, confidence) {
  logger.info('Agent Rejection', {
    candidate_action: candidate,
    reason,
    confidence,
    event_type: 'agent_rejection'
  });
}

export function logAgentHandoff(logger, issue, analysis, recommendation, urgency) {
  logger.warn('Agent Handoff', {
    issue,
    analysis,
    recommendation,
    urgency,
    event_type: 'agent_handoff'
  });
}

export function logHeartbeatCycle(logger, cycleId, status, metrics) {
  logger.info('Heartbeat Cycle', {
    cycle_id: cycleId,
    status,
    duration: metrics.duration,
    actions_count: metrics.actionsCount,
    rejections_count: metrics.rejectionsCount,
    handoffs_count: metrics.handoffsCount,
    event_type: 'heartbeat_cycle'
  });
}