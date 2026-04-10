// BLOOM Conference API — PM Mode with standup trigger detection
// POST /api/conference/message — post a message, detect standup triggers
// GET  /api/conference/messages — load history

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('conference-api');

// Standup trigger detection
const STANDUP_TRIGGERS = [
  /morning\s*standup/i,
  /\bstandup\b/i,
  /team\s*status/i,
  /what['\u2019s]*s?\s+going\s+on/i,
  /@claude\s+status/i,
];

function isStandupTrigger(content) {
  return STANDUP_TRIGGERS.some(r => r.test(content));
}

// Extract user info from JWT
function extractUserId(req) {
  try {
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) return null;
    const payload = JSON.parse(Buffer.from(auth.slice(7).split('.')[1], 'base64url').toString());
    return payload.sub || null;
  } catch { return null; }
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

// ── GET /api/conference/messages ─────────────────────────────────────────────
router.get('/messages', async (req, res) => {
  try {
    const userId = extractUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { org_id, limit = 50, before } = req.query;
    if (!org_id) return res.status(400).json({ error: 'org_id required' });

    const sb = await getSupabase();

    // Verify user belongs to org
    const { data: profile } = await sb
      .from('user_profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();
    if (!profile || profile.organization_id !== org_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let query = sb
      .from('conference_messages')
      .select('id, org_id, role, content, sender_type, message_type, created_at, metadata')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return res.json({ messages: (data || []).reverse() });
  } catch (err) {
    logger.error('Conference messages load failed:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/conference/message ─────────────────────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const userId = extractUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { org_id, content, sender_label } = req.body;
    if (!org_id || !content) return res.status(400).json({ error: 'org_id and content required' });

    const sb = await getSupabase();

    // Verify user belongs to org
    const { data: profile } = await sb
      .from('user_profiles')
      .select('organization_id, full_name, role')
      .eq('id', userId)
      .single();
    if (!profile || profile.organization_id !== org_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Insert user message
    const { data: msg, error: msgErr } = await sb
      .from('conference_messages')
      .insert({
        org_id,
        role: 'user',
        content,
        sender_type: 'human',
        message_type: 'message',
        metadata: { sender_label: sender_label || profile.full_name || 'Operator', user_id: userId }
      })
      .select('id, created_at')
      .single();

    if (msgErr) throw new Error(msgErr.message);

    // Check for standup trigger — fire async, respond immediately
    if (isStandupTrigger(content)) {
      logger.info(`📊 Standup trigger detected in conference for org ${org_id}`);
      runStandup(org_id, sb).catch(e => logger.error('Standup failed:', e));
    }

    return res.json({ success: true, id: msg.id, created_at: msg.created_at });
  } catch (err) {
    logger.error('Conference message failed:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Standup synthesis — Claude BLOOM PM ──────────────────────────────────────
async function runStandup(orgId, sb) {
  try {
    // 1. Gather active conversations
    const { data: sessions } = await sb
      .from('sessions')
      .select('id, agent_id, status, title, updated_at')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(20);

    // 2. Gather agent statuses
    const { data: agents } = await sb
      .from('agents')
      .select('id, name, role, status, last_heartbeat_at, current_task')
      .eq('organization_id', orgId);

    // 3. Gather open tickets / tasks
    const { data: tasks } = await sb
      .from('scheduled_tasks')
      .select('id, name, status, frequency, next_run_at')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .limit(20);

    // 4. Recent task runs (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentRuns } = await sb
      .from('task_runs')
      .select('scheduled_task_id, status, started_at, error')
      .eq('organization_id', orgId)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(20);

    // 5. Build context for Claude
    const context = {
      agents: agents || [],
      active_conversations: sessions || [],
      scheduled_tasks: tasks || [],
      recent_task_runs: recentRuns || [],
    };

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are Claude BLOOM PM, the project management intelligence layer for BLOOM. Generate a concise morning standup report.

Current system data:
${JSON.stringify(context, null, 2)}

Format your response EXACTLY as:

## 🌅 BLOOM Standup — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}

**Agent Status**
[One line per agent: Name — status, current task or last heartbeat]

**Active Conversations**
[Count and brief summary — e.g. "3 active sessions, 1 escalated"]

**Scheduled Tasks**
[Any tasks due today or recently failed]

**Blockers**
[Anything that needs operator attention]

**Action Items**
- [Specific actionable items]

---
*Claude BLOOM PM*

Keep it under 300 words. Be direct and operational.`
        }
      ]
    });

    const standupContent = response.content[0]?.type === 'text'
      ? response.content[0].text
      : 'Standup generation failed.';

    // 6. Post standup to conference
    await sb.from('conference_messages').insert({
      org_id: orgId,
      role: 'assistant',
      content: standupContent,
      sender_type: 'claude',
      message_type: 'standup',
      metadata: {
        sender_label: 'Claude BLOOM PM',
        source: 'pm-mode-standup',
        generated_at: new Date().toISOString(),
      }
    });

    logger.info(`✅ Standup posted for org ${orgId}`);
  } catch (err) {
    logger.error('Standup synthesis error:', err);
    // Post error notice
    await sb.from('conference_messages').insert({
      org_id: orgId,
      role: 'assistant',
      content: `⚠️ Standup generation failed: ${err.message}`,
      sender_type: 'claude',
      message_type: 'alert',
      metadata: { sender_label: 'Claude BLOOM PM', source: 'pm-mode-standup-error' }
    }).catch(() => {});
  }
}

export default router;
