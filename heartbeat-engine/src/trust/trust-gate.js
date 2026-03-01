// Trust Gate System - Autonomy Level Enforcement
// Ensures Sarah only performs actions within her current trust level
// Level 1 (Observer): Read-only operations, analysis, recommendations
// Level 2 (Assistant): Basic write operations with human oversight
// Level 3 (Operator): Independent operations within defined boundaries
// Level 4 (Manager): Full autonomous decision-making

import { createLogger } from '../logging/logger.js';
import { loadAgentConfig } from '../config/agent-profile.js';
import { logRejection, logHandoff } from '../logging/index.js';

const logger = createLogger('trust-gate');

// Action categories and their minimum autonomy levels
const ACTION_PERMISSIONS = {
  // Level 1 (Observer) - Read-only operations
  'ghl_search_contacts': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_contact': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_conversations': { level: 1, category: 'read', risk: 'low' },
  'ghl_list_calendars': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_calendar_slots': { level: 1, category: 'read', risk: 'low' },
  'ghl_search_opportunities': { level: 1, category: 'read', risk: 'low' },
  'ghl_list_workflows': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_forms': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_form_submissions': { level: 1, category: 'read', risk: 'low' },
  'ghl_list_pipelines': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_pipeline_stages': { level: 1, category: 'read', risk: 'low' },
  'ghl_list_tasks': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_notes': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_contact_tags': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_custom_fields': { level: 1, category: 'read', risk: 'low' },
  'ghl_list_users': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_location_info': { level: 1, category: 'read', risk: 'low' },
  'ghl_list_campaigns': { level: 1, category: 'read', risk: 'low' },
  'ghl_get_campaign_stats': { level: 1, category: 'read', risk: 'low' },
  'log_decision': { level: 1, category: 'logging', risk: 'low' },
  'create_task': { level: 1, category: 'planning', risk: 'low' },

  // Level 2 (Assistant) - Basic write operations
  'ghl_send_message': { level: 2, category: 'communication', risk: 'medium' },
  'ghl_update_contact': { level: 2, category: 'data_modification', risk: 'medium' },
  'ghl_create_contact': { level: 2, category: 'data_creation', risk: 'medium' },
  'ghl_create_appointment': { level: 2, category: 'scheduling', risk: 'medium' },
  'ghl_add_contact_to_workflow': { level: 2, category: 'workflow', risk: 'medium' },
  'ghl_create_task': { level: 2, category: 'data_creation', risk: 'medium' },
  'ghl_update_task': { level: 2, category: 'data_modification', risk: 'medium' },
  'ghl_create_note': { level: 2, category: 'data_creation', risk: 'medium' },
  'ghl_add_contact_tag': { level: 2, category: 'data_modification', risk: 'medium' },
  'ghl_remove_contact_tag': { level: 2, category: 'data_modification', risk: 'medium' },
  'ghl_update_contact_custom_field': { level: 2, category: 'data_modification', risk: 'medium' },

  // Level 3 (Operator) - Independent operations
  'ghl_create_opportunity': { level: 3, category: 'sales', risk: 'high' },
  'ghl_update_opportunity_stage': { level: 3, category: 'sales', risk: 'high' },
  'ghl_delete_contact': { level: 3, category: 'data_deletion', risk: 'high' },

  // Level 4 (Manager) - Full autonomous operations
  'system_configuration': { level: 4, category: 'administration', risk: 'critical' },
  'financial_transactions': { level: 4, category: 'financial', risk: 'critical' }
};

// Risk-based daily action limits by level
const DAILY_ACTION_LIMITS = {
  1: { // Observer
    communication: 0,      // Can't send messages
    data_modification: 0,  // Can't modify data
    data_creation: 0,      // Can't create data
    data_deletion: 0,      // Can't delete data
    total: 50              // Total actions per day
  },
  2: { // Assistant
    communication: 10,     // Limited messaging
    data_modification: 20, // Limited updates
    data_creation: 15,     // Limited creation
    data_deletion: 0,      // Still can't delete
    total: 100             // More total actions
  },
  3: { // Operator
    communication: 50,
    data_modification: 100,
    data_creation: 75,
    data_deletion: 5,      // Very limited deletion
    total: 500
  },
  4: { // Manager
    communication: 200,
    data_modification: 500,
    data_creation: 300,
    data_deletion: 50,
    total: 2000
  }
};

/**
 * Trust Gate - Core authorization system
 */
export class TrustGate {
  constructor() {
    this.actionCounts = new Map(); // Track daily action counts
  }

  /**
   * Check if an action is authorized at current autonomy level
   * @param {string} actionName - The action/tool name
   * @param {Object} parameters - Action parameters
   * @param {string} agentId - Agent ID
   * @param {string} cycleId - Current heartbeat cycle ID
   * @returns {Object} Authorization result
   */
  async authorizeAction(actionName, parameters, agentId, cycleId = null) {
    try {
      logger.info('Authorizing action', {
        action: actionName,
        agentId,
        cycleId
      });

      // Load agent configuration
      const agentConfig = await loadAgentConfig(agentId);
      const currentLevel = agentConfig.currentAutonomyLevel;

      // Get action permissions
      const actionPermission = ACTION_PERMISSIONS[actionName];

      if (!actionPermission) {
        // Unknown action - default to highest security level
        const rejection = {
          authorized: false,
          reason: 'Unknown action not in permission matrix',
          code: 'UNKNOWN_ACTION',
          escalate: true,
          requiredLevel: 4,
          currentLevel
        };

        await this.logRejection(agentId, cycleId, actionName, parameters, rejection);
        return rejection;
      }

      // Check autonomy level requirement
      if (currentLevel < actionPermission.level) {
        const rejection = {
          authorized: false,
          reason: `Action requires Level ${actionPermission.level}, agent is Level ${currentLevel}`,
          code: 'INSUFFICIENT_AUTONOMY_LEVEL',
          escalate: true,
          requiredLevel: actionPermission.level,
          currentLevel,
          suggestion: `This action needs to be approved by a human or wait for autonomy level upgrade`
        };

        await this.logRejection(agentId, cycleId, actionName, parameters, rejection);
        return rejection;
      }

      // Check daily action limits
      const limitCheck = await this.checkDailyLimits(agentId, currentLevel, actionPermission.category);
      if (!limitCheck.allowed) {
        const rejection = {
          authorized: false,
          reason: limitCheck.reason,
          code: 'DAILY_LIMIT_EXCEEDED',
          escalate: false,
          currentLevel,
          limitsExceeded: limitCheck.limits
        };

        await this.logRejection(agentId, cycleId, actionName, parameters, rejection);
        return rejection;
      }

      // Check risk-specific constraints
      const riskCheck = await this.checkRiskConstraints(actionName, parameters, agentConfig, actionPermission);
      if (!riskCheck.allowed) {
        const rejection = {
          authorized: false,
          reason: riskCheck.reason,
          code: 'RISK_CONSTRAINT_VIOLATION',
          escalate: riskCheck.escalate,
          currentLevel,
          riskLevel: actionPermission.risk
        };

        await this.logRejection(agentId, cycleId, actionName, parameters, rejection);
        return rejection;
      }

      // Action is authorized
      await this.recordAuthorizedAction(agentId, currentLevel, actionPermission.category);

      logger.info('Action authorized', {
        action: actionName,
        level: currentLevel,
        category: actionPermission.category,
        risk: actionPermission.risk
      });

      return {
        authorized: true,
        level: currentLevel,
        category: actionPermission.category,
        risk: actionPermission.risk,
        limits: limitCheck.remaining
      };

    } catch (error) {
      logger.error('Authorization error:', error);

      // Fail secure - deny on error
      const rejection = {
        authorized: false,
        reason: 'Authorization system error',
        code: 'SYSTEM_ERROR',
        escalate: true,
        error: error.message
      };

      return rejection;
    }
  }

  /**
   * Check daily action limits
   */
  async checkDailyLimits(agentId, autonomyLevel, actionCategory) {
    const today = new Date().toDateString();
    const key = `${agentId}-${today}`;

    // Get current action counts
    const counts = this.actionCounts.get(key) || {
      total: 0,
      communication: 0,
      data_modification: 0,
      data_creation: 0,
      data_deletion: 0,
      logging: 0,
      planning: 0,
      read: 0
    };

    const limits = DAILY_ACTION_LIMITS[autonomyLevel];

    // Check category-specific limit
    if (actionCategory && limits[actionCategory] !== undefined) {
      if (counts[actionCategory] >= limits[actionCategory]) {
        return {
          allowed: false,
          reason: `Daily ${actionCategory} limit exceeded (${counts[actionCategory]}/${limits[actionCategory]})`,
          limits: { category: actionCategory, used: counts[actionCategory], limit: limits[actionCategory] }
        };
      }
    }

    // Check total daily limit
    if (counts.total >= limits.total) {
      return {
        allowed: false,
        reason: `Daily total action limit exceeded (${counts.total}/${limits.total})`,
        limits: { total: counts.total, limit: limits.total }
      };
    }

    return {
      allowed: true,
      remaining: {
        total: limits.total - counts.total,
        [actionCategory]: limits[actionCategory] ? limits[actionCategory] - counts[actionCategory] : 'unlimited'
      }
    };
  }

  /**
   * Check risk-specific constraints
   */
  async checkRiskConstraints(actionName, parameters, agentConfig, actionPermission) {
    // High-risk actions require additional checks
    if (actionPermission.risk === 'high' || actionPermission.risk === 'critical') {

      // Check for sensitive operations
      if (actionName === 'ghl_delete_contact') {
        // Ensure it's not a critical contact
        if (parameters.contactId && this.isCriticalContact(parameters.contactId)) {
          return {
            allowed: false,
            reason: 'Cannot delete critical contacts without human approval',
            escalate: true
          };
        }
      }

      // Check for bulk operations
      if (this.isBulkOperation(actionName, parameters)) {
        return {
          allowed: false,
          reason: 'Bulk operations require human approval',
          escalate: true
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record successful authorized action for limit tracking
   */
  async recordAuthorizedAction(agentId, autonomyLevel, actionCategory) {
    const today = new Date().toDateString();
    const key = `${agentId}-${today}`;

    const counts = this.actionCounts.get(key) || {
      total: 0,
      communication: 0,
      data_modification: 0,
      data_creation: 0,
      data_deletion: 0,
      logging: 0,
      planning: 0,
      read: 0
    };

    counts.total++;
    if (actionCategory && counts[actionCategory] !== undefined) {
      counts[actionCategory]++;
    }

    this.actionCounts.set(key, counts);

    // Cleanup old entries (keep last 7 days)
    this.cleanupOldActionCounts();
  }

  /**
   * Log rejected action for audit trail
   */
  async logRejection(agentId, cycleId, actionName, parameters, rejection) {
    try {
      const reason = `${rejection.code}: ${rejection.reason}`;
      const confidence = rejection.escalate ? 0.95 : 0.8;

      await logRejection(
        cycleId || 'trust-gate',
        agentId,
        `${actionName}(${JSON.stringify(parameters)})`,
        reason,
        confidence,
        rejection.code
      );

      // If escalation is needed, create handoff
      if (rejection.escalate) {
        await this.createEscalation(agentId, cycleId, actionName, parameters, rejection);
      }

    } catch (error) {
      logger.error('Failed to log rejection:', error);
    }
  }

  /**
   * Create escalation for blocked actions
   */
  async createEscalation(agentId, cycleId, actionName, parameters, rejection) {
    try {
      const escalation = {
        issue: `Action blocked by trust gate: ${actionName}`,
        analysis: `Agent attempted ${actionName} but was blocked due to: ${rejection.reason}`,
        recommendation: rejection.suggestion || 'Review action and approve manually if appropriate',
        urgency: rejection.code === 'SYSTEM_ERROR' ? 'high' : 'medium',
        actionRequested: actionName,
        parameters: parameters,
        blockingReason: rejection.reason,
        requiredLevel: rejection.requiredLevel
      };

      await logHandoff(cycleId || 'trust-gate', escalation);

      logger.warn('Created escalation for blocked action', {
        action: actionName,
        reason: rejection.reason,
        agentId
      });

    } catch (error) {
      logger.error('Failed to create escalation:', error);
    }
  }

  /**
   * Helper methods
   */
  isCriticalContact(contactId) {
    // Define critical contacts that shouldn't be deleted
    const criticalPatterns = [
      'admin', 'owner', 'manager', 'ceo', 'founder'
    ];

    // This would ideally check against a database
    return criticalPatterns.some(pattern =>
      contactId.toLowerCase().includes(pattern)
    );
  }

  isBulkOperation(actionName, parameters) {
    // Detect bulk operations
    if (Array.isArray(parameters.contacts) && parameters.contacts.length > 10) {
      return true;
    }

    if (parameters.query && parameters.query.toLowerCase().includes('*')) {
      return true;
    }

    return false;
  }

  cleanupOldActionCounts() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const [key, counts] of this.actionCounts.entries()) {
      const [agentId, dateString] = key.split('-');
      const entryDate = new Date(dateString);

      if (entryDate < sevenDaysAgo) {
        this.actionCounts.delete(key);
      }
    }
  }

  /**
   * Get current action usage for an agent
   */
  async getActionUsage(agentId) {
    const today = new Date().toDateString();
    const key = `${agentId}-${today}`;

    const counts = this.actionCounts.get(key) || {
      total: 0,
      communication: 0,
      data_modification: 0,
      data_creation: 0,
      data_deletion: 0,
      logging: 0,
      planning: 0,
      read: 0
    };

    const agentConfig = await loadAgentConfig(agentId);
    const limits = DAILY_ACTION_LIMITS[agentConfig.currentAutonomyLevel];

    return {
      agentId,
      autonomyLevel: agentConfig.currentAutonomyLevel,
      date: today,
      usage: counts,
      limits,
      remaining: {
        total: limits.total - counts.total,
        communication: limits.communication - counts.communication,
        data_modification: limits.data_modification - counts.data_modification,
        data_creation: limits.data_creation - counts.data_creation,
        data_deletion: limits.data_deletion - counts.data_deletion
      }
    };
  }
}

// Export singleton instance
export const trustGate = new TrustGate();

// Export permissions for reference
export { ACTION_PERMISSIONS, DAILY_ACTION_LIMITS };