// BLOOM Heartbeat Engine - Agent Thinking (Claude API Integration)
// Analyzes environment and memory to make autonomous decisions

import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logging/logger.js';
import { getAutonomyLevel } from '../config/autonomy-levels.js';

const logger = createLogger('think');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export async function think(context) {
  logger.info('🤔 Agent thinking phase started...', {
    agent: context.agentProfile.agentId,
    autonomyLevel: context.autonomyLevel,
    alertCount: context.environment.alerts?.length || 0
  });

  try {
    // Build the prompt with all context
    const prompt = buildThinkingPrompt(context);

    logger.info('Calling Claude API for decision making...');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      temperature: 0.1, // Low temperature for consistent decision making
      system: buildSystemPrompt(context),
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const decisions = parseClaudeResponse(response.content[0].text);

    logger.info(`Claude generated ${decisions.length} decisions`, {
      actions: decisions.filter(d => d.type === 'act').length,
      rejections: decisions.filter(d => d.type === 'reject').length,
      escalations: decisions.filter(d => d.type === 'escalate').length
    });

    return decisions;

  } catch (error) {
    logger.error('Agent thinking failed:', error);

    // Return a safe escalation if AI fails
    return [{
      type: 'escalate',
      issue: `AI thinking module failed: ${error.message}`,
      analysis: 'Claude API call failed during decision making',
      recommendation: 'Check API connectivity and retry cycle',
      confidence: 1.0,
      urgency: 'HIGH'
    }];
  }
}

function buildSystemPrompt(context) {
  const autonomyLevel = getAutonomyLevel(context.autonomyLevel);

  return `You are ${context.agentProfile.name}, an autonomous operations agent for ${context.agentProfile.client}.

IDENTITY AND ROLE:
${context.agentProfile.standingInstructions}

CURRENT AUTONOMY LEVEL: ${autonomyLevel.level} (${autonomyLevel.name})
${autonomyLevel.description}

ALLOWED ACTIONS: ${autonomyLevel.allowed.join(', ')}
BLOCKED ACTIONS: ${autonomyLevel.blocked.join(', ')}
ESCALATION POLICY: ${autonomyLevel.escalation}

DECISION-MAKING PRINCIPLES:
1. SAFETY FIRST: Never take actions that could harm the business or client relationships
2. NO GUESSING: If you're unsure, escalate with your analysis rather than guess
3. LOG EVERYTHING: Every decision (do, don't do, escalate) must be justified
4. STAY IN SCOPE: Only take actions within your current autonomy level
5. BE THOROUGH: Consider all possibilities before deciding

For each decision, you must output structured JSON with these types:
- "act": Actions you will take within your scope
- "reject": Actions you considered but decided against (with reasons)
- "escalate": Issues requiring human intervention

Always explain your reasoning and confidence level (0.0 to 1.0).`;
}

function buildThinkingPrompt(context) {
  const { environment, memory, trigger } = context;

  return `# HEARTBEAT CYCLE ANALYSIS

## CURRENT SITUATION
**Trigger**: ${trigger.type || 'scheduled'} ${trigger.triggerType ? `(${trigger.triggerType})` : ''}
**Time**: ${environment.timestamp}

## ENVIRONMENT SNAPSHOT

### GoHighLevel Activity:
- New Inquiries: ${environment.ghl.newInquiries?.length || 0}
- Overdue Follow-ups: ${environment.ghl.overdueFollowups?.length || 0}
- Upcoming Appointments: ${environment.ghl.upcomingAppointments?.length || 0}
- Pipeline Updates: ${environment.ghl.pipelineUpdates?.length || 0}

### Email Activity:
- Unread: ${environment.email.unread?.length || 0}
- Urgent: ${environment.email.urgent?.length || 0}
- From Clients: ${environment.email.fromClients?.length || 0}

### Tasks:
- Pending: ${environment.tasks.pending?.length || 0}
- Overdue: ${environment.tasks.overdue?.length || 0}
- Assigned to Me: ${environment.tasks.assigned?.length || 0}

### Calendar:
- Today's Appointments: ${environment.calendar.today?.length || 0}
- Need Prep: ${environment.calendar.needsPrep?.length || 0}
- Conflicts: ${environment.calendar.conflicts?.length || 0}

### Environment Alerts:
${environment.alerts?.map(alert => `- ${alert.type}: ${alert.message} (${alert.urgency})`).join('\n') || 'None'}

## RECENT MEMORY CONTEXT
${memory.recentActions?.length ?
  `Recent actions I took:\n${memory.recentActions.map(a => `- ${a.action_type}: ${a.description} (${a.success ? 'SUCCESS' : 'FAILED'})`).join('\n')}` :
  'No recent actions in memory'}

${memory.patterns?.length ?
  `Learned patterns:\n${memory.patterns.map(p => `- ${p.description}`).join('\n')}` :
  'No learned patterns available'}

${memory.preferences?.length ?
  `Client preferences:\n${memory.preferences.map(p => `- ${p.preference}: ${p.value}`).join('\n')}` :
  'No client preferences stored'}

## YOUR TASK

Analyze this situation and make decisions. For each potential action, decide whether to:
1. **ACT** - Take the action (within your autonomy scope)
2. **REJECT** - Don't take the action (explain why)
3. **ESCALATE** - Hand off to human (explain analysis and recommendation)

Return your decisions as a JSON array with this format:

\`\`\`json
[
  {
    "type": "act",
    "action_type": "send_followup_email",
    "description": "Send follow-up email to John Smith about enrollment inquiry",
    "target_system": "GHL",
    "input_data": {
      "contact_id": "12345",
      "template": "enrollment_followup",
      "personalization": "Mentioned interest in math tutoring"
    },
    "reasoning": "New inquiry received 45 minutes ago, within follow-up window",
    "confidence": 0.9,
    "urgency": "MEDIUM"
  },
  {
    "type": "reject",
    "candidate": "delete_spam_contact",
    "reason": "Contact appears suspicious but deletion requires human verification",
    "reasoning": "Safety protocol - avoid irreversible data actions",
    "confidence": 0.8,
    "alternative": "Flag contact for human review instead"
  },
  {
    "type": "escalate",
    "issue": "Multiple scheduling conflicts detected for tomorrow",
    "analysis": "Found 3 overlapping appointments between 2-4pm, tried automatic resolution but conflicts remain",
    "hypotheses_tested": ["Double-booked time slots", "Timezone errors", "System sync issues"],
    "recommendation": "Manual review of calendar and contact with affected clients",
    "confidence": 0.95,
    "urgency": "HIGH"
  }
]
\`\`\`

Focus on the most important issues first. Consider both immediate actions and preventive measures.`;
}

function parseClaudeResponse(responseText) {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;

    let decisions = JSON.parse(jsonText);

    // Ensure it's an array
    if (!Array.isArray(decisions)) {
      decisions = [decisions];
    }

    // Validate and enrich each decision
    return decisions.map(decision => {
      // Add default values for required fields
      decision.timestamp = new Date().toISOString();
      decision.agentId = process.env.AGENT_ID || 'bloomie-sarah-rodriguez';

      // Validate decision structure
      if (!decision.type || !['act', 'reject', 'escalate'].includes(decision.type)) {
        logger.warn('Invalid decision type, defaulting to escalate:', decision);
        return {
          type: 'escalate',
          issue: 'Invalid decision format from AI',
          analysis: 'Decision did not match expected structure',
          recommendation: 'Review AI response format',
          confidence: 0.5,
          urgency: 'MEDIUM',
          original: decision
        };
      }

      // Ensure confidence is between 0 and 1
      if (decision.confidence > 1) {
        decision.confidence = decision.confidence / 100; // Convert percentage
      }
      if (!decision.confidence || decision.confidence < 0) {
        decision.confidence = 0.5; // Default moderate confidence
      }

      return decision;
    });

  } catch (error) {
    logger.error('Failed to parse Claude response:', error, {
      responseText: responseText.substring(0, 500)
    });

    return [{
      type: 'escalate',
      issue: `Failed to parse AI decision: ${error.message}`,
      analysis: 'AI response was not in expected JSON format',
      recommendation: 'Check AI prompt and response format',
      confidence: 0.8,
      urgency: 'MEDIUM'
    }];
  }
}