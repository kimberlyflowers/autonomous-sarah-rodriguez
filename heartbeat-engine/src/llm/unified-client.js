// ═══════════════════════════════════════════════════════════════════════════
// BLOOM Unified LLM Client v2 — with Silent Failover Chain
//
// Supports: Anthropic (Claude), OpenAI (GPT), DeepSeek, Google (Gemini)
// Failover: Primary → next provider → next (silent, user NEVER sees downtime)
//
// Architecture:
// - All providers normalize to Anthropic-style content blocks
// - Gemini uses OpenAI-compatible endpoint (no new code path)
// - callModel() for one-shot specialist calls
// - Failover chain auto-activates on ANY provider error:
//   billing/credits, auth, rate limits, 4xx/5xx, timeouts, network failures
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
      'claude-sonnet-4-6',
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-20250514',
      'claude-opus-4-6',
      'claude-opus-4-5-20250414',
    ],
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: null, // uses SDK
  },
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
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
// Order defined in bloom_admin_settings.failover_chain — this is the code-level safety net only.
// The chain skips whatever the current primary model is.

// Failover order: Gemini first (always has credits), then OpenAI, then Anthropic last
// This matches bloom_admin_settings.failover_chain in Supabase
const FAILOVER_CHAIN = [
  { provider: 'gemini',    model: 'gemini-2.5-flash' },
  { provider: 'openai',    model: 'gpt-4o' },
  { provider: 'openai',    model: 'gpt-4o-mini' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
];

// Errors that trigger failover (not user errors, provider errors)
const FAILOVER_STATUS_CODES = [401, 402, 403, 429, 500, 502, 503, 504, 529]; // 400 removed — bad request is a client error, not provider outage

// Error messages that should ALWAYS trigger failover (billing, auth, quota)
const FAILOVER_ERROR_PATTERNS = [
  'credit balance',         // Anthropic: credits depleted
  'billing',                // Generic billing issues
  'quota exceeded',         // Google/OpenAI quota
  'insufficient_quota',     // OpenAI: out of credits
  'rate limit',             // Rate limiting
  'overloaded',             // Anthropic: overloaded
  'api key',                // Invalid/revoked API key
  'authentication',         // Auth failures
  'unauthorized',           // 401-style errors
  'not_found_error',        // Wrong model string
  'model_not_found',        // OpenAI: model doesn't exist or no access
  'does not exist',         // OpenAI: model not available
  'timeout',                // Connection timeouts
  'econnrefused',           // Provider down
  'fetch failed',           // Network error
  '503', '529',             // Status codes in text form
];

function shouldFailover(error) {
  const status = error?.status || error?.error?.status;
  if (FAILOVER_STATUS_CODES.includes(status)) return true;
  const msg = (error?.message || '').toLowerCase();
  return FAILOVER_ERROR_PATTERNS.some(pattern => msg.includes(pattern));
}

// ── Token Pricing (per 1M tokens, USD) ────────────────────────────────────

const PRICING = {
  'claude-haiku-4-5-20251001':   { input: 1.00,  output: 5.00  },
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-5-20250929':  { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-20250514':    { input: 3.00,  output: 15.00 },
  'claude-opus-4-6':    { input: 5.00,  output: 25.00 },
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

export function detectProvider(model) {
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

  // ── Capture reasoning/thinking from all providers ──
  // DeepSeek: reasoning_content field contains Chain-of-Thought reasoning
  if (choice.message.reasoning_content) {
    content.push({ type: 'thinking', thinking: choice.message.reasoning_content });
  }
  // Gemini (OpenAI-compatible): may include thought parts or reasoning field
  if (choice.message.thought) {
    content.push({ type: 'thinking', thinking: choice.message.thought });
  }
  // OpenAI o-series: reasoning tokens are hidden, but reasoning summary may appear
  if (choice.message.reasoning) {
    content.push({ type: 'thinking', thinking: typeof choice.message.reasoning === 'string' ? choice.message.reasoning : JSON.stringify(choice.message.reasoning) });
  }

  if (choice.message.content) content.push({ type: 'text', text: choice.message.content });

  let validToolCalls = 0;
  if (choice.message.tool_calls?.length > 0) {
    for (const tc of choice.message.tool_calls) {
      try {
        // Validate required fields exist
        if (!tc.function?.name) {
          console.warn('[unified-client] Skipping tool call with missing function name:', JSON.stringify(tc).substring(0, 200));
          continue;
        }
        // Parse arguments — handle both string and object formats
        let args = {};
        if (tc.function.arguments) {
          args = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;
        }
        // Generate a fallback ID if Gemini doesn't provide one
        const toolId = tc.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        content.push({
          type: 'tool_use',
          id: toolId,
          name: tc.function.name,
          input: args,
        });
        validToolCalls++;
      } catch (parseErr) {
        console.error(`[unified-client] Failed to parse tool call "${tc.function?.name}":`, parseErr.message,
          'Raw arguments:', String(tc.function?.arguments || '').substring(0, 300));
        // Don't push broken tool calls — they cause empty result blocks downstream
      }
    }
  }

  return {
    content,
    stopReason: validToolCalls > 0 ? 'tool_use' : 'end_turn',
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
    this._currentModel = process.env.LLM_MODEL || 'gemini-2.5-flash'; // cold-start fallback — overridden by bloom_admin_settings within 60s
    this._currentProvider = detectProvider(this._currentModel);
    this._failoverActive = false;
    this._isFailingOver = false; // Guard against recursive failover
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
      // Log full error for diagnosis
      logger.error(`Provider ${provider} error details: status=${error.status} message=${(error.message || '').slice(0, 500)}`);
      // Only failover if NOT already in a failover attempt (prevents infinite recursion)
      if (shouldFailover(error) && !this._isFailingOver) {
        logger.warn(`Provider ${provider} failed (${error.status || error.message}), attempting failover...`);
        return await this._failoverChat({ messages, system, tools, maxTokens, temperature }, provider);
      }
      throw error;
    }
  }

  /**
   * Per-request chat — uses the specified model WITHOUT mutating singleton state.
   * This is the multi-tenant-safe way to call the LLM. The model/provider is
   * scoped to this single call and doesn't affect other concurrent requests.
   *
   * @param {string} model — full model string (e.g. 'gemini-2.5-flash')
   * @param {object} params — same as chat(): { messages, system, tools, maxTokens, temperature }
   * @returns {object} — normalized response
   */
  async chatWithModel(model, { messages, system, tools = [], maxTokens = 1024, temperature = 0.1 }) {
    const provider = detectProvider(model);
    if (!hasApiKey(provider)) {
      throw new Error(`Cannot use ${model} — missing API key for ${provider}`);
    }

    // Save + restore current state (failover may mutate during execution)
    const savedModel = this._currentModel;
    const savedProvider = this._currentProvider;
    const savedFailover = this._failoverActive;

    try {
      // Temporarily set model for this call only
      this._currentModel = model;
      this._currentProvider = provider;

      if (provider === 'anthropic') {
        return await this._callAnthropic({ messages, system, tools, maxTokens, temperature });
      } else {
        return await this._callOpenAICompatible({ messages, system, tools, maxTokens, temperature });
      }
    } catch (error) {
      if (shouldFailover(error)) {
        logger.warn(`chatWithModel: ${provider} (${model}) failed (${error.status || error.message}), attempting failover...`);
        return await this._failoverChat({ messages, system, tools, maxTokens, temperature }, provider);
      }
      throw error;
    } finally {
      // ALWAYS restore singleton state regardless of success/failure
      this._currentModel = savedModel;
      this._currentProvider = savedProvider;
      this._failoverActive = savedFailover;
    }
  }

  /**
   * Silent failover — try each provider in the chain until one works
   */
async _failoverChat(params, failedProvider) {
    // Guard: prevent recursive failover (chat() → _failoverChat() → chat() → _failoverChat())
    if (this._isFailingOver) {
      throw new Error(`Failover already in progress — refusing recursive failover from ${failedProvider}`);
    }
    this._isFailingOver = true;

    const origModel = this._currentModel;
    const origProvider = this._currentProvider;

    try {
      let attemptIndex = 0;
      for (const fallback of FAILOVER_CHAIN) {
        if (fallback.provider === failedProvider && fallback.model === origModel) continue;
        if (!hasApiKey(fallback.provider)) continue;

        try {
          // Backoff: 500ms, 1s, 2s between attempts to prevent rate limit cascade
          if (attemptIndex > 0) {
            const delay = Math.min(500 * Math.pow(2, attemptIndex - 1), 4000);
            logger.info(`Failover backoff: waiting ${delay}ms before next attempt...`);
            await new Promise(r => setTimeout(r, delay));
          }
          attemptIndex++;

          logger.info(`Failing over to ${fallback.provider} (${fallback.model})...`);

          // Direct call — do NOT go through this.chat() to avoid recursion
          this._currentModel = fallback.model;
          this._currentProvider = fallback.provider;
          this._failoverActive = true;
          this._originalProvider = origProvider;

          let result;
          if (fallback.provider === 'anthropic') {
            result = await this._callAnthropic(params);
          } else {
            result = await this._callOpenAICompatible(params);
          }

          logger.info(`Failover to ${fallback.provider} succeeded`);

          // Restore original after success
          this._currentModel = origModel;
          this._currentProvider = origProvider;
          this._failoverActive = false;

          return result;
        } catch (err) {
          logger.warn(`Failover to ${fallback.provider}/${fallback.model} failed: ${(err.message || '').slice(0, 200)}`);
          continue;
        }
      }

      // Restore originals before throwing
      this._currentModel = origModel;
      this._currentProvider = origProvider;
      this._failoverActive = false;
      throw new Error(`All providers failed. Chain: ${FAILOVER_CHAIN.map(f => f.provider).join(' → ')}`);
    } finally {
      this._isFailingOver = false;
    }
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

    // ── Extended thinking ─────────────────────────────────────────────────
    // Claude 4.6 models: use "adaptive" (recommended, "enabled" is deprecated)
    // Claude 4.5/4.x models: use "enabled" with budget_tokens
    // Docs: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
    const adaptiveModels = ['claude-sonnet-4-6', 'claude-opus-4-6'];
    const budgetModels = ['claude-sonnet-4-5-20250929', 'claude-sonnet-4-20250514', 'claude-opus-4-5-20250414', 'claude-haiku-4-5-20251001'];

    const useAdaptive = adaptiveModels.some(m => this._currentModel.includes(m));
    const useBudget = budgetModels.some(m => this._currentModel.includes(m));

    if (useAdaptive || useBudget) {
      // Build thinking params — never toggle mid-turn (causes 400 with tool use)
      const thinkingParams = { ...params };
      if (useAdaptive) {
        // 4.6 models: adaptive thinking (no budget_tokens needed)
        thinkingParams.thinking = { type: 'adaptive' };
      } else {
        // 4.5/4.x models: enabled with explicit budget
        thinkingParams.thinking = { type: 'enabled', budget_tokens: 10000 };
      }
      // Ensure max_tokens is large enough for thinking + response
      if (thinkingParams.max_tokens < 16000) thinkingParams.max_tokens = 16000;

      try {
        const response = await client.messages.create(thinkingParams);
        return parseAnthropicResponse(response);
      } catch (thinkErr) {
        // Log the FULL error for debugging
        logger.warn('Extended thinking failed, retrying without thinking', {
          status: thinkErr?.status,
          message: (thinkErr?.message || '').slice(0, 500),
          errorBody: JSON.stringify(thinkErr?.error || {}).slice(0, 500),
          model: this._currentModel,
          thinkingType: useAdaptive ? 'adaptive' : 'enabled'
        });

        // Check if prior messages already contain thinking blocks (mid-turn tool loop).
        // If so, we CANNOT disable thinking — it causes 400 "toggling mid-turn".
        // In that case, let the error propagate so the outer failover handles it.
        const hasPriorThinking = messages.some(m =>
          m.role === 'assistant' && Array.isArray(m.content) &&
          m.content.some(b => b.type === 'thinking')
        );
        if (hasPriorThinking) {
          logger.warn('Cannot disable thinking mid-turn (prior thinking blocks exist), propagating error');
          throw thinkErr;
        }

        // First call in conversation — safe to retry without thinking
        const response = await client.messages.create(params);
        return parseAnthropicResponse(response);
      }
    }

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

// ── Per-Org Model Preferences ──────────────────────────────────────────────
// In-memory map: orgId → { model, updatedAt }
// Dashboard /models/switch writes here; chat reads here.
// This is per-process — if you scale to multiple processes, move to Redis or Supabase.
const _orgModelPrefs = new Map();

export function setOrgModelPreference(orgId, model) {
  if (!orgId) return false;
  const provider = detectProvider(model);
  if (!hasApiKey(provider)) return false;
  _orgModelPrefs.set(orgId, { model, provider, updatedAt: Date.now() });
  logger.info('Org model preference saved', { orgId, model, provider });
  return true;
}

export function getOrgModelPreference(orgId) {
  if (!orgId) return null;
  return _orgModelPrefs.get(orgId) || null;
}

export function clearOrgModelPreference(orgId) {
  _orgModelPrefs.delete(orgId);
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

export async function callModel(model, { system, messages, tools = [], maxTokens = 4096, temperature = 0.3, responseFormat = null }) {
  const provider = detectProvider(model);
  const providerConfig = PROVIDERS[provider];
  const apiKey = process.env[providerConfig?.envKey];

  if (!apiKey) {
    throw new Error(`Missing API key for ${model}: set ${providerConfig?.envKey}`);
  }

  logger.info('callModel', { model, provider, msgCount: messages.length });

  try {
    return await _callModelDirect(model, provider, { system, messages, tools, maxTokens, temperature, responseFormat });
  } catch (error) {
    if (shouldFailover(error)) {
      logger.warn(`callModel: ${provider} failed, trying failover...`);
      // Try each fallback
      for (const fallback of FAILOVER_CHAIN) {
        if (fallback.provider === provider) continue;
        if (!hasApiKey(fallback.provider)) continue;
        try {
          logger.info(`callModel failover: trying ${fallback.provider} (${fallback.model})`);
          const result = await _callModelDirect(fallback.model, fallback.provider, { system, messages, tools, maxTokens, temperature, responseFormat });
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

async function _callModelDirect(model, provider, { system, messages, tools, maxTokens, temperature, responseFormat = null }) {
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
    // Attach response_format for structured output (Gemini compat, OpenAI, DeepSeek)
    // Anthropic does not use this param — it is excluded via the provider branch above
    if (responseFormat) { body.response_format = responseFormat; }
    
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

// ═══════════════════════════════════════════════════════════════════════════
// Model Tier Manager — per-org model assignment with time-based switching
//
// Tiers:
//   "bloom"    → Sonnet 4.6 (primary instance, best quality)
//   "premium"  → GPT-4o (first 30 days for new clients)
//   "standard" → Gemini 2.5 Flash (after 30 days, cost-optimized)
//   "custom"   → Any model string (per-org override)
//
// Usage:
//   const model = resolveModelForOrg(orgConfig);
//   // orgConfig = { tier: "premium", createdAt: "2025-12-01", customModel: null }
//   // Returns the correct model string based on tier + account age
// ═══════════════════════════════════════════════════════════════════════════

// MODEL_TIERS — legacy fallback ONLY (used when admin-config.js can't reach Supabase).
// The real tier→model mapping lives in admin-config.js getResolvedConfig() which reads
// from bloom_admin_settings in Supabase. This must stay in sync with the DB defaults.
const MODEL_TIERS = {
  bloom: {
    model: process.env.DEFAULT_MODEL || 'gemini-2.5-flash',
    description: 'BLOOM primary — uses global default model from admin settings',
  },
  premium: {
    model: 'gpt-4o',
    description: 'Client onboarding — GPT-4o (first 30 days)',
    downgradeTo: 'standard',
    downgradeAfterDays: 30,
  },
  trial: {
    model: 'gpt-4o',
    description: 'Trial tier — same as premium',
    downgradeTo: 'standard',
    downgradeAfterDays: 30,
  },
  standard: {
    model: 'gemini-2.5-flash',
    description: 'Client steady-state — Gemini Flash (cost-optimized)',
  },
  budget: {
    model: 'gpt-4o-mini',
    description: 'Budget tier — GPT-4o-mini (minimum viable)',
  },
  custom: {
    model: null, // uses org.customModel
    description: 'Custom model override',
  },
};

export function getModelTiers() {
  return { ...MODEL_TIERS };
}

/**
 * Resolve the correct model for an organization based on tier + account age.
 *
 * @param {Object} orgConfig - Organization configuration
 * @param {string} orgConfig.modelTier - Tier name: "bloom", "premium", "standard", "budget", "custom"
 * @param {string} orgConfig.createdAt - ISO date string when the org was created
 * @param {string} [orgConfig.customModel] - Full model string for "custom" tier
 * @param {string} [orgConfig.modelOverride] - Temporary override (e.g., operator switched via tool)
 * @returns {{ model: string, tier: string, reason: string }}
 */
export function resolveModelForOrg(orgConfig = {}) {
  // Temporary override takes priority (from switch_model tool)
  if (orgConfig.modelOverride) {
    return {
      model: orgConfig.modelOverride,
      tier: 'override',
      reason: `Manual override: ${orgConfig.modelOverride}`,
    };
  }

  const tierName = orgConfig.modelTier || 'bloom';
  const tier = MODEL_TIERS[tierName];

  if (!tier) {
    logger.warn(`Unknown model tier: ${tierName}, falling back to bloom`);
    return { model: MODEL_TIERS.bloom.model, tier: 'bloom', reason: `Unknown tier "${tierName}", using bloom default` };
  }

  // Custom tier — use the org's specified model
  if (tierName === 'custom') {
    const customModel = orgConfig.customModel || MODEL_TIERS.bloom.model;
    return { model: customModel, tier: 'custom', reason: `Custom model: ${customModel}` };
  }

  // Check for time-based downgrade (e.g., premium → standard after 30 days)
  if (tier.downgradeAfterDays && tier.downgradeTo && orgConfig.createdAt) {
    const createdDate = new Date(orgConfig.createdAt);
    const now = new Date();
    const daysSinceCreation = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));

    if (daysSinceCreation > tier.downgradeAfterDays) {
      const downgradeTier = MODEL_TIERS[tier.downgradeTo];
      logger.info(`Org auto-downgraded: ${tierName} → ${tier.downgradeTo} (${daysSinceCreation} days old, threshold: ${tier.downgradeAfterDays})`, {
        orgCreatedAt: orgConfig.createdAt, daysSinceCreation, fromTier: tierName, toTier: tier.downgradeTo
      });
      return {
        model: downgradeTier.model,
        tier: tier.downgradeTo,
        reason: `Auto-switched from ${tierName} to ${tier.downgradeTo} after ${tier.downgradeAfterDays} days (account is ${daysSinceCreation} days old)`,
      };
    }

    const daysRemaining = tier.downgradeAfterDays - daysSinceCreation;
    return {
      model: tier.model,
      tier: tierName,
      reason: `${tier.description} — ${daysRemaining} days until switch to ${tier.downgradeTo}`,
    };
  }

  return { model: tier.model, tier: tierName, reason: tier.description };
}

export default UnifiedLLMClient;
