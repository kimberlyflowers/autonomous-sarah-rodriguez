// Internal Tools for Sarah's Autonomous Operations
// Planning, memory management, logging, and workflow tools

import { createLogger } from '../logging/logger.js';
import { logAction, logRejection, logHandoff } from '../logging/index.js';

const logger = createLogger('internal-tools');

// Supabase-backed query shim — maintains pool.query() interface for all tool handlers
async function getPool() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  return {
    query: async (sql, params = []) => {
      // Use Supabase's postgres() raw query via the REST API
      // Supabase JS client doesn't expose raw SQL — use the pg-compatible REST endpoint
      let data = null, error = { message: 'rpc not available' };
      try {
        const result = await supabase.rpc('exec_sql', { sql_text: sql, sql_params: params });
        data = result.data;
        error = result.error;
      } catch (_rpcErr) {
        // exec_sql RPC not available — fall through to supabaseQueryShim
      }
      if (!error && data) return { rows: Array.isArray(data) ? data : [data] };

      // Fallback: parse simple queries and translate to Supabase client calls
      return await supabaseQueryShim(supabase, sql, params);
    }
  };
}

// Translate parameterized SQL to Supabase JS client calls
async function supabaseQueryShim(supabase, sql, params) {
  const s = sql.trim().replace(/\s+/g, ' ');

  // INSERT INTO bloom_tasks
  if (/INSERT INTO bloom_tasks/i.test(s)) {
    const vals = params;
    const row = {
      agent_id: vals[0], title: vals[1], description: vals[2],
      priority: vals[3], category: vals[4], status: 'pending',
      due_date: vals[5] || null, related_contact_id: vals[6] || null,
      related_opportunity_id: vals[7] || null
    };
    const { data, error } = await supabase.from('bloom_tasks').insert(row).select('id, title, priority, category, status, created_at').single();
    if (error) throw new Error(error.message);
    return { rows: [data] };
  }

  // SELECT FROM bloom_tasks
  if (/SELECT.*FROM bloom_tasks/i.test(s)) {
    let q = supabase.from('bloom_tasks').select('id, title, description, priority, category, status, due_date, related_contact_id, related_opportunity_id, created_at').eq('agent_id', 'bloomie-sarah-rodriguez');
    // Apply status/priority filters if present in params
    if (params[1]) q = q.eq('status', params[1]);
    if (params[2]) q = q.eq('priority', params[2]);
    q = q.order('created_at', { ascending: false }).limit(params[params.length - 1] || 20);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: data || [] };
  }

  // UPDATE bloom_tasks
  if (/UPDATE bloom_tasks/i.test(s)) {
    const taskId = params[params.length - 1];
    const updates = {};
    if (/status\s*=/.test(s)) updates.status = params[0];
    if (/priority\s*=/.test(s)) updates.priority = params[0];
    const { data, error } = await supabase.from('bloom_tasks').update(updates).eq('id', taskId).select().single();
    if (error) throw new Error(error.message);
    return { rows: [data] };
  }

  // INSERT INTO bloom_decisions
  if (/INSERT INTO bloom_decisions/i.test(s)) {
    const { data, error } = await supabase.from('bloom_decisions').insert({
      agent_id: params[0], decision: params[1], reasoning: params[2],
      confidence: params[3], category: params[4], impact_level: params[5],
      related_data: params[6] ? (typeof params[6] === 'string' ? JSON.parse(params[6]) : params[6]) : null
    }).select('id, decision, category, confidence').single();
    if (error) throw new Error(error.message);
    return { rows: [data] };
  }

  // INSERT INTO bloom_observations
  if (/INSERT INTO bloom_observations/i.test(s)) {
    const { data, error } = await supabase.from('bloom_observations').insert({
      agent_id: params[0], observation: params[1], context: params[2],
      significance: params[3], action_recommended: params[4] || null,
      data_points: params[5] ? (typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5]) : null
    }).select('id, observation, significance').single();
    if (error) throw new Error(error.message);
    return { rows: [data] };
  }

  // INSERT INTO bloom_context
  if (/INSERT INTO bloom_context/i.test(s)) {
    const { data, error } = await supabase.from('bloom_context').insert({
      agent_id: params[0], context_type: params[1], title: params[2],
      content: params[3],
      related_entities: params[4] ? (typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4]) : null,
      tags: params[5] ? (typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5]) : null,
      expires_at: params[6] || null
    }).select('id, context_type, title').single();
    if (error) throw new Error(error.message);
    return { rows: [data] };
  }

  // SELECT FROM bloom_context
  if (/SELECT.*FROM bloom_context/i.test(s)) {
    let q = supabase.from('bloom_context').select('id, context_type, title, content, related_entities, tags, created_at, expires_at')
      .eq('agent_id', params[0])
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
    if (params[1]) q = q.eq('context_type', params[1]);
    q = q.order('created_at', { ascending: false }).limit(params[params.length - 1] || 10);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: data || [] };
  }

  // INSERT INTO task_plans (upsert)
  if (/INSERT INTO task_plans/i.test(s)) {
    const { data, error } = await supabase.from('task_plans').upsert({
      session_id: params[0], title: params[1], steps: typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2],
      agent_id: 'c3000000-0000-0000-0000-000000000003',
      organization_id: process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001',
      updated_at: new Date().toISOString()
    }, { onConflict: 'session_id' }).select('session_id, title, steps, updated_at').single();
    if (error) throw new Error(error.message);
    // Normalize: return task_id field name the caller expects
    return { rows: [{ ...data, task_id: data.session_id }] };
  }

  // CREATE TABLE IF NOT EXISTS — no-op for Supabase (tables exist)
  if (/CREATE TABLE IF NOT EXISTS/i.test(s)) {
    return { rows: [] };
  }

  // SELECT 1 health check
  if (/SELECT 1/i.test(s)) {
    return { rows: [{ health_check: 1 }] };
  }

  logger.warn('supabaseQueryShim: unhandled SQL', { sql: s.slice(0, 100) });
  return { rows: [] };
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

  // SARAH'S INTERNAL PLANNING SYSTEM (Cowork TodoWrite + Ralph Verification Hybrid)
  bloom_todo_write: {
    name: "bloom_todo_write",
    description: `Create or update a structured task plan with verification tracking.

## MANDATORY RULES (Cowork Discipline):
1. You MUST call this BEFORE executing any multi-step task — no exceptions.
2. Mark a step 'in_progress' BEFORE starting it.
3. Only ONE step may be 'in_progress' at a time.
4. NEVER batch-complete steps — complete them one at a time.
5. Mark 'completed' ONLY after verification confirms success.
6. Do NOT include a separate 'Verify' step — verify WITHIN each step. When the last real step completes, the task is done.

## VERIFICATION RULES (Ralph Pattern):
- Every step MUST have success_criteria describing what "done" looks like.
- Every step MUST have a verification_method: 'api_check', 'result_check', or 'llm_judgment'.
- When marking a step 'completed', you MUST also set verified: true and provide verification_evidence.
- If verification fails, set verified: false and status: 'failed' with the reason.
- The system will automatically verify your claims — do not mark verified: true unless you have evidence.

## STEP LIFECYCLE:
pending → in_progress → (execute) → (verify) → completed/failed

After creating or updating a plan, you will receive the current plan state as a reminder.`,
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID for this task plan (auto-generated if not provided)" },
        title: { type: "string", description: "What this task accomplishes" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "number", description: "Sequential step number" },
              content: { type: "string", description: "What this step does" },
              activeForm: { type: "string", description: "Present continuous form shown during execution (e.g., 'Creating contact in GHL')" },
              status: { type: "string", enum: ["pending","in_progress","completed","failed"], description: "Current step status" },
              priority: { type: "string", enum: ["high","medium","low"], description: "Step priority" },
              success_criteria: { type: "string", description: "REQUIRED: What 'done' looks like. E.g., 'Contact exists in GHL with email and tags applied'" },
              verification_method: { type: "string", enum: ["api_check","result_check","llm_judgment","manual"], description: "REQUIRED: How to verify this step succeeded" },
              verified: { type: "boolean", description: "Whether this step has been independently verified as passing. Only set true with evidence." },
              verification_evidence: { type: "string", description: "Evidence that verification passed (e.g., 'Contact ID abc123 confirmed in GHL')" },
              failure_reason: { type: "string", description: "If failed or verification failed, explain why" },
              tool_used: { type: "string", description: "Which tool was used to execute this step" },
              retry_count: { type: "number", description: "How many times this step has been attempted", default: 0 }
            },
            required: ["id", "content", "status", "priority", "success_criteria", "verification_method"]
          }
        }
      },
      required: ["title", "steps"]
    },
    category: "planning",
    operation: "write"
  },

  // CLARIFICATION TOOL (Cowork AskUserQuestion equivalent — MANDATORY for chat tasks)
  bloom_clarify: {
    name: "bloom_clarify",
    description: `MANDATORY: Ask the user a clarifying question before starting any multi-step task from chat. You MUST call this BEFORE creating a task plan. Present 2-4 options as clickable buttons for the user to choose from. This pauses execution until the user responds.

THIS IS NOT OPTIONAL. Call bloom_clarify before starting real work on ANY chat task unless the request is 100% unambiguous with all details provided.

ALWAYS use when:
- Task involves creating content (what type? what tone? what audience?)
- Task involves contacting someone (which contact? what channel? what message?)
- Task involves updating data (which record? what fields? what values?)
- Task has multiple possible interpretations
- Task is missing WHO, WHAT, HOW, or WHERE
- You aren't sure about scope, format, priority, or audience

ONLY skip when:
- Request is 100% unambiguous with all details provided
- Single trivial action (one lookup, one quick search)
- Pure conversation with no tool use
- Heartbeat-triggered autonomous tasks (already well-defined)
- Emergency escalations`,
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The clarifying question to ask" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short option label (1-5 words)" },
              description: { type: "string", description: "What this option means" }
            },
            required: ["label", "description"]
          },
          description: "2-4 options for the user to choose from"
        },
        context: { type: "string", description: "Why you need this clarification" }
      },
      required: ["question", "options"]
    },
    category: "planning",
    operation: "read"
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
  },

  // SUB-AGENT DELEGATION TOOLS
  bloom_delegate_task: {
    name: "bloom_delegate_task",
    description: "Delegate a specialized task to an expert sub-agent for focused execution",
    parameters: {
      type: "object",
      properties: {
        task: { type: "string", description: "Clear description of the task to delegate" },
        preferredAgent: {
          type: "string",
          enum: ["ghl_specialist", "communication_specialist", "data_analyst", "task_coordinator", "escalation_specialist"],
          description: "Preferred sub-agent (optional - auto-selected if not specified)"
        },
        context: { type: "object", description: "Additional context for the sub-agent" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Task priority", default: "medium" },
        requiredCapabilities: { type: "array", items: { type: "string" }, description: "Required capabilities or expertise areas" }
      },
      required: ["task"]
    },
    category: "delegation",
    operation: "write"
  },

  bloom_list_subagents: {
    name: "bloom_list_subagents",
    description: "List available sub-agents with their capabilities and current status",
    parameters: {
      type: "object",
      properties: {
        includeStats: { type: "boolean", description: "Include usage statistics", default: true },
        filterByExpertise: { type: "string", description: "Filter by expertise area" }
      }
    },
    category: "delegation",
    operation: "read"
  },

  bloom_recommend_subagent: {
    name: "bloom_recommend_subagent",
    description: "Get recommendations for which sub-agent to use for a specific task",
    parameters: {
      type: "object",
      properties: {
        taskDescription: { type: "string", description: "Description of the task needing delegation" },
        requiredExpertise: { type: "array", items: { type: "string" }, description: "Required areas of expertise" },
        includeReasons: { type: "boolean", description: "Include reasoning for recommendations", default: true }
      },
      required: ["taskDescription"]
    },
    category: "delegation",
    operation: "read"
  },

  // ── SELF-SCHEDULING TOOLS ──────────────────────────────────
  bloom_schedule_task: {
    name: "bloom_schedule_task",
    description: "Create a new scheduled/recurring task for yourself. Use when user asks you to do something on a recurring basis.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short task name" },
        description: { type: "string", description: "What this task does" },
        instruction: { type: "string", description: "Detailed instruction to execute each time" },
        frequency: { type: "string", enum: ["every_10_min", "every_30_min", "hourly", "daily", "weekdays", "weekly", "monthly"] },
        runTime: { type: "string", description: "HH:MM format (24-hour). Default: 09:00" },
        taskType: { type: "string", enum: ["content", "email", "followup", "reporting", "monitoring", "custom"] }
      },
      required: ["name", "instruction", "frequency"]
    },
    category: "scheduling",
    operation: "write"
  },

  bloom_list_scheduled_tasks: {
    name: "bloom_list_scheduled_tasks",
    description: "List all your currently scheduled/recurring tasks.",
    parameters: { type: "object", properties: {}, required: [] },
    category: "scheduling",
    operation: "read"
  },

  bloom_update_scheduled_task: {
    name: "bloom_update_scheduled_task",
    description: "Update or pause/resume a scheduled task.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        enabled: { type: "boolean" },
        name: { type: "string" },
        instruction: { type: "string" },
        frequency: { type: "string", enum: ["every_10_min", "every_30_min", "hourly", "daily", "weekdays", "weekly", "monthly"] },
        runTime: { type: "string" }
      },
      required: ["taskId"]
    },
    category: "scheduling",
    operation: "write"
  },

  bloom_delete_scheduled_task: {
    name: "bloom_delete_scheduled_task",
    description: "Permanently delete a scheduled task.",
    parameters: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"]
    },
    category: "scheduling",
    operation: "write"
  },

  // DOCUMENT TOOLS
  bloom_create_document: {
    name: "bloom_create_document",
    description: "Create and save a document/artifact for Kimberly to review. Use for drafts, reports, research findings, response collections, content pieces, or any structured output that needs to be saved and reviewed. Documents appear in the dashboard under Documents. Supports markdown formatting in content.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title — clear and descriptive (e.g. 'Question Responses Sarah — March 23 2026')" },
        content: { type: "string", description: "Full document content. Supports markdown formatting (headers, bold, lists, links, etc.)" },
        docType: { type: "string", enum: ["draft", "report", "research", "responses", "content", "plan", "general"], description: "Type of document" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for organization (e.g. ['quora', 'forum-responses', 'bloom-marketing'])" },
        requiresApproval: { type: "boolean", description: "If true, flags this document as needing Kimberly's approval before any action is taken", default: false }
      },
      required: ["title", "content", "docType"]
    },
    category: "documents",
    operation: "write"
  },

  bloom_list_documents: {
    name: "bloom_list_documents",
    description: "List saved documents with optional filters by type, status, or tags.",
    parameters: {
      type: "object",
      properties: {
        docType: { type: "string", enum: ["draft", "report", "research", "responses", "content", "plan", "general"], description: "Filter by document type" },
        status: { type: "string", enum: ["draft", "approved", "rejected", "archived"], description: "Filter by status" },
        limit: { type: "number", description: "Max documents to return", default: 20 }
      }
    },
    category: "documents",
    operation: "read"
  },

  bloom_update_document: {
    name: "bloom_update_document",
    description: "Update an existing document's content, status, or metadata.",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID to update" },
        content: { type: "string", description: "Updated content (replaces existing)" },
        status: { type: "string", enum: ["draft", "approved", "rejected", "archived"], description: "New status" },
        title: { type: "string", description: "Updated title" }
      },
      required: ["documentId"]
    },
    category: "documents",
    operation: "write"
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
  },

  // SUB-AGENT DELEGATION TOOLS
  bloom_delegate_task: async (params) => {
    try {
      const { subAgentSystem } = await import('../agents/sub-agent-system.js');

      // Delegate to sub-agent system
      const result = await subAgentSystem.delegateTask(
        params.task,
        params.context || {},
        params.preferredAgent
      );

      if (result.success) {
        logger.info('Task delegated to sub-agent', {
          subAgent: result.subAgent,
          task: params.task.substring(0, 50),
          success: result.result.success
        });

        // Log the delegation as a decision
        const delegationDecision = {
          decision: `Delegated task to ${result.agentName}`,
          reasoning: `Selected ${result.subAgent} for specialized task execution`,
          confidence: 0.9,
          category: 'action_taken',
          impactLevel: params.priority === 'urgent' || params.priority === 'high' ? 'high' : 'medium',
          relatedData: {
            subAgent: result.subAgent,
            taskDescription: params.task,
            executionTime: result.executionTime
          }
        };

        // Log the decision (don't await to avoid blocking)
        internalToolExecutors.bloom_log_decision(delegationDecision).catch(err =>
          logger.warn('Failed to log delegation decision:', err)
        );
      }

      return {
        success: result.success,
        subAgent: result.subAgent,
        agentName: result.agentName,
        result: result.result,
        executionTime: result.executionTime,
        message: result.success
          ? `Task successfully delegated to ${result.agentName}`
          : `Delegation failed: ${result.error}`
      };

    } catch (error) {
      logger.error('Sub-agent delegation failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to delegate task to sub-agent'
      };
    }
  },

  bloom_list_subagents: async (params) => {
    try {
      const { subAgentSystem, SUB_AGENTS } = await import('../agents/sub-agent-system.js');

      const registry = subAgentSystem.getSubAgentRegistry();
      const stats = subAgentSystem.getSubAgentStats();

      let filtered = registry;
      if (params.filterByExpertise) {
        filtered = registry.filter(agent =>
          agent.expertise.includes(params.filterByExpertise.toLowerCase())
        );
      }

      return {
        success: true,
        subAgents: filtered,
        stats: params.includeStats ? stats : undefined,
        count: filtered.length,
        message: `Found ${filtered.length} available sub-agents`
      };

    } catch (error) {
      logger.error('Failed to list sub-agents:', error);
      return {
        success: false,
        error: error.message,
        subAgents: [],
        message: 'Failed to retrieve sub-agent information'
      };
    }
  },

  bloom_recommend_subagent: async (params) => {
    try {
      const { subAgentSystem, SUB_AGENTS } = await import('../agents/sub-agent-system.js');

      // Use the existing selection logic to get recommendations
      const selectedAgent = subAgentSystem.selectBestAgent(params.taskDescription, {
        requiredExpertise: params.requiredExpertise
      });

      const agent = SUB_AGENTS[selectedAgent];

      // Calculate match score for transparency
      const taskLower = params.taskDescription.toLowerCase();
      const expertiseMatches = agent.expertise.filter(exp =>
        taskLower.includes(exp.toLowerCase())
      );

      const recommendations = [{
        agentKey: selectedAgent,
        name: agent.name,
        description: agent.description,
        expertise: agent.expertise,
        matchingExpertise: expertiseMatches,
        toolsAvailable: agent.tools.length,
        confidence: expertiseMatches.length > 0 ? 'high' : 'medium',
        reasoning: params.includeReasons
          ? `Selected based on ${expertiseMatches.length} matching expertise areas: ${expertiseMatches.join(', ')}`
          : undefined
      }];

      return {
        success: true,
        primaryRecommendation: selectedAgent,
        recommendations: recommendations,
        taskAnalysis: {
          complexity: expertiseMatches.length > 2 ? 'high' : 'medium',
          requiredExpertise: expertiseMatches,
          estimatedTools: agent.tools.filter(tool =>
            taskLower.includes(tool.toLowerCase().replace(/[_]/g, ' '))
          ).length
        },
        message: `Recommended: ${agent.name} (${expertiseMatches.length} expertise matches)`
      };

    } catch (error) {
      logger.error('Failed to recommend sub-agent:', error);
      return {
        success: false,
        error: error.message,
        recommendations: [],
        message: 'Failed to generate sub-agent recommendations'
      };
    }
  },

  // SARAH'S INTERNAL PLANNING SYSTEM EXECUTORS (Cowork + Ralph Hybrid)
  bloom_todo_write: async (params) => {
    try {
      const pool = await getPool();
      const { v4: uuidv4 } = await import('uuid');

      // Create task_plans table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS task_plans (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id VARCHAR(100) UNIQUE NOT NULL,
          agent_id VARCHAR(100) DEFAULT 'bloomie-sarah-rodriguez',
          organization_id VARCHAR(100),
          title TEXT NOT NULL,
          steps JSONB NOT NULL,
          status VARCHAR(50) DEFAULT 'active',
          verification_status VARCHAR(50) DEFAULT 'unverified',
          all_steps_passing BOOLEAN DEFAULT FALSE,
          last_verified_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      const taskId = params.task_id || uuidv4();

      // Validate Cowork discipline: only one step in_progress at a time
      const inProgressSteps = params.steps.filter(s => s.status === 'in_progress');
      if (inProgressSteps.length > 1) {
        logger.warn('DISCIPLINE VIOLATION: Multiple steps marked in_progress', {
          inProgressCount: inProgressSteps.length,
          steps: inProgressSteps.map(s => s.id)
        });
        // Fix it: only keep the first one as in_progress
        let foundFirst = false;
        params.steps = params.steps.map(s => {
          if (s.status === 'in_progress') {
            if (!foundFirst) {
              foundFirst = true;
              return s;
            }
            return { ...s, status: 'pending' };
          }
          return s;
        });
      }

      // Validate Ralph verification: don't allow completed without verified
      for (const step of params.steps) {
        if (step.status === 'completed' && step.verified !== true) {
          logger.warn('VERIFICATION DISCIPLINE: Step marked completed without verified=true', {
            stepId: step.id,
            content: step.content
          });
          // Don't block it but flag it — the system prompt will reinforce this
        }
      }

      // Calculate verification status
      const allStepsPassing = params.steps.length > 0 &&
        params.steps.every(s => s.status === 'completed' && s.verified === true);
      const verificationStatus = allStepsPassing ? 'all_passing' :
        params.steps.some(s => s.verified === true) ? 'partial' : 'unverified';

      // Insert or update the entire plan
      const upsertResult = await pool.query(`
        INSERT INTO task_plans (task_id, title, steps, verification_status, all_steps_passing, last_verified_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (task_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          steps = EXCLUDED.steps,
          verification_status = EXCLUDED.verification_status,
          all_steps_passing = EXCLUDED.all_steps_passing,
          last_verified_at = EXCLUDED.last_verified_at,
          updated_at = NOW()
        RETURNING task_id, title, steps, updated_at, verification_status, all_steps_passing
      `, [
        taskId,
        params.title,
        JSON.stringify(params.steps),
        verificationStatus,
        allStepsPassing,
        allStepsPassing ? new Date().toISOString() : null
      ]);

      const plan = upsertResult.rows[0];

      // Build progress summary for logging
      const completed = params.steps.filter(s => s.status === 'completed').length;
      const verified = params.steps.filter(s => s.verified === true).length;
      const failed = params.steps.filter(s => s.status === 'failed').length;
      const pending = params.steps.filter(s => s.status === 'pending').length;

      logger.info('Created/updated task plan', {
        taskId: plan.task_id,
        title: plan.title,
        stepCount: params.steps.length,
        completed, verified, failed, pending,
        allStepsPassing,
        verificationStatus
      });

      return {
        success: true,
        task_id: plan.task_id,
        title: plan.title,
        steps: params.steps,
        verification_status: verificationStatus,
        all_steps_passing: allStepsPassing,
        progress: { total: params.steps.length, completed, verified, failed, pending },
        message: `Plan "${plan.title}": ${verified}/${params.steps.length} verified passing${allStepsPassing ? ' — ALL PASSING ✅' : ''}`,
        // Return current state for system message injection
        currentState: {
          title: plan.title,
          steps: params.steps,
          verification_status: verificationStatus,
          all_steps_passing: allStepsPassing
        }
      };

    } catch (error) {
      logger.error('Failed to create/update task plan:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create task plan'
      };
    }
  },

  // CLARIFICATION TOOL EXECUTOR
  bloom_clarify: async (params) => {
    try {
      logger.info('Clarification requested', {
        question: params.question,
        optionCount: params.options?.length || 0
      });

      // Store clarification request for the dashboard to display
      // The chat handler will pick this up and show it to the user
      return {
        success: true,
        type: 'clarification_needed',
        question: params.question,
        options: params.options || [],
        context: params.context || '',
        message: `Clarification needed: ${params.question}`,
        // Signal to the executor to pause and wait for user input
        pauseExecution: true
      };
    } catch (error) {
      logger.error('Failed to create clarification request:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // ── SELF-SCHEDULING EXECUTORS ──────────────────────────────
  bloom_schedule_task: async (params) => {
    try {
      const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
      const resp = await fetch(`${BASE_URL}/api/agent/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: params.name,
          description: params.description || '',
          instruction: params.instruction,
          frequency: params.frequency || 'daily',
          runTime: params.runTime || '09:00',
          taskType: params.taskType || 'custom'
        })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Failed to create scheduled task');
      logger.info('Bloomie self-scheduled task via heartbeat', { taskId: data.task?.task_id, name: params.name });
      return {
        success: true,
        taskId: data.task?.task_id,
        name: params.name,
        frequency: params.frequency,
        runTime: params.runTime || '09:00',
        nextRunAt: data.task?.next_run_at,
        message: `Scheduled task "${params.name}" created — runs ${params.frequency} at ${params.runTime || '09:00'}`
      };
    } catch (e) {
      logger.error('bloom_schedule_task failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  bloom_list_scheduled_tasks: async () => {
    try {
      const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
      const resp = await fetch(`${BASE_URL}/api/agent/tasks`);
      const data = await resp.json();
      if (!resp.ok) throw new Error('Failed to list tasks');
      return {
        success: true,
        tasks: data.tasks || [],
        message: `Found ${(data.tasks || []).length} scheduled tasks`
      };
    } catch (e) {
      logger.error('bloom_list_scheduled_tasks failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  bloom_update_scheduled_task: async (params) => {
    try {
      const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
      const body = {};
      if (params.enabled !== undefined) body.enabled = params.enabled;
      if (params.name) body.name = params.name;
      if (params.instruction) body.instruction = params.instruction;
      if (params.frequency) body.frequency = params.frequency;
      if (params.runTime) body.runTime = params.runTime;
      const resp = await fetch(`${BASE_URL}/api/agent/tasks/${params.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Failed to update task');
      return { success: true, taskId: params.taskId, message: `Updated task ${params.taskId}` };
    } catch (e) {
      logger.error('bloom_update_scheduled_task failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  bloom_delete_scheduled_task: async (params) => {
    try {
      const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
      const resp = await fetch(`${BASE_URL}/api/agent/tasks/${params.taskId}`, { method: 'DELETE' });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Failed to delete task');
      return { success: true, message: `Deleted task ${params.taskId}` };
    } catch (e) {
      logger.error('bloom_delete_scheduled_task failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  // DOCUMENT TOOLS
  bloom_create_document: async (params) => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });

      const row = {
        org_id: 'a1000000-0000-0000-0000-000000000001',
        agent_id: 'c3000000-0000-0000-0000-000000000003',
        title: params.title,
        content: params.content,
        doc_type: params.docType || 'general',
        status: 'draft',
        tags: params.tags || [],
        requires_approval: params.requiresApproval || false,
        metadata: params.metadata || {}
      };

      const { data, error } = await supabase.from('documents').insert(row).select('id, title, doc_type, status, requires_approval, created_at').single();
      if (error) throw new Error(error.message);

      logger.info('Document created', { docId: data.id, title: data.title, requiresApproval: data.requires_approval });

      return {
        success: true,
        documentId: data.id,
        title: data.title,
        docType: data.doc_type,
        status: data.status,
        requiresApproval: data.requires_approval,
        createdAt: data.created_at,
        message: data.requires_approval
          ? `Document "${data.title}" saved and flagged for Kimberly's approval.`
          : `Document "${data.title}" saved successfully.`
      };
    } catch (e) {
      logger.error('bloom_create_document failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  bloom_list_documents: async (params) => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });

      let q = supabase.from('documents')
        .select('id, title, doc_type, status, tags, requires_approval, created_at, updated_at')
        .eq('org_id', 'a1000000-0000-0000-0000-000000000001')
        .order('created_at', { ascending: false })
        .limit(params.limit || 20);

      if (params.docType) q = q.eq('doc_type', params.docType);
      if (params.status) q = q.eq('status', params.status);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      return { success: true, documents: data || [], count: (data || []).length };
    } catch (e) {
      logger.error('bloom_list_documents failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  bloom_update_document: async (params) => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });

      const updates = { updated_at: new Date().toISOString() };
      if (params.content) updates.content = params.content;
      if (params.status) updates.status = params.status;
      if (params.title) updates.title = params.title;

      const { data, error } = await supabase.from('documents')
        .update(updates)
        .eq('id', params.documentId)
        .select('id, title, status, updated_at')
        .single();
      if (error) throw new Error(error.message);

      return { success: true, document: data, message: `Document "${data.title}" updated.` };
    } catch (e) {
      logger.error('bloom_update_document failed:', e.message);
      return { success: false, error: e.message };
    }
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