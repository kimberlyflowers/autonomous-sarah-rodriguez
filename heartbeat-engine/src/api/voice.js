// ═══════════════════════════════════════════════════════════════════════════
// BLOOM Voice Prompt Generator
// Generates the GHL Voice AI Agent prompt for any Bloomie + any client
// 
// Usage: GET /api/voice/prompt — returns the prompt to paste into GHL
// This is a SETUP tool, not a runtime tool. You paste the output into GHL.
// ═══════════════════════════════════════════════════════════════════════════

import express from 'express';

const router = express.Router();

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
