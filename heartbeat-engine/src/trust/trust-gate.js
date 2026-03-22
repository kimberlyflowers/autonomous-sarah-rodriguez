// Trust Gate System - Autonomy Level Enforcement
// Ensures Sarah only performs actions within her current trust level
// Level 1 (Assistant): Full working Bloomie - read + write, no deletion
// Level 2 (Partner):   Pipeline/sales autonomy + everything in Level 1
// Level 3 (Operator):  Reserved for future expansion
// Level 4 (Admin):     Internal system use only

import { createLogger } from '../logging/logger.js';
import { loadAgentConfig } from '../config/agent-profile.js';
import { logRejection, logHandoff } from '../logging/index.js';

const logger = createLogger('trust-gate');

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE PERMISSION MATRIX — EVERY tool Sarah has access to must be here
// If a tool isn't listed AND doesn't match a safe prefix, it gets hard-blocked.
// Level 1 = Assistant (full working Bloomie), Level 2 = Partner (pipeline/sales)
// ═══════════════════════════════════════════════════════════════════════════
const ACTION_PERMISSIONS = {

  // ── GHL READ OPERATIONS ────────────────────────────────────────────────────
  'ghl_search_contacts':          { level: 1, category: 'read', risk: 'low' },
  'ghl_get_contact':              { level: 1, category: 'read', risk: 'low' },
  'ghl_get_conversations':        { level: 1, category: 'read', risk: 'low' },
  'ghl_search_conversations':     { level: 1, category: 'read', risk: 'low' },
  'ghl_list_calendars':           { level: 1, category: 'read', risk: 'low' },
  'ghl_get_calendar_slots':       { level: 1, category: 'read', risk: 'low' },
  'ghl_get_appointments':         { level: 1, category: 'read', risk: 'low' },
  'ghl_search_opportunities':     { level: 1, category: 'read', risk: 'low' },
  'ghl_get_opportunity':          { level: 1, category: 'read', risk: 'low' },
  'ghl_list_workflows':           { level: 1, category: 'read', risk: 'low' },
  'ghl_get_forms':                { level: 1, category: 'read', risk: 'low' },
  'ghl_list_forms':               { level: 1, category: 'read', risk: 'low' },
  'ghl_get_form_submissions':     { level: 1, category: 'read', risk: 'low' },
  'ghl_list_surveys':             { level: 1, category: 'read', risk: 'low' },
  'ghl_get_survey_submissions':   { level: 1, category: 'read', risk: 'low' },
  'ghl_list_pipelines':           { level: 1, category: 'read', risk: 'low' },
  'ghl_get_pipeline_stages':      { level: 1, category: 'read', risk: 'low' },
  'ghl_list_tasks':               { level: 1, category: 'read', risk: 'low' },
  'ghl_get_notes':                { level: 1, category: 'read', risk: 'low' },
  'ghl_get_contact_tags':         { level: 1, category: 'read', risk: 'low' },
  'ghl_list_location_tags':       { level: 1, category: 'read', risk: 'low' },
  'ghl_get_custom_fields':        { level: 1, category: 'read', risk: 'low' },
  'ghl_list_users':               { level: 1, category: 'read', risk: 'low' },
  'ghl_get_location_info':        { level: 1, category: 'read', risk: 'low' },
  'ghl_list_campaigns':           { level: 1, category: 'read', risk: 'low' },
  'ghl_get_campaign_stats':       { level: 1, category: 'read', risk: 'low' },
  'ghl_list_products':            { level: 1, category: 'read', risk: 'low' },
  'ghl_get_product':              { level: 1, category: 'read', risk: 'low' },
  'ghl_list_invoices':            { level: 1, category: 'read', risk: 'low' },
  'ghl_get_invoice':              { level: 1, category: 'read', risk: 'low' },
  'ghl_list_payments':            { level: 1, category: 'read', risk: 'low' },
  'ghl_list_funnels':             { level: 1, category: 'read', risk: 'low' },
  'ghl_get_funnel_pages':         { level: 1, category: 'read', risk: 'low' },
  'ghl_list_media':               { level: 1, category: 'read', risk: 'low' },
  'ghl_list_email_templates':     { level: 1, category: 'read', risk: 'low' },
  'ghl_list_social_posts':        { level: 1, category: 'read', risk: 'low' },
  'ghl_list_blog_posts':          { level: 1, category: 'read', risk: 'low' },
  'ghl_get_blog_post':            { level: 1, category: 'read', risk: 'low' },
  'ghl_list_documents':           { level: 1, category: 'read', risk: 'low' },
  'ghl_list_trigger_links':       { level: 1, category: 'read', risk: 'low' },
  'ghl_list_phone_numbers':       { level: 1, category: 'read', risk: 'low' },
  'ghl_list_courses':             { level: 1, category: 'read', risk: 'low' },

  // ── GHL WRITE / COMMUNICATION ──────────────────────────────────────────────
  'ghl_send_message':                { level: 1, category: 'communication', risk: 'medium' },
  'ghl_create_contact':              { level: 1, category: 'data_creation', risk: 'medium' },
  'ghl_update_contact':              { level: 1, category: 'data_modification', risk: 'medium' },
  'ghl_create_appointment':          { level: 1, category: 'scheduling', risk: 'medium' },
  'ghl_add_contact_to_workflow':     { level: 1, category: 'workflow', risk: 'medium' },
  'ghl_remove_contact_from_workflow':{ level: 1, category: 'workflow', risk: 'medium' },
  'ghl_create_task':                 { level: 1, category: 'data_creation', risk: 'medium' },
  'ghl_update_task':                 { level: 1, category: 'data_modification', risk: 'medium' },
  'ghl_create_note':                 { level: 1, category: 'data_creation', risk: 'medium' },
  'ghl_add_contact_tag':             { level: 1, category: 'data_modification', risk: 'medium' },
  'ghl_add_contact_tags':            { level: 1, category: 'data_modification', risk: 'medium' },
  'ghl_remove_contact_tag':          { level: 1, category: 'data_modification', risk: 'medium' },
  'ghl_remove_contact_tags':         { level: 1, category: 'data_modification', risk: 'medium' },
  'ghl_update_contact_custom_field': { level: 1, category: 'data_modification', risk: 'medium' },
  'ghl_create_invoice':              { level: 1, category: 'data_creation', risk: 'medium' },
  'ghl_send_invoice':                { level: 1, category: 'communication', risk: 'medium' },
  'ghl_upload_media':                { level: 1, category: 'data_creation', risk: 'low' },
  'ghl_create_email_template':       { level: 1, category: 'data_creation', risk: 'low' },
  'ghl_create_social_post':          { level: 1, category: 'communication', risk: 'medium' },
  'ghl_create_blog_post':            { level: 1, category: 'data_creation', risk: 'low' },
  'ghl_update_blog_post':            { level: 1, category: 'data_modification', risk: 'low' },
  'ghl_send_document':               { level: 1, category: 'communication', risk: 'medium' },
  'ghl_create_trigger_link':         { level: 1, category: 'data_creation', risk: 'low' },
  'ghl_create_product':              { level: 1, category: 'data_creation', risk: 'medium' },
  'notify_owner':                    { level: 0, category: 'communication', risk: 'low' },

  // ── GMAIL TOOLS ────────────────────────────────────────────────────────────
  'gmail_check_inbox':   { level: 1, category: 'read', risk: 'low' },
  'gmail_read_message':  { level: 1, category: 'read', risk: 'low' },
  'gmail_send_email':    { level: 1, category: 'communication', risk: 'medium' },

  // ── WEB SEARCH & FETCH ─────────────────────────────────────────────────────
  'web_search':          { level: 1, category: 'read', risk: 'low' },
  'web_fetch':           { level: 1, category: 'read', risk: 'low' },

  // ── SCRAPER TOOLS ──────────────────────────────────────────────────────────
  'scraper_scrape_url':  { level: 1, category: 'read', risk: 'low' },
  'scrape_url':          { level: 1, category: 'read', risk: 'low' },
  'scrape_website':      { level: 1, category: 'read', risk: 'low' },
  'scrape_structured':   { level: 1, category: 'read', risk: 'low' },

  // ── BROWSER TOOLS ──────────────────────────────────────────────────────────
  'browser_task':        { level: 1, category: 'read', risk: 'medium' },
  'browser_screenshot':  { level: 1, category: 'read', risk: 'low' },
  'browser_navigate':    { level: 1, category: 'read', risk: 'low' },
  'browser_click':       { level: 1, category: 'data_modification', risk: 'medium' },
  'browser_type':        { level: 1, category: 'data_modification', risk: 'medium' },

  // ── IMAGE TOOLS ────────────────────────────────────────────────────────────
  'image_generate':      { level: 1, category: 'data_creation', risk: 'low' },
  'image_resize':        { level: 1, category: 'data_creation', risk: 'low' },
  'image_edit':          { level: 1, category: 'data_creation', risk: 'low' },
  'swap_image_in_artifact': { level: 1, category: 'data_modification', risk: 'low' },

  // ── BLOOM INTERNAL TOOLS ───────────────────────────────────────────────────
  'bloom_todo_write':           { level: 1, category: 'planning', risk: 'low' },
  'bloom_log':                  { level: 1, category: 'logging', risk: 'low' },
  'bloom_log_decision':         { level: 1, category: 'logging', risk: 'low' },
  'bloom_log_observation':      { level: 1, category: 'logging', risk: 'low' },
  'bloom_list_tasks':           { level: 1, category: 'read', risk: 'low' },
  'bloom_retrieve_context':     { level: 1, category: 'read', risk: 'low' },
  'bloom_analyze_patterns':     { level: 1, category: 'read', risk: 'low' },
  'bloom_generate_summary':     { level: 1, category: 'read', risk: 'low' },
  'bloom_create_task':          { level: 1, category: 'planning', risk: 'low' },
  'bloom_update_task':          { level: 1, category: 'planning', risk: 'low' },
  'bloom_store_context':        { level: 1, category: 'data_creation', risk: 'low' },
  'bloom_escalate_issue':       { level: 1, category: 'escalation', risk: 'medium' },
  'bloom_clarify':              { level: 1, category: 'communication', risk: 'low' },
  'bloom_schedule_task':        { level: 1, category: 'planning', risk: 'low' },
  'bloom_list_scheduled_tasks': { level: 1, category: 'read', risk: 'low' },
  'bloom_update_scheduled_task':{ level: 1, category: 'planning', risk: 'low' },
  'bloom_delete_scheduled_task':{ level: 1, category: 'data_deletion', risk: 'medium' },
  'bloom_take_screenshot':      { level: 1, category: 'read', risk: 'low' },
  'bloom_click':                { level: 1, category: 'data_modification', risk: 'medium' },
  'bloom_double_click':         { level: 1, category: 'data_modification', risk: 'medium' },
  'bloom_type_text':            { level: 1, category: 'data_modification', risk: 'medium' },
  'bloom_key_press':            { level: 1, category: 'data_modification', risk: 'low' },
  'bloom_scroll':               { level: 1, category: 'read', risk: 'low' },
  'bloom_move_mouse':           { level: 1, category: 'read', risk: 'low' },
  'create_task':                { level: 1, category: 'planning', risk: 'low' },
  'log_decision':               { level: 1, category: 'logging', risk: 'low' },

  // ── MODEL / DISPATCH TOOLS ─────────────────────────────────────────────────
  'dispatch_to_specialist':     { level: 1, category: 'planning', risk: 'low' },
  'switch_model':               { level: 1, category: 'planning', risk: 'low' },
  'get_model_status':           { level: 1, category: 'read', risk: 'low' },

  // ── LEVEL 2 (Partner) - Pipeline/sales autonomy ───────────────────────────
  'ghl_create_opportunity':       { level: 2, category: 'sales', risk: 'high' },
  'ghl_update_opportunity':       { level: 2, category: 'sales', risk: 'high' },
  'ghl_update_opportunity_stage': { level: 2, category: 'sales', risk: 'high' },

  // ── LEVEL 3+ - Destructive / admin operations ─────────────────────────────
  'ghl_delete_contact':    { level: 3, category: 'data_deletion', risk: 'high' },
  'system_configuration':  { level: 4, category: 'administration', risk: 'critical' },
  'financial_transactions':{ level: 4, category: 'financial', risk: 'critical' }
};

// Risk-based daily action limits by level
const DAILY_ACTION_LIMITS = {
  1: { // Assistant - full working Bloomie
    communication: 100,
    data_modification: 100,
    data_creation: 100,
    data_deletion: 0,      // No deletion at Level 1
    total: 500
  },
  2: { // Partner - full pipeline autonomy
    communication: 300,
    data_modification: 300,
    data_creation: 300,
    data_deletion: 0,
    total: 1500
  },
  3: { // Operator
    communication: 500,
    data_modification: 500,
    data_creation: 500,
    data_deletion: 10,
    total: 5000
  },
  4: { // Admin
    communication: 9999,
    data_modification: 9999,
    data_creation: 9999,
    data_deletion: 9999,
    total: 9999
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
        // Unknown tool — allow known-safe prefixes at Level 1, block truly unknown tools
        const safePrefixes = ['bloom_', 'ghl_', 'gmail_', 'web_', 'scrape_', 'browser_', 'image_'];
        const isSafePrefix = safePrefixes.some(p => actionName.startsWith(p));
        if (isSafePrefix) {
          logger.warn(`Tool "${actionName}" not in permission matrix but has safe prefix — allowing at Level 1`, { agentId });
          const cat = actionName.startsWith('gmail_send') || actionName.startsWith('ghl_send') ? 'communication' : 'read';
          await this.recordAuthorizedAction(agentId, currentLevel, cat);
          return {
            authorized: true,
            level: currentLevel,
            category: cat,
            risk: 'medium',
            silent: true
          };
        }

        // Truly unknown action — block
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

      // Level 1 Observer behavior: Execute reads immediately, ask permission for writes
      if (currentLevel < actionPermission.level) {
        // Level 1 can do everything - she just needs confirmation for write operations
        if (actionPermission.category === 'read' ||
            actionPermission.category === 'logging' ||
            actionPermission.category === 'planning') {
          // Execute read/logging operations immediately - no confirmation needed
          await this.recordAuthorizedAction(agentId, currentLevel, actionPermission.category);
          return {
            authorized: true,
            level: currentLevel,
            category: actionPermission.category,
            risk: actionPermission.risk,
            silent: true // No user notification needed
          };
        } else {
          // Write operations need user confirmation - pause for approval (employee behavior)
          const confirmation = {
            authorized: false,
            needs_confirmation: true,
            action: actionName,
            parameters: parameters,
            level: currentLevel,
            category: actionPermission.category,
            risk: actionPermission.risk,
            confirmation_message: this.buildConfirmationMessage(actionName, parameters),
            employee_tone: true // Flag to use employee language, not system errors
          };

          logger.info('Action requires user confirmation (Level 1 employee behavior)', {
            action: actionName,
            level: currentLevel,
            category: actionPermission.category
          });

          return confirmation;
        }
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
   * Build employee-style confirmation message (not system error message)
   */
  buildConfirmationMessage(actionName, parameters) {
    const actionDescriptions = {
      'ghl_create_contact': `create a new contact for ${parameters.firstName || 'the person'}`,
      'ghl_update_contact': `update the contact information`,
      'ghl_send_message': `send a message to the contact`,
      'notify_owner': `notify the business owner via SMS or email`,
      'ghl_create_opportunity': `create a new opportunity: ${parameters.title || 'untitled opportunity'}`,
      'ghl_update_opportunity_stage': `move the opportunity to the next stage`,
      'ghl_create_appointment': `schedule an appointment`,
      'ghl_create_task': `create a new task`,
      'ghl_update_task': `update the task status`,
      'ghl_add_contact_tag': `add tags to the contact`,
      'ghl_remove_contact_tag': `remove tags from the contact`,
      'bloom_create_task': `create a planning task`,
      'bloom_update_task': `update the task progress`,
      'bloom_escalate_issue': `escalate this to you for review`
    };

    const actionDesc = actionDescriptions[actionName] ||
      actionName.replace('ghl_', '').replace('bloom_', '').replace('_', ' ');

    // Employee asking manager for approval - not system denial
    return `I'd like to ${actionDesc}. Should I go ahead?`;
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