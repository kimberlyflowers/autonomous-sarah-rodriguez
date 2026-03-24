// Dashboard API endpoints for Sarah Rodriguez
// Provides data for the web dashboard displaying autonomous operations

import express from 'express';
import { createLogger } from '../logging/logger.js';
import { loadAgentConfig, getAgentStatus } from '../config/agent-profile.js';
import { taskProgress } from './chat.js';
import { isTrustGateEnabled, setTrustGateEnabled } from '../trust/trust-gate.js';

const router = express.Router();
const logger = createLogger('dashboard-api');

// Get Supabase client
let _supabase = null;
async function getSupabase() {
  if (!_supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return _supabase;
}

const AGENT_ID = process.env.AGENT_UUID || process.env.AGENT_ID || 'c3000000-0000-0000-0000-000000000003';
const ORG_ID = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';

// GET /api/dashboard/status - Agent status and configuration
router.get('/status', async (req, res) => {
  try {
    const agentStatus = await getAgentStatus();
    res.json(agentStatus);
  } catch (error) {
    logger.error('Failed to get agent status:', error);
    res.status(500).json({ error: 'Failed to load agent status' });
  }
});

// GET /api/dashboard/cycles - Recent heartbeat cycles
router.get('/cycles', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const agentId = req.query.agentId || AGENT_ID;

    const supabase = await getSupabase();

    const { data: cycles, error: cycleErr } = await supabase
      .from('heartbeat_cycles')
      .select('id, agent_id, started_at, completed_at, duration_ms, actions_count, rejections_count, handoffs_count, status, environment_snapshot')
      .eq('agent_id', agentId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (cycleErr) throw new Error(cycleErr.message);

    const { count, error: countErr } = await supabase
      .from('heartbeat_cycles')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId);

    res.json({
      cycles: (cycles || []).map(row => ({
        cycleId: row.id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        duration: row.duration_ms,
        status: row.status,
        counts: {
          actions: row.actions_count || 0,
          rejections: row.rejections_count || 0,
          handoffs: row.handoffs_count || 0
        },
        environment: row.environment_snapshot || {}
      })),
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (count || 0)
      }
    });
  } catch (error) {
    logger.error('Failed to get cycles:', error);
    res.status(500).json({ error: 'Failed to load heartbeat cycles' });
  }
});

// GET /api/dashboard/actions - Action log
router.get('/actions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const agentId = req.query.agentId || AGENT_ID;

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('action_log')
      .select('id, cycle_id, action_type, description, target_system, input_data, result, success, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    res.json({
      actions: (data || []).map(row => ({
        id: row.id,
        cycleId: row.cycle_id,
        type: row.action_type,
        description: row.description,
        targetSystem: row.target_system,
        inputData: row.input_data || {},
        result: row.result || {},
        success: row.success,
        timestamp: row.created_at
      })),
      pagination: { limit, offset }
    });
  } catch (error) {
    logger.error('Failed to get actions:', error);
    res.status(500).json({ error: 'Failed to load action log' });
  }
});

// GET /api/dashboard/rejections - Rejection log (decisions NOT to act)
router.get('/rejections', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const agentId = req.query.agentId || AGENT_ID;

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('rejection_log')
      .select('id, cycle_id, candidate_action, reason, reason_code, confidence, alternative_suggested, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    res.json({
      rejections: (data || []).map(row => ({
        id: row.id,
        cycleId: row.cycle_id,
        candidateAction: row.candidate_action,
        reason: row.reason,
        reasonCode: row.reason_code,
        confidence: parseFloat(row.confidence) || 0,
        alternativeSuggested: row.alternative_suggested,
        timestamp: row.created_at
      })),
      pagination: { limit, offset }
    });
  } catch (error) {
    logger.error('Failed to get rejections:', error);
    res.status(500).json({ error: 'Failed to load rejection log' });
  }
});

// GET /api/dashboard/handoffs - Handoff log (escalations to humans)
router.get('/handoffs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const agentId = req.query.agentId || AGENT_ID;

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('handoff_log')
      .select('id, cycle_id, issue, analysis, recommendation, confidence, urgency, human_notified, human_response, resolved, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    res.json({
      handoffs: (data || []).map(row => ({
        id: row.id,
        cycleId: row.cycle_id,
        issue: row.issue,
        analysisPath: row.analysis,
        recommendation: row.recommendation,
        confidence: parseFloat(row.confidence) || 0,
        urgency: row.urgency,
        humanNotified: row.human_notified,
        humanResponse: row.human_response,
        resolved: row.resolved,
        timestamp: row.created_at
      })),
      pagination: { limit, offset }
    });
  } catch (error) {
    logger.error('Failed to get handoffs:', error);
    res.status(500).json({ error: 'Failed to load handoff log' });
  }
});

// GET /api/dashboard/metrics - Trust metrics and graduation progress
router.get('/metrics', async (req, res) => {
  try {
    const agentId = req.query.agentId || AGENT_ID;
    const hours = parseInt(req.query.hours) || 24;

    const supabase = await getSupabase();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data: cycleRows } = await supabase
      .from('heartbeat_cycles')
      .select('actions_count, rejections_count, handoffs_count, duration_ms, status')
      .eq('agent_id', agentId)
      .gte('started_at', since);

    const { data: trustRow } = await supabase
      .from('trust_metrics')
      .select('approval_rate, action_success_rate, escalation_appropriateness, calculated_at')
      .eq('agent_id', agentId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let graduationStatus = null;
    try {
      const { checkGraduationEligibility } = await import('../config/autonomy-levels.js');
      const agentConfig = await loadAgentConfig(agentId);
      graduationStatus = await checkGraduationEligibility(agentId, agentConfig.currentAutonomyLevel);
    } catch (error) {
      logger.warn('Could not check graduation eligibility:', error.message);
    }

    const rows = cycleRows || [];
    const trust = trustRow || {};

    res.json({
      period: `Last ${hours} hours`,
      cycles: {
        total: rows.length,
        successful: rows.filter(r => r.status === 'completed').length,
        failed: rows.filter(r => r.status === 'error').length,
        successRate: rows.length > 0
          ? ((rows.filter(r => r.status === 'completed').length / rows.length) * 100).toFixed(1)
          : '0.0'
      },
      actions: {
        total: rows.reduce((s, r) => s + (r.actions_count || 0), 0),
        successRate: trust.action_success_rate ? parseFloat(trust.action_success_rate).toFixed(1) : 'N/A'
      },
      decisions: {
        rejections: rows.reduce((s, r) => s + (r.rejections_count || 0), 0),
        handoffs: rows.reduce((s, r) => s + (r.handoffs_count || 0), 0),
        escalationAppropriate: trust.escalation_appropriateness ? parseFloat(trust.escalation_appropriateness).toFixed(1) : 'N/A'
      },
      performance: {
        avgCycleDuration: rows.length ? Math.round(rows.reduce((s, r) => s + (r.duration_ms || 0), 0) / rows.length) : 0,
        approvalRate: trust.approval_rate ? parseFloat(trust.approval_rate).toFixed(1) : 'N/A'
      },
      graduation: graduationStatus || { eligible: false, reason: 'Status check unavailable' },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({ error: 'Failed to load trust metrics' });
  }
});

// User avatar — persist across sessions via Supabase user_settings
router.post('/user-avatar', async (req, res) => {
  try {
    const { avatar } = req.body;
    let valueToStore = avatar;

    if (avatar && avatar.startsWith('data:image')) {
      try {
        const { uploadImage, isConfigured } = await import('../storage/supabase-storage.js');
        if (isConfigured()) {
          const base64 = avatar.split(',')[1];
          const ext = avatar.includes('png') ? 'png' : 'jpg';
          const fname = `avatars/user-${Date.now()}.${ext}`;
          const upload = await uploadImage(base64, fname, `image/${ext}`);
          if (upload.success && upload.url) valueToStore = upload.url;
        }
      } catch (e) { /* fallback to storing data URL */ }
    }

    const supabase = await getSupabase();
    const { error } = await supabase.from('user_settings').upsert(
      { organization_id: ORG_ID, key: 'user_avatar', value: valueToStore, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id,key' }
    );
    if (error) throw new Error(error.message);
    res.json({ success: true, url: valueToStore });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

router.get('/user-avatar', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.from('user_settings')
      .select('value')
      .eq('organization_id', ORG_ID)
      .eq('key', 'user_avatar')
      .maybeSingle();
    res.json({ avatar: data?.value || null });
  } catch {
    res.json({ avatar: null });
  }
});

// GHL Business Profile Sync — pulls location data from GoHighLevel
router.get('/business-profile', async (req, res) => {
  try {
    const apiKey = process.env.GHL_API_KEY;
    const locationId = process.env.GHL_LOCATION_ID;
    if (!apiKey || !locationId) {
      return res.json({ profile: null, error: 'GHL not configured' });
    }

    const ghlRes = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Accept': 'application/json'
      }
    });
    
    if (!ghlRes.ok) {
      return res.json({ profile: null, error: `GHL API ${ghlRes.status}` });
    }
    
    const data = await ghlRes.json();
    const loc = data.location || data;
    
    res.json({
      profile: {
        name: loc.name || '',
        phone: loc.phone || '',
        email: loc.email || '',
        address: loc.address || '',
        city: loc.city || '',
        state: loc.state || '',
        postalCode: loc.postalCode || loc.postal_code || '',
        country: loc.country || '',
        website: loc.website || '',
        logoUrl: loc.logoUrl || loc.logo || '',
        timezone: loc.timezone || '',
        locationId: locationId,
      }
    });
  } catch (e) {
    res.json({ profile: null, error: e.message });
  }
});

// Brand Kits — up to 3 kits, each with name, logo, colors, fonts, voice
// Stored as jsonb in Supabase user_settings key='brand_kits'
router.get('/brand-kit', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const orgId = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';

    const { data: bkRow } = await sb.from('user_settings').select('value').eq('organization_id', orgId).eq('key', 'brand_kits').maybeSingle();
    // value is jsonb — already parsed by Supabase client
    let kits = bkRow?.value ? (Array.isArray(bkRow.value) ? bkRow.value : [bkRow.value]) : null;

    // Check legacy single-kit key
    if (!kits) {
      const { data: oldRow } = await sb.from('user_settings').select('value').eq('organization_id', orgId).eq('key', 'brand_kit').maybeSingle();
      if (oldRow?.value) {
        const oldKit = oldRow.value;
        kits = [{ ...oldKit, kitName: oldKit.kitName || 'Primary Brand', active: true }];
        // Migrate to new key
        await sb.from('user_settings').upsert({ organization_id: orgId, key: 'brand_kits', value: kits, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,key' });
      }
    }

    res.json({ kits: kits || [], brand: kits?.find(k => k.active) || kits?.[0] || null });
  } catch (e) {
    logger.warn('brand-kit GET error', { error: e.message });
    res.json({ kits: [], brand: null, error: e.message });
  }
});

router.post('/brand-kit', async (req, res) => {
  try {
    const { kits } = req.body;
    if (!kits || !Array.isArray(kits)) return res.status(400).json({ error: 'kits array required' });
    if (kits.length > 3) return res.status(400).json({ error: 'Maximum 3 brand kits' });
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const orgId = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
    const { error } = await sb.from('user_settings').upsert(
      { organization_id: orgId, key: 'brand_kits', value: kits, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id,key' }
    );
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    logger.warn('brand-kit POST error', { error: e.message });
    res.json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// TRUST GATE TOGGLE — enable/disable from dashboard
// ══════════════════════════════════════════════════════════════════════════

router.get('/trust-gate-status', (req, res) => {
  res.json({ enabled: isTrustGateEnabled() });
});

router.post('/trust-gate-status', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
  setTrustGateEnabled(enabled);
  logger.info(`Trust Gate toggled: ${enabled ? 'ENABLED' : 'DISABLED'} via dashboard`);
  res.json({ success: true, enabled: isTrustGateEnabled() });
});

// ══════════════════════════════════════════════════════════════════════════
// OPERATIONS MONITOR ENDPOINTS — powers the 8 cards on the Status page
// ══════════════════════════════════════════════════════════════════════════

// GET /api/dashboard/health — System Health card
router.get('/health', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const components = [];

    // 1. Database — try a simple query
    const dbStart = Date.now();
    const { error: dbErr } = await supabase.from('agents').select('id').limit(1);
    const dbMs = Date.now() - dbStart;
    components.push({
      name: 'Database',
      status: dbErr ? 'critical' : dbMs > 2000 ? 'warning' : 'healthy',
      message: dbErr ? dbErr.message : `${dbMs}ms response`
    });

    // 2. LLM API — check if we have a key and last successful call
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    try {
      const { getLLMClient } = await import('../llm/unified-client.js');
      const llm = getLLMClient();
      components.push({
        name: 'LLM API',
        status: hasAnthropicKey || hasOpenAIKey ? 'healthy' : 'critical',
        message: `${llm.provider}/${llm.model}`
      });
    } catch {
      components.push({ name: 'LLM API', status: hasAnthropicKey ? 'healthy' : 'critical', message: hasAnthropicKey ? 'Anthropic active' : 'No API key' });
    }

    // 3. BLOOM CRM
    const hasGHL = !!process.env.GHL_API_KEY;
    components.push({
      name: 'BLOOM CRM API',
      status: hasGHL ? 'healthy' : 'warning',
      message: hasGHL ? 'Connected' : 'No API key'
    });

    // 4. Memory — check recent snapshots
    const { data: memSnap } = await supabase.from('memory_snapshots').select('created_at').order('created_at', { ascending: false }).limit(1);
    const lastMem = memSnap?.[0]?.created_at;
    const memAge = lastMem ? (Date.now() - new Date(lastMem).getTime()) / 60000 : Infinity;
    components.push({
      name: 'Memory',
      status: memAge < 30 ? 'healthy' : memAge < 120 ? 'warning' : 'critical',
      message: lastMem ? `Last snapshot ${Math.round(memAge)}m ago` : 'No snapshots'
    });

    // 5. Scheduled Tasks engine
    const { data: recentRuns } = await supabase.from('task_runs').select('status, created_at').order('created_at', { ascending: false }).limit(5);
    const lastRun = recentRuns?.[0];
    const runAge = lastRun ? (Date.now() - new Date(lastRun.created_at).getTime()) / 60000 : Infinity;
    components.push({
      name: 'Task Engine',
      status: runAge < 15 ? 'healthy' : runAge < 60 ? 'warning' : 'critical',
      message: lastRun ? `Last run ${Math.round(runAge)}m ago` : 'No runs yet'
    });

    // 6. OAuth / Connectors
    const { data: connectors } = await supabase.from('user_connectors').select('connector_slug, status').eq('organization_id', ORG_ID);
    const activeConns = (connectors || []).filter(c => c.status === 'active').length;
    components.push({
      name: 'Connectors',
      status: activeConns > 0 ? 'healthy' : 'warning',
      message: `${activeConns} active`
    });

    const criticalCount = components.filter(c => c.status === 'critical').length;
    const warnCount = components.filter(c => c.status === 'warning').length;
    const overall = criticalCount > 0 ? 'critical' : warnCount > 1 ? 'warning' : 'healthy';

    res.json({ overall, components });
  } catch (e) {
    logger.error('health endpoint error', { error: e.message });
    res.json({ overall: 'critical', components: [{ name: 'System', status: 'critical', message: e.message }] });
  }
});

// GET /api/dashboard/trust-gate — Trust Gate card
router.get('/trust-gate', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const agentId = req.query.agentId || AGENT_ID;

    // Load agent config for autonomy level
    let autonomyLevel = 1;
    try {
      const config = await loadAgentConfig(agentId);
      autonomyLevel = config?.currentAutonomyLevel || config?.autonomy_level || 1;
    } catch {}

    // Count today's actions from task_runs
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { data: todayRuns } = await supabase.from('task_runs').select('status')
      .eq('agent_id', agentId).gte('created_at', todayStart.toISOString());

    const totalActions = todayRuns?.length || 0;
    const communications = todayRuns?.filter(r => r.status === 'completed').length || 0;

    // Count rejections today
    const { count: violationCount } = await supabase.from('rejection_log')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId).gte('created_at', todayStart.toISOString());

    res.json({
      autonomyLevel,
      usage: { total: totalActions, communication: communications, data_modification: 0 },
      limits: { total: 500, communication: 100 },
      violations: violationCount || 0
    });
  } catch (e) {
    logger.error('trust-gate error', { error: e.message });
    res.json({ autonomyLevel: 1, usage: { total: 0 }, limits: { total: 500 }, violations: 0 });
  }
});

// GET /api/dashboard/tool-performance — Tool Performance card
router.get('/tool-performance', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const agentId = req.query.agentId || AGENT_ID;

    // Parse tool usage from task_runs results
    const { data: runs } = await supabase.from('task_runs').select('result, status, created_at')
      .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(50);

    const toolStats = {};
    let totalCalls = 0, successCalls = 0, totalTime = 0;

    for (const run of (runs || [])) {
      try {
        const result = typeof run.result === 'string' ? JSON.parse(run.result) : run.result;
        const history = result?.toolHistory || [];
        for (const tool of history) {
          const name = tool.tool || 'unknown';
          if (!toolStats[name]) toolStats[name] = { name, calls: 0, success: 0, totalTime: 0 };
          toolStats[name].calls++;
          totalCalls++;
          if (tool.result?.success) { toolStats[name].success++; successCalls++; }
          const execTime = tool.result?.executionTime || 0;
          toolStats[name].totalTime += execTime;
          totalTime += execTime;
        }
      } catch {}
    }

    const topTools = Object.values(toolStats)
      .map(t => ({ ...t, successRate: t.calls > 0 ? t.success / t.calls : 0, avgTime: t.calls > 0 ? Math.round(t.totalTime / t.calls) : 0 }))
      .sort((a, b) => b.calls - a.calls);

    res.json({
      totalCalls,
      successRate: totalCalls > 0 ? successCalls / totalCalls : 0,
      avgExecutionTime: totalCalls > 0 ? Math.round(totalTime / totalCalls) : 0,
      topTools
    });
  } catch (e) {
    logger.error('tool-performance error', { error: e.message });
    res.json({ totalCalls: 0, successRate: 0, avgExecutionTime: 0, topTools: [] });
  }
});

// GET /api/dashboard/context-analytics — Context Analytics card
router.get('/context-analytics', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const agentId = req.query.agentId || AGENT_ID;

    // Pull context stats from recent task runs
    const { data: runs } = await supabase.from('task_runs').select('result')
      .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(20);

    let totalTokens = 0, maxTokens = 200000, compressions = 0, runCount = 0;
    for (const run of (runs || [])) {
      try {
        const result = typeof run.result === 'string' ? JSON.parse(run.result) : run.result;
        const ctx = result?.contextStats;
        if (ctx) {
          totalTokens += ctx.totalTokens || 0;
          compressions += ctx.compressionCount || 0;
          runCount++;
        }
      } catch {}
    }

    const avgTokens = runCount > 0 ? Math.round(totalTokens / runCount) : 0;
    const pct = (avgTokens / maxTokens) * 100;

    res.json({
      utilizationPercent: Math.min(100, pct),
      usedTokens: avgTokens,
      maxTokens,
      compressionCount: compressions
    });
  } catch (e) {
    logger.error('context-analytics error', { error: e.message });
    res.json({ utilizationPercent: 0, usedTokens: 0, maxTokens: 200000, compressionCount: 0 });
  }
});

// GET /api/dashboard/internal-tasks — Internal Tasks card (scheduled tasks)
router.get('/internal-tasks', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const agentId = req.query.agentId || AGENT_ID;

    const { data: tasks } = await supabase.from('scheduled_tasks')
      .select('id, name, instruction, frequency, run_time, enabled, next_run_at, last_run_at')
      .eq('agent_id', agentId).eq('enabled', true)
      .order('next_run_at', { ascending: true });

    res.json({
      tasks: (tasks || []).map(t => ({
        title: t.name,
        description: `${t.frequency} at ${t.run_time} · Next: ${t.next_run_at ? new Date(t.next_run_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'pending'}`,
        status: t.last_run_at ? 'completed' : 'pending',
        frequency: t.frequency,
        nextRun: t.next_run_at
      }))
    });
  } catch (e) {
    logger.error('internal-tasks error', { error: e.message });
    res.json({ tasks: [] });
  }
});

// GET /api/dashboard/action-log — Action Log card (recent tool calls from task runs)
router.get('/action-log', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const agentId = req.query.agentId || AGENT_ID;
    const limit = parseInt(req.query.limit) || 20;

    // Pull from both action_log table AND recent task_runs toolHistory
    const { data: actions } = await supabase.from('action_log')
      .select('action_type, description, created_at, success')
      .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(limit);

    // Also extract tool calls from recent task_runs for a richer log
    const { data: runs } = await supabase.from('task_runs')
      .select('task_name, result, created_at, status')
      .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(10);

    const allActions = [];

    // Add formal action_log entries
    for (const a of (actions || [])) {
      allActions.push({
        action_type: a.action_type,
        description: a.description,
        category: 'logging',
        timestamp: a.created_at,
        time: new Date(a.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      });
    }

    // Extract tool calls from task_runs
    for (const run of (runs || [])) {
      try {
        const result = typeof run.result === 'string' ? JSON.parse(run.result) : run.result;
        for (const tool of (result?.toolHistory || [])) {
          const cat = tool.tool?.startsWith('ghl_') ? 'communication' :
            tool.tool?.startsWith('gmail_') ? 'communication' :
            tool.tool?.startsWith('web_') ? 'read' :
            tool.tool?.startsWith('scrape_') ? 'read' : 'data_modification';
          allActions.push({
            action_type: tool.tool,
            description: `${run.task_name || 'Task'}: ${tool.tool}(${JSON.stringify(tool.input || {}).slice(0, 80)}...)`,
            category: cat,
            timestamp: tool.timestamp || run.created_at,
            time: new Date(tool.timestamp || run.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          });
        }
      } catch {}
    }

    // Sort by timestamp desc, limit
    allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ actions: allActions.slice(0, limit) });
  } catch (e) {
    logger.error('action-log error', { error: e.message });
    res.json({ actions: [] });
  }
});

// GET /api/dashboard/sub-agents — Sub-Agent Network card
router.get('/sub-agents', async (req, res) => {
  try {
    const supabase = await getSupabase();

    // Pull all agents in the org
    const { data: agents } = await supabase.from('agents')
      .select('id, name, role, status, model, specialization')
      .eq('organization_id', ORG_ID);

    // Count task runs per agent
    const agentList = [];
    for (const a of (agents || [])) {
      const { count } = await supabase.from('task_runs')
        .select('id', { count: 'exact', head: true }).eq('agent_id', a.id);
      agentList.push({
        name: a.name || 'Unknown',
        expertise: [a.role, a.specialization].filter(Boolean),
        status: a.status || 'active',
        taskCount: count || 0,
        model: a.model
      });
    }

    res.json({ agents: agentList });
  } catch (e) {
    logger.error('sub-agents error', { error: e.message });
    res.json({ agents: [] });
  }
});

// GET /api/dashboard/handoff-log — alias for /handoffs (frontend expects this name)
router.get('/handoff-log', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const limit = parseInt(req.query.limit) || 10;
    const targetAgentId = req.query.agentId || AGENT_ID;
    const { data } = await supabase.from('handoff_log')
      .select('issue, recommendation, urgency, confidence, created_at')
      .eq('agent_id', targetAgentId).order('created_at', { ascending: false }).limit(limit);

    res.json({ handoffs: (data || []).map(h => ({ issue: h.issue, recommendation: h.recommendation, urgency: h.urgency, confidence: h.confidence, timestamp: h.created_at })) });
  } catch (e) {
    res.json({ handoffs: [] });
  }
});

// GET /api/dashboard/rejection-log — alias for /rejections (frontend expects this name)
router.get('/rejection-log', async (req, res) => {
  try {
    const supabase = await getSupabase();
    const limit = parseInt(req.query.limit) || 10;
    const targetAgentId = req.query.agentId || AGENT_ID;
    const { data } = await supabase.from('rejection_log')
      .select('candidate_action, reason, reason_code, confidence, created_at')
      .eq('agent_id', targetAgentId).order('created_at', { ascending: false }).limit(limit);

    res.json({ rejections: (data || []).map(r => ({ action: r.candidate_action, reason: r.reason, code: r.reason_code, risk: `${(r.confidence * 100).toFixed(0)}% confidence`, timestamp: r.created_at })) });
  } catch (e) {
    res.json({ rejections: [] });
  }
});

// ── ACTIVE TASK TRACKER — serves taskProgress data to dashboard panel ──
// The ActiveTaskTracker component in App.jsx polls this every 15s.
// Data shape: { executions: [{ task, status, steps: [{ name, status }] }] }
router.get('/agentic-executions', (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const filterSession = req.query.sessionId || null;
  const executions = [];

  // Convert taskProgress Map entries into the format ActiveTaskTracker expects
  for (const [sessionId, progress] of taskProgress.entries()) {
    if (!progress?.todos || progress.todos.length === 0) continue;
    // If a sessionId filter is provided, only show tasks for that session
    if (filterSession && sessionId !== filterSession) continue;

    const hasActive = progress.todos.some(t => t.status === 'in_progress');
    const allDone = progress.todos.every(t => t.status === 'completed');

    // Only show tasks that are active or recently completed (within 5 min)
    const age = Date.now() - (progress.updatedAt || 0);
    if (!hasActive && !allDone) continue;
    if (allDone && age > 5 * 60 * 1000) continue;

    // Filter stale passive tracking entries ("Planning steps..." stuck > 3 min)
    const isStalePassive = progress.todos.length === 1
      && progress.todos[0].activeForm === 'Planning steps...'
      && age > 3 * 60 * 1000;
    if (isStalePassive) {
      taskProgress.delete(sessionId); // Clean up while we're here
      continue;
    }

    executions.push({
      task: progress.todos.find(t => t.status === 'in_progress')?.activeForm
        || progress.todos[0]?.content
        || 'Running task',
      name: `Session: ${sessionId}`,
      status: allDone ? 'complete' : 'running',
      steps: progress.todos.map(t => ({
        name: t.status === 'in_progress' ? t.activeForm : t.content,
        description: t.content,
        status: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : 'pending'
      }))
    });

    if (executions.length >= limit) break;
  }

  res.json({ executions });
});

// ══ DOCUMENTS ══

// GET /api/dashboard/documents - List all documents
router.get('/documents', async (req, res) => {
  try {
    const sb = await getSupabase();
    const { docType, status, limit = 50, agentId } = req.query;

    let q = sb.from('documents')
      .select('id, title, doc_type, status, tags, requires_approval, approved_by, approved_at, metadata, created_at, updated_at, agent_id')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (agentId) q = q.eq('agent_id', agentId);
    if (docType) q = q.eq('doc_type', docType);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw error;

    res.json({ documents: data || [], count: (data || []).length });
  } catch (e) {
    logger.error('Documents list failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dashboard/documents/:id - Get full document with content
router.get('/documents/:id', async (req, res) => {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('documents')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    logger.error('Document fetch failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/dashboard/documents/:id - Update document status (approve/reject/archive)
router.patch('/documents/:id', async (req, res) => {
  try {
    const sb = await getSupabase();
    const { status } = req.body;
    const updates = { status, updated_at: new Date().toISOString() };

    if (status === 'approved') {
      updates.approved_by = '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce'; // Kimberly's UUID
      updates.approved_at = new Date().toISOString();
    }

    const { data, error } = await sb.from('documents')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, title, status, approved_at')
      .single();
    if (error) throw error;

    res.json({ success: true, document: data });
  } catch (e) {
    logger.error('Document update failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══ CREDENTIAL REGISTRY (per-org site logins) ══

router.get('/credential-registry', async (req, res) => {
  try {
    const { getRegistrySummary } = await import('../config/credential-registry.js');
    const summary = await getRegistrySummary(ORG_ID);
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dashboard/credential-registry — add or update a site credential
router.post('/credential-registry', async (req, res) => {
  try {
    const { siteKey, siteName, domain, loginUrl, username, password, notes } = req.body;
    if (!siteKey || !username || !password) {
      return res.status(400).json({ error: 'siteKey, username, and password are required' });
    }
    const { upsertCredential } = await import('../config/credential-registry.js');
    const result = await upsertCredential(ORG_ID, siteKey, { siteName, domain, loginUrl, username, password, notes });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/dashboard/credential-registry/:siteKey — remove a site credential
router.delete('/credential-registry/:siteKey', async (req, res) => {
  try {
    const { deleteCredential } = await import('../config/credential-registry.js');
    const result = await deleteCredential(ORG_ID, req.params.siteKey);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══ MODEL CONFIG (read: any user, write: master/owner only) ══

router.get('/model-config', async (req, res) => {
  try {
    const { getResolvedConfig } = await import('../config/admin-config.js');
    const config = await getResolvedConfig(ORG_ID);
    res.json({
      model: config.model,
      tier: config.tier,
      reason: config.reason,
      failoverChain: config.failoverChain,
    });
  } catch (e) {
    logger.error('Model config fetch failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put('/model-config', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'model required' });

    const allowedModels = [
      'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro',
      'gpt-4o', 'gpt-4o-mini',
      'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6',
      'deepseek-chat'
    ];
    if (!allowedModels.includes(model)) {
      return res.status(400).json({ error: `Invalid model. Allowed: ${allowedModels.join(', ')}` });
    }

    const sb = await getSupabase();
    const { data, error } = await sb.from('bloom_admin_settings')
      .update({ default_model: model, updated_at: new Date().toISOString(), updated_by: 'dashboard' })
      .not('id', 'is', null)
      .select('default_model')
      .single();
    if (error) throw error;

    // Invalidate cache so the change takes effect immediately
    const { invalidateCache } = await import('../config/admin-config.js');
    invalidateCache();

    logger.info('Model updated via dashboard', { model });
    res.json({ success: true, model: data.default_model });
  } catch (e) {
    logger.error('Model config update failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Image Engine Config ──
// Controls which image generation engine (gpt, gemini, auto) is used per content type
router.get('/image-engine-config', async (req, res) => {
  try {
    const sb = await getSupabase();
    const { data } = await sb.from('bloom_admin_settings').select('image_engine_config').not('id', 'is', null).single();
    res.json(data?.image_engine_config || { blog: 'gemini', flyer: 'gpt', website: 'gemini', social: 'auto', email: 'auto', default: 'auto' });
  } catch (e) {
    logger.error('Image engine config fetch failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put('/image-engine-config', async (req, res) => {
  try {
    const config = req.body;
    const validEngines = ['auto', 'gpt', 'gemini'];
    const validKeys = ['blog', 'flyer', 'website', 'social', 'email', 'default'];

    // Validate
    for (const [key, val] of Object.entries(config)) {
      if (!validKeys.includes(key)) return res.status(400).json({ error: `Invalid key: ${key}. Allowed: ${validKeys.join(', ')}` });
      if (!validEngines.includes(val)) return res.status(400).json({ error: `Invalid engine for ${key}: ${val}. Allowed: ${validEngines.join(', ')}` });
    }

    const sb = await getSupabase();
    // Merge with existing config so partial updates work
    const { data: existing } = await sb.from('bloom_admin_settings').select('image_engine_config').not('id', 'is', null).single();
    const merged = { ...(existing?.image_engine_config || {}), ...config };

    const { data, error } = await sb.from('bloom_admin_settings')
      .update({ image_engine_config: merged, updated_at: new Date().toISOString(), updated_by: 'dashboard' })
      .not('id', 'is', null)
      .select('image_engine_config')
      .single();
    if (error) throw error;

    logger.info('Image engine config updated via dashboard', { config: merged });
    res.json({ success: true, config: data.image_engine_config });
  } catch (e) {
    logger.error('Image engine config update failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
