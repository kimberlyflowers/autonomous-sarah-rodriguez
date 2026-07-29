import { createLogger } from '../logging/logger.js';
import { loadAgentConfig } from '../config/agent-profile.js';
import { callModel } from '../llm/unified-client.js';
import { getResolvedConfig } from '../config/admin-config.js';
import { executeGHLTool, ghlToolDefinitions } from '../tools/ghl-tools.js';
import { executeInternalTool, internalToolDefinitions } from '../tools/internal-tools.js';
import { executeBrowserTool, browserToolDefinitions } from '../tools/browser-tools.js';
import { executeWebSearchTool, webSearchToolDefinitions } from '../tools/web-search-tools.js';
import { executeImageTool, imageToolDefinitions } from '../tools/image-tools.js';
import { executeScrapeTools, scrapeToolDefinitions } from '../tools/scrape-tools.js';
import { executeGmailTool, gmailToolDefinitions } from '../tools/gmail-tools.js';
import { executeDeveloperTool, developerToolDefinitions } from '../tools/developer-tools.js';
import { subAgentSystem, SUB_AGENTS } from '../agents/sub-agent-system.js';
import { contextManager } from '../context/context-manager.js';
import { ModelFormatter, modelSelector } from '../context/model-formatter.js';
import { enhancedExecutor } from '../tools/enhanced-executor.js';
import { systemMonitor } from '../monitoring/system-monitor.js';
import { broadcastExecutionProgress } from '../api/events.js';
import { verifyAction } from './verify.js';
import { appendProgress, getProgressText } from './progress-log.js';
import { exec as _exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { buildSharedExecutionContract } from '../orchestrator/agent-experience.js';
import { buildCompletionNudge, evaluateCompletionContract } from '../orchestrator/completion-contract.js';

async function buildWorkReferenceContext(task, agentConfig, context = {}) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const orgId = context.orgId || context.organizationId || agentConfig?.organizationId || agentConfig?.organization_id;
    const agentId = agentConfig?.agentId || agentConfig?.id;
    if (!orgId || !agentId) return '';
    const { data, error } = await sb
      .from('user_settings')
      .select('value')
      .eq('organization_id', orgId)
      .eq('key', 'reference_library')
      .maybeSingle();
    if (error) throw error;
    const taskText = String(task || '').toLowerCase();
    const categories = new Set(['knowledge']);
    if (/\b(write|writing|blog|article|email|script|document|tone|voice|style)\b/.test(taskText)) categories.add('writing_style');
    if (/\b(image|photo|portrait|headshot|avatar|heygen|video|visual)\b/.test(taskText)) {
      categories.add('identity'); categories.add('heygen'); categories.add('brand');
    }
    if (/\b(brand|logo|colors?|fonts?|design)\b/.test(taskText)) categories.add('brand');
    if (context.projectId) categories.add('project');
    const references = (Array.isArray(data?.value) ? data.value : [])
      .filter(ref => ref.status === 'active' && categories.has(ref.category))
      .filter(ref =>
        ref.scope === 'organization' ||
        (ref.scope === 'agent' && ref.agent_id === agentId) ||
        (context.projectId && ref.scope === 'project' && ref.project_id === context.projectId)
      )
      .slice(0, 12);
    if (!references.length) return '';
    return `\n\n## Approved Reference Library
Use these task-relevant sources. Identity references belong only to ${agentConfig.name}. Writing samples guide style but are not factual authority.
${references.map((ref, index) => `${index + 1}. [${ref.category}] ${ref.title}${ref.description ? ` — ${ref.description}` : ''}${ref.storage_url ? `\nSource URL: ${ref.storage_url}` : ''}${ref.extracted_text ? `\nExcerpt:\n${ref.extracted_text.slice(0, 6000)}` : ''}`).join('\n\n')}`;
  } catch (error) {
    logger.warn('Work reference context skipped', { error: error.message });
    return '';
  }
}

const _execAsync = promisify(_exec);

// ── GIT SNAPSHOT — lightweight rollback before destructive file ops ───────────
async function gitSnapshot(reason = 'auto-snapshot') {
  try {
    await _execAsync(`git add -A && git stash push -m "bloom-auto: ${reason}"`, { timeout: 10000 });
    return { success: true };
  } catch (e) {
    return { success: false, reason: e.message }; // non-fatal
  }
}

// ── AGENTS.md CONTEXT LOADER — Kiro-style per-task context ───────────────────
function loadAgentsContext() {
  const paths = ['./AGENTS.md', './CLAUDE.md', './.kiro/steering/product.md'];
  for (const p of paths) {
    if (existsSync(p)) {
      try { return readFileSync(p, 'utf8').slice(0, 4000); } catch(e) {}
    }
  }
  return null;
}

const logger = createLogger('agent-executor');
const DEFAULT_AGENT_ID = process.env.AGENT_UUID || process.env.SARAH_AGENT_ID || 'c3000000-0000-0000-0000-000000000003';

// Agent execution status
const EXECUTION_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  BLOCKED: 'blocked'
};

const NON_SUBSTANTIVE_TOOLS = new Set([
  'bloom_todo_write',
  'todo_write',
  'bloom_clarify',
  'bloom_log_decision',
  'bloom_log_observation'
]);

const PRE_ACTION_SUPPRESSED_TOOLS = new Set([
  ...NON_SUBSTANTIVE_TOOLS,
  'bloom_create_document',
  'bloom_escalate_issue'
]);

const SCHEDULED_TASK_MAX_IMAGE_GENERATIONS = Number(process.env.SCHEDULED_TASK_MAX_IMAGE_GENERATIONS || 4);
const MAX_COMPLETION_CONTRACT_NUDGES = 3;

export function classifyExecutionTask(task, context = {}) {
  const text = `${task} ${context.taskName || ''} ${context.taskType || ''}`.toLowerCase();
  const declaredTaskType = String(context.taskType || '').trim().toLowerCase();

  // Put developer work before broad research/audit matching. A request such as
  // "audit the repo, edit the website, and deploy to Vercel" must receive the
  // focused GitHub/Vercel toolset rather than every tool in the system.
  if (/\b(github|repository|repo|branch|commit|codebase|source code|vercel|deployment|deploy|website|landing page)\b/.test(text)
      && /\b(inspect|audit|edit|change|fix|update|implement|add|remove|create|build|deploy|publish|verify|test)\b/.test(text)) {
    return 'developer';
  }
  if (/blog|article|geo.?optimized|seo.?post|write.*post/.test(text)) return 'blog';
  if (/social|instagram|facebook|linkedin|twitter|tiktok/.test(text)) return 'social';
  if (/email|newsletter|campaign|drip|outreach/.test(text)) return 'email';
  if (declaredTaskType === 'crm') return 'followup';
  if (/follow.?up|nurture|check.?in|overdue|re.?engage/.test(text)) return 'followup';
  if (/research|scrape|analyze|report|audit|competitor/.test(text)) return 'research';
  return null;
}

/**
 * Main agentic execution engine
 * Takes a task and executes it autonomously using tool chaining
 */
export class AgentExecutor {
  constructor(agentId = DEFAULT_AGENT_ID, options = {}) {
    this.agentId = agentId;
    this.toolExecutionHistory = [];
    this.conversationHistory = [];
    this.safetyValveThreshold = 50; // Log warning but don't kill the loop
    this.currentPlan = null; // Track current task plan for progress
    this.currentStep = 0; // Track current step number
    this.recentToolCalls = []; // Track for loop detection
    this.executionId = null; // Track execution session for progress streaming
    this.currentTurn = 0; // Track current turn for progress streaming

    // Advanced context management
    this.contextManager = contextManager;
    // Model will be resolved from admin config in executeTask(); use placeholder for now
    this._modelOverride = options.model || null;
    this.modelFormatter = new ModelFormatter(options.model || 'gemini-2.5-flash');

    // Adaptive model selection
    this.useAdaptiveModels = options.useAdaptiveModels !== false;
    this.taskComplexity = 'standard'; // 'fast', 'standard', 'premium'

    // System monitoring integration
    this.systemMonitor = systemMonitor;
    this.systemHealth = 'healthy';

    logger.info('Initialized AgentExecutor with advanced capabilities', {
      agentId,
      model: this.modelFormatter.model,
      useAdaptiveModels: this.useAdaptiveModels,
      systemMonitoring: true,
      autoHealing: this.systemMonitor.autoHealingEnabled
    });
  }

  /**
   * Execute a task using agentic tool chaining
   * @param {string} task - The task description
   * @param {Object} context - Additional context for execution
   * @returns {Object} Execution result with status and outputs
   */
  async executeTask(task, context = {
  }) {
    const startTime = Date.now();
    const { v4: uuidv4 } = await import('uuid');
    this.executionId = uuidv4();
    this.currentTurn = 0;

    // ═══ CRITICAL FIX: Reset context manager between task executions ═══
    // The contextManager is a module-level singleton. Without this reset,
    // stale conversation history from previous tasks pollutes the context,
    // causing the LLM to generate text continuations instead of using tools.
    // This was the root cause of "tasks say completed but nothing created."
    this.contextManager.conversationMemory = [];
    this.contextManager.workingContext = new Map();
    this.toolExecutionHistory = [];
    this.conversationHistory = [];
    this.recentToolCalls = [];
    this.currentPlan = null;
    this.currentStep = 0;
    this.allStepsPassing = false;
    this.lastVerificationResult = null;
    this.scheduledTerminalFailure = null;
    this.scheduledImageGenerations = 0;
    this.scheduledBlogRepairAttempts = 0;
    this.unfinishedPlanNudges = 0;
    this.completionContractNudges = 0;
    this.forceFinalEvidenceTurn = false;
    this._currentTaskText = task || '';
    this._currentTaskName = context.taskName || '';
    this._currentRawTaskType = context.taskType || '';
    logger.info('Context manager reset for fresh task execution');

    // Load AGENTS.md / steering context after reset so every task starts with
    // fresh project instructions when they exist.
    const agentsCtx = loadAgentsContext();
    if (agentsCtx) {
      await this.contextManager.addConversationTurn('user',
        `[PROJECT CONTEXT from AGENTS.md]:\n${agentsCtx}`,
        { type: 'project_context', priority: 1 }
      );
    }

    // ═══ TASK-TYPE DETECTION for tool filtering ═══
    // Classify the task so formatToolsForClaude() can filter to relevant tools only.
    // Gemini 2.5 Flash chokes on 99 tools and responds text-only; filtering to
    // 10-20 relevant tools makes it actually call them.
    this._currentTaskType = this._classifyTaskType(task, context);
    this._isScheduledTask = context.trigger === 'scheduled';
    this._currentOrgId = context.orgId || context.organizationId || null;
    this._currentSessionId = context.sessionId || null;
    logger.info('Task classified for tool filtering', {
      taskType: this._currentTaskType,
      isScheduled: this._isScheduledTask,
      taskPreview: task.substring(0, 80)
    });

    // Resolve model from admin config (respects Gemini setting in Supabase)
    // MULTI-TENANT: Use the task's org ID if available, not a hardcoded org
    if (!this._modelOverride) {
      try {
        const orgId = context.orgId || 'a1000000-0000-0000-0000-000000000001';
        const config = await getResolvedConfig(orgId);
        const resolvedModel = config.model || 'gemini-2.5-flash';
        this.modelFormatter = new ModelFormatter(resolvedModel);
        logger.info('Executor using admin-configured model', { model: resolvedModel, orgId, reason: config.reason });
      } catch (cfgErr) {
        logger.warn('Could not load admin config for executor, using default', { error: cfgErr.message });
      }
    }

    logger.info('Starting agentic task execution', {
      task: task.substring(0, 100),
      agentId: this.agentId,
      executionId: this.executionId,
      model: this.modelFormatter.model
    });

    try {
      // Load agent configuration and build system prompt
      const agentConfig = await loadAgentConfig(this.agentId);
      this._agentConfig = agentConfig;

      let systemPrompt;
      if (context.trigger === 'chat') {
        // Use conversational system prompt passed from chat.js
        systemPrompt = context.chatSystemPrompt;
        logger.info('Using conversational chat prompt for execution');
      } else {
        // Use agentic execution prompt for heartbeat/tasks
        systemPrompt = await this.buildSystemPrompt(agentConfig, { ...context, instruction: task });
        systemPrompt += await buildWorkReferenceContext(task, agentConfig, context);
        logger.info('Using agentic execution prompt for task');
      }

      // Store task context and initialize conversation with advanced context management
      await this.contextManager.storeWorkingContext('current_task', {
        description: task,
        context: context,
        startTime: startTime,
        agentId: this.agentId
      }, 'current_task');

      // Add initial task to conversation context
      if (context.trigger === 'chat') {
        // For chat, add the message directly without agentic framing
        await this.contextManager.addConversationTurn('user', task, { type: 'chat_message', priority: 9 });
      } else {
        // For agentic tasks, use the full execution framing
        await this.contextManager.addConversationTurn('user',
          `Execute this task autonomously: ${task}

Available context: ${JSON.stringify(context, null, 2)}

Use the available tools to complete this task. Work step by step and explain your reasoning. When you've completed the task, clearly state "TASK COMPLETED" followed by a summary of what was accomplished.`,
          { type: 'current_task', priority: 9 }
        );
      }

      // DISABLED: adaptModelForTask was overriding the admin-configured model
      // (gemini-2.5-flash) with models from MODEL_CAPABILITIES that may not be
      // available on the account (e.g., gpt-4-turbo). The admin config at
      // getResolvedConfig() already selects the correct model per org tier.
      // if (this.useAdaptiveModels) {
      //   this.adaptModelForTask(task, context);
      // }

      let currentTurn = 0;
      let status = EXECUTION_STATUS.RUNNING;
      let finalResult = null;
      const defaultMaxTurns = this._isScheduledTask
        ? (this._currentTaskType === 'blog' ? 24 : 12)
        : 100;
      const configuredMaxTurns = this._isScheduledTask
        ? process.env.SCHEDULED_TASK_MAX_TURNS
        : null;
      const maxTurns = Math.min(
        Math.max(Number(context.maxTurns || configuredMaxTurns || defaultMaxTurns), 3),
        200
      );

      // Claude Code's nO pattern: while (response has tool_use) { execute → feed back → get next response }
      while (status === EXECUTION_STATUS.RUNNING) {
        currentTurn++;
        this.currentTurn = currentTurn;
        if (currentTurn > maxTurns) {
          status = EXECUTION_STATUS.FAILED;
          finalResult = { error: `Execution exceeded ${maxTurns} turns without reaching verified completion.` };
          logger.error('Execution stopped at configured maximum turns', { maxTurns });
          break;
        }

        // Safety valve warning at 50 turns, but DON'T stop the loop (Claude Code behavior)
        if (currentTurn === this.safetyValveThreshold) {
          logger.warn(`[WARNING] Execution reached ${this.safetyValveThreshold} turns - still running. Task may be highly complex.`);
        }

        logger.info(`Execution turn ${currentTurn}`);

        try {
          // Call Claude with current conversation and available tools
          const response = await this.callClaudeWithTools(systemPrompt);

          // Process the response
          const turnResult = await this.processTurnResponse(response);

          // Claude Code loop logic: continue while response has tool_use
          if (turnResult.hasToolUse) {
            const completionEvaluation = evaluateCompletionContract(
              task,
              this.toolExecutionHistory.map(entry => ({ name: entry.tool })),
              this.toolExecutionHistory.map(entry => entry.result)
            );
            if (completionEvaluation.required && completionEvaluation.complete) {
              status = EXECUTION_STATUS.COMPLETED;
              finalResult = this.buildVerifiedCompletionSummary();
              logger.info('Completion contract satisfied; ending from verified tool receipts');
              break;
            }
            // Check for infinite loop: same tool + args called 3 times in a row
            if (this.detectInfiniteLoop()) {
              logger.error('Infinite loop detected: same tool called 3 times with same parameters');
              status = EXECUTION_STATUS.FAILED;
              finalResult = { error: 'Infinite loop detected - same operation repeated' };
              break;
            }
            // Continue the loop - Claude wants to use more tools
            continue;
          } else {
            if (this.shouldContinueScheduledTaskAfterPlanningOnly(currentTurn)) {
              await this.injectScheduledSubstantiveToolReminder();
              logger.warn('Scheduled task attempted to stop before using a substantive tool; continuing', {
                taskType: this._currentTaskType,
                turn: currentTurn,
                toolsUsed: this.toolExecutionHistory.length
              });
              continue;
            }
            if (this.shouldContinueAfterUnfinishedPlan(turnResult.textResponse, currentTurn)) {
              await this.injectUnfinishedPlanContinuationReminder(turnResult.textResponse);
              logger.warn('Task attempted to stop with unfinished plan items; continuing', {
                taskType: this._currentTaskType,
                turn: currentTurn,
                unfinishedPlanNudges: this.unfinishedPlanNudges
              });
              continue;
            }
            const completionEvaluation = evaluateCompletionContract(
              task,
              this.toolExecutionHistory.map(entry => ({ name: entry.tool })),
              this.toolExecutionHistory.map(entry => entry.result)
            );
            if (completionEvaluation.required && !completionEvaluation.complete) {
              if (this.completionContractNudges < MAX_COMPLETION_CONTRACT_NUDGES) {
                this.completionContractNudges += 1;
                await this.contextManager.addConversationTurn(
                  'user',
                  buildCompletionNudge(completionEvaluation),
                  { type: 'completion_contract', priority: 10 }
                );
                logger.warn('Completion contract missing required proof; continuing', {
                  turn: currentTurn,
                  nudge: this.completionContractNudges,
                  missing: completionEvaluation.missing.map(item => item.id)
                });
                continue;
              }
              status = EXECUTION_STATUS.FAILED;
              finalResult = {
                error: `Required completion evidence was not produced: ${completionEvaluation.missing.map(item => item.description).join(', ')}`
              };
              logger.error('Completion contract remained unsatisfied after retries', {
                missing: completionEvaluation.missing.map(item => item.id)
              });
              break;
            }
            // Claude responded with text only (no tool_use) - natural completion
            status = EXECUTION_STATUS.COMPLETED;
            finalResult = turnResult.result || turnResult.textResponse || 'Task completed successfully';
            logger.info(`Task completed naturally (text-only response) after ${currentTurn} turns`);
          }

          // Handle other completion conditions
          if (turnResult.completed) {
            status = EXECUTION_STATUS.COMPLETED;
            finalResult = turnResult.result;
            logger.info(`Task completed explicitly after ${currentTurn} turns`);
          } else if (turnResult.blocked) {
            status = EXECUTION_STATUS.BLOCKED;
            finalResult = turnResult.reason;
          }

        } catch (error) {
          logger.error(`Execution error on turn ${currentTurn}:`, error);
          status = EXECUTION_STATUS.FAILED;
          finalResult = { error: error.message };
          break;
        }
      }

      const duration = Date.now() - startTime;
      logger.info('Task execution finished', {
        status,
        duration,
        turns: currentTurn,
        toolsUsed: this.toolExecutionHistory.length
      });

      // Get final context and system statistics
      const contextStats = this.contextManager.getContextStats();
      const systemHealth = this.systemMonitor.getHealthSummary();

      // === RALPH PROGRESS LOG: Append what happened for cross-cycle memory ===
      try {
        const planStatus = this.currentPlan ? {
          title: this.currentPlan.title,
          stepsCompleted: (this.currentPlan.steps || [])
            .filter(s => s.status === 'completed' && s.verified)
            .map(s => s.content),
          stepsFailed: (this.currentPlan.steps || [])
            .filter(s => s.status === 'failed')
            .map(s => ({ content: s.content, reason: s.failure_reason || 'unknown' })),
          allPassing: this.allStepsPassing || false
        } : null;

        await appendProgress({
          cycleId: this.executionId,
          type: status === EXECUTION_STATUS.COMPLETED ? 'task_completed' : 'task_failed',
          summary: `${status === EXECUTION_STATUS.COMPLETED ? 'Completed' : 'Failed'}: ${task.substring(0, 100)}${planStatus?.allPassing ? ' (all steps verified)' : ''}`,
          details: {
            status,
            turns: currentTurn,
            toolsUsed: this.toolExecutionHistory.length,
            duration,
            model: this.modelFormatter.model
          },
          stepsCompleted: planStatus?.stepsCompleted || [],
          stepsFailed: planStatus?.stepsFailed || [],
          nextPriority: planStatus && !planStatus.allPassing
            ? `Retry failed steps or continue unfinished plan: ${planStatus.title}`
            : null,
          verificationResults: this.lastVerificationResult || null
        });
      } catch (progressError) {
        logger.warn('Failed to append progress log (non-fatal):', progressError.message);
      }

      return {
        status,
        result: finalResult,
        executionTime: duration,
        turns: currentTurn,
        toolsUsed: this.toolExecutionHistory.length,
        conversationHistory: this.conversationHistory,
        toolHistory: this.toolExecutionHistory,
        contextStats,
        // Ralph verification status
        verification: {
          allStepsPassing: this.allStepsPassing || false,
          planStatus: this.currentPlan?.verification_status || 'no_plan',
          verifiedSteps: (this.currentPlan?.steps || []).filter(s => s.verified).length,
          totalSteps: (this.currentPlan?.steps || []).length
        },
        systemHealth: {
          status: systemHealth.overallHealth,
          uptime: systemHealth.uptime,
          autoHealing: systemHealth.autoHealingEnabled,
          recentAlerts: systemHealth.recentAlerts.length
        },
        modelUsed: this.modelFormatter.model,
        taskComplexity: this.taskComplexity
      };

    } catch (error) {
      logger.error('Failed to execute task:', error);
      return {
        status: EXECUTION_STATUS.FAILED,
        error: error.message,
        executionTime: Date.now() - startTime,
        turns: 0,
        toolsUsed: 0,
        contextStats: this.contextManager.getContextStats(),
        modelUsed: this.modelFormatter.model,
        taskComplexity: this.taskComplexity
      };
    }
  }

  /**
   * Call LLM API with tools and optimized conversation context
   */
  async callClaudeWithTools(systemPrompt) {
    // Get optimized conversation history from context manager
    const optimizedHistory = this.contextManager.getOptimizedHistory(
      this.modelFormatter.capabilities.contextWindow * 0.8 // Reserve 20% for response
    );

    // Add current working context to system prompt
    const workingContext = this.contextManager.getFormattedWorkingContext();
    const enhancedSystemPrompt = workingContext
      ? `${systemPrompt}\n\n## Current Working Context:\n${workingContext}`
      : systemPrompt;

    // Format tools and validate context size
    const allTools = this.formatToolsForClaude();
    const validation = this.modelFormatter.validateContextSize(
      optimizedHistory,
      allTools,
      enhancedSystemPrompt
    );

    if (!validation.valid) {
      logger.warn('Context size exceeds model limits, compressing further', {
        totalTokens: validation.totalTokens,
        limit: this.modelFormatter.capabilities.contextWindow,
        utilization: validation.utilizationPercent
      });

      // Force context compression
      await this.contextManager.compressContext();
      // Retry with compressed context
      const reoptimizedHistory = this.contextManager.getOptimizedHistory(
        this.modelFormatter.capabilities.contextWindow * 0.7 // More aggressive limit
      );

      return this.callLLMWithParams(enhancedSystemPrompt, reoptimizedHistory, allTools);
    }

    logger.info('Making LLM API call with optimized context', {
      model: this.modelFormatter.model,
      historyTurns: optimizedHistory.length,
      tools: allTools.length,
      utilization: validation.utilizationPercent
    });

    return this.callLLMWithParams(enhancedSystemPrompt, optimizedHistory, allTools);
  }

  /**
   * Make actual LLM API call with formatted parameters
   * ⚡ Migrated: Uses unified callModel with failover (respects admin Gemini config)
   */
  async callLLMWithParams(systemPrompt, messages, tools) {
    const model = this.modelFormatter.model;

    // Format tools for the unified client
    const toolDefs = (tools || []).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema || t.parameters || {}
    }));

    // ═══ FORCE TOOL USE for scheduled tasks until real work starts ═══
    // Gemini 2.5 Flash with mode:'AUTO' responds text-only instead of calling tools.
    // Setting mode:'ANY' forces it to call at least one tool. Keep forcing after
    // the plan is written until a non-planning tool has actually been attempted.
    const scheduledRequiredNextTools = this.getScheduledRequiredNextToolSet();
    const forceToolUse = this._isScheduledTask &&
      !this.isTextOnlyScheduledTask() &&
      (
        !this.hasSubstantiveToolUse() ||
        this.needsScheduledOwnerNotification() ||
        !!scheduledRequiredNextTools
      ) &&
      toolDefs.length > 0;
    const maxTokens = this._isScheduledTask
      ? (
          this._currentTaskType === 'blog'
            ? Number(process.env.SCHEDULED_BLOG_MAX_OUTPUT_TOKENS || 4096)
            : Number(process.env.SCHEDULED_TASK_MAX_OUTPUT_TOKENS || 2048)
        )
      : 4000;

    // Use unified callModel — handles all providers + automatic failover
    const result = await callModel(model, {
      system: systemPrompt,
      messages: messages,
      tools: toolDefs,
      maxTokens,
      temperature: 0.1,
      forceToolUse: forceToolUse
    });

    logger.info('LLM response received', {
      model: result.model || model,
      provider: result.provider,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      stopReason: result.stopReason
    });

    // Normalize to the format the executor loop expects (Anthropic-style content array)
    return {
      content: result.content || [],
      stop_reason: result.stopReason === 'tool_use' ? 'tool_use' : 'end_turn',
      model: result.model || model,
      usage: {
        input_tokens: result.usage?.inputTokens || 0,
        output_tokens: result.usage?.outputTokens || 0
      },
      parsed: {
        content: result.content || [],
        stopReason: result.stopReason,
        usage: result.usage || {},
        model: result.model || model
      }
    };
  }

  /**
   * Process Claude's response and handle tool calls
   * ⚡ Fixed: Batches ALL tool_use blocks into ONE assistant turn and ALL tool_results
   *    into ONE user turn, preventing "unexpected tool_use_id in tool_result" API errors.
   */
  async processTurnResponse(response) {
    const content = response.content;
    let hasToolUse = false;
    let completed = false;
    let blocked = false;
    let result = null;
    let textResponse = null;

    // Separate text blocks and tool_use blocks
    const textBlocks = content.filter(b => b.type === 'text');
    const toolUseBlocks = content.filter(b => b.type === 'tool_use');

    // Process text blocks
    for (const block of textBlocks) {
      if (this.allStepsPassing) {
        completed = true;
        result = block.text;
        logger.info('Task completed via Ralph verification: all steps passing');
      } else if (block.text.includes('TASK COMPLETED')) {
        completed = true;
        result = block.text;
        logger.warn('Task completed via text signal (legacy) — plan verification not confirmed');
      }
      textResponse = block.text;
    }

    // If there are tool_use blocks, process them ALL as a batch
    if (toolUseBlocks.length > 0) {
      hasToolUse = true;

      // 1. Add the ENTIRE assistant response as ONE turn (text + all tool_use blocks)
      await this.contextManager.addConversationTurn('assistant', content, {
        type: 'tool_execution',
        tool: toolUseBlocks.map(b => b.name).join(','),
        priority: 8,
        turnNumber: this.conversationHistory.length
      });

      // 2. Execute all tools and collect results
      const allToolResults = [];
      const verificationQueue = [];

      for (const block of toolUseBlocks) {
        if (this._currentTaskType === 'developer' &&
            NON_SUBSTANTIVE_TOOLS.has(block.name) &&
            this.hasPlanningToolAttempt()) {
          const replacement = this.getDeveloperPlanningReplacement();
          if (replacement) {
            logger.warn('Replacing repeated developer planning call with required discovery action', {
              originalTool: block.name,
              replacementTool: replacement.name,
            });
            block.name = replacement.name;
            block.input = replacement.input;
          }
        }

        // Some OpenRouter models can hallucinate a previously seen TodoWrite
        // call even when scheduled-task tools no longer advertise it. For an
        // explicit research URL, translate that stale planning call into the
        // requested fetch so the schedule performs work instead of looping.
        if (this._isScheduledTask &&
            NON_SUBSTANTIVE_TOOLS.has(block.name) &&
            this._currentTaskType === 'research') {
          const requestedUrl = String(this._currentTaskText || '').match(/https?:\/\/[^\s)>"']+/i)?.[0];
          if (requestedUrl) {
            logger.warn('Replacing hallucinated scheduled planning call with requested web fetch', {
              originalTool: block.name,
              requestedUrl
            });
            block.name = 'web_fetch';
            block.input = { url: requestedUrl };
          }
        }

        this.currentStep++;

        // Broadcast tool execution start
        broadcastExecutionProgress({
          executionId: this.executionId,
          turn: this.currentTurn,
          toolName: block.name,
          toolStatus: "in_progress",
          todoState: this.currentPlan?.steps || null,
          message: this.getToolDescription(block.name, block.input)
        });

        // Track tool calls for loop detection
        this.trackToolCall(block.name, block.input);

        // Execute the tool
        const toolResult = await this.executeTool(block.name, block.input);

        // Record tool execution
        this.toolExecutionHistory.push({
          tool: block.name,
          input: block.input,
          result: toolResult,
          timestamp: new Date().toISOString()
        });

        // Broadcast tool execution completion
        broadcastExecutionProgress({
          executionId: this.executionId,
          turn: this.currentTurn,
          toolName: block.name,
          toolStatus: toolResult.success ? "completed" : "failed",
          todoState: this.currentPlan?.steps || null,
          message: this.formatCompletionMessage(block.name, toolResult)
        });

        // Collect the tool_result for batched user turn
        allToolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(toolResult, null, 2)
        });

        logger.info('Tool executed', { tool: block.name, success: toolResult.success });

        if (this._isScheduledTask && !NON_SUBSTANTIVE_TOOLS.has(block.name) && toolResult.success === false) {
          if (this.shouldRepairScheduledBlogTemplateFailure(block.name, toolResult)) {
            this.scheduledBlogRepairAttempts += 1;
            await this.injectScheduledBlogRepairReminder(toolResult);
            logger.warn('Scheduled blog template gate failed; giving Sarah a self-repair turn', {
              attempt: this.scheduledBlogRepairAttempts,
              tool: block.name,
              error: toolResult.error || toolResult.message || 'Tool failed'
            });
          } else {
            this.scheduledTerminalFailure = {
              tool: block.name,
              error: toolResult.error || toolResult.message || 'Tool failed'
            };
          }
        }

        // Queue verification (don't add to conversation yet)
        if (block.name !== 'bloom_todo_write' && block.name !== 'bloom_clarify' &&
            block.name !== 'bloom_log_decision' && block.name !== 'bloom_log_observation') {
          verificationQueue.push({ block, toolResult });
        }

        // Check for clarification pause
        if (block.name === 'bloom_clarify' && toolResult.pauseExecution) {
          logger.info('Execution paused for clarification', { question: toolResult.question });
          // Still add collected results as user turn before pausing
          await this.contextManager.addConversationTurn('user', allToolResults, {
            type: 'tool_result',
            tool: 'batch',
            priority: 8,
            turnNumber: this.conversationHistory.length
          });
          return {
            completed: false,
            blocked: true,
            reason: 'clarification_needed',
            clarification: toolResult,
            hasToolUse: false
          };
        }

        // === PLAN STATE TRACKING (Cowork TodoWrite behavior) ===
        if (block.name === 'bloom_todo_write' && toolResult.success && toolResult.currentState) {
          this.currentPlan = toolResult.currentState;

          // Check if all steps are passing (Ralph completion signal)
          if (toolResult.all_steps_passing) {
            logger.info('ALL STEPS PASSING — task verified complete (Ralph promise)');
            this.allStepsPassing = true;
          }

          await this.injectPlanStateReminder();
        }
      }

      // 3. Add ALL tool_results as ONE user turn (prevents tool_use_id mismatch errors)
      await this.contextManager.addConversationTurn('user', allToolResults, {
        type: 'tool_result',
        tool: 'batch',
        priority: 8,
        turnNumber: this.conversationHistory.length
      });

      // 4. Run verification hooks AFTER the batched user turn
      for (const { block, toolResult } of verificationQueue) {
        try {
          const verification = await verifyAction(block.name, toolResult, block.input, {
            executeGHL: async (tool, params) => enhancedExecutor.executeTool(tool, params),
            executeInternal: async (tool, params) => executeInternalTool(tool, params)
          });

          if (verification && !verification.verified && verification.confidence !== 'low') {
            // Add verification failure as a plain text user message (not tool_result)
            await this.contextManager.addConversationTurn('user',
              `[VERIFICATION FAILED for ${block.name}]: ${verification.reason || 'Unverified result'}. Confidence: ${verification.confidence}. ${verification.evidence ? 'Evidence: ' + JSON.stringify(verification.evidence) : ''}`,
              {
                type: 'verification_result',
                tool: block.name,
                verified: verification.verified,
                priority: 9
              }
            );

            logger.warn(`Verification failed for ${block.name}`, {
              reason: verification.reason,
              confidence: verification.confidence
            });
          }

          this.lastVerificationResult = verification;
        } catch (verifyError) {
          logger.warn('Verification hook error (non-fatal):', verifyError.message);
        }
      }

      if (this.scheduledTerminalFailure) {
        const reason = `${this.scheduledTerminalFailure.tool} failed: ${this.scheduledTerminalFailure.error}`;
        logger.warn('Scheduled task stopped after required tool failure', this.scheduledTerminalFailure);
        return {
          completed: false,
          blocked: true,
          reason,
          hasToolUse: false,
          textResponse: reason
        };
      }

      if (this.isScheduledEmailCheckInComplete()) {
        const result = 'Scheduled email check-in complete: Gmail inbox checked and owner notification sent.';
        logger.info('Scheduled email check-in completed after required tools succeeded');
        return {
          completed: true,
          blocked: false,
          result,
          hasToolUse: false,
          textResponse: result
        };
      }
    } else if (textBlocks.length > 0) {
      // No tool_use — just text response. Add as assistant turn.
      await this.contextManager.addConversationTurn('assistant', textResponse || '', {
        type: 'assistant_response',
        priority: 7,
        turnNumber: this.conversationHistory.length
      });
    }

    return {
      completed,
      blocked,
      result,
      hasToolUse,
      textResponse
    };
  }

  /**
   * Execute a tool by name with parameters using enhanced executor
   */
  async executeTool(toolName, parameters, options = {}) {
    try {
      if (developerToolDefinitions[toolName]) {
        return await executeDeveloperTool(
          toolName,
          parameters,
          options.orgId || this._currentOrgId || null,
          {
            sessionId: options.sessionId || this._currentSessionId || null,
            agentId: this.agentId,
            agentName: this._agentConfig?.name || 'Bloomie AI Employee',
          }
        );
      }
      const scheduledRequiredNextTools = this.getScheduledRequiredNextToolSet();
      if (scheduledRequiredNextTools && !scheduledRequiredNextTools.has(toolName)) {
        const requiredTools = Array.from(scheduledRequiredNextTools);
        return {
          success: false,
          error: `Scheduled blog workflow requires ${requiredTools.join(' or ')} next. ${toolName} is disabled for this step.`,
          disallowedTool: true,
          requiredTools
        };
      }

      if ((toolName === 'image_generate' || toolName === 'image_edit') && process.env.IMAGE_GENERATION_DISABLED === 'true') {
        return {
          success: false,
          error: 'Image generation is temporarily disabled by the operator to prevent runaway generation.',
          disabled: true
        };
      }

      if (this._isScheduledTask && toolName === 'image_generate') {
        this.scheduledImageGenerations = (this.scheduledImageGenerations || 0) + 1;
        if (this.scheduledImageGenerations > SCHEDULED_TASK_MAX_IMAGE_GENERATIONS) {
          return {
            success: false,
            error: `Scheduled task image generation limit exceeded (${SCHEDULED_TASK_MAX_IMAGE_GENERATIONS}). Stopping to prevent runaway file creation.`,
            limitExceeded: true
          };
        }
      }

      logger.info('Executing tool with enhanced capabilities', {
        tool: toolName,
        agentId: this.agentId,
        enhanced: true
      });

      // Use enhanced executor with retry logic and performance monitoring
      const identityParameters = {
        ...parameters,
        _agentId: this.agentId,
        _agentName: this._agentConfig?.name || 'Bloomie AI Employee',
        _organizationId: options.orgId || this._currentOrgId || null,
        _sessionId: options.sessionId || this._currentSessionId || null,
      };
      const result = await enhancedExecutor.executeTool(toolName, identityParameters, {
        timeout: options.timeout || 30000,
        retryOnFailure: options.retryOnFailure !== false,
        orgId: options.orgId || this._currentOrgId || null,
        agentId: this.agentId,
        ...options
      });

      // Store execution metrics in working context
      await this.contextManager.storeWorkingContext(`tool_execution_${toolName}`, {
        toolName,
        executionId: result.execution?.id,
        attempts: result.execution?.attempts,
        totalTime: result.execution?.totalTime,
        status: result.execution?.status,
        timestamp: new Date().toISOString()
      }, 'recent_actions', 300000); // 5 minute TTL

      return result;

    } catch (error) {
      logger.error(`Enhanced tool execution failed: ${toolName}`, error);
      return {
        success: false,
        error: error.message,
        enhanced: true,
        execution: {
          attempts: 1,
          status: 'failed',
          totalTime: 0
        }
      };
    }
  }

  /**
   * Execute multiple tools in parallel when possible
   */
  async executeToolsParallel(toolExecutions, options = {}) {
    logger.info('Executing tools in parallel', {
      toolCount: toolExecutions.length,
      agentId: this.agentId
    });

    try {
      const result = await enhancedExecutor.executeParallel(toolExecutions, {
        maxConcurrent: options.maxConcurrent || 3,
        timeout: options.timeout || 60000,
        ...options
      });

      // Store batch execution context
      await this.contextManager.storeWorkingContext('parallel_execution', {
        batchId: result.batchId,
        summary: result.summary,
        toolNames: toolExecutions.map(t => t.toolName),
        timestamp: new Date().toISOString()
      }, 'recent_actions', 600000); // 10 minute TTL

      return result;

    } catch (error) {
      logger.error('Parallel tool execution failed', error);
      throw error;
    }
  }

  /**
   * Execute tools with dependency management
   */
  async executeToolGraph(toolGraph, options = {}) {
    logger.info('Executing tool dependency graph', {
      toolCount: Object.keys(toolGraph).length,
      agentId: this.agentId
    });

    try {
      const result = await enhancedExecutor.executeWithDependencies(toolGraph, options);

      // Store graph execution context
      await this.contextManager.storeWorkingContext('graph_execution', {
        executionId: result.executionId,
        summary: result.summary,
        toolGraph: Object.keys(toolGraph),
        timestamp: new Date().toISOString()
      }, 'recent_actions', 600000); // 10 minute TTL

      return result;

    } catch (error) {
      logger.error('Tool graph execution failed', error);
      throw error;
    }
  }

  /**
   * Convert tool definitions to Claude API format
   * When a taskType is provided, filters to only the tools relevant for that task
   * to avoid overwhelming the model with 99 tools (Gemini stops calling tools when overloaded)
   */
  formatToolsForClaude(taskType = null) {
    if (this.forceFinalEvidenceTurn) return [];
    if (this.isTextOnlyScheduledTask()) {
      logger.info('Formatted tools for text-only scheduled task', {
        taskType: this._currentRawTaskType || this._currentTaskType || 'custom',
        toolCount: 0,
        filtered: true
      });
      return [];
    }

    // ═══ TASK-TYPE TOOL FILTERING ═══
    // Gemini 2.5 Flash with 99 tools responds text-only instead of calling tools.
    // Filtering to 10-20 relevant tools per task type fixes this.
    const TASK_TOOL_MAP = {
      blog: [
        // Core blog creation
        'create_artifact', 'update_artifact', 'publish_artifact',
        // Content research
        'web_search', 'web_fetch',
        // Image for blog hero
        'image_generate',
        // Planning & logging
        'bloom_todo_write', 'bloom_create_document', 'bloom_log_decision',
        'bloom_log_observation', 'bloom_escalate_issue',
      ],
      social: [
        // Social posting
        'ghl_create_social_post', 'ghl_list_social_posts',
        // Image generation for social graphics
        'image_generate', 'image_edit',
        // Content research
        'web_search', 'web_fetch',
        // Planning & logging
        'bloom_todo_write', 'bloom_create_document', 'bloom_log_decision',
        'bloom_log_observation', 'bloom_escalate_issue',
        // Media
        'ghl_upload_media', 'ghl_list_media',
      ],
      email: [
        // Email tools
        'ghl_list_email_templates', 'ghl_create_email_template', 'ghl_update_email_template',
        'ghl_list_campaigns',
        // Gmail
        'gmail_check_inbox', 'gmail_read_message', 'gmail_send_email',
        // Owner check-ins and alerts
        'notify_owner',
        // Contact lookup
        'ghl_search_contacts', 'ghl_get_contact',
        // Planning & logging
        'bloom_todo_write', 'bloom_create_document', 'bloom_log_decision',
        'bloom_log_observation', 'bloom_escalate_issue',
      ],
      followup: [
        // CRM tools for follow-ups
        'ghl_search_contacts', 'ghl_get_contact', 'ghl_update_contact',
        'ghl_get_conversations', 'ghl_get_messages', 'ghl_send_message',
        'ghl_create_note', 'ghl_get_notes',
        'ghl_add_contact_tag', 'ghl_list_location_tags',
        // Tasks
        'ghl_create_task', 'ghl_list_tasks',
        // Planning & logging
        'bloom_todo_write', 'bloom_log_decision', 'bloom_log_observation',
        'bloom_escalate_issue', 'bloom_create_document',
      ],
      research: [
        // Web research
        'web_search', 'web_fetch',
        'browser_task', 'browser_screenshot',
        // Scraping
        ...Object.keys(scrapeToolDefinitions),
        // Documents
        'bloom_create_document', 'bloom_list_documents',
        // Planning & logging
        'bloom_todo_write', 'bloom_log_decision', 'bloom_log_observation',
        'bloom_escalate_issue',
      ],
      developer: [
        // Focused tenant-scoped repository and deployment discovery
        'github_list_repositories', 'github_get_repository', 'github_list_branches',
        'github_list_files', 'github_search_code', 'github_get_file', 'github_put_file',
        'vercel_list_projects', 'vercel_list_deployments',
        'vercel_create_deployment', 'vercel_wait_for_deployment',
        // Server-side coding workspace for multi-file changes and verification
        'coding_workspace_prepare', 'coding_workspace_list_files', 'coding_workspace_read_file',
        'coding_workspace_write_file', 'coding_workspace_replace_text',
        'coding_workspace_run_command', 'coding_workspace_run_checks',
        'coding_workspace_diff', 'coding_workspace_commit',
        // Planning, progress, and browser proof
        'bloom_todo_write', 'bloom_log_decision', 'bloom_log_observation',
        'bloom_escalate_issue', 'browser_task', 'browser_screenshot',
      ],
    };

    // Determine task type from stored context if not explicitly provided
    const effectiveTaskType = taskType || this._currentTaskType || null;

    // Get the allowed tool names for this task type (null = all tools)
    const allowedTools = effectiveTaskType && TASK_TOOL_MAP[effectiveTaskType]
      ? new Set(TASK_TOOL_MAP[effectiveTaskType])
      : null;
      const scheduledRequiredNextTools = this.getScheduledRequiredNextToolSet();

    const claudeTools = [];
    const allToolSources = [
      ghlToolDefinitions,
      internalToolDefinitions,
      browserToolDefinitions,
      webSearchToolDefinitions,
      imageToolDefinitions,
      scrapeToolDefinitions,
      gmailToolDefinitions,
      developerToolDefinitions,
    ];

    for (const toolSource of allToolSources) {
      for (const [toolName, toolDef] of Object.entries(toolSource)) {
        // For scheduled email check-ins, after the inbox check succeeds the only
        // valid next action is notifying the owner.
        if (this.needsScheduledOwnerNotification() && toolName !== 'notify_owner') continue;

        // After a scheduled task has attempted its plan, hide internal paperwork
        // tools until at least one real external/action tool is attempted.
        if (this.shouldSuppressPlanningToolsForScheduledTask(toolName)) continue;
        if (this.shouldSuppressConsecutivePlanningTools(toolName)) continue;
        if (this.shouldSuppressRepeatedBlogImageTool(toolName)) continue;
        if (scheduledRequiredNextTools && !scheduledRequiredNextTools.has(toolName)) continue;

        // If filtering is active, only include allowed tools
        if (allowedTools && !allowedTools.has(toolName)) continue;
        claudeTools.push({
          name: toolName,
          description: toolDef.description,
          input_schema: toolDef.parameters
        });
      }
    }

    // Final name-based guard. Tool collections are assembled from several
    // registries, so enforce the scheduled-task contract on the normalized
    // definitions as well as on their registry keys.
    const finalTools = this._isScheduledTask
      ? claudeTools.filter(tool => !this.shouldSuppressPlanningToolsForScheduledTask(tool.name))
      : claudeTools;

    logger.info('Formatted tools for LLM', {
      taskType: effectiveTaskType || 'all',
      toolCount: finalTools.length,
      filtered: !!allowedTools,
      suppressedPlanningTools: this._isScheduledTask,
      toolNames: this._isScheduledTask ? finalTools.map(tool => tool.name) : undefined
    });

    return finalTools;
  }

  /**
   * Generate tool description for logging and display
   */
  getToolDescription(toolName, input) {
    const inputStr = input && typeof input === 'object' ?
      Object.keys(input).join(', ') :
      (input || '');
    return `${toolName}(${inputStr})`;
  }

  /**
   * Build system prompt for agentic execution
   */
  async buildSystemPrompt(agentConfig, context) {
    const now = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'short'
    });

    // Auto-load relevant skill based on task instruction keywords
    let skillContent = '';
    try {
      const taskInstruction = (context.instruction || context.taskName || '').toLowerCase();
      const instruction = taskInstruction;
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const skillsDir = path.join(__dirname, '..', 'skills', 'catalog');

      // Map task keywords to skill files
      const skillMap = [
        { keywords: ['blog', 'article', 'post', 'geo-optimized'], skill: 'blog-content' },
        { keywords: ['email', 'newsletter', 'campaign'], skill: 'email-creator' },
        { keywords: ['social', 'instagram', 'facebook', 'linkedin'], skill: 'social-media' },
        { keywords: ['flyer', 'poster', 'brochure'], skill: 'flyer-generation' },
        { keywords: ['website', 'landing page'], skill: 'website-creation' },
        { keywords: ['hyperframes', 'motion graphic', 'html animation', 'seekable animation', 'animated composition', 'logo sting', 'lower third', 'title card', 'product launch video', 'faceless explainer', 'beat-synced video'], skill: 'hyperframes' },
      ];

      for (const mapping of skillMap) {
        if (mapping.keywords.some(kw => instruction.includes(kw))) {
          try {
            const content = fs.readFileSync(path.join(skillsDir, `${mapping.skill}.md`), 'utf-8');
            skillContent = `\n\n## LOADED SKILL: ${mapping.skill}\n${content}\n`;
            logger.info('Auto-loaded skill for scheduled task', { skill: mapping.skill });
          } catch (e) {
            logger.warn(`Could not load skill ${mapping.skill}:`, e.message);
          }
          break;
        }
      }
    } catch (e) {
      logger.warn('Skill auto-load failed:', e.message);
    }

    // Load recent progress for cross-cycle memory (Ralph's progress.txt)
    let progressContext = '';
    try {
      progressContext = await getProgressText({ hours: 48, limit: 10 });
    } catch (err) {
      logger.warn('Could not load progress context:', err.message);
    }

    const orgName = agentConfig.config?.orgName || agentConfig.client || 'BLOOM Ecosystem';

    return `You are ${agentConfig.name}, an autonomous AI employee for ${orgName}.

## Your Core Identity
- **Name**: ${agentConfig.name}
- **Role**: ${agentConfig.role}
- **Autonomy Level**: Level ${agentConfig.currentAutonomyLevel}
- **Organization**: ${orgName}

${buildSharedExecutionContract(agentConfig, context?.trigger === 'scheduled' ? 'scheduled' : 'work')}

## EXECUTION DISCIPLINE (MANDATORY — READ CAREFULLY)

You follow a strict 5-step execution protocol. This is not optional.

### Step 1: CLARIFY (MANDATORY for chat tasks)
Before starting ANY multi-step task from a chat message, you MUST call \`bloom_clarify\` FIRST.
This is NOT optional. Ask 1 focused question with 2-4 clickable options. Wait for the answer.
Do NOT start planning or executing until you get a response.

ALWAYS clarify when:
- The task involves creating content, contacting someone, or updating data
- The task has multiple possible interpretations
- The task is missing WHO, WHAT, HOW, or WHERE
ONLY skip clarification when:
- The request is 100% unambiguous with all details provided
- Single trivial action (one lookup, one search)
- Heartbeat/scheduled tasks (already well-defined)

### Step 2: PLAN (Always required for multi-step tasks)
Call \`bloom_todo_write\` to create your plan BEFORE executing ANY tools.
Every step MUST include:
- \`success_criteria\`: What "done" looks like in concrete terms
- \`verification_method\`: How you'll verify it ('api_check', 'result_check', 'llm_judgment')
- \`activeForm\`: Present-tense description (e.g., "Creating contact in GHL")
Do NOT include a separate "Verify" step — verification happens WITHIN each step. When the last real step completes, the task is done.

### Step 3: EXECUTE (One step at a time)
- After the initial plan, immediately execute the first substantive action tool
- Continue through dependent action tools without rewriting the plan between every call
- Only ONE step may be \`in_progress\` at any time
- NEVER skip ahead or batch-complete steps

### Step 4: VERIFY (After every step)
After executing a step, VERIFY it actually worked:
- **api_check**: Query the target system (GHL, database) to confirm the change exists
- **result_check**: Inspect the tool's return value for expected data
- **llm_judgment**: Evaluate content quality against the success criteria
At a material milestone, update the plan once via \`bloom_todo_write\`:
- If verified: set \`status: 'completed'\`, \`verified: true\`, \`verification_evidence: '...'\`
- If NOT verified: set \`status: 'failed'\`, \`verified: false\`, \`failure_reason: '...'\`
- If failed: you may retry up to 2 times (increment \`retry_count\`), then escalate
- A plan update is progress bookkeeping, not execution. Never call
  \`bloom_todo_write\` twice consecutively; an action tool must run between updates.

### Step 5: COMPLETE
The task is complete when ALL steps in your plan have \`verified: true\`.
When all steps pass, respond with "TASK COMPLETED" and a summary.
Do NOT say "TASK COMPLETED" until all steps are verified.

## RULES THAT MUST NOT BE BROKEN
1. NEVER mark a step 'completed' without setting verified: true and providing evidence
2. NEVER have more than one step 'in_progress' at a time
3. NEVER skip creating a plan for multi-step tasks
4. NEVER batch-complete steps — one at a time, verified, then next
5. If a step fails verification twice, ESCALATE — do not keep retrying silently

## Available Tools
- **GHL Tools**: GoHighLevel CRM API (limited by autonomy level)
- **Developer Tools**: Tenant-authorized GitHub repository metadata, branches, directory listings, code search, file reads/writes, plus Vercel projects and deployments
- **Planning Tools**: bloom_todo_write, bloom_clarify, bloom_create_task
- **Logging Tools**: bloom_log_decision, bloom_log_observation
- **Escalation Tools**: bloom_escalate_issue
- **Delegation Tools**: bloom_delegate_task (for specialized sub-agents)
- **Browser Tools**: browser_task (navigate/interact with websites — has 3-tier anti-bot fallback: self-hosted → cloud stealth → BLOOM Desktop), browser_screenshot (capture pages), browser_login (log into sites using saved credentials), browser_list_sites (see which sites have credentials)
- **Search Tools**: web_search (search the internet), web_fetch (fetch page content)
- **Gmail Tools**: gmail_check_inbox (check emails), gmail_read_message (read full email), gmail_send_email (send emails)
- **Document Tools**: bloom_create_document (save documents/artifacts for Kimberly to review in the dashboard), bloom_list_documents, bloom_update_document
- **Image Tools**: image_generate (create images via AI)

## Technical Investigation
Repository structure, default branches, file paths, frameworks, and deployment states are facts you must discover with tools—not questions for Kimberly. Before changing code, inspect repository metadata, list branches and root files, read the package manifest, traverse the relevant source directories, and search code when a path is unknown. Never assume main, master, or index.html. Ask Kimberly only after discovery tools are exhausted, and include the exact checks and errors.

## Site Credentials
Kimberly has saved login credentials for certain websites in the dashboard. When a task requires a logged-in site (Quora, Reddit, LinkedIn, etc.), use \`browser_list_sites\` to check which sites have credentials, then call \`browser_task\` with \`siteName\` (example: \`browser_task({ siteName: "reddit", task: "find questions about AI employees" })\`). Login and work must happen in the same browser_task session. Use \`browser_login\` only as a quick login test, not as a prerequisite for later browser_task calls.
Never claim login/access succeeded if a browser result reports blocked, unverified, CAPTCHA, Cloudflare, challenge, or verification. Report the exact blocker instead.

## Browser Anti-Bot Fallback
browser_task has a 3-tier automatic fallback chain for Cloudflare-protected sites:
- Tier 1: Self-hosted browser (free) — tries first
- Tier 2: Cloud stealth browser (anti-detect) — auto-activates if Cloudflare blocks
- Tier 3: BLOOM Desktop (real browser on user's machine) — last resort
The response includes \`tier_used\` so you know which path worked.
If a site blocks server/cloud automation and BLOOM Desktop is connected in an interactive session, use \`bloom_browser_*\` step tools in the user's real browser. If all tiers fail, log the issue and escalate — do NOT retry endlessly.
IMPORTANT: Never use BLOOM Desktop (bloom_* tools) during background heartbeat tasks without prior user permission. Desktop control is only for interactive sessions where the user explicitly grants access.

## Documents (bloom_create_document)
When you complete research, draft content, write responses, or produce any deliverable, save it using \`bloom_create_document\`. This makes it visible to Kimberly in the dashboard Docs tab. Set \`requiresApproval: true\` ONLY for email campaigns or SMS campaigns. Blog posts, social posts, forum responses, and helpful content do NOT need approval — just save the document as a record of what you did.

## Permission Rules
- **No approval needed**: Blog posts, social media posts, forum/Quora/Reddit responses, helpful content, research, web searches
- **Needs Kimberly approval**: Email campaigns, SMS/text campaigns ONLY
- Do NOT ask Kimberly for permission to post helpful content or respond to forum questions. Just do it.

## Sub-Agent Delegation
Delegate to specialists when tasks need domain expertise:
- **GHL Specialist**: Complex CRM operations, data management
- **Communication Specialist**: Messaging strategies, relationship management
- **Data Analyst**: Pattern recognition, reporting, insights
- **Task Coordinator**: Workflow optimization, project planning
- **Escalation Specialist**: Issue resolution, risk assessment

## Trust Gate (Level ${agentConfig.currentAutonomyLevel})
- Read Operations: ✅ Always allowed
- Write Operations: ${agentConfig.currentAutonomyLevel >= 2 ? '✅ Limited' : '❌ Blocked — escalate if needed'}
- Delete Operations: ${agentConfig.currentAutonomyLevel >= 3 ? '✅ Restricted' : '❌ Blocked'}
- Admin Operations: ${agentConfig.currentAutonomyLevel >= 4 ? '✅ Allowed' : '❌ Blocked'}

## Recent Progress (Cross-Cycle Memory)
${progressContext || 'No recent progress entries — this may be a fresh work session.'}

## Current Context (${now}):
${JSON.stringify(context, null, 2)}

## Standing Instructions:
${agentConfig.standingInstructions}
${skillContent}

## ⚠️ CRITICAL: SCHEDULED TASK EXECUTION RULES
When executing a scheduled task (not interactive chat):
1. You MUST use the tools specified in the task instruction. If the instruction says to use create_artifact and publish_artifact, you MUST call those tools. If it says to use ghl_create_social_post, you MUST call that tool.
2. NEVER just write text as your response and stop. Text-only output means NOTHING was actually created.
3. Your text response alone does NOT create blog posts, does NOT schedule social media, does NOT save artifacts. You MUST call the actual tools.
4. If a tool call fails, report the failure — do NOT pretend the task succeeded.
5. A Bloomie blog post is NOT live until create_artifact returns an artifact ID, publish_artifact returns a /p slug, and web_fetch verifies the public URL. Writing blog content as text is NOT the same as publishing it.
6. After creating the plan, the next tool call MUST be a substantive action tool, not another planning/logging tool.
   - Email inbox tasks: call gmail_check_inbox first.
   - Research/forum tasks: call web_search or browser_task.
   - CRM/follow-up tasks: call the matching ghl_* read/search tool.
   - If a required tool is unavailable or fails, escalate with the exact error.
7. When asked to change or fix "this post", "the current blog", "the one we are working on", or a live /p URL, resolve the artifact yourself. Use the artifact ID from your last tool result when available; otherwise use update_artifact with slug/publicUrl/name so it can find the correct existing artifact. Do not ask the operator to paste code or click "ask for changes" unless you cannot resolve the artifact after trying.

Remember: Plan first. Execute one step. Verify it worked. Then move on.`;
  }

  /**
   * Adapt model selection based on task characteristics
   */
  adaptModelForTask(task, context) {
    const taskLower = task.toLowerCase();
    const hasContext = context && Object.keys(context).length > 0;

    let useCase = 'standard';

    // Detect task characteristics
    if (taskLower.includes('analyz') || taskLower.includes('pattern') || taskLower.includes('report')) {
      useCase = 'analysis';
      this.taskComplexity = 'premium';
    } else if (taskLower.includes('quick') || taskLower.includes('fast') || taskLower.includes('urgent')) {
      useCase = 'quick_response';
      this.taskComplexity = 'fast';
    } else if (taskLower.includes('tool') || taskLower.includes('ghl') || taskLower.includes('api')) {
      useCase = 'tool_heavy';
      this.taskComplexity = 'standard';
    } else if (hasContext && JSON.stringify(context).length > 5000) {
      useCase = 'long_context';
      this.taskComplexity = 'premium';
    }

    const recommendedModel = modelSelector.getRecommendedModel(useCase);

    if (recommendedModel !== this.modelFormatter.model) {
      logger.info('Adapting model for task', {
        task: task.substring(0, 50),
        useCase,
        fromModel: this.modelFormatter.model,
        toModel: recommendedModel
      });

      this.modelFormatter.switchModel(recommendedModel);
    }
  }

  /**
   * Classify task type for tool filtering
   * Returns a category key that maps to TASK_TOOL_MAP in formatToolsForClaude()
   */
  _classifyTaskType(task, context = {}) {
    return classifyExecutionTask(task, context);
  }

  /**
   * Delegate task to specialized sub-agent
   */
  async delegateToSubAgent(task, context = {}, preferredAgent = null) {
    try {
      logger.info('Delegating task to sub-agent', {
        task: task.substring(0, 100),
        preferredAgent,
        agentId: this.agentId
      });

      const parentProfile = await loadAgentConfig(this.agentId);
      const result = await subAgentSystem.delegateTask(task, {
        ...context,
        parentAgentId: parentProfile.agentId,
        parentAgentName: parentProfile.name,
        parentAgentRole: parentProfile.role,
        orgName: parentProfile.config?.orgName || parentProfile.client || 'the current organization',
      }, preferredAgent);

      // Add delegation to tool execution history
      this.toolExecutionHistory.push({
        tool: 'bloom_delegate_task',
        input: { task, context, preferredAgent },
        result: result,
        timestamp: new Date().toISOString()
      });

      return result;

    } catch (error) {
      logger.error('Sub-agent delegation failed:', error);
      return {
        success: false,
        error: error.message,
        subAgent: null
      };
    }
  }

  /**
   * Internal tool implementations
   */
  async createTask(parameters) {
    // Implementation for creating tasks
    logger.info('Creating task', parameters);
    return {
      success: true,
      taskId: `task-${Date.now()}`,
      message: `Task created: ${parameters.title}`
    };
  }

  async logDecision(parameters) {
    // Implementation for logging decisions
    logger.info('Decision logged', parameters);
    return {
      success: true,
      message: `Decision logged: ${parameters.decision}`
    };
  }

  /**
   * Track tool calls for infinite loop detection (Claude Code pattern)
   */
  trackToolCall(toolName, input) {
    const callSignature = `${toolName}:${JSON.stringify(input)}`;
    this.recentToolCalls.push({
      signature: callSignature,
      timestamp: Date.now()
    });

    // Keep only last 10 calls for efficiency
    if (this.recentToolCalls.length > 10) {
      this.recentToolCalls.shift();
    }
  }

  /**
   * Detect infinite loops: same tool + args called 3 times in a row
   */
  detectInfiniteLoop() {
    if (this.recentToolCalls.length < 3) return false;

    const lastThree = this.recentToolCalls.slice(-3);
    const signatures = lastThree.map(call => call.signature);

    // Check if last 3 signatures are identical
    return signatures[0] === signatures[1] && signatures[1] === signatures[2];
  }

  hasSubstantiveToolUse() {
    return this.toolExecutionHistory.some(entry => {
      const name = entry?.tool || entry?.name || entry?.toolName;
      return name && !PRE_ACTION_SUPPRESSED_TOOLS.has(name);
    });
  }

  hasPlanningToolAttempt() {
    return this.toolExecutionHistory.some(entry => {
      const name = entry?.tool || entry?.name || entry?.toolName;
      return name === 'bloom_todo_write' || name === 'todo_write';
    });
  }

  hasToolAttempt(toolName) {
    return this.toolExecutionHistory.some(entry => {
      const name = entry?.tool || entry?.name || entry?.toolName;
      return name === toolName;
    });
  }

  hasSuccessfulToolAttempt(toolName) {
    return this.toolExecutionHistory.some(entry => {
      const name = entry?.tool || entry?.name || entry?.toolName;
      return name === toolName && entry?.result?.success === true;
    });
  }

  getSuccessfulToolResult(toolName) {
    return [...this.toolExecutionHistory].reverse().find(entry => {
      const name = entry?.tool || entry?.name || entry?.toolName;
      return name === toolName && entry?.result?.success === true;
    })?.result || null;
  }

  buildVerifiedCompletionSummary() {
    const lines = ['TASK COMPLETED', '', 'Verified evidence:'];
    const repository = this.getSuccessfulToolResult('github_get_repository')?.repository;
    if (repository?.fullName) {
      lines.push(`- Repository: ${repository.fullName}`);
      if (repository.defaultBranch) lines.push(`- Branch: ${repository.defaultBranch}`);
    }
    const write = this.getSuccessfulToolResult('coding_workspace_write_file');
    if (write?.file?.path) lines.push(`- File: ${write.file.path}`);
    const commit = this.getSuccessfulToolResult('coding_workspace_commit');
    if (commit?.commit) lines.push(`- Commit: ${commit.commit}`);
    if (commit?.url) lines.push(`- Commit URL: ${commit.url}`);
    const deployment = this.getSuccessfulToolResult('vercel_wait_for_deployment')
      || this.getSuccessfulToolResult('vercel_create_deployment');
    const deploymentId = deployment?.deploymentId || deployment?.id || deployment?.deployment?.id;
    const deploymentState = deployment?.status || deployment?.state
      || deployment?.deployment?.state || deployment?.deployment?.readyState;
    const deploymentUrl = deployment?.url || deployment?.deployment?.url;
    if (deploymentId) lines.push(`- Deployment: ${deploymentId}`);
    if (deploymentState) lines.push(`- Deployment state: ${String(deploymentState).toUpperCase()}`);
    if (deploymentUrl) {
      const url = /^https?:\/\//i.test(deploymentUrl) ? deploymentUrl : `https://${deploymentUrl}`;
      lines.push(`- Preview URL: ${url}`);
    }
    return lines.join('\n');
  }

  getDeveloperPlanningReplacement() {
    if (!this.hasToolAttempt('github_list_repositories')) {
      return { name: 'github_list_repositories', input: {} };
    }
    if (!this.hasToolAttempt('vercel_list_projects')) {
      return { name: 'vercel_list_projects', input: {} };
    }

    const repositories = this.getSuccessfulToolResult('github_list_repositories')?.repositories || [];
    const taskSlug = String(this._currentTaskText || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const candidate = repositories
      .map(repository => {
        const [owner, repo] = String(repository.fullName || '').split('/');
        const repoSlug = String(repo || '').toLowerCase();
        const tokens = repoSlug.split(/[-_]+/).filter(token => token.length > 2);
        const score = (taskSlug.includes(repoSlug) ? 100 : 0) +
          tokens.filter(token => taskSlug.includes(token)).length;
        return { owner, repo, score };
      })
      .filter(candidate => candidate.owner && candidate.repo && candidate.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    if (!candidate) return null;
    if (!this.hasToolAttempt('github_get_repository')) {
      return {
        name: 'github_get_repository',
        input: { owner: candidate.owner, repo: candidate.repo },
      };
    }
    if (!this.hasToolAttempt('github_list_files')) {
      const defaultBranch = this.getSuccessfulToolResult('github_get_repository')?.repository?.defaultBranch;
      return {
        name: 'github_list_files',
        input: {
          owner: candidate.owner,
          repo: candidate.repo,
          path: '',
          ...(defaultBranch ? { ref: defaultBranch } : {}),
        },
      };
    }

    const repository = this.getSuccessfulToolResult('github_get_repository')?.repository || {};
    const owner = candidate.owner;
    const repo = candidate.repo;
    const branch = repository.defaultBranch || 'main';
    if (!this.hasToolAttempt('coding_workspace_prepare')) {
      return { name: 'coding_workspace_prepare', input: { owner, repo, ref: branch } };
    }

    const exactFile = this.extractExactDeveloperFileInstruction();
    if (!exactFile) return null;
    if (!this.hasToolAttempt('coding_workspace_write_file')) {
      return {
        name: 'coding_workspace_write_file',
        input: { owner, repo, path: exactFile.path, content: exactFile.content },
      };
    }
    if (!this.hasToolAttempt('coding_workspace_read_file')) {
      return {
        name: 'coding_workspace_read_file',
        input: { owner, repo, path: exactFile.path },
      };
    }
    if (!this.hasToolAttempt('coding_workspace_diff')) {
      return { name: 'coding_workspace_diff', input: { owner, repo } };
    }

    const commitMessage = String(this._currentTaskText || '')
      .match(/commit with message\s+["“]([^"”]+)["”]/i)?.[1];
    if (commitMessage && !this.hasToolAttempt('coding_workspace_commit')) {
      return {
        name: 'coding_workspace_commit',
        input: { owner, repo, branch, message: commitMessage },
      };
    }

    const projects = this.getSuccessfulToolResult('vercel_list_projects')?.projects || [];
    const project = projects.find(item => String(item.name || '').toLowerCase() === repo.toLowerCase())
      || projects.find(item => repo.toLowerCase().includes(String(item.name || '').toLowerCase()));
    if (project && /\bpreview deployment\b/i.test(String(this._currentTaskText || '')) &&
        !this.hasToolAttempt('vercel_create_deployment')) {
      return {
        name: 'vercel_create_deployment',
        input: { name: project.name, repo: `${owner}/${repo}`, ref: branch, target: 'preview' },
      };
    }

    const deployment = this.getSuccessfulToolResult('vercel_create_deployment') || {};
    if (Object.keys(deployment).length > 0 && !this.hasToolAttempt('vercel_wait_for_deployment')) {
      const deploymentId = deployment.deploymentId || deployment.id;
      return {
        name: 'vercel_wait_for_deployment',
        input: {
          ...(deploymentId
            ? { deploymentId }
            : { projectId: project?.id || project?.name }),
          timeoutSeconds: 180,
          pollIntervalSeconds: 10,
        },
      };
    }
    return null;
  }

  extractExactDeveloperFileInstruction() {
    const task = String(this._currentTaskText || '');
    const path = task.match(/\b([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)\b/)?.[1];
    const contentMatch = task.match(/exact content must be:\s*\n([\s\S]*?)(?=\n\s*\d+\.\s|\n\s*commit with message|\n\s*create a preview|\n\s*do not alter|$)/i);
    if (!path || !contentMatch) return null;
    const content = contentMatch[1].trim();
    return content ? { path, content } : null;
  }

  isScheduledEmailCheckInComplete() {
    if (this._isScheduledTask && this._currentTaskType === 'blog') {
      return this.hasSuccessfulToolAttempt('create_artifact') &&
        this.hasSuccessfulToolAttempt('publish_artifact') &&
        this.hasSuccessfulToolAttempt('web_fetch');
    }
    return this._isScheduledTask &&
      this._currentTaskType === 'email' &&
      this.hasSuccessfulToolAttempt('gmail_check_inbox') &&
      this.hasSuccessfulToolAttempt('notify_owner');
  }

  needsScheduledOwnerNotification() {
    return this._isScheduledTask &&
      this._currentTaskType === 'email' &&
      this.hasToolAttempt('gmail_check_inbox') &&
      !this.hasToolAttempt('notify_owner');
  }

  isTextOnlyScheduledTask() {
    if (!this._isScheduledTask) return false;
    const text = `${this._currentTaskName || ''} ${this._currentRawTaskType || ''} ${this._currentTaskText || ''}`.toLowerCase();
    return /(?:smoke test|reply with exactly|respond with exactly|say exactly)/.test(text);
  }

  shouldSuppressPlanningToolsForScheduledTask(toolName) {
    if (this.needsScheduledOwnerNotification()) {
      return PRE_ACTION_SUPPRESSED_TOOLS.has(toolName);
    }
    if (!this._isScheduledTask) return false;
    if (this.isExplicitlyReadOnlyScheduledTask()) {
      return PRE_ACTION_SUPPRESSED_TOOLS.has(toolName);
    }
    // Scheduled work already has a persisted task definition and the scheduler
    // validates its substantive tool evidence. Exposing TodoWrite here lets
    // smaller models spend the whole execution rewriting a duplicate plan.
    // Keep planning/logging available in Chat and Work, but remove it from
    // scheduled runs from the first turn onward.
    return (this.hasSubstantiveToolUse() ? NON_SUBSTANTIVE_TOOLS : PRE_ACTION_SUPPRESSED_TOOLS).has(toolName);
  }

  shouldSuppressConsecutivePlanningTools(toolName) {
    if (this._isScheduledTask || !NON_SUBSTANTIVE_TOOLS.has(toolName)) return false;
    const lastEntry = this.toolExecutionHistory[this.toolExecutionHistory.length - 1];
    const lastName = lastEntry?.tool || lastEntry?.name || lastEntry?.toolName;
    // Chat/Work may publish progress between actions, but never allow two
    // planning-only turns in a row. The next model turn must use a substantive
    // tool, after which planning tools become available again.
    return Boolean(lastName && NON_SUBSTANTIVE_TOOLS.has(lastName));
  }

  shouldSuppressRepeatedBlogImageTool(toolName) {
    return this._isScheduledTask &&
      this._currentTaskType === 'blog' &&
      toolName === 'image_generate' &&
      this.hasSuccessfulToolAttempt('image_generate');
  }

  getScheduledBlogNextToolSet() {
    if (!this._isScheduledTask || this._currentTaskType !== 'blog') return null;
    if (this.hasSuccessfulToolAttempt('publish_artifact')) {
      if (!this.hasSuccessfulToolAttempt('web_fetch')) return new Set(['web_fetch']);
      // The publish and live-page verification are the terminal actions. Give
      // the model a tool-free turn so it must report the evidence instead of
      // publishing or fetching the same page again.
      return new Set();
    }
    if (this.hasSuccessfulToolAttempt('create_artifact')) return new Set(['publish_artifact']);
    if (this.hasSuccessfulToolAttempt('image_generate')) return new Set(['create_artifact']);
    return null;
  }

  getScheduledResearchNextToolSet() {
    if (!this._isScheduledTask || this._currentTaskType !== 'research') return null;
    const taskText = `${this._currentTaskName || ''} ${this._currentTaskText || ''}`.toLowerCase();
    const requiresSavedDocument = /(?:save|create|compile)[\s\S]{0,80}(?:artifact|document|briefing|report|drafts)/i.test(taskText);
    const researchTools = ['web_search', 'web_fetch', 'browser_task'];
    const researchComplete = researchTools.some(toolName => this.hasSuccessfulToolAttempt(toolName));
    if (!researchComplete) return null;
    if (requiresSavedDocument && !this.hasSuccessfulToolAttempt('bloom_create_document')) {
      return new Set(['bloom_create_document']);
    }
    // Research evidence exists (and any requested document has been saved).
    // A tool-free final turn prevents repeated fetch/search loops.
    return new Set();
  }

  getScheduledRequiredNextToolSet() {
    const workflowSet = this.getScheduledBlogNextToolSet() || this.getScheduledResearchNextToolSet();
    if (workflowSet) return workflowSet;

    if (this.isExplicitlyReadOnlyScheduledTask() && this.hasSubstantiveToolUse()) {
      // A successful read receipt is terminal for an explicitly read-only
      // probe. Remove tools on the following turn so Gemini reports evidence
      // instead of repeating the same lookup until loop detection.
      return new Set();
    }
    return null;
  }

  isExplicitlyReadOnlyScheduledTask() {
    if (!this._isScheduledTask) return false;
    const taskText = `${this._currentTaskName || ''} ${this._currentTaskText || ''}`.toLowerCase();
    return /\bread[- ]only\b/.test(taskText) ||
      /do not (?:create|update|send|notify|publish|schedule|delete)/.test(taskText);
  }

  shouldRepairScheduledBlogTemplateFailure(toolName, toolResult = {}) {
    if (!this._isScheduledTask || this._currentTaskType !== 'blog') return false;
    if (toolName !== 'create_artifact') return false;
    if (this.scheduledBlogRepairAttempts >= 2) return false;
    const error = String(toolResult.error || toolResult.message || '');
    return /Bloomie blog failed the locked template gate/i.test(error);
  }

  shouldContinueScheduledTaskAfterPlanningOnly(currentTurn) {
    if (this.isTextOnlyScheduledTask()) return false;
    if (!this._isScheduledTask || this.hasSubstantiveToolUse()) return false;
    return currentTurn < 5;
  }

  getUnfinishedPlanSteps() {
    if (!this.currentPlan || !Array.isArray(this.currentPlan.steps)) return [];
    return this.currentPlan.steps.filter(step => {
      const status = step.status || (step.verified ? 'completed' : 'pending');
      return status !== 'completed' || step.verified !== true;
    });
  }

  textLooksLikeDeferredWork(text = '') {
    return /\b(i('|’)ll|i will|i am going to|i'm going to|i can continue|i'll continue|will continue|continue working|i'll work on|i will work on|next i('|’)ll|next i will|get back to you|follow up|checking now)\b/i.test(text);
  }

  shouldContinueAfterUnfinishedPlan(textResponse, currentTurn) {
    if (this.forceFinalEvidenceTurn) return false;
    // Scheduled runs are validated from their real tool history by the outer
    // scheduler. Once an action tool has run, do not trap the worker in plan
    // bookkeeping just because the model omitted a final todo-state rewrite.
    if (this._isScheduledTask && this.hasSubstantiveToolUse()) return false;
    const unfinished = this.getUnfinishedPlanSteps();
    if (unfinished.length === 0 || this.allStepsPassing) return false;
    if (this.unfinishedPlanNudges >= 3) return false;
    if (currentTurn >= this.safetyValveThreshold) return false;
    return this.textLooksLikeDeferredWork(textResponse || '') || this.hasPlanningToolAttempt();
  }

  getScheduledNextToolHint() {
    switch (this._currentTaskType) {
      case 'email':
        return 'Call gmail_check_inbox now. Use query "is:unread newer_than:1d" unless the task gives a more specific inbox query.';
      case 'research':
        return 'Call web_search or browser_task now, depending on whether the task needs public search or a logged-in site.';
      case 'followup':
        return 'Call a GHL read/search tool now, such as ghl_search_contacts, ghl_get_conversations, or ghl_list_tasks.';
      case 'blog':
        if (this.hasSuccessfulToolAttempt('image_generate') && !this.hasSuccessfulToolAttempt('create_artifact')) {
          return 'Use the existing successful hero image URL and call create_artifact now. Do not call image_generate again.';
        }
        if (this.hasSuccessfulToolAttempt('create_artifact') && !this.hasSuccessfulToolAttempt('publish_artifact')) {
          return 'Call publish_artifact now using the artifact ID returned by create_artifact.';
        }
        if (this.hasSuccessfulToolAttempt('publish_artifact') && !this.hasSuccessfulToolAttempt('web_fetch')) {
          return 'Call web_fetch now on the published public URL and the live /p/blog index. Confirm the live post has the title, master marker, Bloomie-hosted hero image, author row/date, and that /p/blog includes the new card. If verification finds a fixable HTML issue, call update_artifact on the existing artifact and then web_fetch again.';
        }
        return 'Call web_search, web_fetch, image_generate, create_artifact, update_artifact, or publish_artifact now, depending on the current plan step. Do not call ghl_create_blog_post for Bloomie blog publishing.';
      case 'social':
        return 'Call web_search, image_generate, or ghl_create_social_post now, depending on the current plan step.';
      default:
        return 'Call the first real action tool required by the task now. Do not call bloom_todo_write, bloom_clarify, or logging tools again until after that action tool returns.';
    }
  }

  async injectScheduledSubstantiveToolReminder() {
    const reminder = `## Scheduled Task Guardrail
You have planned, but no substantive action tool has run yet. A scheduled task is not verified by planning alone.

NEXT ACTION: ${this.getScheduledNextToolHint()}

If the action tool fails, report or escalate the exact error. Do not respond with TASK COMPLETED until a real tool has run and the plan step is verified.`;

    await this.contextManager.addConversationTurn('system', reminder, {
      type: 'system_critical',
      source: 'scheduled_substantive_tool_guardrail',
      priority: 10
    });
  }

  async injectScheduledBlogRepairReminder(toolResult = {}) {
    const error = String(toolResult.error || toolResult.message || 'Unknown template error');
    const reminder = `## Bloomie Blog Self-Repair Required
Your create_artifact call was rejected by the locked Bloomie blog template gate. This is a repairable quality failure, not a reason to stop.

Fix the HTML you just attempted to save, then call create_artifact again with the corrected full HTML. Do not generate another hero image unless the existing image URL itself is invalid.

Required fixes from the gate:
${error}

Before retrying create_artifact, confirm in the HTML:
- It contains the marker comment: <!-- Bloomie Blog Master v2026-06-19 -->
- The structure is header.blog-master-header, then one direct img.hero-image, then div.content.
- The hero image URL and author avatar URL both use https://njfhzabmaxhfzekbzpzz.supabase.co/storage/v1/object/public/bloom-images/
- The first visible block inside div.content is div.author-row with avatar, author-name, role line, and visible publication date.
- The final CTA is a dark cta-card near the end of the article and includes exactly: Call Us Now, Schedule a Demo, Interview an AI Employee.
- The page includes the Bloomie nav safety CSS for .site-nav, .site-logo, .nav-cta, plain nav, a.logo, and a.cta-button.

If the bad HTML was already saved or published, call update_artifact on the existing artifact ID with the corrected full HTML instead of creating a duplicate.

After create_artifact or update_artifact succeeds, continue normally with publish_artifact when needed and web_fetch verification.`;

    await this.contextManager.addConversationTurn('system', reminder, {
      type: 'system_critical',
      source: 'scheduled_blog_self_repair',
      priority: 10
    });
  }

  async injectUnfinishedPlanContinuationReminder(textResponse = '') {
    this.unfinishedPlanNudges = (this.unfinishedPlanNudges || 0) + 1;
    const unfinished = this.getUnfinishedPlanSteps();
    const reminder = `## Unfinished Task Guardrail
You were about to stop, but the current plan still has unfinished or unverified steps.

Unfinished steps:
${unfinished.map(step => `- ${step.status || 'pending'}: ${step.content}`).join('\n')}

Do not promise to continue later. Continue now: mark the next unfinished step in_progress, call the required action tool, verify the result, then update the plan. Only respond with TASK COMPLETED after every plan step is completed and verified.

Previous text-only response that was intercepted:
${String(textResponse || '').slice(0, 800)}`;

    await this.contextManager.addConversationTurn('system', reminder, {
      type: 'system_critical',
      source: 'unfinished_plan_guardrail',
      priority: 10
    });
  }

  /**
   * Inject current plan state as system message (Claude Code TodoWrite behavior)
   */
  async injectPlanStateReminder() {
    if (!this.currentPlan) return;

    const verifiedCount = (this.currentPlan.steps || []).filter(s => s.verified).length;
    const totalCount = (this.currentPlan.steps || []).length;
    const allPassing = this.currentPlan.all_steps_passing || this.allStepsPassing;

    const planReminder = `## Current Task Plan: ${this.currentPlan.title}
**Verification: ${verifiedCount}/${totalCount} steps verified${allPassing ? ' — ALL PASSING ✅' : ''}**

${this.currentPlan.steps.map(step => {
  const status = step.status || (step.verified ? 'completed' : 'pending');
  const statusIcon = step.verified ? '✅' : status === 'failed' ? '❌' : status === 'in_progress' ? '🔄' : '⬜';
  const verifyTag = step.verified ? ` [VERIFIED: ${step.verification_evidence || 'confirmed'}]` :
    status === 'failed' ? ` [FAILED: ${step.failure_reason || 'unknown'}]` : '';
  return `${statusIcon} ${step.id}. [${status.toUpperCase()}] ${step.content}${verifyTag}`;
}).join('\n')}

NEXT ACTION: Find the highest-priority pending step, mark it in_progress, execute it, then VERIFY before marking complete.
${allPassing ? 'ALL STEPS VERIFIED — you may now respond with TASK COMPLETED.' : ''}`;

    await this.contextManager.addConversationTurn('system', planReminder, {
      type: 'system_critical',
      source: 'todo_reminder',
      priority: 10
    });

    logger.debug('Injected plan state reminder into conversation');
  }

  /**
   * Format completion message for Claude Code style progress streaming
   */
  formatCompletionMessage(toolName, toolResult) {
    if (!toolResult.success) {
      return `❌ ${this.getToolDescription(toolName, {})} failed: ${toolResult.error || 'Unknown error'}`;
    }

    // Special formatting for common tools
    if (toolName === 'ghl_create_contact' && toolResult.data?.contact) {
      return `✅ Created contact: ${toolResult.data.contact.firstName || ''} ${toolResult.data.contact.lastName || ''} (ID: ${toolResult.data.contact.id || 'unknown'})`;
    }

    if (toolName === 'ghl_search_contacts' && toolResult.data?.contacts) {
      return `✅ Found ${toolResult.data.contacts.length} contacts matching criteria`;
    }

    if (toolName === 'bloom_todo_write' && toolResult.currentState) {
      return `✅ Created task plan: "${toolResult.currentState.title}" with ${toolResult.currentState.steps.length} steps`;
    }

    // Generic success message
    return `✅ ${this.getToolDescription(toolName, {})} completed successfully`;
  }

  async escalateToHuman(parameters) {
    // Implementation for human escalation
    logger.warn('Escalating to human', parameters);
    return {
      success: true,
      escalationId: `esc-${Date.now()}`,
      message: `Issue escalated: ${parameters.issue}`
    };
  }
}

// Export default instance
export const agentExecutor = new AgentExecutor();

// Export for use in other modules
export { EXECUTION_STATUS };
