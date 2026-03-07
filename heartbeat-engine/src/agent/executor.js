// Sarah's Agentic Execution Engine
// Multi-turn tool chaining system similar to Claude Code architecture
// Executes tasks autonomously with tool use until completion

import { createLogger } from '../logging/logger.js';
import { loadAgentConfig } from '../config/agent-profile.js';
import { getAnthropicClient } from '../api/chat.js';
import { executeGHLTool, ghlToolDefinitions } from '../tools/ghl-tools.js';
import { executeInternalTool, internalToolDefinitions } from '../tools/internal-tools.js';
import { executeBrowserTool, browserToolDefinitions } from '../tools/browser-tools.js';
import { executeWebSearchTool, webSearchToolDefinitions } from '../tools/web-search-tools.js';
import { executeImageTool, imageToolDefinitions } from '../tools/image-tools.js';
import { executeScrapeTools, scrapeToolDefinitions } from '../tools/scrape-tools.js';
import { subAgentSystem, SUB_AGENTS } from '../agents/sub-agent-system.js';
import { trustGate } from '../trust/trust-gate.js';
import { contextManager } from '../context/context-manager.js';
import { ModelFormatter, modelSelector } from '../context/model-formatter.js';
import { enhancedExecutor } from '../tools/enhanced-executor.js';
import { systemMonitor } from '../monitoring/system-monitor.js';
import { broadcastExecutionProgress } from '../api/events.js';

const logger = createLogger('agent-executor');

// Agent execution status
const EXECUTION_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  BLOCKED: 'blocked'
};

/**
 * Main agentic execution engine
 * Takes a task and executes it autonomously using tool chaining
 */
export class AgentExecutor {
  constructor(agentId = 'bloomie-sarah-rodriguez', options = {}) {
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
    this.modelFormatter = new ModelFormatter(options.model || 'claude-haiku-4-5-20251001');

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
  async executeTask(task, context = {}) {
    const startTime = Date.now();
    const { v4: uuidv4 } = await import('uuid');
    this.executionId = uuidv4();
    this.currentTurn = 0;

    logger.info('Starting agentic task execution', {
      task: task.substring(0, 100),
      agentId: this.agentId,
      executionId: this.executionId
    });

    try {
      // Load agent configuration and build system prompt
      const agentConfig = await loadAgentConfig(this.agentId);

      let systemPrompt;
      if (context.trigger === 'chat') {
        // Use conversational system prompt passed from chat.js
        systemPrompt = context.chatSystemPrompt;
        logger.info('Using conversational chat prompt for execution');
      } else {
        // Use agentic execution prompt for heartbeat/tasks
        systemPrompt = await this.buildSystemPrompt(agentConfig, context);
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

      // Select optimal model for this task if adaptive models are enabled
      if (this.useAdaptiveModels) {
        this.adaptModelForTask(task, context);
      }

      let currentTurn = 0;
      let status = EXECUTION_STATUS.RUNNING;
      let finalResult = null;

      // Claude Code's nO pattern: while (response has tool_use) { execute → feed back → get next response }
      while (status === EXECUTION_STATUS.RUNNING) {
        currentTurn++;
        this.currentTurn = currentTurn;

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

      return {
        status,
        result: finalResult,
        executionTime: duration,
        turns: currentTurn,
        toolsUsed: this.toolExecutionHistory.length,
        conversationHistory: this.conversationHistory,
        toolHistory: this.toolExecutionHistory,
        contextStats,
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
    const client = getAnthropicClient();

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
   */
  async callLLMWithParams(systemPrompt, messages, tools) {
    const client = getAnthropicClient();

    // Create API request using model formatter
    const apiParams = this.modelFormatter.createAPIRequest(
      messages,
      tools,
      systemPrompt,
      {
        maxTokens: 4000,
        temperature: 0.1
      }
    );

    // Make the API call
    const response = await client.messages.create(apiParams);

    // Parse response using model formatter
    const parsed = this.modelFormatter.parseResponse(response);

    logger.info('LLM response received', {
      model: this.modelFormatter.model,
      inputTokens: parsed.usage?.inputTokens,
      outputTokens: parsed.usage?.outputTokens,
      stopReason: parsed.stopReason
    });

    return {
      ...response,
      parsed
    };
  }

  /**
   * Process Claude's response and handle tool calls
   */
  async processTurnResponse(response) {
    const content = response.content;
    let hasToolUse = false;
    let completed = false;
    let blocked = false;
    let result = null;

    // Process each content block
    for (const block of content) {
      if (block.type === 'text') {
        // Check for completion signal
        if (block.text.includes('TASK COMPLETED')) {
          completed = true;
          result = block.text;
        }

        // Add text to conversation using context manager
        await this.contextManager.addConversationTurn('assistant', block.text, {
          type: 'assistant_response',
          priority: 7,
          turnNumber: this.conversationHistory.length
        });

      } else if (block.type === 'tool_use') {
        hasToolUse = true;
        this.currentStep++;

        // Broadcast tool execution start (Claude Code interleaved thinking)
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

        // Broadcast tool execution completion with updated todoState
        broadcastExecutionProgress({
          executionId: this.executionId,
          turn: this.currentTurn,
          toolName: block.name,
          toolStatus: toolResult.success ? "completed" : "failed",
          todoState: this.currentPlan?.steps || null,
          message: this.formatCompletionMessage(block.name, toolResult)
        });

        // Add tool use and result to conversation using context manager
        await this.contextManager.addConversationTurn('assistant', [block], {
          type: 'tool_execution',
          tool: block.name,
          priority: 8,
          turnNumber: this.conversationHistory.length
        });

        await this.contextManager.addConversationTurn('user', [{
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(toolResult, null, 2)
        }], {
          type: 'tool_result',
          tool: block.name,
          success: toolResult.success,
          priority: 8,
          turnNumber: this.conversationHistory.length
        });

        logger.info('Tool executed', {
          tool: block.name,
          success: toolResult.success
        });

        // Claude Code behavior: After bloom_todo_write, inject current plan state
        if (block.name === 'bloom_todo_write' && toolResult.success && toolResult.currentState) {
          this.currentPlan = toolResult.currentState;
          await this.injectPlanStateReminder();
        }
      }
    }

    return {
      completed,
      blocked,
      result,
      hasToolUse,
      textResponse: content.find(block => block.type === 'text')?.text
    };
  }

  /**
   * Execute a tool by name with parameters using enhanced executor
   */
  async executeTool(toolName, parameters, options = {}) {
    try {
      logger.info('Executing tool with enhanced capabilities', {
        tool: toolName,
        agentId: this.agentId,
        enhanced: true
      });

      // Use enhanced executor with retry logic and performance monitoring
      const result = await enhancedExecutor.executeTool(toolName, parameters, {
        timeout: options.timeout || 30000,
        retryOnFailure: options.retryOnFailure !== false,
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
   */
  formatToolsForClaude() {
    const claudeTools = [];

    // Add GHL tools
    for (const [toolName, toolDef] of Object.entries(ghlToolDefinitions)) {
      claudeTools.push({
        name: toolName,
        description: toolDef.description,
        input_schema: toolDef.parameters
      });
    }

    // Add comprehensive internal tools
    for (const [toolName, toolDef] of Object.entries(internalToolDefinitions)) {
      claudeTools.push({
        name: toolName,
        description: toolDef.description,
        input_schema: toolDef.parameters
      });
    }

    // Add browser automation tools
    for (const [toolName, toolDef] of Object.entries(browserToolDefinitions)) {
      claudeTools.push({
        name: toolName,
        description: toolDef.description,
        input_schema: toolDef.parameters
      });
    }

    // Add web search tools
    for (const [toolName, toolDef] of Object.entries(webSearchToolDefinitions)) {
      claudeTools.push({
        name: toolName,
        description: toolDef.description,
        input_schema: toolDef.parameters
      });
    }

    // Add image generation tools
    for (const [toolName, toolDef] of Object.entries(imageToolDefinitions)) {
      claudeTools.push({
        name: toolName,
        description: toolDef.description,
        input_schema: toolDef.parameters
      });
    }

    // Add lead scraping tools
    for (const [toolName, toolDef] of Object.entries(scrapeToolDefinitions)) {
      claudeTools.push({
        name: toolName,
        description: toolDef.description,
        input_schema: toolDef.parameters
      });
    }

    return claudeTools;
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

    return `You are Sarah Rodriguez, an autonomous AI operations agent for BLOOM Ecosystem.

## Your Core Identity
- **Name**: ${agentConfig.name}
- **Role**: ${agentConfig.role}
- **Autonomy Level**: Level ${agentConfig.currentAutonomyLevel} (Observer)
- **Organization**: BLOOM Ecosystem

## Execution Guidelines
You are now in AGENTIC EXECUTION MODE. You have access to tools and can work autonomously to complete tasks through multi-turn conversations.

### Key Principles:
1. **Work systematically** - Break complex tasks into steps
2. **Use tools purposefully** - Each tool call should have clear intent
3. **Explain your reasoning** - Be transparent about your decision-making
4. **Escalate when needed** - If something exceeds your autonomy level, escalate
5. **Complete tasks thoroughly** - Don't stop until the task is fully done

### Available Tools:
- **GHL Tools**: GoHighLevel API access (limited by autonomy level)
- **Planning Tools**: Create tasks and track progress
- **Logging Tools**: Record decisions and reasoning
- **Escalation Tools**: Hand off to humans when appropriate
- **Delegation Tools**: Delegate specialized tasks to expert sub-agents

### Sub-Agent Architecture:
You have access to specialized sub-agents for complex tasks:

**GHL Operations Specialist**: Expert in GoHighLevel CRM operations
- Expertise: contacts, opportunities, calendars, workflows, pipelines, tasks
- Use for: Complex GHL operations, data management, workflow optimization

**Communication Specialist**: Expert in client communication and relationships
- Expertise: messaging, communication, relationships, follow-ups, campaigns
- Use for: Complex messaging strategies, relationship management, campaign analysis

**Data Analysis Specialist**: Expert in pattern recognition and insights
- Expertise: analysis, patterns, metrics, reporting, insights
- Use for: Complex data analysis, trend identification, performance reporting

**Task Planning & Coordination Specialist**: Expert in workflow optimization
- Expertise: planning, coordination, workflows, optimization, task_management
- Use for: Complex project planning, workflow design, coordination challenges

**Escalation & Issue Resolution Specialist**: Expert in problem escalation
- Expertise: escalation, issue_resolution, risk_assessment, decision_support
- Use for: Complex issues requiring human escalation, risk assessment

**When to Delegate:**
- Complex multi-step operations requiring domain expertise
- Tasks that would benefit from specialized knowledge
- Operations requiring multiple tool interactions
- Analysis or planning that exceeds basic execution

### Enhanced Tool Execution:
You have access to advanced tool execution capabilities:

**Retry Logic**: Tools automatically retry on recoverable failures
- Rate limits, timeouts, and temporary service issues
- Exponential backoff with jitter to prevent overload
- Different retry strategies per tool category (GHL API, Internal, etc.)

**Performance Monitoring**: All tool executions are monitored
- Execution time tracking and success rate analysis
- Performance optimization recommendations
- Failed execution analysis and pattern detection

**Parallel Execution**: Execute multiple independent tools simultaneously
- Automatically detect when tools can run in parallel
- Respect concurrency limits and resource constraints
- Batch processing for improved efficiency

**Dependency Management**: Handle complex tool workflows
- Execute tools in correct order based on dependencies
- Pass results between dependent tools automatically
- Handle partial failures gracefully with rollback options

**Enhanced Error Handling**: Intelligent error recovery
- Categorize errors by type (temporary vs permanent)
- Automatic retry for recoverable errors
- Detailed error context and resolution suggestions

### System Monitoring & Self-Healing:
You operate within a comprehensive monitoring and self-healing environment:

**Health Monitoring**: All system components are continuously monitored
- Context manager utilization and compression triggers
- Tool performance and success rates
- Trust gate violations and security metrics
- Database connectivity and API service health
- Memory usage and resource optimization

**Auto-Healing Capabilities**: System automatically recovers from issues
- Context compression when approaching token limits
- Tool retry logic for transient failures
- Resource cleanup and garbage collection
- API rate limit handling and backoff strategies
- Database reconnection and failover procedures

**System Alerts**: Real-time notification of system issues
- Performance degradation warnings
- Security violation alerts
- Resource utilization thresholds
- Service connectivity problems
- Auto-healing action confirmations

**Current System Health**: ${this.systemHealth}
**Auto-Healing**: ${this.systemMonitor.autoHealingEnabled ? 'Enabled' : 'Disabled'}

### Trust Gate Enforcement:
You are operating under Trust Gate protection. All tool use is monitored and enforced based on your autonomy level:

**Level ${agentConfig.currentAutonomyLevel} Permissions:**
- **Read Operations**: ✅ Search contacts, view data, list resources
- **Write Operations**: ${agentConfig.currentAutonomyLevel >= 2 ? '✅ Limited' : '❌ Blocked'} Send messages, update contacts, create records
- **Delete Operations**: ${agentConfig.currentAutonomyLevel >= 3 ? '✅ Restricted' : '❌ Blocked'} Delete data (with constraints)
- **Admin Operations**: ${agentConfig.currentAutonomyLevel >= 4 ? '✅ Allowed' : '❌ Blocked'} System configuration

**IMPORTANT**: If a tool is blocked, you'll receive a clear error message. When this happens:
1. Acknowledge the constraint transparently
2. Suggest alternative approaches within your level
3. Escalate to humans if the blocked action is critical

### Completion Signal:
When you have completed the task, respond with "TASK COMPLETED" followed by a clear summary of what was accomplished.

## Current Context (${now}):
${JSON.stringify(context, null, 2)}

## Standing Instructions:
${agentConfig.standingInstructions}

Remember: You operate at Level 1 autonomy, so focus on observation, analysis, and appropriate escalation. Use your tools wisely and work systematically toward task completion.`;
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
   * Delegate task to specialized sub-agent
   */
  async delegateToSubAgent(task, context = {}, preferredAgent = null) {
    try {
      logger.info('Delegating task to sub-agent', {
        task: task.substring(0, 100),
        preferredAgent,
        agentId: this.agentId
      });

      const result = await subAgentSystem.delegateTask(task, context, preferredAgent);

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

  /**
   * Inject current plan state as system message (Claude Code TodoWrite behavior)
   */
  async injectPlanStateReminder() {
    if (!this.currentPlan) return;

    const planReminder = `## Current Task Plan:
**${this.currentPlan.title}**

${this.currentPlan.steps.map(step =>
  `${step.id}. [${step.status.toUpperCase()}] ${step.content} (${step.priority} priority)`
).join('\n')}

Remember: Mark steps 'in_progress' BEFORE starting them. Mark 'completed' ONLY after verifying success.`;

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