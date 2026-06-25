// ═══════════════════════════════════════════════════════════════════════════
// BLOOM Voice Prompt Generator
// Generates the GHL Voice AI Agent prompt for any Bloomie + any client
// 
// Usage: GET /api/voice/prompt — returns the prompt to paste into GHL
// This is a SETUP tool, not a runtime tool. You paste the output into GHL.
// ═══════════════════════════════════════════════════════════════════════════

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('voice-api');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BLOOM_ORG_ID = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
const SARAH_AGENT_ID = process.env.SARAH_AGENT_ID || process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003';
const ELEVENLABS_SARAH_AGENT_ID = process.env.ELEVENLABS_CONVAI_SARAH_AGENT_ID || 'agent_7401kcdd80w2fs5r0fdn6f8ktjy9';
const ELEVENLABS_SARAH_VOICE_ID = process.env.ELEVENLABS_SARAH_VOICE_ID || 'TOhxx937tpk5BU3jtXir';
const SARAH_FIRST_MESSAGE = process.env.ELEVENLABS_SARAH_FIRST_MESSAGE || '';
const GHL_VOICE_WEBHOOK_SECRET = process.env.GHL_VOICE_WEBHOOK_SECRET || '';
const SARAH_VOICE_PROMPT = `You are Sarah Rodriguez, Kimberly's Bloomie AI employee inside the Bloomie Staffing app. You are warm, direct, capable, and calm.

When the user asks whether you can hear them, answer directly: "Yes, I can hear you." Do not repeat your opening greeting.
When the user asks whether you can see their screen, use the available screenshot or screen capture tool if available, then answer what you can see.
Keep voice replies concise unless the user asks for detail. Do not use a creator brainstorming persona.`;

let anonClient = null;
let serviceClient = null;

function getAnonClient() {
  if (!anonClient) anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return anonClient;
}

function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return serviceClient;
}

function normalizeText(v) {
  return String(v || '').trim().toLowerCase();
}

function compactVoiceText(value, maxLength = 700) {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[[^\]]+\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isSensitivePublicVoiceRequest(text) {
  const s = String(text || '').toLowerCase();
  return /\b(password|secret|api key|token|login|credentials|private|confidential|owner info|bank|card|ssn|social security)\b/.test(s)
    || /\b(list|send|give|read|show|tell me)\b.*\b(contacts?|customers?|clients?|leads?|emails?|phone numbers?|numbers?|addresses?)\b/.test(s)
    || /\b(email|phone|number|address)\b.*\b(for|of)\b.*\b[a-z]+ [a-z]+\b/.test(s)
    || /\b(did|has|have|was|is)\b.*\b(call|called|text|messag|email|appointment|book)\b.*\b[a-z]+ [a-z]+\b/.test(s);
}

async function resolveOwnerContactId(orgId = BLOOM_ORG_ID) {
  let ownerContactId = process.env.OWNER_GHL_CONTACT_ID || '';
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return ownerContactId;
    const { data: org } = await getServiceClient()
      .from('organizations')
      .select('owner_ghl_contact_id')
      .eq('id', orgId || BLOOM_ORG_ID)
      .maybeSingle();
    if (org?.owner_ghl_contact_id) ownerContactId = org.owner_ghl_contact_id;
  } catch (e) {
    logger.warn('Owner contact lookup failed for voice bridge', { error: e.message });
  }
  return ownerContactId;
}

function verifyVoiceWebhook(req, res) {
  if (!GHL_VOICE_WEBHOOK_SECRET) return true;
  const provided = req.headers['x-bloom-voice-secret']
    || req.headers['x-ghl-voice-secret']
    || req.body?.secret
    || req.query?.secret;
  if (provided && String(provided) === GHL_VOICE_WEBHOOK_SECRET) return true;
  res.status(401).json({ success: false, error: 'Invalid voice webhook secret' });
  return false;
}

function buildInternalBaseUrl() {
  return process.env.INTERNAL_BASE_URL
    || process.env.BASE_URL
    || `http://localhost:${process.env.PORT || 8080}`;
}

async function runSarahVoiceToolTurn({ message, sessionId, agentId = SARAH_AGENT_ID }) {
  const baseUrl = buildInternalBaseUrl();
  const resp = await fetch(`${baseUrl}/api/chat/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bloom-internal-source': 'ghl-voice-ai'
    },
    body: JSON.stringify({
      message,
      sessionId,
      agentId,
      source: 'ghl_voice_ai'
    })
  });

  const raw = await resp.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { response: raw }; }
  if (!resp.ok) {
    const detail = data?.error || data?.message || raw || resp.statusText;
    throw new Error(`Sarah tool turn failed: ${detail}`);
  }
  return data;
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: 'Supabase auth is not configured' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await getAnonClient().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid session' });
    req.authUser = user;
    next();
  } catch (e) {
    logger.warn('Voice auth failed', { error: e.message });
    return res.status(401).json({ error: 'Auth failed' });
  }
}

async function resolveSarahAccess(req, requestedAgentId) {
  const user = req.authUser;
  const sb = getServiceClient();

  const { data: memberships, error: memberError } = await sb
    .from('organization_members')
    .select('organization_id, role, organizations(id, name, slug)')
    .eq('user_id', user.id);

  if (memberError) throw memberError;
  const orgIds = (memberships || []).map(m => m.organization_id).filter(Boolean);
  if (!orgIds.length) return { ok: false, status: 403, error: 'User is not associated with an organization' };

  if (BLOOM_ORG_ID && !orgIds.includes(BLOOM_ORG_ID)) {
    return { ok: false, status: 403, error: 'Voice is only enabled for the Bloom organization' };
  }

  const targetAgentId = requestedAgentId || SARAH_AGENT_ID;
  const { data: agent, error: agentError } = await sb
    .from('agents')
    .select('id, name, role, job_title, organization_id')
    .eq('id', targetAgentId)
    .maybeSingle();

  if (agentError) throw agentError;
  if (!agent) return { ok: false, status: 404, error: 'Agent not found' };
  if (!orgIds.includes(agent.organization_id)) return { ok: false, status: 403, error: 'Agent belongs to a different organization' };

  const agentName = normalizeText(agent.name);
  const isSarah = agent.id === SARAH_AGENT_ID || agentName === 'sarah' || agentName.startsWith('sarah ') || agentName.includes('sarah rodriguez');
  if (!isSarah) return { ok: false, status: 403, error: 'ElevenLabs voice is only enabled for Sarah' };

  return { ok: true, agent, orgId: agent.organization_id };
}

router.get('/elevenlabs/status', requireAuth, async (req, res) => {
  try {
    const access = await resolveSarahAccess(req, req.query.agentId);
    if (!access.ok) return res.status(access.status).json({ enabled: false, error: access.error });

    const configured = Boolean(process.env.ELEVENLABS_API_KEY && ELEVENLABS_SARAH_AGENT_ID);
    return res.json({
      enabled: configured,
      provider: 'elevenlabs',
      agentId: access.agent.id,
      convaiAgentId: ELEVENLABS_SARAH_AGENT_ID,
      voiceId: ELEVENLABS_SARAH_VOICE_ID,
      agentName: access.agent.name,
      connectionType: 'webrtc',
      reason: configured ? null : 'ElevenLabs is not configured'
    });
  } catch (e) {
    logger.error('ElevenLabs status error', { error: e.message });
    return res.status(500).json({ enabled: false, error: 'Failed to check ElevenLabs voice status' });
  }
});

router.post('/elevenlabs/token', requireAuth, async (req, res) => {
  try {
    const access = await resolveSarahAccess(req, req.body?.agentId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(503).json({ error: 'ElevenLabs API key is not configured' });
    }

    const tokenUrl = `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(ELEVENLABS_SARAH_AGENT_ID)}`;
    const tokenResp = await fetch(tokenUrl, {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });

    const raw = await tokenResp.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

    if (!tokenResp.ok) {
      const detail = data?.detail?.message || data?.detail || data?.message || raw || tokenResp.statusText;
      logger.warn('ElevenLabs token request failed', { status: tokenResp.status, detail: String(detail).slice(0, 160) });
      return res.status(502).json({ error: `ElevenLabs token request failed: ${String(detail).slice(0, 240)}` });
    }

    const token = data.token || data.conversation_token || data.conversationToken;
    if (!token) {
      logger.warn('ElevenLabs token response missing token');
      return res.status(502).json({ error: 'ElevenLabs did not return a conversation token' });
    }

    return res.json({
      token,
      provider: 'elevenlabs',
      agentId: access.agent.id,
      convaiAgentId: ELEVENLABS_SARAH_AGENT_ID,
      voiceId: ELEVENLABS_SARAH_VOICE_ID,
      ...(SARAH_FIRST_MESSAGE ? { firstMessage: SARAH_FIRST_MESSAGE } : {}),
      voicePrompt: SARAH_VOICE_PROMPT,
      connectionType: 'webrtc'
    });
  } catch (e) {
    logger.error('ElevenLabs token error', { error: e.message });
    return res.status(500).json({ error: 'Failed to start Sarah voice session' });
  }
});

router.post('/action', async (req, res) => {
  if (!verifyVoiceWebhook(req, res)) return;

  try {
    const body = req.body || {};
    const action = body.action || body.intent || body.name || 'voice_action';
    const utterance = body.utterance || body.query || body.message || body.task || body.user_message || body.transcript || '';
    const contactId = body.contactId || body.contact_id || body.caller_contact_id || body.contact?.id || '';
    const contactName = body.contactName || body.contact_name || body.caller_name || body.contact?.name || '';
    const contactPhone = body.contactPhone || body.contact_phone || body.caller_phone || body.contact?.phone || '';
    const callId = body.callId || body.call_id || body.conversationId || body.conversation_id || Date.now();
    const sessionId = body.sessionId || `voice-${contactId || callId}`;
    const ownerContactId = await resolveOwnerContactId(body.orgId || body.organizationId || BLOOM_ORG_ID);
    const isVerifiedOwner = Boolean(contactId && ownerContactId && String(contactId) === String(ownerContactId));

    if (!String(utterance || '').trim()) {
      return res.status(400).json({ success: false, error: 'Voice action requires an utterance, query, message, task, or transcript field.' });
    }

    if (!isVerifiedOwner && isSensitivePublicVoiceRequest(utterance)) {
      const safe = 'I can help with Bloomie services, appointments, or relay a message to Kimberly, but I cannot share private contact or account details.';
      logger.warn('Blocked sensitive public GHL Voice AI request', { action, contactId, sessionId, preview: String(utterance).slice(0, 120) });
      return res.json({ success: true, blocked: true, response: safe, answer: safe, message: safe, sessionId, agentId: body.agentId || SARAH_AGENT_ID });
    }

    const message = [
      'VOICE CUSTOM ACTION FROM GHL VOICE AI.',
      'Respond with one or two short spoken sentences.',
      'If the caller asks for a lookup, scheduling check, CRM update, browser/search task, or document/status check, use the available tools now before answering.',
      'Do not say you will check and get back unless you actually created a follow-up task or sent a notification.',
      isVerifiedOwner
        ? 'Caller is verified as the organization owner. Owner-level CRM/status lookups are allowed.'
        : 'Caller is not verified as the organization owner. Do not reveal private CRM details, contact details, secrets, internal lists, passwords, or account information. You may answer product/service questions, schedule appointments, and relay messages to Kimberly.',
      `Action: ${action}`,
      contactName ? `Caller/contact name: ${contactName}` : '',
      contactPhone ? `Caller/contact phone: ${contactPhone}` : '',
      contactId ? `GHL contactId: ${contactId}` : '',
      `Caller said: ${utterance}`
    ].filter(Boolean).join('\n');

    logger.info('GHL Voice AI custom action received', { action, contactId, sessionId, preview: String(utterance).slice(0, 120) });
    const sarahResult = await runSarahVoiceToolTurn({ message, sessionId, agentId: body.agentId || SARAH_AGENT_ID });
    const spoken = compactVoiceText(sarahResult.response || sarahResult.text || sarahResult.message || 'I handled that.');

    return res.json({
      success: true,
      response: spoken,
      answer: spoken,
      message: spoken,
      sessionId: sarahResult.sessionId || sessionId,
      agentId: sarahResult.agentId || body.agentId || SARAH_AGENT_ID,
      toolsUsed: sarahResult.toolsUsed || sarahResult.skillsUsed || []
    });
  } catch (e) {
    logger.error('GHL Voice AI custom action failed', { error: e.message });
    const spoken = 'I hit a tool issue while checking that. I am logging it for Kimberly now.';
    return res.status(500).json({ success: false, error: e.message, response: spoken, answer: spoken, message: spoken });
  }
});

router.post('/ingest-call', async (req, res) => {
  if (!verifyVoiceWebhook(req, res)) return;

  try {
    const body = req.body || {};
    const transcript = body.transcript || body.call_transcript || body.fullTranscript || '';
    const summary = body.summary || body.call_summary || '';
    const contactId = body.contactId || body.contact_id || body.contact?.id || '';
    const contactName = body.contactName || body.contact_name || body.contact?.name || '';
    const contactPhone = body.contactPhone || body.contact_phone || body.contact?.phone || '';
    const callId = body.callId || body.call_id || Date.now();
    const sessionId = body.sessionId || `voice-${contactId || callId}`;

    if (!String(transcript || summary || '').trim()) {
      return res.status(400).json({ success: false, error: 'Call ingest requires transcript or summary.' });
    }

    const message = [
      'POST-CALL TRANSCRIPT FROM GHL VOICE AI.',
      'Review this call. Extract any promised follow-ups or tasks, use tools if needed, and log concise completion/blocker details.',
      contactName ? `Caller/contact name: ${contactName}` : '',
      contactPhone ? `Caller/contact phone: ${contactPhone}` : '',
      contactId ? `GHL contactId: ${contactId}` : '',
      summary ? `Summary: ${summary}` : '',
      transcript ? `Transcript:\n${transcript}` : ''
    ].filter(Boolean).join('\n');

    logger.info('GHL Voice AI transcript ingest received', { contactId, sessionId, hasTranscript: Boolean(transcript), hasSummary: Boolean(summary) });
    const sarahResult = await runSarahVoiceToolTurn({ message, sessionId, agentId: body.agentId || SARAH_AGENT_ID });
    const responseText = compactVoiceText(sarahResult.response || sarahResult.text || sarahResult.message || 'Call transcript processed.');

    return res.json({
      success: true,
      response: responseText,
      message: responseText,
      sessionId: sarahResult.sessionId || sessionId,
      agentId: sarahResult.agentId || body.agentId || SARAH_AGENT_ID
    });
  } catch (e) {
    logger.error('GHL Voice AI transcript ingest failed', { error: e.message });
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/prompt', async (req, res) => {
  // Pull agent config (could come from DB in multi-client future)
  const agentName = process.env.AGENT_NAME || 'Sarah Rodriguez';
  const agentRole = process.env.AGENT_ROLE || 'AI Employee';
  const clientName = process.env.CLIENT_NAME || 'the business';
  const sarahBaseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
    : process.env.SARAH_BASE_URL || 'https://autonomous-sarah-rodriguez.up.railway.app';

  // Load company skills if available
  let companySkillsText = '';
  try {
    const r = await fetch(`${sarahBaseUrl}/api/skills`);
    const d = await r.json();
    if (d.companySkills?.length > 0) {
      companySkillsText = '\n\nCompany-specific guidelines:\n' + 
        d.companySkills.map(s => `- ${s.name}: ${s.instructions}`).join('\n');
    }
  } catch {}

  const prompt = `You are ${agentName}, an AI employee (called a "Bloomie") working for ${clientName}. You handle phone calls professionally, warmly, and efficiently.

## Your Personality
- Warm, confident, and genuinely helpful
- Professional but never robotic — you sound like a real person who cares
- You call people by their first name when you know it
- You're proactive — if you can solve something right now, you do
- If you don't know something, say so honestly: "Let me look into that and get back to you"
- You never say "as an AI" unprompted, but you're honest if directly asked

## How You Handle Calls

### When someone calls in:
- Greet them warmly: "Hey, thanks for calling ${clientName}! This is ${agentName}, how can I help you?"
- Listen carefully to what they need
- If they give you a task (write something, check something, schedule something), confirm what you heard: "Got it — so you'd like me to [specific task]. I'll get on that right away."
- If they ask a question you can answer, answer it directly
- If they ask something you need to look up, say: "Let me check on that for you real quick"
- If they give you multiple tasks, repeat them back: "OK so I've got three things: [1], [2], and [3]. I'll knock these out and text you when they're done."

### When you need clarification:
- Ask ONE question at a time, not a list
- Be specific: "Quick question — for that blog post, should I focus on the summer program or the general enrollment?"
- Don't ask questions you can figure out yourself

### When wrapping up:
- Summarize what you're going to do
- Give a timeframe if possible: "I'll have that draft ready within the hour"
- End warmly: "Anything else? ... Great, I'm on it. Talk soon!"

## What You Can Do
- Write content (blogs, emails, social media posts, documents)
- Manage CRM contacts (look up, create, update, tag)
- Schedule appointments and manage calendar
- Research topics and summarize findings
- Create documents and reports
- Send follow-up emails or texts on behalf of the business
- Check on task status and give updates

## What You Should NOT Do on the Phone
- Don't try to read long content over the phone — say "I'll text/email that to you"
- Don't make promises about things outside your capabilities
- Don't share other contacts' private information
- If someone is upset, listen and empathize first, then solve
${companySkillsText}

## Important Context
- You work through BLOOM Ecosystem, an AI staffing agency
- You have access to the business's CRM (GoHighLevel) and can take real actions
- After this call ends, you'll process the full transcript and execute on everything discussed
- If you need to follow up, you'll text the caller
- You remember previous conversations — if they reference something from before, you have that context`;

  const customActions = [
    {
      name: "Ask Sarah Tools",
      description: "Use this whenever the caller asks Sarah to look up, check, create, schedule, search, update, or verify anything using Bloomie/GHL tools.",
      trigger: "Caller gives a task, asks for a CRM/search/status lookup, wants Sarah to check something, or needs a tool-backed answer.",
      webhook: `${sarahBaseUrl}/api/voice/action`,
      method: "POST",
      responsePath: "response",
      body: {
        secret: "{{GHL_VOICE_WEBHOOK_SECRET}}",
        action: "{action_name}",
        utterance: "{caller_request_or_question}",
        contactId: "{contact.id}",
        contactName: "{contact.name}",
        contactPhone: "{contact.phone}",
        callId: "{call.id}",
        sessionId: "voice-{call.id}"
      },
    },
  ];

  const postCallWorkflow = {
    trigger: "Transcript Generated",
    action: "Custom Webhook POST",
    url: `${sarahBaseUrl}/api/voice/ingest-call`,
    body: {
      secret: "{{GHL_VOICE_WEBHOOK_SECRET}}",
      transcript: "{{transcript}}",
      contactId: "{{contact.id}}",
      contactName: "{{contact.name}}",
      contactPhone: "{{contact.phone}}",
      callDirection: "{{call.direction}}",
      callDuration: "{{call.duration}}",
      callId: "{{call.id}}",
      summary: "{{transcript.summary}}",
    },
  };

  res.json({
    prompt,
    customActions,
    postCallWorkflow,
    setupInstructions: {
      step1: "Go to GHL → AI Agents → Voice AI → + Create Agent",
      step2: `Agent name: "${agentName}"`,
      step3: `Business name: "${clientName}"`,
      step4: "Pick a voice (warm, female, professional recommended)",
      step5: "Switch to Advanced Mode",
      step6: "Paste the 'prompt' field above into the Agent Prompt",
      step7: "Under Custom Actions, create one action per item in 'customActions' above",
      step8: "Assign to your phone number under Phone & Availability",
      step9: "Create a workflow with the 'postCallWorkflow' config for post-call processing",
      step10: "Test with 'Call Me' button in GHL",
      secretNote: "Set GHL_VOICE_WEBHOOK_SECRET in Railway and use that same value in the GHL custom action body where the placeholder appears.",
    },
  });
});

export default router;
