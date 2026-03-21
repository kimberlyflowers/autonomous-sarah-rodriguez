// ═══════════════════════════════════════════════════════════════════════════
// BLOOM Unified LLM Client v2 — with Silent Failover Chain
//
// Supports: Anthropic (Claude), OpenAI (GPT), DeepSeek, Google (Gemini)
// Failover: Claude → OpenAI → Gemini (silent, user never sees downtime)
// 
// Architecture:
// - All providers normalize to Anthropic-style content blocks
// - Gemini uses OpenAI-compatible endpoint (no new code path)
// - callModel() for one-shot specialist calls
// - Failover chain auto-activates on 429, 500, 502, 503, 504, 529 errors
// ═══════════════════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('llm-client');

// ── Provider Registry ──────────────────────────────────────────────────────

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    models: [
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6-20250929',
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-20250514',
      'claude-opus-4-6-20250929',
      'claude-opus-4-5-20250414',
    ],
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: null, // uses SDK
  },
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
  },
  deepseek: {
    name: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  gemini: {
    name: 'Google Gemini',
    // Gemini uses OpenAI-compatible endpoint
    models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-flash-preview'],
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
};

// ── Failover Chain ─────────────────────────────────────────────────────────
// When a provider fails, silently try the next one.
// User never sees "Claude is down" — Sarah just keeps working.
// Order: Claude (cheapest) → GPT-4o → GPT-4o-mini → Gemini Flash
// The chain skips the current primary model and tries everything else.

const FAILOVER_CHAIN = [
  { provider: 'anthropic', model: 'claude-sonnet-4-6-20250929' },
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  { provider: 'openai',    model: 'gpt-4o' },
  { provider: 'openai',    model: 'gpt-4o-mini' },
  { provider: 'gemini',    model: 'gemini-2.5-flash' },
];

// Errors that trigger failover (not user errors, provider errors)
const FAILOVER_STATUS_CODES = [429, 500, 502, 503, 504, 529];

function shouldFailover(error) {
  const status = error?.status || error?.error?.status;
  if (FAILOVER_STATUS_CODES.includes(status)) return true;
  const msg = error?.message?.toLowerCase() || '';
  return msg.includes('overloaded') || msg.includes('rate limit') || 
         msg.includes('503') || msg.includes('529') || msg.includes('timeout') ||
         msg.includes('econnrefused') || msg.includes('fetch failed');
}

// ── Token Pricing (per 1M tokens, USD) ────────────────────────────────────

const PRICING = {
  'claude-haiku-4-5-20251001':   { input: 1.00,  output: 5.00  },
  'claude-sonnet-4-6-20250929':  { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-5-20250929':  { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-20250514':    { input: 3.00,  output: 15.00 },
  'claude-opus-4-6-20250929':    { input: 5.00,  output: 25.00 },
  'claude-opus-4-5-20250414':    { input: 5.00,  output: 25.00 },
  'gpt-4o':                      { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':                 { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':                 { input: 10.00, output: 30.00 },
  'o3-mini':                     { input: 1.10,  output: 4.40  },
  'deepseek-chat':               { input: 0.27,  output: 1.10  },
  'deepseek-reasoner':           { input: 0.55,  output: 2.19  },
  'gemini-2.5-flash':            { input: 0.15,  output: 0.60  },
  'gemini-2.0-flash':            { input: 0.10,  output: 0.40  },
  'gemini-3-flash-preview':      { input: 0.15,  output: 0.60  },
};

export function calculateCost(model, usage) {
  const p = PRICING[model] || { input: 1.0, output: 3.0 };
  const cost = ((usage.inputTokens || 0) / 1_000_000) * p.input +
               ((usage.outputTokens || 0) / 1_000_000) * p.output;
  return Math.round(cost * 100 * 10000) / 10000; // cents, 4 decimals
}

// ── Helpers ────────────────────────────────────────────────────────────────

function detectProvider(model) {
  for (const [key, prov] of Object.entries(PROVIDERS)) {
    if (prov.models.includes(model)) return key;
  }
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('deepseek')) return 'deepseek';
  if (model.startsWith('gemini')) return 'gemini';
  return 'anthropic';
}

function hasApiKey(provider) {
  return !!process.env[PROVIDERS[provider]?.envKey];
}

// ── Format converters ──────────────────────────────────────────────────────

function formatToolsAnthropic(tools) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema || t.parameters,
  }));
}

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

function parseAnthropicResponse(response) {
  return {
    content: response.content || [],
    stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
    usage: { inputTokens: response.usage?.input_tokens || 0, outputTokens: response.usage?.output_tokens || 0 },
    model: response.model,
    raw: response,
  };
}

function parseOpenAIResponse(response) {
  const choice = response.choices?.[0];
  if (!choice) return { content: [], stopReason: 'end_turn', usage: {}, model: response.model, raw: response };

  const content = [];
  if (choice.message.content) content.push({ type: 'text', text: choice.message.content });
  if (choice.message.tool_calls?.length > 0) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}'),
      });
    }
  }

  return {
    content,
    stopReason: choice.message.tool_calls?.length > 0 ? 'tool_use' : 'end_turn',
    usage: { inputTokens: response.usage?.prompt_tokens || 0, outputTokens: response.usage?.completion_tokens || 0 },
    model: response.model,
    raw: response,
  };
}

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

function formatToolResultsOpenAI(toolResults) {
  return toolResults.map(r => ({
    role: 'tool',
    tool_call_id: r.tool_use_id,
    content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
  }));
}

function formatAssistantMessageOpenAI(content) {
  const textParts = content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const toolCalls = content.filter(b => b.type === 'tool_use').map(b => ({
    id: b.id, type: 'function',
    function: { name: b.name, arguments: JSON.stringify(b.input) },
  }));
  const msg = { role: 'assistant', content: textParts || null };
  if (toolCalls.length > 0) msg.tool_calls = toolCalls;
  return msg;
}

// ═══════════════════════════════════════════════════════════════════════════
// UnifiedLLMClient — main class with silent failover
// ═══════════════════════════════════════════════════════════════════════════

export class UnifiedLLMClient {
  constructor() {
    this._anthropicClient = null;
    this._currentModel = process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6-20250929';
    this._currentProvider = detectProvider(this._currentModel);
    this._failoverActive = false;
    this._originalProvider = null;

    logger.info('UnifiedLLMClient v2 initialized', {
      model: this._currentModel,
      provider: this._currentProvider,
      failoverChain: FAILOVER_CHAIN.filter(f => hasApiKey(f.provider)).map(f => f.provider).join(' → '),
    });
  }

  get model() { return this._currentModel; }
  get provider() { return this._currentProvider; }
  get isFailoverActive() { return this._failoverActive; }

  switchModel(newModel) {
    const newProvider = detectProvider(newModel);
    if (!hasApiKey(newProvider)) {
      logger.error(`Cannot switch to ${newModel} — missing ${PROVIDERS[newProvider]?.envKey}`);
      return false;
    }
    const oldModel = this._currentModel;
    this._currentModel = newModel;
    this._currentProvider = newProvider;
    logger.info('Model switched', { from: oldModel, to: newModel, provider: newProvider });
    return true;
  }

  getAvailableModels() {
    const available = [];
    for (const [key, prov] of Object.entries(PROVIDERS)) {
      if (hasApiKey(key)) {
        for (const model of prov.models) {
          available.push({ model, provider: key, providerName: prov.name, active: model === this._currentModel });
        }
      }
    }
    return available;
  }

  /**
   * Get provider health status for dashboard
   */
  getProviderHealth() {
    return Object.entries(PROVIDERS).map(([key, prov]) => ({
      provider: key,
      name: prov.name,
      configured: hasApiKey(key),
      active: key === this._currentProvider,
      failoverPosition: FAILOVER_CHAIN.findIndex(f => f.provider === key),
    }));
  }

  // ── Main chat with silent failover ────────────────────────────────────

  async chat({ messages, system, tools = [], maxTokens = 1024, temperature = 0.1 }) {
    const provider = this._currentProvider;

    try {
      if (provider === 'anthropic') {
        return await this._callAnthropic({ messages, system, tools, maxTokens, temperature });
      } else {
        return await this._callOpenAICompatible({ messages, system, tools, maxTokens, temperature });
      }
    } catch (error) {
      if (shouldFailover(error)) {
        logger.warn(`Provider ${provider} failed (${error.status || error.message}), attempting failover...`);
        return await this._failoverChat({ messages, system, tools, maxTokens, temperature }, provider);
      }
      throw error;
    }
  }

  /**
   * Silent failover — try each provider in the chain until one works
   */
  async _failoverChat(params, failedProvider) {
    for (const fallback of FAILOVER_CHAIN) {
      if (fallback.provider === failedProvider) continue;
      if (!hasApiKey(fallback.provider)) continue;

      try {
        logger.info(`Failing over to ${fallback.provider} (${fallback.model})...`);

        // Temporarily switch
        const origModel = this._currentModel;
        const origProvider = this._currentProvider;
        this._currentModel = fallback.model;
        this._currentProvider = fallback.provider;
        this._failoverActive = true;
        this._originalProvider = origProvider;

        const result = await this.chat(params);
        
        logger.info(`Failover to ${fallback.provider} succeeded`);
        
        // Restore original after success (next call tries primary again)
        this._currentModel = origModel;
        this._currentProvider = origProvider;
        this._failoverActive = false;
        
        return result;
      } catch (err) {
        logger.warn(`Failover to ${fallback.provider} also failed: ${err.message}`);
        continue;
      }
    }

    throw new Error(`All providers failed. Chain: ${FAILOVER_CHAIN.map(f => f.provider).join(' → ')}`);
  }

  formatToolResults(toolResults) {
    return this._currentProvider === 'anthropic'
      ? formatToolResultsAnthropic(toolResults)
      : formatToolResultsOpenAI(toolResults);
  }

  formatAssistantMessage(content) {
    return this._currentProvider === 'anthropic'
      ? { role: 'assistant', content }
      : formatAssistantMessageOpenAI(content);
  }

  // ── Anthropic ────────────────────────────────────────────────────────

  _getAnthropicClient() {
    if (!this._anthropicClient) {
      this._anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this._anthropicClient;
  }

  async _callAnthropic({ messages, system, tools, maxTokens, temperature }) {
    const client = this._getAnthropicClient();
    const params = { model: this._currentModel, max_tokens: maxTokens, temperature, messages };
    if (system) params.system = system;
    if (tools?.length > 0) params.tools = formatToolsAnthropic(tools);
    const response = await client.messages.create(params);
    return parseAnthropicResponse(response);
  }

  // ── OpenAI-compatible (OpenAI, DeepSeek, Gemini) ─────────────────────

  async _callOpenAICompatible({ messages, system, tools, maxTokens, temperature }) {
    const provider = PROVIDERS[this._currentProvider];
    const apiKey = process.env[provider.envKey];
    if (!apiKey) throw new Error(`Missing API key: ${provider.envKey}`);

    const openaiMessages = [];
    if (system) openaiMessages.push({ role: 'system', content: system });

    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        openaiMessages.push(formatAssistantMessageOpenAI(msg.content));
      } else if (msg.role === 'user' && Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(b => b.type === 'tool_result');
        if (toolResults.length > 0) {
          openaiMessages.push(...formatToolResultsOpenAI(toolResults));
        } else {
          const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
          if (text) openaiMessages.push({ role: 'user', content: text });
        }
      } else {
        openaiMessages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    const body = { model: this._currentModel, messages: openaiMessages, max_tokens: maxTokens, temperature };
    if (tools?.length > 0) { body.tools = formatToolsOpenAI(tools); body.tool_choice = 'auto'; }

    // Gemini uses /chat/completions under its OpenAI-compatible endpoint
    const baseUrl = provider.baseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      const error = new Error(`${provider.name} API error ${response.status}: ${errText}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return parseOpenAIResponse(data);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
let _instance = null;
export function getLLMClient() {
  if (!_instance) _instance = new UnifiedLLMClient();
  return _instance;
}

// ═══════════════════════════════════════════════════════════════════════════
// callModel — one-shot call to any model WITH failover
// Used by orchestrator/dispatch. Does NOT change default model.
// ═══════════════════════════════════════════════════════════════════════════

export async function callModel(model, { system, messages, tools = [], maxTokens = 4096, temperature = 0.3 }) {
  const provider = detectProvider(model);
  const providerConfig = PROVIDERS[provider];
  const apiKey = process.env[providerConfig?.envKey];

  if (!apiKey) {
    throw new Error(`Missing API key for ${model}: set ${providerConfig?.envKey}`);
  }

  logger.info('callModel', { model, provider, msgCount: messages.length });

  try {
    return await _callModelDirect(model, provider, { system, messages, tools, maxTokens, temperature });
  } catch (error) {
    if (shouldFailover(error)) {
      logger.warn(`callModel: ${provider} failed, trying failover...`);
      // Try each fallback
      for (const fallback of FAILOVER_CHAIN) {
        if (fallback.provider === provider) continue;
        if (!hasApiKey(fallback.provider)) continue;
        try {
          logger.info(`callModel failover: trying ${fallback.provider} (${fallback.model})`);
          const result = await _callModelDirect(fallback.model, fallback.provider, { system, messages, tools, maxTokens, temperature });
          logger.info(`callModel failover to ${fallback.provider} succeeded`);
          return result;
        } catch (e) {
          continue;
        }
      }
    }
    throw error;
  }
}

async function _callModelDirect(model, provider, { system, messages, tools, maxTokens, temperature }) {
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const params = { model, max_tokens: maxTokens, temperature, messages };
    if (system) params.system = system;
    if (tools?.length > 0) params.tools = formatToolsAnthropic(tools);
    const response = await client.messages.create(params);
    const parsed = parseAnthropicResponse(response);
    return {
      ...parsed,
      text: parsed.content.filter(b => b.type === 'text').map(b => b.text).join('\n'),
      usage: { inputTokens: response.usage?.input_tokens || 0, outputTokens: response.usage?.output_tokens || 0 },
      model, provider,
    };
  } else {
    const providerConfig = PROVIDERS[provider];
    const apiKey = process.env[providerConfig.envKey];
    const openaiMessages = [];
    if (system) openaiMessages.push({ role: 'system', content: system });
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        openaiMessages.push(msg);
      } else if (Array.isArray(msg.content)) {
        const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        if (text) openaiMessages.push({ role: msg.role, content: text });
      } else {
        openaiMessages.push({ role: msg.role, content: JSON.stringify(msg.content) });
      }
    }
    const body = { model, messages: openaiMessages, max_tokens: maxTokens, temperature };
    if (tools?.length > 0) { body.tools = formatToolsOpenAI(tools); body.tool_choice = 'auto'; }
    
    const baseUrl = providerConfig.baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errText = await response.text();
      const error = new Error(`${providerConfig.name} API error ${response.status}: ${errText}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    const parsed = parseOpenAIResponse(data);
    return {
      ...parsed,
      text: parsed.content.filter(b => b.type === 'text').map(b => b.text).join('\n'),
      usage: { inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 },
      model, provider,
    };
  }
}

export default UnifiedLLMClient;
