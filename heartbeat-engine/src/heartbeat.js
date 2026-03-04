// BLOOM Heartbeat Engine - Core Autonomous Agent Loop
// This implements the Ralph Wiggum pattern: sense → think → act → log

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from './logging/logger.js';
import { sense } from './agent/sense.js';
import { think } from './agent/think.js';
import { act } from './agent/act.js';
import { escalate } from './agent/escalate.js';
import { lettaClient } from './memory/letta-client.js';
import { logHeartbeat, logAction, logRejection, logHandoff } from './logging/index.js';
import { isWithinScope } from './config/autonomy-levels.js';

const logger = createLogger('heartbeat');

export async function runHeartbeat(agentConfig, trigger = {}) {
  const cycleId = `cycle_${uuidv4().substring(0, 8)}`;
  const startTime = Date.now();

  logger.info(`🔄 Starting heartbeat cycle ${cycleId}`, {
    agent: agentConfig.name,
    autonomyLevel: agentConfig.currentAutonomyLevel,
    trigger: trigger.type || 'unknown'
  });

  try {
    // PHASE 1: SENSE - Check the environment
    logger.info('👁️  PHASE 1: Sensing environment...');
    const environment = await sense(agentConfig, trigger);

    logger.info('Environment snapshot:', {
      ghl: {
        newInquiries: environment.ghl?.newInquiries?.length || 0,
        overdueFollowups: environment.ghl?.overdueFollowups?.length || 0,
        upcomingAppointments: environment.ghl?.upcomingAppointments?.length || 0
      },
      email: {
        unreadCount: environment.email?.unread?.length || 0,
        urgentCount: environment.email?.urgent?.length || 0
      },
      tasks: {
        pendingCount: environment.tasks?.pending?.length || 0,
        overdueCount: environment.tasks?.overdue?.length || 0
      }
    });

    // PHASE 2: REMEMBER - Load relevant memory from Letta
    logger.info('🧠 PHASE 2: Loading relevant memories...');
    const memory = await lettaClient.getRelevantMemory({
      agentId: agentConfig.agentId,
      currentContext: environment,
      recentActions: await getRecentActions(agentConfig.agentId, 24), // last 24 hours
      triggerContext: trigger
    });

    // PHASE 3: THINK - Call Claude with full context
    logger.info('🤔 PHASE 3: Analyzing and deciding...');
    const decisions = await think({
      agentProfile: agentConfig,
      environment,
      memory,
      autonomyLevel: agentConfig.currentAutonomyLevel,
      instructions: agentConfig.standingInstructions,
      trigger
    });

    logger.info(`Made ${decisions.length} decisions:`, {
      actions: decisions.filter(d => d.type === 'act').length,
      rejections: decisions.filter(d => d.type === 'reject').length,
      escalations: decisions.filter(d => d.type === 'escalate').length
    });

    // PHASE 4: ACT - Execute approved actions
    logger.info('⚡ PHASE 4: Executing approved actions...');
    const results = {
      actions: [],
      rejections: [],
      handoffs: []
    };

    for (const decision of decisions) {
      try {
        if (decision.type === 'act') {
          // Check if action is within current autonomy scope
          if (isWithinScope(decision, agentConfig.currentAutonomyLevel)) {
            logger.info(`Executing action: ${decision.action_type}`, {
              description: decision.description
            });

            const result = await act(decision, agentConfig);
            await logAction(cycleId, decision, result);
            results.actions.push({ decision, result });

            logger.info(`✅ Action completed: ${decision.action_type}`, {
              success: result.success
            });
          } else {
            // Action outside scope - convert to escalation
            logger.warn(`Action outside autonomy scope: ${decision.action_type}`);
            const escalationDecision = {
              type: 'escalate',
              issue: `Action requires higher autonomy level: ${decision.action_type}`,
              analysis: decision.analysis || 'Action identified but outside current scope',
              recommendation: `Approve: ${decision.description}`,
              confidence: decision.confidence || 0.9,
              urgency: decision.urgency || 'MEDIUM',
              originalAction: decision
            };

            await escalate(escalationDecision, agentConfig);
            await logHandoff(cycleId, escalationDecision);
            results.handoffs.push(escalationDecision);
          }

        } else if (decision.type === 'reject') {
          logger.info(`Rejecting action: ${decision.candidate}`, {
            reason: decision.reason,
            confidence: decision.confidence
          });

          await logRejection(cycleId, decision.candidate, decision.reason, decision.confidence);
          results.rejections.push(decision);

        } else if (decision.type === 'escalate') {
          logger.info(`Escalating issue: ${decision.issue}`, {
            urgency: decision.urgency,
            confidence: decision.confidence
          });

          await escalate(decision, agentConfig);
          await logHandoff(cycleId, decision);
          results.handoffs.push(decision);
        }

      } catch (actionError) {
        logger.error(`Failed to process decision:`, actionError, {
          decision: decision.type,
          action: decision.action_type || decision.candidate || decision.issue
        });

        // Log the failure as a handoff
        const errorHandoff = {
          type: 'escalate',
          issue: `Failed to process decision: ${actionError.message}`,
          analysis: `Error occurred while processing ${decision.type}`,
          recommendation: 'Manual review required',
          confidence: 1.0,
          urgency: 'MEDIUM',
          error: actionError.message
        };

        await escalate(errorHandoff, agentConfig);
        await logHandoff(cycleId, errorHandoff);
        results.handoffs.push(errorHandoff);
      }
    }

    // PHASE 5: REMEMBER - Store what happened this cycle
    logger.info('💾 PHASE 5: Storing cycle memory...');
    await lettaClient.storeMemory({
      agentId: agentConfig.agentId,
      cycleId,
      actions: results.actions.map(a => a.decision),
      rejections: results.rejections,
      handoffs: results.handoffs,
      environmentSnapshot: environment,
      trigger,
      duration: Date.now() - startTime
    });

    // PHASE 5.5: SCHEDULED TASKS - Check and run any due scheduled tasks
    logger.info('📋 PHASE 5.5: Checking scheduled tasks...');
    let scheduledTaskResults = { tasksRun: 0 };
    try {
      const { checkAndRunScheduledTasks } = await import('./orchestrator/task-executor.js');
      scheduledTaskResults = await checkAndRunScheduledTasks();
      if (scheduledTaskResults.tasksRun > 0) {
        logger.info(`📋 Ran ${scheduledTaskResults.tasksRun} scheduled task(s)`, { results: scheduledTaskResults.results });
      }
    } catch (schedError) {
      logger.error('Scheduled task check failed', { error: schedError.message });
    }

    // PHASE 6: LOG - Record cycle completion
    const duration = Date.now() - startTime;
    await logHeartbeat(cycleId, {
      agentId: agentConfig.agentId,
      duration,
      actionsCount: results.actions.length,
      rejectionsCount: results.rejections.length,
      handoffsCount: results.handoffs.length,
      status: 'completed',
      environmentSnapshot: environment,
      trigger
    });

    logger.info(`✅ Heartbeat cycle ${cycleId} completed`, {
      duration: `${duration}ms`,
      actions: results.actions.length,
      rejections: results.rejections.length,
      handoffs: results.handoffs.length
    });

    return {
      cycleId,
      duration,
      actionsCount: results.actions.length,
      rejectionsCount: results.rejections.length,
      handoffsCount: results.handoffs.length,
      results
    };

  } catch (error) {
    logger.error(`❌ Heartbeat cycle ${cycleId} failed:`, error);

    // Log the failed cycle
    await logHeartbeat(cycleId, {
      agentId: agentConfig.agentId,
      duration: Date.now() - startTime,
      status: 'error',
      error: error.message,
      trigger
    });

    // Create emergency handoff for cycle failure
    const emergencyHandoff = {
      type: 'escalate',
      issue: `Heartbeat cycle failed: ${error.message}`,
      analysis: `Complete cycle failure in ${cycleId}`,
      recommendation: 'Check logs and system status',
      confidence: 1.0,
      urgency: 'HIGH'
    };

    try {
      await escalate(emergencyHandoff, agentConfig);
      await logHandoff(cycleId, emergencyHandoff);
    } catch (escalationError) {
      logger.error('Failed to escalate cycle failure:', escalationError);
    }

    throw error;
  }
}

// Helper function to get recent actions for context
async function getRecentActions(agentId, hours = 24) {
  try {
    const { createPool } = await import('../database/setup.js');
    const pool = createPool();

    const result = await pool.query(`
      SELECT
        action_type,
        description,
        target_system,
        success,
        timestamp
      FROM action_log
      WHERE agent_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
      ORDER BY timestamp DESC
      LIMIT 50
    `, [agentId]);

    await pool.end();
    return result.rows;
  } catch (error) {
    logger.error('Failed to get recent actions:', error);
    return [];
  }
}