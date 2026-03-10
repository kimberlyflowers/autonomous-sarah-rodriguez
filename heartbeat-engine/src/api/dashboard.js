// Dashboard API endpoints for Sarah Rodriguez
// Provides data for the web dashboard displaying autonomous operations

import express from 'express';
import { createLogger } from '../logging/logger.js';
import { loadAgentConfig, getAgentStatus } from '../config/agent-profile.js';

const router = express.Router();
const logger = createLogger('dashboard-api');

// Get database pool - using the same pattern as existing code
async function getPool() {
  const { getSharedPool } = await import('../database/pool.js');
  return getSharedPool();
}

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
    const agentId = req.query.agentId || process.env.AGENT_ID || 'bloomie-sarah-rodriguez';

    const pool = await getPool();

    const result = await pool.query(`
      SELECT
        cycle_id,
        started_at,
        completed_at,
        duration_ms,
        actions_count,
        rejections_count,
        handoffs_count,
        status,
        environment_snapshot
      FROM heartbeat_cycles
      WHERE agent_id = $1
      ORDER BY started_at DESC
      LIMIT $2 OFFSET $3
    `, [agentId, limit, offset]);

    const totalResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM heartbeat_cycles
      WHERE agent_id = $1
    `, [agentId]);

    

    res.json({
      cycles: result.rows.map(row => ({
        cycleId: row.cycle_id,
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
        total: parseInt(totalResult.rows[0].total),
        limit,
        offset,
        hasMore: (offset + limit) < parseInt(totalResult.rows[0].total)
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
    const agentId = req.query.agentId || process.env.AGENT_ID || 'bloomie-sarah-rodriguez';

    const pool = await getPool();

    const result = await pool.query(`
      SELECT
        a.id,
        a.cycle_id,
        a.action_type,
        a.description,
        a.target_system,
        a.input_data,
        a.result,
        a.success,
        a.timestamp,
        h.started_at as cycle_started
      FROM action_log a
      LEFT JOIN heartbeat_cycles h ON a.cycle_id = h.cycle_id
      WHERE a.agent_id = $1
      ORDER BY a.timestamp DESC
      LIMIT $2 OFFSET $3
    `, [agentId, limit, offset]);

    

    res.json({
      actions: result.rows.map(row => ({
        id: row.id,
        cycleId: row.cycle_id,
        cycleStarted: row.cycle_started,
        type: row.action_type,
        description: row.description,
        targetSystem: row.target_system,
        inputData: row.input_data || {},
        result: row.result || {},
        success: row.success,
        timestamp: row.timestamp
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
    const agentId = req.query.agentId || process.env.AGENT_ID || 'bloomie-sarah-rodriguez';

    const pool = await getPool();

    const result = await pool.query(`
      SELECT
        r.id,
        r.cycle_id,
        r.candidate_action,
        r.reason,
        r.reason_code,
        r.confidence,
        r.alternative_suggested,
        r.timestamp,
        h.started_at as cycle_started
      FROM rejection_log r
      LEFT JOIN heartbeat_cycles h ON r.cycle_id = h.cycle_id
      WHERE r.agent_id = $1
      ORDER BY r.timestamp DESC
      LIMIT $2 OFFSET $3
    `, [agentId, limit, offset]);

    

    res.json({
      rejections: result.rows.map(row => ({
        id: row.id,
        cycleId: row.cycle_id,
        cycleStarted: row.cycle_started,
        candidateAction: row.candidate_action,
        reason: row.reason,
        reasonCode: row.reason_code,
        confidence: parseFloat(row.confidence) || 0,
        alternativeSuggested: row.alternative_suggested,
        timestamp: row.timestamp
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
    const agentId = req.query.agentId || process.env.AGENT_ID || 'bloomie-sarah-rodriguez';

    const pool = await getPool();

    const result = await pool.query(`
      SELECT
        h.id,
        h.cycle_id,
        h.issue,
        h.analysis_path,
        h.hypotheses_tested,
        h.recommendation,
        h.confidence,
        h.urgency,
        h.human_notified,
        h.human_response,
        h.resolved,
        h.timestamp,
        c.started_at as cycle_started
      FROM handoff_log h
      LEFT JOIN heartbeat_cycles c ON h.cycle_id = c.cycle_id
      WHERE h.agent_id = $1
      ORDER BY h.timestamp DESC
      LIMIT $2 OFFSET $3
    `, [agentId, limit, offset]);

    

    res.json({
      handoffs: result.rows.map(row => ({
        id: row.id,
        cycleId: row.cycle_id,
        cycleStarted: row.cycle_started,
        issue: row.issue,
        analysisPath: row.analysis_path,
        hypothesesTested: row.hypotheses_tested || {},
        recommendation: row.recommendation,
        confidence: parseFloat(row.confidence) || 0,
        urgency: row.urgency,
        humanNotified: row.human_notified,
        humanResponse: row.human_response,
        resolved: row.resolved,
        timestamp: row.timestamp
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
    const agentId = req.query.agentId || process.env.AGENT_ID || 'bloomie-sarah-rodriguez';
    const hours = parseInt(req.query.hours) || 24; // Default to last 24 hours

    const pool = await getPool();

    // Get recent metrics
    const metricsResult = await pool.query(`
      SELECT
        COUNT(*) as total_cycles,
        SUM(actions_count) as total_actions,
        SUM(rejections_count) as total_rejections,
        SUM(handoffs_count) as total_handoffs,
        AVG(duration_ms) as avg_cycle_duration,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_cycles,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as failed_cycles
      FROM heartbeat_cycles
      WHERE agent_id = $1 AND started_at > NOW() - INTERVAL '${hours} hours'
    `, [agentId]);

    // Get latest trust metrics from trust_metrics table
    const trustResult = await pool.query(`
      SELECT
        approval_rate,
        action_success_rate,
        escalation_appropriateness,
        calculated_at
      FROM trust_metrics
      WHERE agent_id = $1
      ORDER BY calculated_at DESC
      LIMIT 1
    `, [agentId]);

    // Check graduation eligibility (import from autonomy levels)
    let graduationStatus = null;
    try {
      const { checkGraduationEligibility } = await import('../config/autonomy-levels.js');
      const agentConfig = await loadAgentConfig(agentId);
      graduationStatus = await checkGraduationEligibility(agentId, agentConfig.currentAutonomyLevel);
    } catch (error) {
      logger.warn('Could not check graduation eligibility:', error.message);
    }

    

    const metrics = metricsResult.rows[0];
    const trust = trustResult.rows[0] || {};

    res.json({
      period: `Last ${hours} hours`,
      cycles: {
        total: parseInt(metrics.total_cycles) || 0,
        successful: parseInt(metrics.successful_cycles) || 0,
        failed: parseInt(metrics.failed_cycles) || 0,
        successRate: metrics.total_cycles > 0 ?
          ((parseInt(metrics.successful_cycles) || 0) / parseInt(metrics.total_cycles) * 100).toFixed(1) :
          '0.0'
      },
      actions: {
        total: parseInt(metrics.total_actions) || 0,
        successRate: trust.action_success_rate ?
          parseFloat(trust.action_success_rate).toFixed(1) :
          'N/A'
      },
      decisions: {
        rejections: parseInt(metrics.total_rejections) || 0,
        handoffs: parseInt(metrics.total_handoffs) || 0,
        escalationAppropriate: trust.escalation_appropriateness ?
          parseFloat(trust.escalation_appropriateness).toFixed(1) :
          'N/A'
      },
      performance: {
        avgCycleDuration: metrics.avg_cycle_duration ?
          Math.round(parseFloat(metrics.avg_cycle_duration)) :
          0,
        approvalRate: trust.approval_rate ?
          parseFloat(trust.approval_rate).toFixed(1) :
          'N/A'
      },
      graduation: graduationStatus || {
        eligible: false,
        reason: 'Status check unavailable'
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({ error: 'Failed to load trust metrics' });
  }
});

// User avatar — persist across sessions
router.post('/user-avatar', async (req, res) => {
  try {
    const { avatar } = req.body;
    const { getSharedPool } = await import('../database/pool.js');
    const pool = getSharedPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    let valueToStore = avatar;

    // If it's a data URL (base64), upload to Supabase Storage for a real URL
    if (avatar && avatar.startsWith('data:image')) {
      try {
        const { uploadImage, isConfigured } = await import('../storage/supabase-storage.js');
        if (isConfigured()) {
          const base64 = avatar.split(',')[1];
          const ext = avatar.includes('png') ? 'png' : 'jpg';
          const fname = `avatars/user-${Date.now()}.${ext}`;
          const upload = await uploadImage(base64, fname, `image/${ext}`);
          if (upload.success && upload.url) {
            valueToStore = upload.url;
          }
        }
      } catch (e) { /* fallback to storing data URL */ }
    }

    await pool.query(
      `INSERT INTO user_settings(key, value, updated_at) VALUES('user_avatar', $1, NOW()) 
       ON CONFLICT(key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [valueToStore]
    );
    res.json({ success: true, url: valueToStore });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

router.get('/user-avatar', async (req, res) => {
  try {
    const { getSharedPool } = await import('../database/pool.js');
    const pool = getSharedPool();
    await pool.query(`CREATE TABLE IF NOT EXISTS user_settings (key VARCHAR(64) PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`);
    const r = await pool.query(`SELECT value FROM user_settings WHERE key='user_avatar'`);
    res.json({ avatar: r.rows[0]?.value || null });
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
