// Model-Agnostic Formatting System for Sarah Rodriguez
// Supports Claude, OpenAI GPT, and other LLM providers with unified interface

import { createLogger } from '../logging/logger.js';

const logger = createLogger('model-formatter');

/**
 * Model capabilities and limitations
 */
export const MODEL_CAPABILITIES = {
  'claude-sonnet-4-5-20250929': {
    provider: 'anthropic',
    maxTokens: 200000,
    supportsTools: true,
    supportsImages: true,
    supportsSystemMessages: true,
    messageFormat: 'anthropic',
    toolFormat: 'anthropic',
    contextWindow: 200000,
    outputTokenLimit: 4096
  },
  'claude-haiku-4-5-20251001': {
    provider: 'anthropic',
    maxTokens: 200000,
    supportsTools: true,
    supportsImages: true,
    supportsSystemMessages: true,
    messageFormat: 'anthropic',
    toolFormat: 'anthropic',
    contextWindow: 200000,
    outputTokenLimit: 4096
  },
  'gpt-4o': {
    provider: 'openai',
    maxTokens: 128000,
    supportsTools: true,
    supportsImages: true,
    supportsSystemMessages: true,
    messageFormat: 'openai',
    toolFormat: 'openai',
    contextWindow: 128000,
    outputTokenLimit: 4096
  },
  'gpt-4-turbo': {
    provider: 'openai',
    maxTokens: 128000,
    supportsTools: true,
    supportsImages: true,
    supportsSystemMessages: true,
    messageFormat: 'openai',
    toolFormat: 'openai',
    contextWindow: 128000,
    outputTokenLimit: 4096
  },
  'gpt-3.5-turbo': {
    provider: 'openai',
    maxTokens: 16385,
    supportsTools: true,
    supportsImages: false,
    supportsSystemMessages: true,
    messageFormat: 'openai',
    toolFormat: 'openai',
    contextWindow: 16385,
    outputTokenLimit: 4096
  }
};

/**
 * Model-Agnostic Formatter
 * Handles conversion between different LLM formats
 */
export class ModelFormatter {
  constructor(model = 'claude-sonnet-4-5-20250929') {
    this.model = model;
    this.capabilities = MODEL_CAPABILITIES[model];

    if (!this.capabilities) {
      logger.warn(`Unknown model: ${model}, using Claude Sonnet defaults`);
      this.capabilities = MODEL_CAPABILITIES['claude-sonnet-4-5-20250929'];
    }

    logger.info('Initialized model formatter', { model, provider: this.capabilities.provider });
  }

  /**
   * Format messages for the current model
   */
  formatMessages(messages, systemPrompt = null) {
    const formatted = this.convertMessageFormat(messages);

    if (systemPrompt && this.capabilities.supportsSystemMessages) {
      return this.addSystemMessage(formatted, systemPrompt);
    }

    return formatted;
  }

  /**
   * Format tools for the current model
   */
  formatTools(tools) {
    if (!this.capabilities.supportsTools || !tools || tools.length === 0) {
      return [];
    }

    switch (this.capabilities.toolFormat) {
      case 'anthropic':
        return this.formatAnthropicTools(tools);
      case 'openai':
        return this.formatOpenAITools(tools);
      default:
        logger.warn(`Unsupported tool format: ${this.capabilities.toolFormat}`);
        return [];
    }
  }

  /**
   * Convert messages to appropriate format
   */
  convertMessageFormat(messages) {
    switch (this.capabilities.messageFormat) {
      case 'anthropic':
        return this.formatAnthropicMessages(messages);
      case 'openai':
        return this.formatOpenAIMessages(messages);
      default:
        logger.warn(`Unsupported message format: ${this.capabilities.messageFormat}`);
        return messages;
    }
  }

  /**
   * Format messages for Anthropic (Claude) API
   */
  formatAnthropicMessages(messages) {
    return messages.map(msg => {
      // Handle tool calls and responses
      if (msg.content && Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content
        };
      }

      // Standard text messages
      return {
        role: msg.role === 'system' ? 'user' : msg.role, // Claude doesn't use system in messages array
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      };
    });
  }

  /**
   * Format messages for OpenAI API
   */
  formatOpenAIMessages(messages) {
    return messages.map(msg => {
      // Handle tool calls
      if (msg.content && Array.isArray(msg.content)) {
        const toolCalls = msg.content.filter(block => block.type === 'tool_use').map(block => ({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        }));

        const textContent = msg.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');

        if (toolCalls.length > 0) {
          return {
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolCalls
          };
        }
      }

      // Handle tool responses
      if (msg.role === 'user' && msg.content && Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(block => block.type === 'tool_result');
        if (toolResults.length > 0) {
          return toolResults.map(result => ({
            role: 'tool',
            tool_call_id: result.tool_use_id,
            content: result.content
          }));
        }
      }

      // Standard messages
      return {
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      };
    }).flat(); // Flatten in case of tool result arrays
  }

  /**
   * Format tools for Anthropic API
   */
  formatAnthropicTools(tools) {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters || tool.input_schema
    }));
  }

  /**
   * Format tools for OpenAI API
   */
  formatOpenAITools(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || tool.input_schema
      }
    }));
  }

  /**
   * Add system message in appropriate format
   */
  addSystemMessage(messages, systemPrompt) {
    switch (this.capabilities.provider) {
      case 'anthropic':
        // Claude uses separate system parameter
        return { messages, system: systemPrompt };
      case 'openai':
        // OpenAI includes system message in messages array
        return [{ role: 'system', content: systemPrompt }, ...messages];
      default:
        return messages;
    }
  }

  /**
   * Create API request parameters for the current model
   */
  createAPIRequest(messages, tools = null, systemPrompt = null, options = {}) {
    const baseParams = {
      model: this.model,
      max_tokens: Math.min(options.maxTokens || this.capabilities.outputTokenLimit, this.capabilities.outputTokenLimit),
      temperature: options.temperature || 0.1
    };

    const formattedTools = this.formatTools(tools);
    const formattedMessages = this.formatMessages(messages, systemPrompt);

    switch (this.capabilities.provider) {
      case 'anthropic':
        const anthropicParams = {
          ...baseParams,
          messages: formattedMessages.messages || formattedMessages
        };

        if (systemPrompt) {
          anthropicParams.system = systemPrompt;
        }

        if (formattedTools.length > 0) {
          anthropicParams.tools = formattedTools;
        }

        return anthropicParams;

      case 'openai':
        const openaiParams = {
          ...baseParams,
          messages: Array.isArray(formattedMessages) ? formattedMessages : [formattedMessages]
        };

        if (formattedTools.length > 0) {
          openaiParams.tools = formattedTools;
          openaiParams.tool_choice = options.toolChoice || 'auto';
        }

        return openaiParams;

      default:
        logger.error(`Unsupported provider: ${this.capabilities.provider}`);
        return baseParams;
    }
  }

  /**
   * Parse model response to unified format
   */
  parseResponse(response) {
    switch (this.capabilities.provider) {
      case 'anthropic':
        return this.parseAnthropicResponse(response);
      case 'openai':
        return this.parseOpenAIResponse(response);
      default:
        logger.error(`Cannot parse response for provider: ${this.capabilities.provider}`);
        return { content: [], usage: null };
    }
  }

  /**
   * Parse Anthropic (Claude) response
   */
  parseAnthropicResponse(response) {
    return {
      content: response.content || [],
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
      },
      stopReason: response.stop_reason,
      model: response.model
    };
  }

  /**
   * Parse OpenAI response
   */
  parseOpenAIResponse(response) {
    const choice = response.choices?.[0];
    if (!choice) {
      return { content: [], usage: null };
    }

    const content = [];

    // Handle text content
    if (choice.message.content) {
      content.push({
        type: 'text',
        text: choice.message.content
      });
    }

    // Handle tool calls
    if (choice.message.tool_calls) {
      choice.message.tool_calls.forEach(toolCall => {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments || '{}')
        });
      });
    }

    return {
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      stopReason: choice.finish_reason,
      model: response.model
    };
  }

  /**
   * Check if context fits within model limits
   */
  validateContextSize(messages, tools = null, systemPrompt = null) {
    const messageTokens = this.estimateMessageTokens(messages);
    const toolTokens = this.estimateToolTokens(tools);
    const systemTokens = this.estimateTokens(systemPrompt || '');

    const totalTokens = messageTokens + toolTokens + systemTokens;
    const available = this.capabilities.contextWindow;

    return {
      valid: totalTokens <= available,
      totalTokens,
      availableTokens: available,
      utilizationPercent: Math.round((totalTokens / available) * 100),
      breakdown: {
        messages: messageTokens,
        tools: toolTokens,
        system: systemTokens
      }
    };
  }

  /**
   * Estimate token count for messages
   */
  estimateMessageTokens(messages) {
    if (!Array.isArray(messages)) return 0;

    return messages.reduce((total, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return total + this.estimateTokens(content);
    }, 0);
  }

  /**
   * Estimate token count for tools
   */
  estimateToolTokens(tools) {
    if (!tools || !Array.isArray(tools)) return 0;

    return tools.reduce((total, tool) => {
      const toolStr = JSON.stringify(tool);
      return total + this.estimateTokens(toolStr);
    }, 0);
  }

  /**
   * Estimate tokens for text (rough approximation)
   */
  estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    // Rough estimation: 1 token ≈ 4 characters for English
    // More accurate for each provider would require their tokenizers
    return Math.ceil(text.length / 4);
  }

  /**
   * Get model capabilities
   */
  getCapabilities() {
    return { ...this.capabilities };
  }

  /**
   * Switch to different model
   */
  switchModel(newModel) {
    if (!MODEL_CAPABILITIES[newModel]) {
      logger.error(`Unknown model: ${newModel}`);
      return false;
    }

    const oldModel = this.model;
    this.model = newModel;
    this.capabilities = MODEL_CAPABILITIES[newModel];

    logger.info('Switched model', { from: oldModel, to: newModel, provider: this.capabilities.provider });
    return true;
  }
}

/**
 * Model Selection Helper
 * Automatically select best model based on requirements
 */
export class ModelSelector {
  constructor() {
    this.models = Object.keys(MODEL_CAPABILITIES);
  }

  /**
   * Select optimal model based on requirements
   */
  selectModel(requirements = {}) {
    const {
      maxTokens = 100000,
      needsTools = false,
      needsImages = false,
      provider = null,
      budget = 'standard' // 'fast', 'standard', 'premium'
    } = requirements;

    // Filter models by requirements
    let candidates = this.models.filter(model => {
      const caps = MODEL_CAPABILITIES[model];

      if (maxTokens > caps.contextWindow) return false;
      if (needsTools && !caps.supportsTools) return false;
      if (needsImages && !caps.supportsImages) return false;
      if (provider && caps.provider !== provider) return false;

      return true;
    });

    if (candidates.length === 0) {
      logger.warn('No models match requirements, using default');
      return 'claude-sonnet-4-5-20250929';
    }

    // Select based on budget preference
    switch (budget) {
      case 'fast':
        // Prefer faster/cheaper models
        return candidates.find(m => m.includes('haiku')) ||
               candidates.find(m => m.includes('3.5-turbo')) ||
               candidates[0];

      case 'premium':
        // Prefer most capable models
        return candidates.find(m => m.includes('sonnet') && m.includes('4-5')) ||
               candidates.find(m => m.includes('gpt-4o')) ||
               candidates[0];

      default:
        // Standard selection - balance capability and cost
        return candidates.find(m => m.includes('sonnet')) ||
               candidates.find(m => m.includes('gpt-4-turbo')) ||
               candidates[0];
    }
  }

  /**
   * Get recommended model for specific use cases
   */
  getRecommendedModel(useCase) {
    switch (useCase) {
      case 'tool_heavy':
        return this.selectModel({ needsTools: true, budget: 'standard' });
      case 'analysis':
        return this.selectModel({ maxTokens: 200000, budget: 'premium' });
      case 'quick_response':
        return this.selectModel({ budget: 'fast' });
      case 'image_processing':
        return this.selectModel({ needsImages: true, budget: 'standard' });
      case 'long_context':
        return this.selectModel({ maxTokens: 200000, budget: 'premium' });
      default:
        return 'claude-sonnet-4-5-20250929';
    }
  }
}

// Export instances
export const modelFormatter = new ModelFormatter();
export const modelSelector = new ModelSelector();