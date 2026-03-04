// ═══════════════════════════════════════════════════════════════════════════
// BLOOM Orchestrator Router v2 — Tier-Based Smart Model Routing
//
// Features:
// - Auto-detects task type from user message (no LLM call needed for simple routing)
// - Tier-based model selection: Standard gets cheap, Enterprise gets premium
// - Dispatch mode: toggle on/off in settings
// - Invisible to user — Sarah just gets better at the right tasks
// ═══════════════════════════════════════════════════════════════════════════

import { callModel, calculateCost } from '../llm/unified-client.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('orchestrator-router');

// Re-export calculateCost for other modules
export { calculateCost };

// ── Plan tiers determine which models Sarah uses ──────────────────────────
// Standard: cheapest models everywhere (Haiku-level)
// Pro: better writing model, cheap everything else
// Enterprise: premium writing + dispatch to specialists

const TIER_MODEL_MAP = {
  standard: {
    chat:      'claude-haiku-4-5-20251001',
    writing:   'claude-haiku-4-5-20251001',    // Standard: Haiku for everything
    email:     'claude-haiku-4-5-20251001',
    coding:    'claude-haiku-4-5-20251001',
    crm:       'claude-haiku-4-5-20251001',
    research:  'claude-haiku-4-5-20251001',
    data:      'claude-haiku-4-5-20251001',
  },
  pro: {
    chat:      'claude-haiku-4-5-20251001',
    writing:   'claude-sonnet-4-5-20250929',   // Pro: Sonnet for writing
    email:     'gpt-4o-mini',                   // Pro: GPT-4o-mini for email (if key exists)
    coding:    'deepseek-chat',                 // Pro: DeepSeek for code (if key exists)
    crm:       'claude-haiku-4-5-20251001',
    research:  'claude-haiku-4-5-20251001',
    data:      'claude-haiku-4-5-20251001',
  },
  enterprise: {
    chat:      'claude-haiku-4-5-20251001',
    writing:   'claude-sonnet-4-5-20250929',   // Enterprise: Sonnet for writing
    email:     'gpt-4o',                        // Enterprise: Full GPT-4o for email
    coding:    'deepseek-chat',                 // Enterprise: DeepSeek for code
    crm:       'claude-haiku-4-5-20251001',
    research:  'claude-haiku-4-5-20251001',
    data:      'claude-haiku-4-5-20251001',
  },
};

// ── Settings (loaded from env, overridable per client later) ──────────────

function getSettings() {
  return {
    tier: (process.env.PLAN_TIER || 'standard').toLowerCase(),
    dispatchEnabled: process.env.DISPATCH_ENABLED === 'true',
  };
}

// ── Fast task classification (no LLM call needed) ─────────────────────────
// Pattern-based classification is instant and free.
// Only falls back to LLM routing for ambiguous tasks when dispatch is ON.

const TASK_PATTERNS = {
  writing: /\b(blog|article|post|write|sop|report|whitepaper|guide|ebook|essay|draft|compose|content)\b/i,
  email:   /\b(email|subject line|newsletter|campaign|sms|message|outreach|follow.?up email|drip)\b/i,
  coding:  /\b(code|script|html|css|javascript|python|automate|function|api|endpoint|webhook|deploy)\b/i,
  crm:     /\b(contact|lead|crm|ghl|pipeline|deal|appointment|calendar|invoice|workflow)\b/i,
  research:/\b(research|search|find|look.?up|competitor|analyze|summarize|compare|review)\b/i,
  design:  /\b(flyer|graphic|image|design|poster|banner|logo|thumbnail|social.?media.?post)\b/i,
  data:    /\b(spreadsheet|csv|data|numbers|chart|graph|calculate|formula|excel)\b/i,
};

function classifyTask(text) {
  const lower = text.toLowerCase();
  
  // Check each pattern — first match wins
  for (const [taskType, pattern] of Object.entries(TASK_PATTERNS)) {
    if (pattern.test(lower)) return taskType;
  }
  
  // Default: treat as chat (cheapest model)
  return 'chat';
}

// ── Get the right model for a task type and tier ──────────────────────────

function getModelForTask(taskType, tier = 'standard') {
  const tierMap = TIER_MODEL_MAP[tier] || TIER_MODEL_MAP.standard;
  const model = tierMap[taskType] || tierMap.chat;
  
  // Check if the chosen model's API key exists — fall back to Claude if not
  const provider = model.startsWith('gpt') || model.startsWith('o') ? 'openai' :
                   model.startsWith('deepseek') ? 'deepseek' :
                   model.startsWith('gemini') ? 'gemini' : 'anthropic';
  
  const envKey = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    gemini: 'GEMINI_API_KEY',
  }[provider];
  
  if (!process.env[envKey]) {
    // Fall back to Claude Haiku (always available)
    logger.debug(`${model} unavailable (no ${envKey}), falling back to Haiku`);
    return 'claude-haiku-4-5-20251001';
  }
  
  return model;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Route a task — classify it and pick the best model for the client's tier.
 * This is FAST (no LLM call) — uses pattern matching.
 */
export function routeTaskFast(instruction) {
  const settings = getSettings();
  const taskType = classifyTask(instruction);
  const model = getModelForTask(taskType, settings.tier);
  
  logger.info('Fast route', { taskType, model, tier: settings.tier });
  
  return { taskType, model, tier: settings.tier };
}

/**
 * Full route with LLM classification (for dispatch mode).
 * Uses Haiku to classify the task and prepare specialist prompts.
 * Only called when dispatch is enabled AND the task is ambiguous.
 */
export async function routeTask(instruction, memoryContext = '') {
  const settings = getSettings();
  
  // If dispatch is disabled, use fast routing only
  if (!settings.dispatchEnabled) {
    return routeTaskFast(instruction);
  }
  
  const routerModel = 'claude-haiku-4-5-20251001';
  
  logger.info('LLM routing', { instruction: instruction.slice(0, 100), routerModel });

  const routerSystemPrompt = `You are a task classifier. Given a task, classify it and prepare it for the specialist model.

Available task types:
- "writing" → Blog posts, articles, reports (needs quality writing model)
- "email" → Emails, subject lines, SMS, social copy (needs punchy copy model)
- "coding" → Scripts, HTML, automation code (needs fast coder)
- "crm" → CRM operations, contacts, deals (just API calls)
- "research" → Web research, summaries (fast model with search)
- "design" → Visual content, images (image generation)
- "data" → Spreadsheets, calculations (structured data)
- "chat" → General conversation (cheapest model)

Memory context: ${memoryContext || 'None'}

Respond with ONLY valid JSON:
{"taskType":"writing|email|coding|crm|research|design|data|chat","subAgentSystemPrompt":"System prompt for the specialist","subAgentUserPrompt":"The enriched task","expectedOutput":"markdown|html|code|text|json"}`;

  try {
    const result = await callModel(routerModel, {
      system: routerSystemPrompt,
      messages: [{ role: 'user', content: `Task: ${instruction}` }],
      maxTokens: 512,
      temperature: 0.1,
    });

    const text = (result.text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const routing = JSON.parse(text);
    const model = getModelForTask(routing.taskType, settings.tier);

    return {
      ...routing,
      model,
      tier: settings.tier,
      routingUsage: result.usage,
      routingCostCents: calculateCost(routerModel, result.usage),
    };
  } catch (e) {
    logger.warn('LLM routing failed, using fast route', { error: e.message });
    return routeTaskFast(instruction);
  }
}

/**
 * Execute a specialist task with the routed model
 */
export async function executeSubAgent(routing) {
  const { model, subAgentSystemPrompt, subAgentUserPrompt } = routing;

  logger.info('Executing sub-agent', { model, taskType: routing.taskType });

  const result = await callModel(model, {
    system: subAgentSystemPrompt || 'You are a helpful specialist.',
    messages: [{ role: 'user', content: subAgentUserPrompt || routing.instruction || '' }],
    maxTokens: 4096,
    temperature: 0.4,
  });

  return {
    text: result.text,
    content: result.content,
    usage: result.usage,
    model,
    provider: result.provider,
    costCents: calculateCost(model, result.usage),
  };
}

/**
 * Get routing config for dashboard display
 */
export function getRoutingConfig() {
  const settings = getSettings();
  const tierMap = TIER_MODEL_MAP[settings.tier] || TIER_MODEL_MAP.standard;
  
  return {
    tier: settings.tier,
    dispatchEnabled: settings.dispatchEnabled,
    modelMap: Object.fromEntries(
      Object.entries(tierMap).map(([task, model]) => [task, getModelForTask(task, settings.tier)])
    ),
    providers: {
      anthropic: { available: !!process.env.ANTHROPIC_API_KEY },
      openai:    { available: !!process.env.OPENAI_API_KEY },
      deepseek:  { available: !!process.env.DEEPSEEK_API_KEY },
      gemini:    { available: !!process.env.GEMINI_API_KEY },
    },
  };
}

// Keep old exports for backwards compatibility
export function getModelMap() {
  const settings = getSettings();
  return TIER_MODEL_MAP[settings.tier] || TIER_MODEL_MAP.standard;
}

export function getAvailableProviders() {
  return {
    anthropic: { available: !!process.env.ANTHROPIC_API_KEY, models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929'] },
    openai:    { available: !!process.env.OPENAI_API_KEY,    models: ['gpt-4o', 'gpt-4o-mini'] },
    deepseek:  { available: !!process.env.DEEPSEEK_API_KEY,  models: ['deepseek-chat'] },
    gemini:    { available: !!process.env.GEMINI_API_KEY,     models: ['gemini-2.5-flash', 'gemini-3-flash-preview'] },
  };
}
