// BLOOM Orchestrator Router
// Sarah (Haiku) classifies incoming tasks and routes to the best sub-agent model
import { callModel } from '../llm/unified-client.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('orchestrator-router');

// ═══ Model routing defaults ═══
// Can be overridden by env vars: MODEL_WRITING, MODEL_EMAIL, etc.
const MODEL_MAP = {
  orchestrator: process.env.MODEL_ORCHESTRATOR || 'claude-haiku-4-5-20251001',
  writing:      process.env.MODEL_WRITING      || 'claude-sonnet-4-5-20250929',
  email:        process.env.MODEL_EMAIL         || 'gpt-4o',
  coding:       process.env.MODEL_CODING        || 'deepseek-chat',
  crm:          process.env.MODEL_CRM           || 'claude-haiku-4-5-20251001',
  research:     process.env.MODEL_RESEARCH      || 'claude-haiku-4-5-20251001',
  design:       process.env.MODEL_IMAGE         || 'gpt-4o', // placeholder until image gen
  video:        process.env.MODEL_VIDEO         || 'veo3', // premium tier
  data:         process.env.MODEL_DATA          || 'claude-haiku-4-5-20251001',
};

// ═══ Token pricing (per 1M tokens, in dollars) ═══
const PRICING = {
  'claude-haiku-4-5-20251001':   { input: 0.25,  output: 1.25  },
  'claude-sonnet-4-5-20250929':  { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-20250514':    { input: 3.00,  output: 15.00 },
  'gpt-4o':                      { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':                 { input: 0.15,  output: 0.60  },
  'deepseek-chat':               { input: 0.27,  output: 1.10  },
  'deepseek-reasoner':           { input: 0.55,  output: 2.19  },
};

/**
 * Calculate cost in cents from usage
 */
export function calculateCost(model, usage) {
  const pricing = PRICING[model] || { input: 1.0, output: 3.0 };
  const inputCost  = (usage.inputTokens  / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 100 * 10000) / 10000; // cents, 4 decimal places
}

/**
 * Route a task — Sarah (Haiku) decides which model should handle it
 * 
 * @param {string} instruction - The task instruction
 * @param {string} memoryContext - Letta memory summary for context
 * @returns {{ taskType, model, subAgentSystemPrompt, subAgentUserPrompt, expectedOutput, postProcessing[], routingUsage }}
 */
export async function routeTask(instruction, memoryContext = '') {
  const routerModel = MODEL_MAP.orchestrator;

  logger.info('Routing task', { instruction: instruction.slice(0, 100), routerModel });

  const routerSystemPrompt = `You are Sarah Rodriguez, an AI orchestrator for BLOOM Ecosystem. You manage a team of AI sub-agents, each specialized for different work.

Your job: Given a task instruction, classify it and prepare the prompt for the right sub-agent.

Available task types and their models:
- "writing" → Long-form content: blog posts, articles, SOPs, reports (Claude Sonnet — best quality writing)
- "email" → Short persuasive copy: emails, subject lines, SMS, social captions (GPT-4o — great at punchy copy)
- "coding" → Scripts, HTML, automation, data processing (DeepSeek — strong coder, very cheap)
- "crm" → CRM operations: check contacts, update records, pull data (Haiku — just API calls)
- "research" → Web research, summarize findings, competitive analysis (Haiku — fast with search)
- "design" → Visual content: flyers, graphics, images (GPT image — placeholder)
- "data" → Spreadsheets, CSVs, number crunching (Haiku — structured data)

Your memory context (knowledge from past conversations with this client):
${memoryContext || 'No memory context available yet.'}

Respond with ONLY valid JSON, no markdown fences, no explanation:
{
  "taskType": "writing|email|coding|crm|research|design|data",
  "reasoning": "Brief explanation of why this model is best",
  "subAgentSystemPrompt": "The system prompt to give the sub-agent, including relevant context from memory",
  "subAgentUserPrompt": "The specific task instruction, enriched with context",
  "expectedOutput": "markdown|html|json|text|code",
  "postProcessing": ["save_as_file", "log_evidence"]
}

Rules:
- The subAgentSystemPrompt should include brand voice, audience, and preferences from memory
- The subAgentUserPrompt should be specific and actionable
- For content tasks, always include "save_as_file" in postProcessing
- For CRM tasks, include "log_crm_actions" in postProcessing
- For email tasks, include "send_via_crm" in postProcessing
- Keep it practical — don't over-complicate`;

  const result = await callModel(routerModel, {
    system: routerSystemPrompt,
    messages: [{ role: 'user', content: `Task instruction: ${instruction}` }],
    maxTokens: 1024,
    temperature: 0.1,
  });

  // Parse the routing decision
  const text = result.text || '';
  let routing;

  try {
    // Strip any markdown fences just in case
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    routing = JSON.parse(cleaned);
  } catch (e) {
    logger.warn('Router returned non-JSON, using fallback', { text: text.slice(0, 200) });
    // Fallback: classify by keywords
    routing = fallbackClassify(instruction);
  }

  // Map taskType to actual model
  const model = MODEL_MAP[routing.taskType] || MODEL_MAP.writing;

  logger.info('Task routed', {
    taskType: routing.taskType,
    model,
    reasoning: routing.reasoning?.slice(0, 80)
  });

  return {
    ...routing,
    model,
    routingUsage: result.usage,
    routingModel: routerModel,
    routingCostCents: calculateCost(routerModel, result.usage),
  };
}

/**
 * Execute the sub-agent — send the routed prompt to the chosen model
 * 
 * @param {object} routing - Output from routeTask()
 * @returns {{ text, usage, model, provider, costCents }}
 */
export async function executeSubAgent(routing) {
  const { model, subAgentSystemPrompt, subAgentUserPrompt } = routing;

  logger.info('Executing sub-agent', { model, taskType: routing.taskType });

  const result = await callModel(model, {
    system: subAgentSystemPrompt,
    messages: [{ role: 'user', content: subAgentUserPrompt }],
    maxTokens: 4096,
    temperature: 0.4,
  });

  const costCents = calculateCost(model, result.usage);

  logger.info('Sub-agent completed', {
    model,
    tokens: result.usage.inputTokens + result.usage.outputTokens,
    costCents
  });

  return {
    text: result.text,
    content: result.content,
    usage: result.usage,
    model,
    provider: result.provider,
    costCents,
  };
}

/**
 * Get the model routing table (for display in dashboard)
 */
export function getModelMap() {
  return { ...MODEL_MAP };
}

/**
 * Get available models with their API key status
 */
export function getAvailableProviders() {
  return {
    anthropic: { available: !!process.env.ANTHROPIC_API_KEY, models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929'] },
    openai:    { available: !!process.env.OPENAI_API_KEY,    models: ['gpt-4o', 'gpt-4o-mini'] },
    deepseek:  { available: !!process.env.DEEPSEEK_API_KEY,  models: ['deepseek-chat', 'deepseek-reasoner'] },
  };
}

// ═══ Fallback classifier (keyword-based, no LLM) ═══
function fallbackClassify(instruction) {
  const lower = instruction.toLowerCase();

  if (lower.match(/blog|article|post|write|sop|report|content|whitepaper/))
    return { taskType: 'writing', reasoning: 'Keyword match: content creation', subAgentSystemPrompt: 'You are a professional content writer.', subAgentUserPrompt: instruction, expectedOutput: 'markdown', postProcessing: ['save_as_file', 'log_evidence'] };

  if (lower.match(/email|subject line|newsletter|campaign|sms|message/))
    return { taskType: 'email', reasoning: 'Keyword match: email/messaging', subAgentSystemPrompt: 'You are an expert email copywriter.', subAgentUserPrompt: instruction, expectedOutput: 'text', postProcessing: ['save_as_file', 'log_evidence'] };

  if (lower.match(/code|script|html|css|javascript|python|automate|function/))
    return { taskType: 'coding', reasoning: 'Keyword match: coding task', subAgentSystemPrompt: 'You are an expert programmer.', subAgentUserPrompt: instruction, expectedOutput: 'code', postProcessing: ['save_as_file', 'log_evidence'] };

  if (lower.match(/contact|lead|crm|follow.?up|check.?(new|recent)|ghl/))
    return { taskType: 'crm', reasoning: 'Keyword match: CRM operations', subAgentSystemPrompt: 'You are a CRM operations assistant.', subAgentUserPrompt: instruction, expectedOutput: 'json', postProcessing: ['log_crm_actions', 'log_evidence'] };

  if (lower.match(/research|search|find|look.?up|competitive|analyze/))
    return { taskType: 'research', reasoning: 'Keyword match: research', subAgentSystemPrompt: 'You are a research analyst.', subAgentUserPrompt: instruction, expectedOutput: 'markdown', postProcessing: ['save_as_file', 'log_evidence'] };

  if (lower.match(/flyer|graphic|image|design|poster|banner/))
    return { taskType: 'design', reasoning: 'Keyword match: design', subAgentSystemPrompt: 'You are a graphic designer.', subAgentUserPrompt: instruction, expectedOutput: 'html', postProcessing: ['save_as_file', 'log_evidence'] };

  // Default to writing
  return { taskType: 'writing', reasoning: 'Default: treating as content creation', subAgentSystemPrompt: 'You are a professional content writer.', subAgentUserPrompt: instruction, expectedOutput: 'markdown', postProcessing: ['save_as_file', 'log_evidence'] };
}
