// Sarah's Agentic Execution Engine
// Multi-turn tool chaining system similar to Claude Code architecture
// Executes tasks autonomously with tool use until completion

import { createLogger } from '../logging/logger.js';
import { loadAgentConfig } from '../config/agent-profile.js';
import { getAnthropicClient } from '../api/chat.js';
import { executeGHLTool, ghlToolDefinitions } from '../tools/ghl-tools.js';
import { executeInternalTool, internalToolDefinitions } from '../tools/internal-tools.js';
import { subAgentSystem, SUB_AGENTS } from '../agents/sub-agent-system.js';
import { trustGate } from '../trust/trust-gate.js';

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
  constructor(agentId = 'bloomie-sarah-rodriguez') {
    this.agentId = agentId;
    this.maxTurns = 10; // Maximum conversation turns to prevent infinite loops
    this.toolExecutionHistory = [];
    this.conversationHistory = [];
  }

  /**
   * Execute a task using agentic tool chaining
   * @param {string} task - The task description
   * @param {Object} context - Additional context for execution
   * @returns {Object} Execution result with status and outputs
   */
  async executeTask(task, context = {}) {
    const startTime = Date.now();
    logger.info('Starting agentic task execution', {
      task: task.substring(0, 100),
      agentId: this.agentId
    });

    try {
      // Load agent configuration and build system prompt
      const agentConfig = await loadAgentConfig(this.agentId);
      const systemPrompt = await this.buildSystemPrompt(agentConfig, context);

      // Initialize conversation with the task
      this.conversationHistory = [{
        role: 'user',
        content: `Execute this task autonomously: ${task}

Available context: ${JSON.stringify(context, null, 2)}

Use the available tools to complete this task. Work step by step and explain your reasoning. When you've completed the task, clearly state "TASK COMPLETED" followed by a summary of what was accomplished.`
      }];

      let currentTurn = 0;
      let status = EXECUTION_STATUS.RUNNING;
      let finalResult = null;

      // Multi-turn execution loop
      while (status === EXECUTION_STATUS.RUNNING && currentTurn < this.maxTurns) {
        currentTurn++;
        logger.info(`Execution turn ${currentTurn}/${this.maxTurns}`);

        try {
          // Call Claude with current conversation and available tools
          const response = await this.callClaudeWithTools(systemPrompt);

          // Process the response
          const turnResult = await this.processTurnResponse(response);

          // Update status based on turn result
          if (turnResult.completed) {
            status = EXECUTION_STATUS.COMPLETED;
            finalResult = turnResult.result;
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

      // Handle max turns reached
      if (currentTurn >= this.maxTurns && status === EXECUTION_STATUS.RUNNING) {
        status = EXECUTION_STATUS.FAILED;
        finalResult = { error: 'Maximum execution turns reached without completion' };
      }

      const duration = Date.now() - startTime;
      logger.info('Task execution finished', {
        status,
        duration,
        turns: currentTurn,
        toolsUsed: this.toolExecutionHistory.length
      });

      return {
        status,
        result: finalResult,
        executionTime: duration,
        turns: currentTurn,
        toolsUsed: this.toolExecutionHistory.length,
        conversationHistory: this.conversationHistory,
        toolHistory: this.toolExecutionHistory
      };

    } catch (error) {
      logger.error('Failed to execute task:', error);
      return {
        status: EXECUTION_STATUS.FAILED,
        error: error.message,
        executionTime: Date.now() - startTime,
        turns: 0,
        toolsUsed: 0
      };
    }
  }

  /**
   * Call Claude API with tools and current conversation
   */
  async callClaudeWithTools(systemPrompt) {
    const client = getAnthropicClient();

    // Convert GHL tool definitions to Claude format
    const claudeTools = this.formatToolsForClaude();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      temperature: 0.1, // Low temperature for consistent execution
      system: systemPrompt,
      messages: this.conversationHistory,
      tools: claudeTools
    });

    return response;
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

        // Add text to conversation
        this.conversationHistory.push({
          role: 'assistant',
          content: block.text
        });

      } else if (block.type === 'tool_use') {
        hasToolUse = true;

        // Execute the tool
        const toolResult = await this.executeTool(block.name, block.input);

        // Record tool execution
        this.toolExecutionHistory.push({
          tool: block.name,
          input: block.input,
          result: toolResult,
          timestamp: new Date().toISOString()
        });

        // Add tool use and result to conversation
        this.conversationHistory.push({
          role: 'assistant',
          content: [block] // Tool use block
        });

        this.conversationHistory.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolResult, null, 2)
          }]
        });

        logger.info('Tool executed', {
          tool: block.name,
          success: toolResult.success
        });
      }
    }

    return {
      completed,
      blocked,
      result,
      hasToolUse
    };
  }

  /**
   * Execute a tool by name with parameters
   */
  async executeTool(toolName, parameters) {
    try {
      // TRUST GATE: Check authorization before execution
      const authorization = await trustGate.authorizeAction(
        toolName,
        parameters,
        this.agentId,
        `exec-${Date.now()}` // Use execution-based cycle ID
      );

      if (!authorization.authorized) {
        logger.warn('Tool execution blocked by trust gate', {
          tool: toolName,
          reason: authorization.reason,
          code: authorization.code
        });

        return {
          success: false,
          blocked: true,
          reason: authorization.reason,
          code: authorization.code,
          requiredLevel: authorization.requiredLevel,
          currentLevel: authorization.currentLevel,
          escalated: authorization.escalate
        };
      }

      logger.info('Tool authorized by trust gate', {
        tool: toolName,
        level: authorization.level,
        category: authorization.category,
        risk: authorization.risk
      });

      // Execute the tool after authorization
      let result;

      if (toolName.startsWith('ghl_')) {
        result = await executeGHLTool(toolName, parameters);
      } else if (toolName.startsWith('bloom_')) {
        result = await executeInternalTool(toolName, parameters);
      } else {
        // Handle legacy internal tools for backward compatibility
        switch (toolName) {
          case 'create_task':
            result = await executeInternalTool('bloom_create_task', parameters);
            break;
          case 'log_decision':
            result = await executeInternalTool('bloom_log_decision', parameters);
            break;
          case 'escalate_to_human':
            result = await executeInternalTool('bloom_escalate_issue', parameters);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }
      }

      // Add authorization info to successful results
      if (result.success) {
        result.authorization = {
          level: authorization.level,
          category: authorization.category,
          risk: authorization.risk,
          limits: authorization.limits
        };
      }

      return result;

    } catch (error) {
      logger.error(`Tool execution failed: ${toolName}`, error);
      return {
        success: false,
        error: error.message,
        blocked: false
      };
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

    return claudeTools;
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