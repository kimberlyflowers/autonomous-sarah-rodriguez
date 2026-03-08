// Sub-Agent Architecture System for Sarah Rodriguez
// Specialized autonomous sub-agents for domain-specific tasks
// Each sub-agent has focused expertise and tool access

import { createLogger } from '../logging/logger.js';
import { getAnthropicClient } from '../api/chat.js';
import { executeGHLTool, ghlToolDefinitions } from '../tools/ghl-tools.js';
import { executeInternalTool, internalToolDefinitions } from '../tools/internal-tools.js';
import { trustGate } from '../trust/trust-gate.js';

const logger = createLogger('sub-agents');

/**
 * Sub-Agent Registry - Specialized autonomous agents
 */
export const SUB_AGENTS = {
  ghl_specialist: {
    name: 'GHL Operations Specialist',
    description: 'Expert in GoHighLevel CRM operations, contacts, opportunities, and workflows',
    expertise: ['contacts', 'opportunities', 'calendars', 'workflows', 'pipelines', 'tasks'],
    tools: [
      'ghl_search_contacts', 'ghl_get_contact', 'ghl_create_contact', 'ghl_update_contact',
      'ghl_search_opportunities', 'ghl_create_opportunity', 'ghl_update_opportunity_stage',
      'ghl_list_calendars', 'ghl_get_calendar_slots', 'ghl_create_appointment',
      'ghl_list_tasks', 'ghl_create_task', 'ghl_update_task',
      'ghl_list_pipelines', 'ghl_get_pipeline_stages', 'ghl_list_workflows',
      'bloom_log_decision', 'bloom_create_task', 'bloom_escalate_issue'
    ],
    systemPrompt: `You are a GoHighLevel CRM Operations Specialist sub-agent working for Sarah Rodriguez at BLOOM Ecosystem.

EXPERTISE: You are an expert in GoHighLevel operations including contacts, opportunities, calendars, workflows, and pipelines.

YOUR ROLE:
- Execute CRM operations with precision and efficiency
- Maintain data integrity and follow best practices
- Optimize workflows and identify process improvements
- Escalate complex business decisions appropriately

CAPABILITIES:
- Contact management (search, create, update, organize)
- Opportunity tracking and pipeline management
- Calendar and appointment scheduling
- Task creation and management
- Workflow automation setup
- Data analysis and reporting

APPROACH:
- Always verify data before making changes
- Log your reasoning for audit trails
- Follow GHL best practices for data structure
- Escalate when uncertain about business impact
- Focus on accuracy over speed`
  },

  communication_specialist: {
    name: 'Communication Specialist',
    description: 'Expert in client communication, messaging, and relationship management',
    expertise: ['messaging', 'communication', 'relationships', 'follow_ups', 'campaigns'],
    tools: [
      'ghl_send_message', 'notify_owner', 'ghl_get_conversations', 'ghl_create_note',
      'ghl_get_notes', 'ghl_add_contact_tag', 'ghl_remove_contact_tag',
      'ghl_list_campaigns', 'ghl_get_campaign_stats',
      'bloom_log_decision', 'bloom_log_observation', 'bloom_store_context',
      'bloom_retrieve_context', 'bloom_escalate_issue'
    ],
    systemPrompt: `You are a Communication Specialist sub-agent working for Sarah Rodriguez at BLOOM Ecosystem.

EXPERTISE: You excel at client communication, relationship management, and messaging strategy.

YOUR ROLE:
- Craft personalized, effective communications
- Manage follow-up sequences and timing
- Analyze communication patterns and effectiveness
- Maintain relationship context and preferences

CAPABILITIES:
- Multi-channel messaging (SMS, Email, WhatsApp)
- Communication timing optimization
- Relationship context management
- Follow-up sequence automation
- Campaign performance analysis
- Conversation thread management

COMMUNICATION PRINCIPLES:
- Personalization over automation
- Respect communication preferences
- Maintain professional yet friendly tone
- Track engagement and adjust approach
- Never overwhelm with frequency
- Always provide value in communications

APPROACH:
- Analyze recipient history before messaging
- Store insights about communication preferences
- Log effectiveness for pattern analysis
- Escalate sensitive relationship issues`
  },

  data_analyst: {
    name: 'Data Analysis Specialist',
    description: 'Expert in data analysis, pattern recognition, and business intelligence',
    expertise: ['analysis', 'patterns', 'metrics', 'reporting', 'insights'],
    tools: [
      'ghl_search_contacts', 'ghl_search_opportunities', 'ghl_get_campaign_stats',
      'ghl_list_tasks', 'ghl_get_notes', 'ghl_get_form_submissions',
      'bloom_analyze_patterns', 'bloom_generate_summary', 'bloom_log_observation',
      'bloom_store_context', 'bloom_retrieve_context', 'bloom_log_decision'
    ],
    systemPrompt: `You are a Data Analysis Specialist sub-agent working for Sarah Rodriguez at BLOOM Ecosystem.

EXPERTISE: You excel at data analysis, pattern recognition, and extracting actionable insights from GHL data.

YOUR ROLE:
- Analyze GHL data for trends and patterns
- Generate comprehensive reports and summaries
- Identify optimization opportunities
- Provide data-driven recommendations

ANALYTICAL CAPABILITIES:
- Contact behavior analysis and segmentation
- Opportunity pipeline analysis and forecasting
- Communication effectiveness measurement
- Campaign performance evaluation
- Conversion rate optimization
- Lead quality assessment
- Time-based pattern recognition

APPROACH:
- Start with clear analytical objectives
- Use multiple data points for validation
- Focus on actionable insights over raw data
- Quantify impact and confidence levels
- Store insights for future reference
- Present findings in business-friendly terms

DELIVERABLES:
- Executive summaries with key insights
- Trend analysis with forward-looking recommendations
- Performance metrics with improvement suggestions
- Pattern identification with business implications`
  },

  task_coordinator: {
    name: 'Task Planning & Coordination Specialist',
    description: 'Expert in task management, workflow optimization, and operational planning',
    expertise: ['planning', 'coordination', 'workflows', 'optimization', 'task_management'],
    tools: [
      'bloom_create_task', 'bloom_list_tasks', 'bloom_update_task',
      'bloom_log_decision', 'bloom_store_context', 'bloom_retrieve_context',
      'ghl_create_task', 'ghl_list_tasks', 'ghl_update_task',
      'ghl_list_workflows', 'ghl_add_contact_to_workflow',
      'bloom_escalate_issue'
    ],
    systemPrompt: `You are a Task Planning & Coordination Specialist sub-agent working for Sarah Rodriguez at BLOOM Ecosystem.

EXPERTISE: You excel at task management, workflow optimization, and operational planning coordination.

YOUR ROLE:
- Design efficient task workflows and sequences
- Coordinate complex multi-step operations
- Optimize resource allocation and timing
- Monitor task completion and bottlenecks

PLANNING CAPABILITIES:
- Break complex objectives into actionable tasks
- Sequence tasks for optimal efficiency
- Identify dependencies and critical paths
- Allocate tasks based on priority and capacity
- Monitor progress and adjust plans
- Coordinate between different operational areas

WORKFLOW OPTIMIZATION:
- Analyze current processes for inefficiencies
- Design improved workflows with clear steps
- Implement automation where appropriate
- Create feedback loops for continuous improvement
- Document processes for knowledge transfer

APPROACH:
- Always start with clear objective definition
- Map out all required steps and dependencies
- Consider resource constraints and timing
- Build in checkpoints and quality gates
- Plan for contingencies and error handling
- Document decisions and lessons learned`
  },

  escalation_specialist: {
    name: 'Escalation & Issue Resolution Specialist',
    description: 'Expert in identifying, analyzing, and escalating complex issues requiring human intervention',
    expertise: ['escalation', 'issue_resolution', 'risk_assessment', 'decision_support'],
    tools: [
      'bloom_escalate_issue', 'bloom_log_decision', 'bloom_log_observation',
      'bloom_store_context', 'bloom_retrieve_context', 'bloom_analyze_patterns',
      'ghl_get_contact', 'ghl_get_conversations', 'ghl_get_notes'
    ],
    systemPrompt: `You are an Escalation & Issue Resolution Specialist sub-agent working for Sarah Rodriguez at BLOOM Ecosystem.

EXPERTISE: You excel at identifying, analyzing, and properly escalating complex issues that require human intervention.

YOUR ROLE:
- Identify situations requiring human oversight
- Analyze complex problems and gather context
- Prepare comprehensive escalation packages
- Assess risk levels and business impact

ESCALATION CRITERIA:
- High-value client relationship issues
- Complex business logic decisions
- Technical problems beyond automated resolution
- Ethical or policy questions
- Financial implications above threshold
- Data integrity or security concerns

ANALYSIS APPROACH:
- Gather all relevant context and data
- Identify root causes vs symptoms
- Assess potential business impact
- Document attempted resolutions
- Provide clear recommendations
- Estimate urgency and timeframes

ESCALATION PACKAGE:
- Clear issue description with context
- Analysis of root causes and impact
- Actions already attempted
- Recommended resolution approach
- Business justification for human intervention
- Timeline considerations and urgency level`
  }
};

/**
 * Sub-Agent Executor - Handles delegation to specialized agents
 */
export class SubAgentSystem {
  constructor(parentAgentId = 'bloomie-sarah-rodriguez') {
    this.parentAgentId = parentAgentId;
    this.activeSubAgents = new Map();
  }

  /**
   * Delegate task to appropriate sub-agent based on requirements
   * @param {string} task - Task description
   * @param {Object} context - Task context
   * @param {string} preferredAgent - Preferred sub-agent (optional)
   * @returns {Object} Delegation result
   */
  async delegateTask(task, context = {}, preferredAgent = null) {
    const startTime = Date.now();
    logger.info('Delegating task to sub-agent', {
      task: task.substring(0, 100),
      preferredAgent,
      parentAgent: this.parentAgentId
    });

    try {
      // Select appropriate sub-agent
      const selectedAgent = preferredAgent || this.selectBestAgent(task, context);

      if (!selectedAgent || !SUB_AGENTS[selectedAgent]) {
        throw new Error(`Invalid sub-agent selection: ${selectedAgent}`);
      }

      const agentConfig = SUB_AGENTS[selectedAgent];

      // Execute task with selected sub-agent
      const result = await this.executeWithSubAgent(selectedAgent, task, context, agentConfig);

      const duration = Date.now() - startTime;
      logger.info('Sub-agent task completed', {
        agent: selectedAgent,
        success: result.success,
        duration
      });

      return {
        success: true,
        subAgent: selectedAgent,
        agentName: agentConfig.name,
        result: result,
        executionTime: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Sub-agent delegation failed:', error);

      return {
        success: false,
        error: error.message,
        executionTime: duration
      };
    }
  }

  /**
   * Select the best sub-agent for a given task
   * @param {string} task - Task description
   * @param {Object} context - Task context
   * @returns {string} Selected sub-agent key
   */
  selectBestAgent(task, context) {
    const taskLower = task.toLowerCase();
    const contextStr = JSON.stringify(context).toLowerCase();
    const combined = taskLower + ' ' + contextStr;

    // Score each sub-agent based on expertise match
    const scores = {};

    for (const [agentKey, agent] of Object.entries(SUB_AGENTS)) {
      let score = 0;

      // Check expertise keywords
      agent.expertise.forEach(keyword => {
        if (combined.includes(keyword.toLowerCase())) {
          score += 2;
        }
      });

      // Check available tools
      agent.tools.forEach(tool => {
        if (combined.includes(tool.toLowerCase().replace('_', ' '))) {
          score += 1;
        }
      });

      scores[agentKey] = score;
    }

    // Return agent with highest score
    const bestAgent = Object.keys(scores).reduce((a, b) =>
      scores[a] > scores[b] ? a : b
    );

    logger.info('Sub-agent selection', {
      task: task.substring(0, 50),
      scores,
      selected: bestAgent
    });

    return bestAgent;
  }

  /**
   * Execute task with specific sub-agent
   * @param {string} agentKey - Sub-agent key
   * @param {string} task - Task to execute
   * @param {Object} context - Task context
   * @param {Object} agentConfig - Agent configuration
   * @returns {Object} Execution result
   */
  async executeWithSubAgent(agentKey, task, context, agentConfig) {
    const client = getAnthropicClient();

    // Build specialized system prompt
    const systemPrompt = this.buildSubAgentPrompt(agentConfig, context);

    // Format available tools for this sub-agent
    const availableTools = this.formatSubAgentTools(agentConfig.tools);

    // Execute with Claude API
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Execute this specialized task autonomously:

${task}

Context: ${JSON.stringify(context, null, 2)}

Use your specialized expertise and available tools to complete this task efficiently. Work step-by-step and explain your reasoning. When completed, provide a clear summary of what was accomplished.

Remember: You are a specialized sub-agent with focused expertise. Leverage your domain knowledge to deliver high-quality results.`
      }],
      tools: availableTools
    });

    // Process response and handle any tool calls
    return await this.processSubAgentResponse(response, agentKey, agentConfig);
  }

  /**
   * Build specialized system prompt for sub-agent
   */
  buildSubAgentPrompt(agentConfig, context) {
    const now = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'short'
    });

    return `${agentConfig.systemPrompt}

## Current Context (${now}):
You are operating as a specialized sub-agent under Sarah Rodriguez's coordination at BLOOM Ecosystem.

## Your Available Tools:
${agentConfig.tools.map(tool => `- ${tool}`).join('\n')}

## Parent Agent Context:
${JSON.stringify(context, null, 2)}

## Execution Guidelines:
- Use your specialized expertise to deliver high-quality results
- Work autonomously within your domain of expertise
- Log important decisions for transparency
- Escalate appropriately when encountering edge cases
- Focus on accuracy and best practices in your domain
- Provide clear explanations of your reasoning

Complete the assigned task using your specialized knowledge and available tools.`;
  }

  /**
   * Format tools available to sub-agent for Claude API
   */
  formatSubAgentTools(toolNames) {
    const claudeTools = [];

    toolNames.forEach(toolName => {
      // Check GHL tools
      if (ghlToolDefinitions[toolName]) {
        const toolDef = ghlToolDefinitions[toolName];
        claudeTools.push({
          name: toolName,
          description: toolDef.description,
          input_schema: toolDef.parameters
        });
      }

      // Check internal tools
      if (internalToolDefinitions[toolName]) {
        const toolDef = internalToolDefinitions[toolName];
        claudeTools.push({
          name: toolName,
          description: toolDef.description,
          input_schema: toolDef.parameters
        });
      }
    });

    return claudeTools;
  }

  /**
   * Process sub-agent response and execute any tool calls
   */
  async processSubAgentResponse(response, agentKey, agentConfig) {
    const toolExecutions = [];
    let textResponse = '';

    // Process each content block
    for (const block of response.content) {
      if (block.type === 'text') {
        textResponse += block.text;
      } else if (block.type === 'tool_use') {
        // Execute tool with trust gate check
        const toolResult = await this.executeSubAgentTool(
          block.name,
          block.input,
          agentKey
        );

        toolExecutions.push({
          tool: block.name,
          input: block.input,
          result: toolResult
        });
      }
    }

    return {
      success: true,
      response: textResponse,
      toolExecutions: toolExecutions,
      agentKey: agentKey,
      agentName: agentConfig.name
    };
  }

  /**
   * Execute tool for sub-agent with trust gate validation
   */
  async executeSubAgentTool(toolName, parameters, agentKey) {
    try {
      // Trust gate check
      const authorization = await trustGate.authorizeAction(
        toolName,
        parameters,
        this.parentAgentId,
        `subagent-${agentKey}-${Date.now()}`
      );

      if (!authorization.authorized) {
        return {
          success: false,
          blocked: true,
          reason: authorization.reason,
          subAgent: agentKey
        };
      }

      // Execute tool
      if (toolName.startsWith('ghl_')) {
        return await executeGHLTool(toolName, parameters);
      } else if (toolName.startsWith('bloom_')) {
        return await executeInternalTool(toolName, parameters);
      } else {
        throw new Error(`Unknown tool: ${toolName}`);
      }

    } catch (error) {
      logger.error(`Sub-agent tool execution failed: ${toolName}`, error);
      return {
        success: false,
        error: error.message,
        subAgent: agentKey
      };
    }
  }

  /**
   * Get sub-agent capabilities and status
   */
  getSubAgentRegistry() {
    return Object.keys(SUB_AGENTS).map(key => ({
      key,
      name: SUB_AGENTS[key].name,
      description: SUB_AGENTS[key].description,
      expertise: SUB_AGENTS[key].expertise,
      toolCount: SUB_AGENTS[key].tools.length,
      active: this.activeSubAgents.has(key)
    }));
  }

  /**
   * Get active sub-agent statistics
   */
  getSubAgentStats() {
    return {
      totalSubAgents: Object.keys(SUB_AGENTS).length,
      activeSubAgents: this.activeSubAgents.size,
      availableExpertise: [...new Set(
        Object.values(SUB_AGENTS).flatMap(agent => agent.expertise)
      )],
      totalSpecializedTools: [...new Set(
        Object.values(SUB_AGENTS).flatMap(agent => agent.tools)
      )].length
    };
  }
}

// Export singleton instance
export const subAgentSystem = new SubAgentSystem();