// BLOOM Verification Engine
// Ralph-inspired verification: don't mark done until you've CHECKED it actually happened
// This is the missing piece between ACT and COMPLETE

import { createLogger } from '../logging/logger.js';

const logger = createLogger('verify');

/**
 * Verification strategies by tool/action type
 * Each strategy defines HOW to verify that an action actually succeeded
 */
const VERIFICATION_STRATEGIES = {
  // GHL Contact Operations
  ghl_create_contact: {
    type: 'api_check',
    description: 'Verify contact exists in GHL after creation',
    verify: async (actionResult, context, tools) => {
      if (!actionResult?.data?.contact?.id) {
        return { verified: false, reason: 'No contact ID returned from creation' };
      }
      try {
        const contact = await tools.executeGHL('ghl_get_contact', {
          contactId: actionResult.data.contact.id
        });
        if (contact?.success && contact?.data?.contact) {
          return {
            verified: true,
            evidence: {
              contactId: contact.data.contact.id,
              name: `${contact.data.contact.firstName || ''} ${contact.data.contact.lastName || ''}`.trim(),
              verifiedAt: new Date().toISOString()
            }
          };
        }
        return { verified: false, reason: 'Contact not found after creation' };
      } catch (err) {
        return { verified: false, reason: `Verification API call failed: ${err.message}` };
      }
    }
  },

  ghl_update_contact: {
    type: 'api_check',
    description: 'Verify contact was updated in GHL',
    verify: async (actionResult, context, tools) => {
      if (!context?.contactId) {
        return { verified: false, reason: 'No contactId in context to verify' };
      }
      try {
        const contact = await tools.executeGHL('ghl_get_contact', {
          contactId: context.contactId
        });
        if (contact?.success) {
          return {
            verified: true,
            evidence: {
              contactId: context.contactId,
              updatedFields: Object.keys(context.updates || {}),
              verifiedAt: new Date().toISOString()
            }
          };
        }
        return { verified: false, reason: 'Could not verify contact update' };
      } catch (err) {
        return { verified: false, reason: `Verification failed: ${err.message}` };
      }
    }
  },

  ghl_create_opportunity: {
    type: 'api_check',
    description: 'Verify opportunity was created in GHL',
    verify: async (actionResult, context, tools) => {
      if (!actionResult?.data?.opportunity?.id) {
        return { verified: false, reason: 'No opportunity ID returned' };
      }
      // For now, trust the creation response if it has an ID
      return {
        verified: true,
        evidence: {
          opportunityId: actionResult.data.opportunity.id,
          verifiedAt: new Date().toISOString()
        }
      };
    }
  },

  ghl_send_message: {
    type: 'api_check',
    description: 'Verify message was sent via GHL',
    verify: async (actionResult, context, tools) => {
      if (!actionResult?.success) {
        return { verified: false, reason: 'Send message returned failure' };
      }
      // Messages are fire-and-forget in most CRM APIs
      // Verify by checking the message ID was returned
      if (actionResult?.data?.messageId || actionResult?.data?.id) {
        return {
          verified: true,
          evidence: {
            messageId: actionResult.data.messageId || actionResult.data.id,
            verifiedAt: new Date().toISOString()
          }
        };
      }
      return {
        verified: true, // Soft verify — API said success
        confidence: 'medium',
        evidence: { note: 'API returned success but no message ID', verifiedAt: new Date().toISOString() }
      };
    }
  },

  // Internal Task Operations
  bloom_create_task: {
    type: 'db_check',
    description: 'Verify task was created in database',
    verify: async (actionResult, context, tools) => {
      if (!actionResult?.taskId) {
        return { verified: false, reason: 'No task ID returned' };
      }
      try {
        const tasks = await tools.executeInternal('bloom_list_tasks', {
          status: 'pending',
          limit: 5
        });
        const found = tasks?.tasks?.find(t => t.id === actionResult.taskId);
        if (found) {
          return {
            verified: true,
            evidence: { taskId: found.id, title: found.title, verifiedAt: new Date().toISOString() }
          };
        }
        return { verified: false, reason: 'Task not found in database after creation' };
      } catch (err) {
        return { verified: false, reason: `DB verification failed: ${err.message}` };
      }
    }
  },

  bloom_todo_write: {
    type: 'db_check',
    description: 'Verify task plan was persisted',
    verify: async (actionResult, context, tools) => {
      if (!actionResult?.success || !actionResult?.task_id) {
        return { verified: false, reason: 'Plan creation returned failure or no ID' };
      }
      return {
        verified: true,
        evidence: {
          taskId: actionResult.task_id,
          stepCount: actionResult.steps?.length || 0,
          verifiedAt: new Date().toISOString()
        }
      };
    }
  },

  // Email Operations
  send_email: {
    type: 'api_check',
    description: 'Verify email was queued/sent',
    verify: async (actionResult, context, tools) => {
      if (actionResult?.success && (actionResult?.messageId || actionResult?.id)) {
        return {
          verified: true,
          evidence: { messageId: actionResult.messageId || actionResult.id, verifiedAt: new Date().toISOString() }
        };
      }
      if (actionResult?.success) {
        return {
          verified: true,
          confidence: 'medium',
          evidence: { note: 'API confirmed send but no message ID', verifiedAt: new Date().toISOString() }
        };
      }
      return { verified: false, reason: 'Email send returned failure' };
    }
  },

  // Content Generation (LLM-judgment verification)
  generate_content: {
    type: 'llm_judgment',
    description: 'Verify content was generated and meets quality bar',
    verify: async (actionResult, context, tools) => {
      if (!actionResult?.success || !actionResult?.content) {
        return { verified: false, reason: 'No content generated' };
      }
      const content = actionResult.content;
      // Basic quality checks
      if (content.length < 50) {
        return { verified: false, reason: 'Content too short (< 50 chars)' };
      }
      return {
        verified: true,
        confidence: 'medium', // Would need LLM judgment for true quality check
        evidence: {
          contentLength: content.length,
          verifiedAt: new Date().toISOString()
        }
      };
    }
  },

  // Browser/Scraping Operations
  scrape_url: {
    type: 'result_check',
    description: 'Verify scrape returned data',
    verify: async (actionResult, context, tools) => {
      if (actionResult?.success && actionResult?.data) {
        const dataSize = JSON.stringify(actionResult.data).length;
        if (dataSize > 100) {
          return {
            verified: true,
            evidence: { dataSize, verifiedAt: new Date().toISOString() }
          };
        }
        return { verified: false, reason: 'Scrape returned very little data' };
      }
      return { verified: false, reason: 'Scrape failed or returned no data' };
    }
  }
};

/**
 * Default verification strategy for unknown tools
 * Uses the tool's own success flag + basic result inspection
 */
const DEFAULT_STRATEGY = {
  type: 'result_check',
  description: 'Default: check tool success flag and result presence',
  verify: async (actionResult, context, tools) => {
    if (actionResult?.success === true) {
      return {
        verified: true,
        confidence: 'low', // We only checked the success flag, not the actual state
        evidence: {
          method: 'success_flag_only',
          verifiedAt: new Date().toISOString()
        }
      };
    }
    if (actionResult?.success === false) {
      return {
        verified: false,
        reason: actionResult.error || 'Tool returned success: false'
      };
    }
    // Ambiguous — no success flag
    return {
      verified: true,
      confidence: 'low',
      evidence: {
        method: 'no_explicit_failure',
        note: 'Tool did not return success flag, assuming success',
        verifiedAt: new Date().toISOString()
      }
    };
  }
};

/**
 * Main verification function
 * Called after every tool execution or action step
 *
 * @param {string} actionType - The tool/action name that was executed
 * @param {Object} actionResult - The result returned by the tool
 * @param {Object} context - Additional context about the action
 * @param {Object} tools - Tool executors for verification calls
 * @returns {Object} Verification result with verified flag, evidence, and confidence
 */
export async function verifyAction(actionType, actionResult, context = {}, tools = {}) {
  const startTime = Date.now();

  logger.info(`Verifying action: ${actionType}`, {
    hasResult: !!actionResult,
    hasContext: Object.keys(context).length > 0
  });

  try {
    // Get the verification strategy for this action type
    const strategy = VERIFICATION_STRATEGIES[actionType] || DEFAULT_STRATEGY;

    logger.info(`Using verification strategy: ${strategy.type} - ${strategy.description}`);

    // Run verification
    const verification = await strategy.verify(actionResult, context, tools);

    const duration = Date.now() - startTime;

    const result = {
      actionType,
      verified: verification.verified,
      confidence: verification.confidence || (verification.verified ? 'high' : 'none'),
      evidence: verification.evidence || null,
      reason: verification.reason || null,
      strategy: strategy.type,
      duration,
      timestamp: new Date().toISOString()
    };

    if (verification.verified) {
      logger.info(`✅ Verification PASSED for ${actionType}`, {
        confidence: result.confidence,
        duration: `${duration}ms`
      });
    } else {
      logger.warn(`❌ Verification FAILED for ${actionType}`, {
        reason: result.reason,
        duration: `${duration}ms`
      });
    }

    return result;

  } catch (error) {
    logger.error(`Verification error for ${actionType}:`, error);
    return {
      actionType,
      verified: false,
      confidence: 'none',
      evidence: null,
      reason: `Verification threw error: ${error.message}`,
      strategy: 'error',
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Verify an entire plan's steps
 * Returns which steps are verified as passing and which aren't
 *
 * @param {Array} steps - Array of plan steps with their execution results
 * @param {Object} tools - Tool executors for verification calls
 * @returns {Object} Plan verification summary
 */
export async function verifyPlan(steps, tools = {}) {
  logger.info(`Verifying plan with ${steps.length} steps`);

  const results = [];
  let allPassing = true;

  for (const step of steps) {
    if (step.status === 'completed' && step.executionResult) {
      const verification = await verifyAction(
        step.toolUsed || 'unknown',
        step.executionResult,
        step.context || {},
        tools
      );

      results.push({
        stepId: step.id,
        content: step.content,
        ...verification
      });

      if (!verification.verified) {
        allPassing = false;
      }
    } else if (step.status === 'pending' || step.status === 'in_progress') {
      allPassing = false;
      results.push({
        stepId: step.id,
        content: step.content,
        verified: false,
        reason: `Step is still ${step.status}`,
        confidence: 'none'
      });
    } else if (step.status === 'failed') {
      allPassing = false;
      results.push({
        stepId: step.id,
        content: step.content,
        verified: false,
        reason: 'Step failed during execution',
        confidence: 'none'
      });
    }
  }

  const summary = {
    totalSteps: steps.length,
    verifiedPassing: results.filter(r => r.verified).length,
    verifiedFailing: results.filter(r => !r.verified).length,
    allPassing,
    results,
    timestamp: new Date().toISOString()
  };

  logger.info(`Plan verification complete: ${summary.verifiedPassing}/${summary.totalSteps} passing`, {
    allPassing: summary.allPassing
  });

  return summary;
}

/**
 * Register a custom verification strategy for a new tool
 *
 * @param {string} toolName - The tool name to register verification for
 * @param {Object} strategy - The verification strategy object
 */
export function registerVerificationStrategy(toolName, strategy) {
  if (!strategy.type || !strategy.verify) {
    throw new Error('Verification strategy must have type and verify function');
  }
  VERIFICATION_STRATEGIES[toolName] = strategy;
  logger.info(`Registered verification strategy for ${toolName}: ${strategy.type}`);
}

/**
 * Get verification strategy info for a tool
 */
export function getVerificationStrategy(toolName) {
  return VERIFICATION_STRATEGIES[toolName] || DEFAULT_STRATEGY;
}

export { VERIFICATION_STRATEGIES, DEFAULT_STRATEGY };
