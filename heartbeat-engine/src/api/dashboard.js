// Dashboard API endpoints for Sarah Rodriguez
// Provides data for the web dashboard displaying autonomous operations

import express from 'express';
import { createLogger } from '../logging/logger.js';
import { loadAgentConfig, getAgentStatus } from '../config/agent-profile.js';

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

export default router;
// Stub for agentic-executions — endpoint polled by dashboard
router.get('/agentic-executions', (req, res) => {
  res.json({ executions: [] });
});
