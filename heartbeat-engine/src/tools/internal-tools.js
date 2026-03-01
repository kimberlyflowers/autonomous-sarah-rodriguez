// Internal Tools for Sarah's Autonomous Operations
// Planning, memory management, logging, and workflow tools

import { createLogger } from '../logging/logger.js';
import { logAction, logRejection, logHandoff } from '../logging/index.js';

const logger = createLogger('internal-tools');

// Get database pool
async function getPool() {
  const { createPool } = await import('../../database/setup.js');
  return createPool();
}

/**
 * Internal tool definitions for autonomous operations
 */
export const internalToolDefinitions = {
  // PLANNING TOOLS
  bloom_create_task: {
    name: "bloom_create_task",
    description: "Create a new task in Sarah's planning system for tracking work",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title (brief, actionable)" },
        description: { type: "string", description: "Detailed task description with context" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Task priority level" },
        category: { type: "string", enum: ["ghl_ops", "communication", "analysis", "follow_up", "escalation"], description: "Task category" },
        dueDate: { type: "string", description: "Due date (ISO format) - optional" },
        relatedContactId: { type: "string", description: "Related GHL contact ID if applicable" },
        relatedOpportunityId: { type: "string", description: "Related GHL opportunity ID if applicable" }
      },
      required: ["title", "description", "priority", "category"]
    },
    category: "planning",
    operation: "write"
  },

  bloom_list_tasks: {
    name: "bloom_list_tasks",
    description: "List Sarah's current tasks with filtering options",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "in_progress", "completed", "blocked"], description: "Filter by task status" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Filter by priority" },
        category: { type: "string", enum: ["ghl_ops", "communication", "analysis", "follow_up", "escalation"], description: "Filter by category" },
        limit: { type: "number", description: "Maximum number of tasks to return", default: 20 },
        includeDue: { type: "boolean", description: "Include only tasks with due dates", default: false }
      }
    },
    category: "planning",
    operation: "read"
  },

  bloom_update_task: {
    name: "bloom_update_task",
    description: "Update a task's status, priority, or add progress notes",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to update" },
        status: { type: "string", enum: ["pending", "in_progress", "completed", "blocked"], description: "New status" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Updated priority" },
        progressNote: { type: "string", description: "Progress note or completion summary" },
        completionDetails: { type: "string", description: "Details of what was accomplished (if completed)" }
      },
      required: ["taskId"]
    },
    category: "planning",
    operation: "write"
  },

  // LOGGING TOOLS
  bloom_log_decision: {
    name: "bloom_log_decision",
    description: "Log an important decision with reasoning for transparency and trust building",
    parameters: {
      type: "object",
      properties: {
        decision: { type: "string", description: "The decision made" },
        reasoning: { type: "string", description: "Detailed reasoning behind the decision" },
        confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence level in the decision (0-1)" },
        category: { type: "string", enum: ["action_taken", "action_rejected", "escalation", "analysis"], description: "Decision category" },
        impactLevel: { type: "string", enum: ["low", "medium", "high"], description: "Expected impact of decision" },
        relatedData: { type: "object", description: "Related data context (contact IDs, opportunity IDs, etc.)" }
      },
      required: ["decision", "reasoning", "confidence", "category"]
    },
    category: "logging",
    operation: "write"
  },

  bloom_log_observation: {
    name: "bloom_log_observation",
    description: "Log important observations from data analysis or system monitoring",
    parameters: {
      type: "object",
      properties: {
        observation: { type: "string", description: "What was observed" },
        context: { type: "string", description: "Context or source of the observation" },
        significance: { type: "string", enum: ["low", "medium", "high"], description: "Significance level" },
        actionRecommended: { type: "string", description: "Recommended action based on observation" },
        dataPoints: { type: "object", description: "Supporting data points or metrics" }
      },
      required: ["observation", "context", "significance"]
    },
    category: "logging",
    operation: "write"
  },

  // MEMORY TOOLS
  bloom_store_context: {
    name: "bloom_store_context",
    description: "Store important context or insights for future reference",
    parameters: {
      type: "object",
      properties: {
        contextType: { type: "string", enum: ["client_preference", "workflow_pattern", "system_insight", "relationship_note"], description: "Type of context" },
        title: { type: "string", description: "Brief title for the context" },
        content: { type: "string", description: "Detailed context content" },
        relatedEntities: { type: "array", items: { type: "string" }, description: "Related contact/opportunity/user IDs" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for easy retrieval" },
        expiresAt: { type: "string", description: "Optional expiration date (ISO format)" }
      },
      required: ["contextType", "title", "content"]
    },
    category: "memory",
    operation: "write"
  },

  bloom_retrieve_context: {
    name: "bloom_retrieve_context",
    description: "Retrieve stored context by type, tags, or related entities",
    parameters: {
      type: "object",
      properties: {
        contextType: { type: "string", enum: ["client_preference", "workflow_pattern", "system_insight", "relationship_note"], description: "Filter by context type" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
        relatedEntity: { type: "string", description: "Find context related to specific entity ID" },
        searchTerm: { type: "string", description: "Search in title and content" },
        limit: { type: "number", description: "Maximum results to return", default: 10 }
      }
    },
    category: "memory",
    operation: "read"
  },

  // ESCALATION TOOLS
  bloom_escalate_issue: {
    name: "bloom_escalate_issue",
    description: "Escalate an issue to human oversight with detailed analysis",
    parameters: {
      type: "object",
      properties: {
        issue: { type: "string", description: "Clear description of the issue" },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Issue severity" },
        category: { type: "string", enum: ["technical", "client_relationship", "data_integrity", "process_failure"], description: "Issue category" },
        analysis: { type: "string", description: "Your analysis of the situation" },
        attemptedActions: { type: "array", items: { type: "string" }, description: "Actions already attempted" },
        recommendation: { type: "string", description: "Recommended resolution approach" },
        relatedData: { type: "object", description: "Relevant data context" },
        timeframe: { type: "string", description: "Suggested response timeframe" }
      },
      required: ["issue", "severity", "category", "analysis"]
    },
    category: "escalation",
    operation: "write"
  },

  // ANALYSIS TOOLS
  bloom_analyze_patterns: {
    name: "bloom_analyze_patterns",
    description: "Analyze patterns in GHL data or system behavior",
    parameters: {
      type: "object",
      properties: {
        analysisType: { type: "string", enum: ["contact_behavior", "opportunity_trends", "communication_effectiveness", "workflow_performance"], description: "Type of analysis" },
        timeframe: { type: "string", enum: ["1d", "7d", "30d", "90d"], description: "Analysis timeframe" },
        filters: { type: "object", description: "Additional filters for the analysis" },
        includeRecommendations: { type: "boolean", description: "Include actionable recommendations", default: true }
      },
      required: ["analysisType", "timeframe"]
    },
    category: "analysis",
    operation: "read"
  },

  bloom_generate_summary: {
    name: "bloom_generate_summary",
    description: "Generate summary reports of work completed or system status",
    parameters: {
      type: "object",
      properties: {
        summaryType: { type: "string", enum: ["daily_work", "weekly_performance", "contact_status", "opportunity_pipeline"], description: "Type of summary" },
        timeframe: { type: "string", enum: ["today", "yesterday", "this_week", "last_week", "this_month"], description: "Summary timeframe" },
        includeMetrics: { type: "boolean", description: "Include performance metrics", default: true },
        includeRecommendations: { type: "boolean", description: "Include recommendations", default: true },
        format: { type: "string", enum: ["detailed", "brief", "executive"], description: "Summary format" }
      },
      required: ["summaryType", "timeframe"]
    },
    category: "analysis",
    operation: "read"
  }
};

/**
 * Internal tool executors
 */
export const internalToolExecutors = {
  // PLANNING TOOLS
  bloom_create_task: async (params) => {
    try {
      const pool = await getPool();

      const result = await pool.query(`
        INSERT INTO bloom_tasks (
          agent_id, title, description, priority, category, status,
          due_date, related_contact_id, related_opportunity_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, NOW())
        RETURNING id, title, priority, category, status, created_at
      `, [
        'bloomie-sarah-rodriguez',
        params.title,
        params.description,
        params.priority,
        params.category,
        params.dueDate ? new Date(params.dueDate) : null,
        params.relatedContactId || null,
        params.relatedOpportunityId || null
      ]);

      await pool.end();

      const task = result.rows[0];
      logger.info('Task created', { taskId: task.id, title: task.title });

      return {
        success: true,
        taskId: task.id,
        task: task,
        message: `Task created: ${task.title}`
      };

    } catch (error) {
      logger.error('Failed to create task:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  bloom_list_tasks: async (params) => {
    try {
      const pool = await getPool();

      let query = `
        SELECT id, title, description, priority, category, status,
               due_date, related_contact_id, related_opportunity_id,
               created_at, updated_at
        FROM bloom_tasks
        WHERE agent_id = $1
      `;
      const queryParams = ['bloomie-sarah-rodriguez'];
      let paramIndex = 2;

      // Add filters
      if (params.status) {
        query += ` AND status = $${paramIndex}`;
        queryParams.push(params.status);
        paramIndex++;
      }

      if (params.priority) {
        query += ` AND priority = $${paramIndex}`;
        queryParams.push(params.priority);
        paramIndex++;
      }

      if (params.category) {
        query += ` AND category = $${paramIndex}`;
        queryParams.push(params.category);
        paramIndex++;
      }

      if (params.includeDue) {
        query += ` AND due_date IS NOT NULL`;
      }

      query += ` ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        created_at DESC
        LIMIT $${paramIndex}`;
      queryParams.push(params.limit || 20);

      const result = await pool.query(query, queryParams);
      await pool.end();

      return {
        success: true,
        tasks: result.rows,
        count: result.rows.length
      };

    } catch (error) {
      logger.error('Failed to list tasks:', error);
      return {
        success: false,
        error: error.message,
        tasks: []
      };
    }
  },

  bloom_update_task: async (params) => {
    try {
      const pool = await getPool();

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (params.status) {
        updates.push(`status = $${paramIndex}`);
        values.push(params.status);
        paramIndex++;
      }

      if (params.priority) {
        updates.push(`priority = $${paramIndex}`);
        values.push(params.priority);
        paramIndex++;
      }

      if (params.progressNote) {
        updates.push(`progress_notes = COALESCE(progress_notes, '') || $${paramIndex}`);
        values.push(`\n${new Date().toISOString()}: ${params.progressNote}`);
        paramIndex++;
      }

      if (params.completionDetails) {
        updates.push(`completion_details = $${paramIndex}`);
        values.push(params.completionDetails);
        paramIndex++;
      }

      updates.push(`updated_at = NOW()`);
      values.push(params.taskId);

      const query = `
        UPDATE bloom_tasks
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND agent_id = 'bloomie-sarah-rodriguez'
        RETURNING id, title, status, priority, updated_at
      `;

      const result = await pool.query(query, values);
      await pool.end();

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Task not found'
        };
      }

      const task = result.rows[0];
      logger.info('Task updated', { taskId: task.id, status: task.status });

      return {
        success: true,
        task: task,
        message: `Task updated: ${task.title}`
      };

    } catch (error) {
      logger.error('Failed to update task:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // LOGGING TOOLS
  bloom_log_decision: async (params) => {
    try {
      const pool = await getPool();

      const result = await pool.query(`
        INSERT INTO bloom_decisions (
          agent_id, decision, reasoning, confidence, category,
          impact_level, related_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, decision, category, confidence
      `, [
        'bloomie-sarah-rodriguez',
        params.decision,
        params.reasoning,
        params.confidence,
        params.category,
        params.impactLevel || 'medium',
        params.relatedData ? JSON.stringify(params.relatedData) : null
      ]);

      await pool.end();

      const decision = result.rows[0];
      logger.info('Decision logged', {
        decisionId: decision.id,
        category: decision.category,
        confidence: decision.confidence
      });

      return {
        success: true,
        decisionId: decision.id,
        message: `Decision logged: ${params.decision}`
      };

    } catch (error) {
      logger.error('Failed to log decision:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  bloom_log_observation: async (params) => {
    try {
      const pool = await getPool();

      const result = await pool.query(`
        INSERT INTO bloom_observations (
          agent_id, observation, context, significance,
          action_recommended, data_points, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, observation, significance
      `, [
        'bloomie-sarah-rodriguez',
        params.observation,
        params.context,
        params.significance,
        params.actionRecommended || null,
        params.dataPoints ? JSON.stringify(params.dataPoints) : null
      ]);

      await pool.end();

      const observation = result.rows[0];
      logger.info('Observation logged', {
        observationId: observation.id,
        significance: observation.significance
      });

      return {
        success: true,
        observationId: observation.id,
        message: `Observation logged: ${params.observation.substring(0, 50)}...`
      };

    } catch (error) {
      logger.error('Failed to log observation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // MEMORY TOOLS
  bloom_store_context: async (params) => {
    try {
      const pool = await getPool();

      const result = await pool.query(`
        INSERT INTO bloom_context (
          agent_id, context_type, title, content, related_entities,
          tags, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, title, context_type
      `, [
        'bloomie-sarah-rodriguez',
        params.contextType,
        params.title,
        params.content,
        params.relatedEntities ? JSON.stringify(params.relatedEntities) : null,
        params.tags ? JSON.stringify(params.tags) : null,
        params.expiresAt ? new Date(params.expiresAt) : null
      ]);

      await pool.end();

      const context = result.rows[0];
      logger.info('Context stored', {
        contextId: context.id,
        type: context.context_type
      });

      return {
        success: true,
        contextId: context.id,
        message: `Context stored: ${context.title}`
      };

    } catch (error) {
      logger.error('Failed to store context:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  bloom_retrieve_context: async (params) => {
    try {
      const pool = await getPool();

      let query = `
        SELECT id, context_type, title, content, related_entities,
               tags, created_at, expires_at
        FROM bloom_context
        WHERE agent_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
      `;
      const queryParams = ['bloomie-sarah-rodriguez'];
      let paramIndex = 2;

      // Add filters
      if (params.contextType) {
        query += ` AND context_type = $${paramIndex}`;
        queryParams.push(params.contextType);
        paramIndex++;
      }

      if (params.relatedEntity) {
        query += ` AND related_entities @> $${paramIndex}`;
        queryParams.push(JSON.stringify([params.relatedEntity]));
        paramIndex++;
      }

      if (params.searchTerm) {
        query += ` AND (title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`;
        queryParams.push(`%${params.searchTerm}%`);
        paramIndex++;
      }

      if (params.tags && params.tags.length > 0) {
        query += ` AND tags @> $${paramIndex}`;
        queryParams.push(JSON.stringify(params.tags));
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
      queryParams.push(params.limit || 10);

      const result = await pool.query(query, queryParams);
      await pool.end();

      return {
        success: true,
        contexts: result.rows.map(row => ({
          ...row,
          related_entities: row.related_entities ? JSON.parse(row.related_entities) : [],
          tags: row.tags ? JSON.parse(row.tags) : []
        })),
        count: result.rows.length
      };

    } catch (error) {
      logger.error('Failed to retrieve context:', error);
      return {
        success: false,
        error: error.message,
        contexts: []
      };
    }
  },

  // ESCALATION TOOLS
  bloom_escalate_issue: async (params) => {
    try {
      // Use existing handoff logging system
      const escalation = {
        issue: params.issue,
        analysis: params.analysis,
        recommendation: params.recommendation,
        urgency: params.severity,
        category: params.category,
        attemptedActions: params.attemptedActions,
        relatedData: params.relatedData,
        timeframe: params.timeframe
      };

      await logHandoff('internal-tool', escalation);

      logger.warn('Issue escalated', {
        severity: params.severity,
        category: params.category,
        issue: params.issue.substring(0, 100)
      });

      return {
        success: true,
        escalationId: `esc-${Date.now()}`,
        message: `Issue escalated: ${params.issue.substring(0, 50)}...`,
        severity: params.severity
      };

    } catch (error) {
      logger.error('Failed to escalate issue:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // ANALYSIS TOOLS (simplified implementations)
  bloom_analyze_patterns: async (params) => {
    // This would integrate with actual GHL data analysis
    // For now, return a structured response
    return {
      success: true,
      analysisType: params.analysisType,
      timeframe: params.timeframe,
      message: `Pattern analysis initiated for ${params.analysisType} over ${params.timeframe}`,
      placeholder: true,
      recommendation: "Implement detailed data analysis logic based on GHL API data"
    };
  },

  bloom_generate_summary: async (params) => {
    // This would generate actual summaries from data
    // For now, return a structured response
    return {
      success: true,
      summaryType: params.summaryType,
      timeframe: params.timeframe,
      message: `Summary generated for ${params.summaryType} - ${params.timeframe}`,
      placeholder: true,
      recommendation: "Implement summary generation from actual operational data"
    };
  }
};

/**
 * Execute internal tool by name
 */
export async function executeInternalTool(toolName, parameters) {
  const startTime = Date.now();
  logger.info(`Executing internal tool: ${toolName}`, parameters);

  if (!internalToolExecutors[toolName]) {
    throw new Error(`Unknown internal tool: ${toolName}`);
  }

  try {
    const result = await internalToolExecutors[toolName](parameters);
    const duration = Date.now() - startTime;

    logger.info(`Internal tool completed: ${toolName} (${duration}ms)`);

    return {
      ...result,
      executionTime: duration,
      tool: toolName
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Internal tool failed: ${toolName} (${duration}ms)`, error.message);

    return {
      success: false,
      error: error.message,
      executionTime: duration,
      tool: toolName
    };
  }
}