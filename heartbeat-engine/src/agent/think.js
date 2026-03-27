// BLOOM Heartbeat Engine - Agent Thinking (Model-Native Prompt System)
// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE: Each LLM receives prompts written IN ITS OWN NATIVE LANGUAGE.
// No runtime translation. When Gemini runs, it sees the Gemini version.
// When GPT runs, it sees the GPT version. Claude sees Claude's version.
// DeepSeek sees DeepSeek's version.
//
// This eliminates hallucinated action types (read_ghl, read_email, etc.)
// by giving every model an explicit, schema-enforced decision contract
// written the way that model was trained to parse it.
// ═══════════════════════════════════════════════════════════════════════════

import { callModel } from '../llm/unified-client.js';
import { getResolvedConfig } from '../config/admin-config.js';
import { createLogger } from '../logging/logger.js';
import { getAutonomyLevel } from '../config/autonomy-levels.js';
import { getProgressText } from './progress-log.js';

const logger = createLogger('think');

// MULTI-TENANT: No hardcoded org ID — org is passed via context.agentProfile
const DEFAULT_ORG_ID = 'a1000000-0000-0000-0000-000000000001'; // fallback only

// ═══════════════════════════════════════════════════════════════════════════
// VALID ACTION TYPES — the ONLY strings act.js knows how to execute.
// Any other string causes a runtime crash. This is the source of truth.
// ═══════════════════════════════════════════════════════════════════════════
const VALID_ACTION_TYPES = [
  'send_followup_email',
  'send_appointment_reminder',
  'send_notification',
  'create_task',
  'update_contact',
  'update_pipeline',
  'update_task_status',
  'log_interaction',
  'schedule_reminder',
  'create_appointment',
  'reply_to_contact',       // Respond to an inbound SMS/email reply from a contact
];

// ═══════════════════════════════════════════════════════════════════════════
// JSON SCHEMA for structured output — used by OpenAI and Gemini compat API.
// This schema ENFORCES valid action_type via enum — model cannot hallucinate.
// ═══════════════════════════════════════════════════════════════════════════
const DECISION_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'heartbeat_decisions',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        decisions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['act', 'reject', 'escalate'],
                description: 'The decision type. Must be exactly one of these three values.',
              },
              action_type: {
                type: 'string',
                enum: VALID_ACTION_TYPES,
                description: 'Required when type is "act". Must be exactly one of the valid action types.',
              },
              description: { type: 'string' },
              target_system: { type: 'string' },
              input_data: { type: 'object', additionalProperties: true },
              reasoning: { type: 'string' },
              confidence: { type: 'number' },
              urgency: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
              verify_by: { type: 'string', enum: ['api_check', 'result_check', 'llm_judgment'] },
              success_criteria: { type: 'string' },
              // reject fields
              candidate: { type: 'string' },
              reason: { type: 'string' },
              alternative: { type: 'string' },
              // escalate fields
              issue: { type: 'string' },
              analysis: { type: 'string' },
              recommendation: { type: 'string' },
            },
            required: ['type', 'reasoning', 'confidence'],
            additionalProperties: false,
          },
        },
      },
      required: ['decisions'],
      additionalProperties: false,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER DETECTION
// ═══════════════════════════════════════════════════════════════════════════
function detectProvider(model) {
  if (!model) return 'anthropic';
  const m = model.toLowerCase();
  if (m.startsWith('claude')) return 'anthropic';
  if (m.startsWith('gemini')) return 'gemini';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return 'openai';
  if (m.startsWith('deepseek')) return 'deepseek';
  return 'anthropic'; // safe default
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED CONTEXT BUILDER — used by all 4 native prompt builders
// ═══════════════════════════════════════════════════════════════════════════
function buildSharedContext(context) {
  const { environment, memory, trigger, agentProfile, autonomyLevel } = context;
  const level = getAutonomyLevel(autonomyLevel);

  return {
    agentName: agentProfile.name,
    client: agentProfile.client,
    instructions: agentProfile.standingInstructions,
    level,
    trigger: trigger?.type || 'scheduled',
    triggerSub: trigger?.triggerType || '',
    timestamp: environment.timestamp,
    ghl: {
      inquiries: environment.ghl?.newInquiries?.length || 0,
      followups: environment.ghl?.overdueFollowups?.length || 0,
      appointments: environment.ghl?.upcomingAppointments?.length || 0,
      pipeline: environment.ghl?.pipelineUpdates?.length || 0,
    },
    email: {
      unread: environment.email?.unread?.length || 0,
      urgent: environment.email?.urgent?.length || 0,
      fromClients: environment.email?.fromClients?.length || 0,
    },
    tasks: {
      pending: environment.tasks?.pending?.length || 0,
      overdue: environment.tasks?.overdue?.length || 0,
      assigned: environment.tasks?.assigned?.length || 0,
    },
    calendar: {
      today: environment.calendar?.today?.length || 0,
      needsPrep: environment.calendar?.needsPrep?.length || 0,
      conflicts: environment.calendar?.conflicts?.length || 0,
    },
    alerts: environment.alerts?.map(a => `${a.type}: ${a.message} (${a.urgency})`).join('\n') || 'None',
    recentActions: memory.recentActions?.map(a =>
      `- ${a.action_type}: ${a.description} (${a.success ? 'SUCCESS' : 'FAILED'})`
    ).join('\n') || 'No recent actions',
    patterns: memory.patterns?.map(p => `- ${p.description}`).join('\n') || 'None',
    validTypes: VALID_ACTION_TYPES.join(', '),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① CLAUDE / ANTHROPIC NATIVE PROMPT
// Claude understands XML tags, rich system prompts, and thinks step-by-step.
// Claude does NOT get response_format — it gets a detailed XML-tagged contract.
// ═══════════════════════════════════════════════════════════════════════════
function buildAnthropicNativePrompts(ctx, progressContext) {
  const c = buildSharedContext(ctx);

  const system = `You are ${c.agentName}, an autonomous operations agent for ${c.client}.

<identity>
${c.instructions}
</identity>

<autonomy_level level="${c.level.level}" name="${c.level.name}">
${c.level.description}
Allowed: ${c.level.allowed.join(', ')}
Blocked: ${c.level.blocked.join(', ')}
Escalation policy: ${c.level.escalation}
</autonomy_level>

<decision_contract>
You will analyze the environment snapshot and return a JSON array of decisions.

DECISION TYPES (exactly one of):
  "act"      — you will execute this action within your autonomy scope
  "reject"   — you considered this but decided against it
  "escalate" — requires human intervention

VALID action_type VALUES (when type is "act"):
You MUST use one of these EXACT strings. No variations, no new types:
${VALID_ACTION_TYPES.map(t => `  • "${t}"`).join('\n')}

Note: "read_ghl", "read_email", "read_tasks", "read_calendar" are NOT valid.
Sensing already happened in Phase 1. You are in Phase 3: deciding what to DO.

RESPONSE FORMAT: Return ONLY a JSON array inside a markdown code block:
\`\`\`json
[
  {
    "type": "act",
    "action_type": "create_task",
    "description": "Create follow-up task for new inquiry from contact 12345",
    "target_system": "GHL",
    "input_data": { "contact_id": "12345", "due_date": "2026-03-26" },
    "reasoning": "New inquiry 2 hours old, needs follow-up",
    "confidence": 0.9,
    "urgency": "MEDIUM",
    "verify_by": "api_check",
    "success_criteria": "Task ID returned by GHL API"
  }
]
\`\`\`
</decision_contract>

<recent_progress>
${progressContext || 'No recent progress entries.'}
</recent_progress>`;

  const user = `<heartbeat_cycle trigger="${c.trigger}${c.triggerSub ? ' / ' + c.triggerSub : ''}" timestamp="${c.timestamp}">

<environment>
  GHL: ${c.ghl.inquiries} new inquiries, ${c.ghl.followups} overdue follow-ups, ${c.ghl.appointments} upcoming appointments, ${c.ghl.pipeline} pipeline updates
  Email: ${c.email.unread} unread, ${c.email.urgent} urgent, ${c.email.fromClients} from clients
  Tasks: ${c.tasks.pending} pending, ${c.tasks.overdue} overdue, ${c.tasks.assigned} assigned to me
  Calendar: ${c.calendar.today} today, ${c.calendar.needsPrep} need prep, ${c.calendar.conflicts} conflicts
  Alerts: ${c.alerts}
</environment>

<memory>
  Recent actions:
${c.recentActions}
  Patterns: ${c.patterns}
</memory>

</heartbeat_cycle>

Analyze this situation. Return a JSON array of decisions using the exact format from your decision_contract. Only use action_type values from the approved list.`;

  return { system, user, responseFormat: null }; // Claude uses prompt engineering, not response_format
}

// ═══════════════════════════════════════════════════════════════════════════
// ② GEMINI NATIVE PROMPT
// Gemini (via OpenAI-compat endpoint) supports response_format json_schema.
// Gemini 2.5+ enforces enum values at the token level — no hallucination.
// Gemini prefers clear, flat instructions. Minimal XML. Explicit constraints.
// ═══════════════════════════════════════════════════════════════════════════
function buildGeminiNativePrompts(ctx, progressContext) {
  const c = buildSharedContext(ctx);

  const system = `You are ${c.agentName}, an autonomous operations agent for ${c.client}.

ROLE: ${c.instructions}

AUTONOMY LEVEL ${c.level.level} — ${c.level.name}
${c.level.description}
Allowed actions: ${c.level.allowed.join(', ')}
Blocked actions: ${c.level.blocked.join(', ')}
Escalation: ${c.level.escalation}

OUTPUT CONTRACT:
Return a JSON object with a "decisions" array. Each decision must have:
- "type": one of "act", "reject", or "escalate"
- "reasoning": explain your thinking
- "confidence": number 0.0 to 1.0

For "act" decisions, "action_type" MUST be one of these EXACT values:
${VALID_ACTION_TYPES.map((t, i) => `${i + 1}. ${t}`).join('\n')}

IMPORTANT: Do not invent action types. The execution engine only recognizes the values listed above.
"read_ghl", "read_email", "read_tasks", "read_calendar" will cause a crash — do not use them.
Sensing already completed in Phase 1. Decide what actions to EXECUTE, not what to read.

RECENT PROGRESS:
${progressContext || 'No recent progress.'}`;

  const user = `HEARTBEAT CYCLE — Trigger: ${c.trigger}${c.triggerSub ? ' / ' + c.triggerSub : ''} — ${c.timestamp}

ENVIRONMENT:
GoHighLevel: ${c.ghl.inquiries} new inquiries | ${c.ghl.followups} overdue follow-ups | ${c.ghl.appointments} upcoming appointments | ${c.ghl.pipeline} pipeline updates
Email: ${c.email.unread} unread | ${c.email.urgent} urgent | ${c.email.fromClients} from clients
Tasks: ${c.tasks.pending} pending | ${c.tasks.overdue} overdue | ${c.tasks.assigned} assigned to me
Calendar: ${c.calendar.today} today | ${c.calendar.needsPrep} need prep | ${c.calendar.conflicts} conflicts
Alerts: ${c.alerts}

MEMORY:
Recent actions:
${c.recentActions}

Decide what actions to take this cycle. Return a JSON object with a "decisions" array.`;

  return { system, user, responseFormat: DECISION_SCHEMA };
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ OPENAI / GPT NATIVE PROMPT
// GPT models excel with clear role definitions and numbered lists.
// GPT-4o supports json_schema with strict:true — guaranteed enum adherence.
// GPT style: professional, direct, role-framed.
// ═══════════════════════════════════════════════════════════════════════════
function buildOpenAINativePrompts(ctx, progressContext) {
  const c = buildSharedContext(ctx);

  const system = `You are ${c.agentName}, an autonomous operations agent for ${c.client}.

Your role: ${c.instructions}

Autonomy Level: ${c.level.level} (${c.level.name})
${c.level.description}

Allowed: ${c.level.allowed.join(', ')}
Blocked: ${c.level.blocked.join(', ')}
Escalation policy: ${c.level.escalation}

You analyze operational data and decide what actions to execute. You will return a structured JSON object with a "decisions" array.

Each decision has one of these types:
- "act": take an action (requires action_type from the approved list)
- "reject": decline to act (explain why)
- "escalate": flag for human review

ACTION TYPE RULES — CRITICAL:
The execution engine maps action_type strings to code handlers. Only these strings have handlers.
Using any other string will throw an error and crash the heartbeat cycle.

Approved action_type values:
${VALID_ACTION_TYPES.map((t, i) => `  ${i + 1}. "${t}"`).join('\n')}

Never use: "read_ghl", "read_email", "read_tasks", "read_calendar" — these have no handlers.
The sensing phase (Phase 1) already ran. You are deciding what ACTIONS to EXECUTE.

Recent operational progress:
${progressContext || 'No recent progress.'}`;

  const user = `Heartbeat cycle — ${c.trigger}${c.triggerSub ? ' / ' + c.triggerSub : ''} — ${c.timestamp}

Current environment:
- GoHighLevel: ${c.ghl.inquiries} new inquiries, ${c.ghl.followups} overdue follow-ups, ${c.ghl.appointments} upcoming appointments, ${c.ghl.pipeline} pipeline updates
- Email: ${c.email.unread} unread, ${c.email.urgent} urgent, ${c.email.fromClients} from clients
- Tasks: ${c.tasks.pending} pending, ${c.tasks.overdue} overdue, ${c.tasks.assigned} assigned
- Calendar: ${c.calendar.today} today, ${c.calendar.needsPrep} need prep, ${c.calendar.conflicts} conflicts
- Alerts: ${c.alerts}

Recent actions:
${c.recentActions}

Return a JSON object with a "decisions" array. Use only approved action_type values.`;

  return { system, user, responseFormat: DECISION_SCHEMA };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ DEEPSEEK NATIVE PROMPT
// DeepSeek requires: (1) the word "json" in system/user prompt explicitly,
// (2) an example of the exact JSON structure, (3) response_format json_object.
// DeepSeek does NOT support json_schema strict mode — only json_object.
// DeepSeek is trained on code; it responds well to typed interface definitions.
// ═══════════════════════════════════════════════════════════════════════════
function buildDeepSeekNativePrompts(ctx, progressContext) {
  const c = buildSharedContext(ctx);

  // DeepSeek REQUIRES the word "json" in the system prompt
  const system = `You are ${c.agentName}, an autonomous operations agent for ${c.client}.

Role: ${c.instructions}

Autonomy Level: ${c.level.level} (${c.level.name})
Allowed: ${c.level.allowed.join(', ')}
Blocked: ${c.level.blocked.join(', ')}

OUTPUT: You must respond with a valid JSON object. The word "json" is required in this prompt.

Your response must match this TypeScript interface:

interface DecisionResponse {
  decisions: Decision[];
}

type DecisionType = "act" | "reject" | "escalate";

// Valid action_type values — ONLY these strings are valid, no others:
type ActionType =
  | "send_followup_email"
  | "send_appointment_reminder"
  | "send_notification"
  | "create_task"
  | "update_contact"
  | "update_pipeline"
  | "update_task_status"
  | "log_interaction"
  | "schedule_reminder"
  | "create_appointment";

interface Decision {
  type: DecisionType;
  reasoning: string;
  confidence: number; // 0.0 to 1.0
  // Required when type === "act":
  action_type?: ActionType;
  description?: string;
  target_system?: string;
  input_data?: Record<string, unknown>;
  urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  verify_by?: "api_check" | "result_check" | "llm_judgment";
  success_criteria?: string;
  // Required when type === "reject":
  candidate?: string;
  reason?: string;
  // Required when type === "escalate":
  issue?: string;
  analysis?: string;
  recommendation?: string;
}

CONSTRAINT: action_type must be one of the ActionType values above.
Do NOT use: "read_ghl", "read_email", "read_tasks", "read_calendar" — these are not valid ActionType values and will crash the system.

Example valid JSON response:
{
  "decisions": [
    {
      "type": "act",
      "action_type": "create_task",
      "description": "Create follow-up task for overdue contact",
      "target_system": "GHL",
      "input_data": { "contact_id": "abc123" },
      "reasoning": "Overdue follow-up requires immediate action",
      "confidence": 0.85,
      "urgency": "HIGH",
      "verify_by": "api_check",
      "success_criteria": "Task ID returned by GHL"
    }
  ]
}

Recent progress:
${progressContext || 'No recent progress.'}`;

  const user = `Heartbeat cycle — ${c.trigger}${c.triggerSub ? ' / ' + c.triggerSub : ''} — ${c.timestamp}

Environment data:
- GHL: ${c.ghl.inquiries} new inquiries, ${c.ghl.followups} overdue follow-ups, ${c.ghl.appointments} upcoming appointments, ${c.ghl.pipeline} pipeline updates
- Email: ${c.email.unread} unread, ${c.email.urgent} urgent, ${c.email.fromClients} from clients
- Tasks: ${c.tasks.pending} pending, ${c.tasks.overdue} overdue, ${c.tasks.assigned} assigned
- Calendar: ${c.calendar.today} today, ${c.calendar.needsPrep} prep needed, ${c.calendar.conflicts} conflicts
- Alerts: ${c.alerts}

Recent actions:
${c.recentActions}

Respond with a json object containing a "decisions" array using the interface defined above.`;

  // DeepSeek uses json_object (not json_schema — it doesn't support strict mode)
  const deepseekResponseFormat = { type: 'json_object' };

  return { system, user, responseFormat: deepseekResponseFormat };
}

// ═══════════════════════════════════════════════════════════════════════════
// NATIVE PROMPT ROUTER — detects model, returns the right native prompts
// ═══════════════════════════════════════════════════════════════════════════
async function getModelNativePrompts(model, context) {
  const provider = detectProvider(model);

  let progressContext = '';
  try {
    progressContext = await getProgressText({ hours: 24, limit: 10 });
  } catch (e) {
    logger.warn('Could not load progress context:', e.message);
  }

  logger.info('Building model-native prompt', { model, provider });

  switch (provider) {
    case 'anthropic': return buildAnthropicNativePrompts(context, progressContext);
    case 'gemini':    return buildGeminiNativePrompts(context, progressContext);
    case 'openai':    return buildOpenAINativePrompts(context, progressContext);
    case 'deepseek':  return buildDeepSeekNativePrompts(context, progressContext);
    default:
      logger.warn(`Unknown provider "${provider}" for model "${model}" — falling back to Anthropic native`);
      return buildAnthropicNativePrompts(context, progressContext);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE PARSER — handles both wrapped {decisions:[]} and raw [] formats
// Works for all providers: Claude returns raw array, others may wrap it
// ═══════════════════════════════════════════════════════════════════════════
function parseDecisionResponse(responseText, provider) {
  try {
    // Strip markdown code blocks if present (Claude does this)
    const stripped = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed = JSON.parse(stripped);

    // Handle {decisions: [...]} wrapper (Gemini, GPT, DeepSeek with schema)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.decisions)) {
      parsed = parsed.decisions;
    }

    // Ensure array
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    return parsed.map(decision => {
      decision.timestamp = new Date().toISOString();
      decision.agentId = process.env.AGENT_ID || 'bloomie-sarah-rodriguez';

      // Validate type
      if (!decision.type || !['act', 'reject', 'escalate'].includes(decision.type)) {
        logger.warn('Invalid decision type, converting to escalate:', { type: decision.type });
        return {
          type: 'escalate',
          issue: 'Invalid decision format from AI model',
          analysis: `Model returned invalid type: ${decision.type}`,
          recommendation: 'Check model-native prompt configuration',
          confidence: 0.5,
          urgency: 'MEDIUM',
          original: decision,
          timestamp: decision.timestamp,
          agentId: decision.agentId,
        };
      }

      // Validate action_type for "act" decisions
      if (decision.type === 'act') {
        if (!decision.action_type || !VALID_ACTION_TYPES.includes(decision.action_type)) {
          logger.warn('Invalid action_type, converting to escalate:', { action_type: decision.action_type, provider });
          return {
            type: 'escalate',
            issue: `Model returned invalid action_type: "${decision.action_type}"`,
            analysis: `Provider "${provider}" generated an action_type that has no handler in act.js`,
            recommendation: 'Check model-native prompt for this provider — action_type constraint may need strengthening',
            confidence: 0.8,
            urgency: 'MEDIUM',
            timestamp: decision.timestamp,
            agentId: decision.agentId,
          };
        }
      }

      // Normalize confidence
      if (decision.confidence > 1) decision.confidence = decision.confidence / 100;
      if (!decision.confidence || decision.confidence < 0) decision.confidence = 0.5;

      return decision;
    });

  } catch (error) {
    logger.error('Failed to parse model decision response:', { error: error.message, provider, preview: responseText?.substring(0, 300) });
    return [{
      type: 'escalate',
      issue: `Failed to parse AI decision response: ${error.message}`,
      analysis: `Provider "${provider}" returned non-parseable output`,
      recommendation: 'Check model-native prompt and response_format configuration',
      confidence: 0.8,
      urgency: 'MEDIUM',
      timestamp: new Date().toISOString(),
      agentId: process.env.AGENT_ID || 'bloomie-sarah-rodriguez',
    }];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN THINK FUNCTION
// ═══════════════════════════════════════════════════════════════════════════
export async function think(context) {
  logger.info('🤔 Agent thinking phase started...', {
    agent: context.agentProfile.agentId,
    autonomyLevel: context.autonomyLevel,
    alertCount: context.environment.alerts?.length || 0,
  });

  try {
    // MULTI-TENANT: Resolve model from the agent's org config, not a hardcoded org
    const orgId = context.agentProfile?.organizationId || context.agentProfile?.orgId || DEFAULT_ORG_ID;
    let thinkModel = 'gemini-2.5-flash';
    try {
      const config = await getResolvedConfig(orgId);
      thinkModel = config.model || 'gemini-2.5-flash';
    } catch (cfgErr) {
      logger.warn('Could not load admin config for think, using default:', { orgId, error: cfgErr.message });
    }

    const provider = detectProvider(thinkModel);
    logger.info('Think phase — model-native prompt selected', { model: thinkModel, provider });

    // Get model-native prompts (each model gets its own language)
    const { system, user, responseFormat } = await getModelNativePrompts(thinkModel, context);

    // Build callModel options
    const callOptions = {
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: 4000,
      temperature: 0.1,
    };

    // Attach response_format for models that support it (Gemini, OpenAI, DeepSeek)
    // Anthropic does NOT use response_format — prompt engineering is sufficient
    if (responseFormat) {
      callOptions.responseFormat = responseFormat;
    }

    const response = await callModel(thinkModel, callOptions);

    const decisions = parseDecisionResponse(response.text, provider);

    logger.info(`Model generated ${decisions.length} decisions`, {
      provider,
      model: thinkModel,
      actions: decisions.filter(d => d.type === 'act').length,
      rejections: decisions.filter(d => d.type === 'reject').length,
      escalations: decisions.filter(d => d.type === 'escalate').length,
    });

    return decisions;

  } catch (error) {
    logger.error('Agent thinking failed:', { message: error.message, stack: error.stack });

    return [{
      type: 'escalate',
      issue: `AI thinking module failed: ${error.message}`,
      analysis: 'The model call itself failed, not just the response parsing',
      recommendation: 'Check API connectivity and model configuration',
      confidence: 1.0,
      urgency: 'HIGH',
      timestamp: new Date().toISOString(),
      agentId: process.env.AGENT_ID || 'bloomie-sarah-rodriguez',
    }];
  }
}
