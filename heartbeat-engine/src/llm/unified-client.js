// Unified LLM Client for BLOOM Bloomie Agents
// Supports Anthropic (Claude), OpenAI (GPT), DeepSeek — hot-swappable at runtime
// All tools work identically regardless of which model is active

import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('llm-client');

/**
 * Provider registry — how to call each LLM provider
 */
const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    models: [
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-20250514',
      'claude-opus-4-5-20250414',
    ],
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: null, // uses SDK default
  },
  openai: {
    name: 'OpenAI',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'o3-mini',
    ],
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
  },
  deepseek: {
    name: 'DeepSeek',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
    ],
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
  },
};

/**
 * Detect provider from model name
 */
function detectProvider(model) {
  for (const [providerKey, provider] of Object.entries(PROVIDERS)) {
    if (provider.models.includes(model)) return providerKey;
  }
  // Heuristic fallback
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('deepseek')) return 'deepseek';
  return 'anthropic'; // default
}

/**
 * Format tools for Anthropic API
 */
function formatToolsAnthropic(tools) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema || t.parameters,
  }));
}

/**
 * Format tools for OpenAI-compatible APIs (OpenAI, DeepSeek)
 */
function formatToolsOpenAI(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema || t.parameters,
    },
  }));
}

/**
 * Parse Anthropic response → unified format
 */
function parseAnthropicResponse(response) {
  return {
    content: response.content || [],
    stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
    usage: {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    },
    model: response.model,
    raw: response,
  };
}

/**
 * Parse OpenAI-compatible response → unified format
 * Converts OpenAI's tool_calls format to Anthropic-style content blocks
 */
function parseOpenAIResponse(response) {
  const choice = response.choices?.[0];
  if (!choice) return { content: [], stopReason: 'end_turn', usage: {}, model: response.model, raw: response };

  const content = [];

  // Text content
  if (choice.message.content) {
    content.push({ type: 'text', text: choice.message.content });
  }

  // Tool calls → convert to Anthropic-style tool_use blocks
  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}'),
      });
    }
  }

  const stopReason = choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop' 
    ? (choice.message.tool_calls?.length > 0 ? 'tool_use' : 'end_turn')
    : 'end_turn';

  return {
    content,
    stopReason,
    usage: {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
    },
    model: response.model,
    raw: response,
  };
}

/**
 * Format tool results for Anthropic
 */
function formatToolResultsAnthropic(toolResults) {
  return {
    role: 'user',
    content: toolResults.map(r => ({
      type: 'tool_result',
      tool_use_id: r.tool_use_id,
      content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
    })),
  };
}

/**
 * Format tool results for OpenAI-compatible APIs
 */
function formatToolResultsOpenAI(toolResults) {
  return toolResults.map(r => ({
    role: 'tool',
    tool_call_id: r.tool_use_id,
    content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
  }));
}

/**
 * Format assistant message with tool calls for OpenAI conversation history
 */
function formatAssistantMessageOpenAI(content) {
  const textParts = content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const toolCalls = content.filter(b => b.type === 'tool_use').map(b => ({
    id: b.id,
    type: 'function',
    function: {
      name: b.name,
      arguments: JSON.stringify(b.input),
    },
  }));

  const msg = { role: 'assistant', content: textParts || null };
  if (toolCalls.length > 0) msg.tool_calls = toolCalls;
  return msg;
}


/**
 * UnifiedLLMClient — the main class
 */
export class UnifiedLLMClient {
  constructor() {
    this._anthropicClient = null;
    this._currentModel = process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
    this._currentProvider = detectProvider(this._currentModel);

    logger.info('UnifiedLLMClient initialized', {
      model: this._currentModel,
      provider: this._currentProvider,
    });
  }

  get model() { return this._currentModel; }
  get provider() { return this._currentProvider; }

  /**
   * Switch model at runtime
   */
  switchModel(newModel) {
    const newProvider = detectProvider(newModel);
    const apiKey = process.env[PROVIDERS[newProvider]?.envKey];

    if (!apiKey) {
      logger.error(`Cannot switch to ${newModel} — missing ${PROVIDERS[newProvider]?.envKey}`);
      return false;
    }

    const oldModel = this._currentModel;
    this._currentModel = newModel;
    this._currentProvider = newProvider;

    logger.info('Model switched', { from: oldModel, to: newModel, provider: newProvider });
    return true;
  }

  /**
   * Get available models (only those with API keys configured)
   */
  getAvailableModels() {
    const available = [];
    for (const [providerKey, provider] of Object.entries(PROVIDERS)) {
      const apiKey = process.env[provider.envKey];
      if (apiKey) {
        for (const model of provider.models) {
          available.push({
            model,
            provider: providerKey,
            providerName: provider.name,
            active: model === this._currentModel,
          });
        }
      }
    }
    return available;
  }

  /**
   * Main chat completion — works with any provider
   * Returns unified format regardless of provider
   */
  async chat({ messages, system, tools = [], maxTokens = 1024, temperature = 0.1 }) {
    const provider = this._currentProvider;

    if (provider === 'anthropic') {
      return this._callAnthropic({ messages, system, tools, maxTokens, temperature });
    } else {
      return this._callOpenAICompatible({ messages, system, tools, maxTokens, temperature });
    }
  }

  /**
   * Format tool results for the current provider's conversation format
   */
  formatToolResults(toolResults) {
    if (this._currentProvider === 'anthropic') {
      return formatToolResultsAnthropic(toolResults);
    }
    return formatToolResultsOpenAI(toolResults);
  }

  /**
   * Format assistant response for conversation history
   */
  formatAssistantMessage(content) {
    if (this._currentProvider === 'anthropic') {
      return { role: 'assistant', content };
    }
    return formatAssistantMessageOpenAI(content);
  }

  // ── Anthropic ──────────────────────────────────────────────────────────

  _getAnthropicClient() {
    if (!this._anthropicClient) {
      this._anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this._anthropicClient;
  }

  async _callAnthropic({ messages, system, tools, maxTokens, temperature }) {
    const client = this._getAnthropicClient();

    const params = {
      model: this._currentModel,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    if (system) params.system = system;
    if (tools && tools.length > 0) params.tools = formatToolsAnthropic(tools);

    const response = await client.messages.create(params);
    return parseAnthropicResponse(response);
  }

  // ── OpenAI-compatible (OpenAI, DeepSeek) ───────────────────────────────

  async _callOpenAICompatible({ messages, system, tools, maxTokens, temperature }) {
    const provider = PROVIDERS[this._currentProvider];
    const apiKey = process.env[provider.envKey];

    if (!apiKey) {
      throw new Error(`Missing API key: ${provider.envKey}`);
    }

    // Build messages array with system prompt
    const openaiMessages = [];
    if (system) {
      openaiMessages.push({ role: 'system', content: system });
    }

    // Convert messages from Anthropic format to OpenAI format
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        openaiMessages.push(formatAssistantMessageOpenAI(msg.content));
      } else if (msg.role === 'user' && Array.isArray(msg.content)) {
        // Check if this is tool results
        const toolResults = msg.content.filter(b => b.type === 'tool_result');
        if (toolResults.length > 0) {
          openaiMessages.push(...formatToolResultsOpenAI(toolResults));
        } else {
          // Regular user message with content blocks
          const text = msg.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');
          if (text) openaiMessages.push({ role: 'user', content: text });
        }
      } else {
        openaiMessages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    const body = {
      model: this._currentModel,
      messages: openaiMessages,
      max_tokens: maxTokens,
      temperature,
    };

    if (tools && tools.length > 0) {
      body.tools = formatToolsOpenAI(tools);
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${provider.name} API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return parseOpenAIResponse(data);
  }
}

// ── Singleton export
let _instance = null;
export function getLLMClient() {
  if (!_instance) _instance = new UnifiedLLMClient();
  return _instance;
}

export default UnifiedLLMClient;
