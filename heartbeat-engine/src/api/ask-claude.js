// ═══════════════════════════════════════════════════════════════════════════
// /api/ask-claude  — General-purpose Claude endpoint + Quality Gate review mode
//
// Normal mode  (review_mode: false / omitted)
//   POST /api/ask-claude  { prompt, system_prompt?, model?, max_tokens? }
//   → { response: string }
//
// Review mode  (review_mode: true)
//   POST /api/ask-claude  { review_mode: true, deliverable_type, deliverable_content,
//                           deliverable_url?, agent_id?, context? }
//   → { status: 'APPROVED'|'NEEDS_REVISION', feedback: string,
//       checklist_results: object, confidence: float }
//
// DO NOT TOUCH: chat.js, soul documents
// ═══════════════════════════════════════════════════════════════════════════

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('ask-claude');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Review checklist per deliverable type ────────────────────────────────────
const REVIEW_CHECKLISTS = {
  website: [
    'All links are functional and point to correct destinations',
    'Content is factually accurate and up-to-date',
    'Brand voice is consistent throughout',
    'No placeholder text (Lorem Ipsum, [INSERT], TBD) remains',
    'Contact information and CTAs are correct',
    'Mobile responsiveness considerations noted',
    'No legal, compliance, or liability red flags',
    'SEO fundamentals: headings, meta content, alt text present',
  ],
  landing_page: [
    'Headline clearly communicates the value proposition',
    'CTA is prominent and action-oriented',
    'Social proof / testimonials are present if applicable',
    'No placeholder text remains',
    'Brand and tone are consistent',
    'No legal or compliance red flags',
  ],
  blog_post: [
    'Opening hook captures attention effectively',
    'Factual claims are accurate and credible',
    'Brand voice is consistent',
    'No placeholder text remains',
    'Conclusion includes a clear takeaway or CTA',
    'Word count is appropriate for the topic',
    'No duplicate or recycled content issues apparent',
  ],
  image: [
    'Image is relevant to the brief or context provided',
    'No inappropriate, offensive, or brand-unsafe content',
    'Quality is suitable for the intended use',
    'Text overlays (if any) are readable and accurate',
  ],
  document: [
    'Document structure is clear (headers, sections)',
    'All factual claims are accurate',
    'Formatting is professional and consistent',
    'No placeholder or draft text remains',
    'Appropriate for client-facing delivery',
    'No legal, IP, or compliance issues',
  ],
  email: [
    'Subject line is compelling and under 50 characters',
    'Sender name and reply-to are correct',
    'Content is personalised appropriately',
    'CTA is clear and links are correct',
    'Unsubscribe/legal footer is present if required',
    'No typos or grammar issues',
    'Brand voice is consistent',
  ],
  social_post: [
    'Post is appropriately concise for the platform',
    'Hashtags/mentions are relevant and accurate',
    'No spelling or grammar issues',
    'Brand voice and tone are appropriate',
    'Links (if included) are correct',
    'No brand-unsafe content',
  ],
  financial_report: [
    'All numbers are accurate and internally consistent',
    'Figures match source data provided',
    'Methodology is clearly stated',
    'No legal or regulatory compliance issues',
    'Assumptions are documented',
    'Professional formatting throughout',
  ],
  legal_content: [
    'Language is legally precise and unambiguous',
    'No conflicting clauses',
    'Jurisdiction and governing law are specified if required',
    'Parties are correctly identified',
    'Professional legal formatting maintained',
    'Flagged for qualified legal review before use',
  ],
  client_proposal: [
    'Client name and details are correct',
    'Scope of work is clearly defined',
    'Pricing is accurate and clearly structured',
    'Deliverables and timelines are realistic',
    'Value proposition is compelling',
    'Brand voice is professional and consistent',
    'No confidential information from other clients included',
  ],
};

// ── Review system prompt ─────────────────────────────────────────────────────
function buildReviewSystemPrompt(deliverableType, checklistItems) {
  const checklistText = checklistItems
    .map((item, i) => `${i + 1}. ${item}`)
    .join('\n');

  return `You are the BLOOM Quality Gate — an expert reviewer ensuring all deliverables meet BLOOM's professional standards before client delivery.

Your task: Evaluate the provided ${deliverableType} deliverable against each checklist item and make a final APPROVED or NEEDS_REVISION decision.

CHECKLIST for ${deliverableType.toUpperCase()}:
${checklistText}

EVALUATION CRITERIA:
- Accuracy: Is the content factually correct and complete?
- Quality: Does it meet professional standards expected by clients?
- Brand Safety: Is it appropriate and on-brand for BLOOM?
- Technical Validity: Are links, figures, formatting, and structure correct?
- Completeness: Has the work been fully completed with no placeholders?

RESPONSE FORMAT (strict JSON, no markdown wrapper):
{
  "status": "APPROVED" | "NEEDS_REVISION",
  "confidence": <float 0.0-1.0>,
  "feedback": "<concise summary of overall quality and key findings>",
  "checklist_results": {
    "<checklist item text>": {
      "pass": true | false,
      "note": "<brief note if failed or notable>"
    }
  },
  "revision_instructions": "<specific, actionable instructions if NEEDS_REVISION, otherwise null>"
}

Be thorough but decisive. If a deliverable is genuinely high quality with no material issues, approve it confidently (confidence 0.85+). Only request revision for real problems that would embarrass BLOOM or harm a client.`;
}

// ── POST /api/ask-claude ─────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { review_mode } = req.body;

    if (review_mode) {
      return handleReviewMode(req, res);
    }

    // ── Normal mode ──────────────────────────────────────────────────────────
    const {
      prompt,
      system_prompt,
      model = 'claude-haiku-4-5-20251001',
      max_tokens = 2048,
    } = req.body;

    if (!prompt?.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const messages = [{ role: 'user', content: prompt }];
    const params = { model, max_tokens, messages };
    if (system_prompt) params.system = system_prompt;

    const completion = await anthropic.messages.create(params);
    const response = completion.content[0]?.text || '';

    return res.json({ response, model, tokens_used: completion.usage?.output_tokens });

  } catch (error) {
    logger.error('ask-claude error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ── Review mode handler ──────────────────────────────────────────────────────
async function handleReviewMode(req, res) {
  const {
    deliverable_type,
    deliverable_content,
    deliverable_url,
    agent_id,
    context,
    model = 'claude-sonnet-4-6',
  } = req.body;

  if (!deliverable_type || !deliverable_content) {
    return res.status(400).json({
      error: 'review_mode requires deliverable_type and deliverable_content',
    });
  }

  const checklist = REVIEW_CHECKLISTS[deliverable_type]
    || REVIEW_CHECKLISTS['document']; // fallback

  const systemPrompt = buildReviewSystemPrompt(deliverable_type, checklist);

  const userContent = [
    `DELIVERABLE TYPE: ${deliverable_type}`,
    deliverable_url ? `DELIVERABLE URL: ${deliverable_url}` : null,
    agent_id ? `PRODUCED BY AGENT: ${agent_id}` : null,
    context ? `CONTEXT/BRIEF: ${context}` : null,
    '',
    '═══ DELIVERABLE CONTENT ═══',
    deliverable_content,
    '═══════════════════════════',
  ]
    .filter(Boolean)
    .join('\n');

  logger.info(`🔍 Quality Gate review: ${deliverable_type}`, { agent_id });

  const completion = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const raw = completion.content[0]?.text || '{}';

  let parsed;
  try {
    // Strip any accidental markdown fences
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    logger.warn('Quality Gate returned non-JSON, wrapping as feedback');
    parsed = {
      status: 'NEEDS_REVISION',
      confidence: 0.5,
      feedback: raw,
      checklist_results: {},
      revision_instructions: raw,
    };
  }

  const result = {
    status: parsed.status || 'NEEDS_REVISION',
    feedback: parsed.feedback || '',
    checklist_results: parsed.checklist_results || {},
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    revision_instructions: parsed.revision_instructions || null,
  };

  logger.info(`✅ Quality Gate result: ${result.status} (confidence ${result.confidence})`, {
    deliverable_type,
    agent_id,
  });

  return res.json(result);
}

export default router;
