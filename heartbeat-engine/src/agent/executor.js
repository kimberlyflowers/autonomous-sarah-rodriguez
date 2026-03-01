// Sarah's Agentic Execution Engine
// Multi-turn tool chaining system similar to Claude Code architecture
// Executes tasks autonomously with tool use until completion

import { createLogger } from '../logging/logger.js';
import { loadAgentConfig } from '../config/agent-profile.js';
import { getAnthropicClient } from '../api/chat.js';
import { executeGHLTool, ghlToolDefinitions } from '../tools/ghl-tools.js';

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
      // Check if it's a GHL tool
      if (toolName.startsWith('ghl_')) {
        return await executeGHLTool(toolName, parameters);
      }

      // Handle other internal tools
      switch (toolName) {
        case 'create_task':
          return await this.createTask(parameters);
        case 'log_decision':
          return await this.logDecision(parameters);
        case 'escalate_to_human':
          return await this.escalateToHuman(parameters);
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

    } catch (error) {
      logger.error(`Tool execution failed: ${toolName}`, error);
      return {
        success: false,
        error: error.message
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

    // Add internal tools
    claudeTools.push({
      name: 'create_task',
      description: 'Create a new task in the planning system',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Task priority' }
        },
        required: ['title', 'description']
      }
    });

    claudeTools.push({
      name: 'log_decision',
      description: 'Log a decision or reasoning step for transparency',
      input_schema: {
        type: 'object',
        properties: {
          decision: { type: 'string', description: 'The decision made' },
          reasoning: { type: 'string', description: 'Why this decision was made' },
          confidence: { type: 'number', description: 'Confidence level 0-1' }
        },
        required: ['decision', 'reasoning']
      }
    });

    claudeTools.push({
      name: 'escalate_to_human',
      description: 'Escalate an issue to human oversight when needed',
      input_schema: {
        type: 'object',
        properties: {
          issue: { type: 'string', description: 'Description of the issue' },
          analysis: { type: 'string', description: 'Analysis performed so far' },
          recommendation: { type: 'string', description: 'Recommended action' },
          urgency: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Urgency level' }
        },
        required: ['issue', 'analysis']
      }
    });

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
- **GHL Tools**: Full access to GoHighLevel API (contacts, opportunities, calendars, etc.)
- **Planning Tools**: Create tasks and track progress
- **Logging Tools**: Record decisions and reasoning
- **Escalation Tools**: Hand off to humans when appropriate

### Completion Signal:
When you have completed the task, respond with "TASK COMPLETED" followed by a clear summary of what was accomplished.

## Current Context (${now}):
${JSON.stringify(context, null, 2)}

## Standing Instructions:
${agentConfig.standingInstructions}

Remember: You operate at Level 1 autonomy, so focus on observation, analysis, and appropriate escalation. Use your tools wisely and work systematically toward task completion.`;
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