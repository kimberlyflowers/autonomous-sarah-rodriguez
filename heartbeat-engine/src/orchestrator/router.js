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
import { getResolvedConfig } from '../config/admin-config.js';
import { createLogger } from '../logging/logger.js';
import { getSkillContext } from '../skills/skill-loader.js';

const logger = createLogger('orchestrator-router');

// Re-export calculateCost for other modules
export { calculateCost };

// ── Default model — resolved from admin config at runtime ────────────────
// MULTI-TENANT: per-org model cache
const _modelCache = new Map(); // orgId → { model, expiry }

async function getDefaultModel(orgId = null) {
  const cacheKey = orgId || '_global';
  const now = Date.now();
  const cached = _modelCache.get(cacheKey);
  if (cached && now < cached.expiry) return cached.model;
  try {
    // Use the org's config if we have an orgId, otherwise fall back to global
    const resolveId = orgId || 'a1000000-0000-0000-0000-000000000001';
    const config = await getResolvedConfig(resolveId);
    const model = config.model || 'gemini-2.5-flash';
    _modelCache.set(cacheKey, { model, expiry: now + 60_000 });
    return model;
  } catch {
    return cached?.model || 'gemini-2.5-flash';
  }
}

// ── Plan tiers determine which models Sarah uses ──────────────────────────
// Standard: uses admin-configured default (Gemini) for everything
// Pro: better writing model, cheap everything else
// Enterprise: premium writing + dispatch to specialists

function buildTierModelMap(defaultModel) {
  return {
    standard: {
      chat:      defaultModel,
      writing:   defaultModel,
      email:     defaultModel,
      coding:    defaultModel,
      crm:       defaultModel,
      research:  defaultModel,
      data:      defaultModel,
    },
    pro: {
      chat:      defaultModel,
      writing:   'claude-sonnet-4-5-20250929',   // Pro: Sonnet for writing
      email:     'gpt-4o-mini',                   // Pro: GPT-4o-mini for email (if key exists)
      coding:    'deepseek-chat',                 // Pro: DeepSeek for code (if key exists)
      crm:       defaultModel,
      research:  defaultModel,
      data:      defaultModel,
    },
    enterprise: {
      chat:      defaultModel,
      writing:   'claude-sonnet-4-5-20250929',   // Enterprise: Sonnet for writing
      email:     'gpt-4o',                        // Enterprise: Full GPT-4o for email
      coding:    'deepseek-chat',                 // Enterprise: DeepSeek for code
      crm:       defaultModel,
      research:  defaultModel,
      data:      defaultModel,
    },
  };
}

// Fallback static map until async init completes
const TIER_MODEL_MAP = buildTierModelMap('gemini-2.5-flash');

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
  design:  /\b(flyer|graphic|image|design|poster|banner|logo|thumbnail|social.?media.?post|quote.?card|cover.?image|ad.?creative|promo.?image|carousel.?design|pinterest.?pin|youtube.?thumbnail)\b/i,
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

function getModelForTask(taskType, tier = 'standard', defaultModel = null) {
  // Use dynamic tier map if default model provided, otherwise static fallback
  const tierMaps = defaultModel ? buildTierModelMap(defaultModel) : TIER_MODEL_MAP;
  const tierMap = tierMaps[tier] || tierMaps.standard;
  const model = tierMap[taskType] || tierMap.chat;

  // Check if the chosen model's API key exists — fall back to admin default, then Gemini
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
    // Fall back to Gemini Flash (NOT Claude — respect the Gemini-first admin setting)
    const fallback = defaultModel || 'gemini-2.5-flash';
    logger.debug(`${model} unavailable (no ${envKey}), falling back to ${fallback}`);
    return fallback;
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
export async function routeTaskFast(instruction) {
  const settings = getSettings();
  const taskType = classifyTask(instruction);
  const defaultModel = await getDefaultModel();
  const model = getModelForTask(taskType, settings.tier, defaultModel);

  logger.info('Fast route', { taskType, model, tier: settings.tier, defaultModel });

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
  
  const defaultModel = await getDefaultModel();
  const routerModel = defaultModel; // Use admin-configured model for routing too

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
    const model = getModelForTask(routing.taskType, settings.tier, defaultModel);

    return {
      ...routing,
      model,
      tier: settings.tier,
      routingUsage: result.usage,
      routingCostCents: calculateCost(routerModel, result.usage),
    };
  } catch (e) {
    logger.warn('LLM routing failed, using fast route', { error: e.message });
    return await routeTaskFast(instruction);
  }
}

/**
 * Execute a specialist task with the routed model.
 * MULTI-TENANT: Now injects skill context from the skill-loader so scheduled
 * tasks get the same expert guidance that interactive chat tasks get.
 * @param {object} routing - The routing result from routeTask/routeTaskFast
 * @param {object} [context] - Optional multi-tenant context { orgId, agentId }
 */
export async function executeSubAgent(routing, context = {}) {
  const { model, subAgentSystemPrompt, subAgentUserPrompt } = routing;

  // Inject skill context — this is the critical fix for "abandoned" scheduled tasks.
  // Previously only chat.js did this; now scheduled tasks get skills too.
  const skillContext = getSkillContext(routing.taskType, subAgentUserPrompt || routing.instruction || '');
  const systemWithSkills = (subAgentSystemPrompt || 'You are a helpful specialist.') + skillContext;

  logger.info('Executing sub-agent', {
    model,
    taskType: routing.taskType,
    skillsInjected: skillContext.length > 0,
    orgId: context.orgId || 'unknown',
  });

  const result = await callModel(model, {
    system: systemWithSkills,
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
