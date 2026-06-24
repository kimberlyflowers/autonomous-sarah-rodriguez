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
const SARAH_FIRST_MESSAGE = "Hi, I'm Sarah. I can hear you and I'm ready to help. What would you like me to work on?";
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
      firstMessage: SARAH_FIRST_MESSAGE,
      voicePrompt: SARAH_VOICE_PROMPT,
      connectionType: 'webrtc'
    });
  } catch (e) {
    logger.error('ElevenLabs token error', { error: e.message });
    return res.status(500).json({ error: 'Failed to start Sarah voice session' });
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
      name: "Look Up Contact",
      description: "When the caller asks about a specific contact, lead, or person in the CRM",
      trigger: "When caller mentions a person's name and wants info about them",
      webhook: `${sarahBaseUrl}/api/chat/message`,
      body: { message: "Look up contact: {contact_name}", sessionId: "voice-{call_id}" },
    },
    {
      name: "Take Task",
      description: "When the caller gives you a task or instruction to complete",
      trigger: "When caller asks you to write, create, send, check, schedule, or do something",
      webhook: `${sarahBaseUrl}/api/chat/message`,
      body: { message: "[📞 Voice task from {caller_name}]: {task_description}", sessionId: "voice-{caller_contact_id}" },
    },
    {
      name: "Check Status",
      description: "When the caller asks about the status of something",
      trigger: "When caller asks 'what's the status of', 'did you finish', 'how's that going'",
      webhook: `${sarahBaseUrl}/api/chat/message`,
      body: { message: "Check status: {status_query}", sessionId: "voice-{caller_contact_id}" },
    },
  ];

  const postCallWorkflow = {
    trigger: "Transcript Generated",
    action: "Custom Webhook POST",
    url: `${sarahBaseUrl}/api/chat/ingest-call`,
    body: {
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
    },
  });
});

export default router;
