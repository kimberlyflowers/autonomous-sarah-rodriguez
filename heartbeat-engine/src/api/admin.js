// BLOOM Admin Panel — Agency-wide settings, model management, feature flags, tech support
// Self-contained: API endpoints + HTML UI served at /admin

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';
import { invalidateCache } from '../config/admin-config.js';
import crypto from 'crypto';

const router = Router();
const logger = createLogger('admin-panel');

// ── Supabase client (service key for full access) ────────────────────────
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || 'https://njfhzabmaxhfzekbzpzz.supabase.co',
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

// ── Simple auth middleware (password or API key) ─────────────────────────
const ADMIN_PASSWORD = process.env.BLOOM_ADMIN_PASSWORD || 'bloom-hq-2026';

function requireAuth(req, res, next) {
  // Check session cookie
  if (req.cookies?.bloom_admin === hashPassword(ADMIN_PASSWORD)) {
    return next();
  }
  // Check Authorization header (for API calls)
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${ADMIN_PASSWORD}`) {
    return next();
  }
  // Check query param (for initial login)
  if (req.query?.key === ADMIN_PASSWORD) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex').slice(0, 16);
}

// ══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════

// ── Login ────────────────────────────────────────────────────────────────
router.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.cookie('bloom_admin', hashPassword(ADMIN_PASSWORD), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    });
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

// ── Global Settings ──────────────────────────────────────────────────────
router.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('bloom_admin_settings').select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    logger.error('Failed to fetch admin settings', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const updates = { ...req.body, updated_at: new Date().toISOString(), updated_by: 'admin' };
    delete updates.id; // never update the PK

    const { data, error } = await sb.from('bloom_admin_settings')
      .update(updates)
      .not('id', 'is', null) // update the single row
      .select()
      .single();
    if (error) throw error;

    // Audit log
    await sb.from('admin_audit_log').insert({
      action: 'settings_update',
      scope: 'global',
      details: updates,
      performed_by: 'admin'
    });

    invalidateCache(); // Clear all caches so changes take effect immediately
    res.json(data);
  } catch (e) {
    logger.error('Failed to update admin settings', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Orgs Overview ────────────────────────────────────────────────────────
router.get('/api/orgs', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();

    // Get orgs with their configs and agents
    const { data: orgs, error: orgErr } = await sb.from('organizations').select('*').order('created_at');
    if (orgErr) throw orgErr;

    const { data: configs, error: cfgErr } = await sb.from('org_config').select('*');
    if (cfgErr) throw cfgErr;

    const { data: agents, error: agentErr } = await sb.from('agents').select('id, organization_id, name, slug, model, status');
    if (agentErr) throw agentErr;

    // Get recent message counts per org (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: msgCounts, error: msgErr } = await sb.from('messages')
      .select('organization_id')
      .gte('created_at', weekAgo);

    const msgByOrg = {};
    (msgCounts || []).forEach(m => {
      msgByOrg[m.organization_id] = (msgByOrg[m.organization_id] || 0) + 1;
    });

    // Merge everything
    const enriched = orgs.map(org => ({
      ...org,
      config: configs.find(c => c.organization_id === org.id) || null,
      agents: agents.filter(a => a.organization_id === org.id),
      messages_7d: msgByOrg[org.id] || 0
    }));

    res.json(enriched);
  } catch (e) {
    logger.error('Failed to fetch orgs', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Org Config Update ────────────────────────────────────────────────────
router.put('/api/orgs/:orgId/config', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const { orgId } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString(), updated_by: 'admin' };
    delete updates.id;
    delete updates.organization_id;

    const { data, error } = await sb.from('org_config')
      .update(updates)
      .eq('organization_id', orgId)
      .select()
      .single();
    if (error) throw error;

    // Audit log
    await sb.from('admin_audit_log').insert({
      action: 'org_config_update',
      scope: 'org',
      organization_id: orgId,
      details: updates,
      performed_by: 'admin'
    });

    invalidateCache(orgId); // Clear this org's cache immediately
    res.json(data);
  } catch (e) {
    logger.error('Failed to update org config', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Bulk Model Switch (all orgs at once) ─────────────────────────────────
router.post('/api/bulk/model', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const { model, scope, tier } = req.body;
    // scope: 'all', 'clients' (non-bloom orgs), or 'bloom'

    let query = sb.from('org_config').update({
      model_override: model || null,
      model_tier: tier || undefined,
      updated_at: new Date().toISOString(),
      updated_by: 'admin'
    });

    if (scope === 'clients') {
      query = query.neq('model_tier', 'bloom');
    } else if (scope === 'bloom') {
      query = query.eq('model_tier', 'bloom');
    }
    // scope === 'all' → no filter

    const { data, error } = await query.select();
    if (error) throw error;

    // Also update agents table model field for consistency
    const orgIds = data.map(d => d.organization_id);
    if (model && orgIds.length > 0) {
      await sb.from('agents')
        .update({ model: model, updated_at: new Date().toISOString() })
        .in('organization_id', orgIds);
    }

    // Audit log
    await sb.from('admin_audit_log').insert({
      action: 'bulk_model_switch',
      scope: 'global',
      details: { model, scope, tier, affected_orgs: orgIds.length },
      performed_by: 'admin'
    });

    invalidateCache(); // Clear all caches
    res.json({ updated: data.length, orgs: data });
  } catch (e) {
    logger.error('Bulk model switch failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Bulk Feature Toggle ──────────────────────────────────────────────────
router.post('/api/bulk/features', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const { features, scope } = req.body;
    // features: { image_generation: true, blog_posting: false, ... }

    if (scope === 'global') {
      // Update global defaults
      const { data: current } = await sb.from('bloom_admin_settings').select('global_feature_flags').single();
      const merged = { ...current.global_feature_flags, ...features };
      await sb.from('bloom_admin_settings').update({
        global_feature_flags: merged,
        updated_at: new Date().toISOString(),
        updated_by: 'admin'
      }).not('id', 'is', null);
    }

    // Also push to all org_configs
    const { data: configs } = await sb.from('org_config').select('*');
    for (const config of configs) {
      const merged = { ...(config.feature_flags || {}), ...features };
      await sb.from('org_config').update({
        feature_flags: merged,
        updated_at: new Date().toISOString()
      }).eq('id', config.id);
    }

    await sb.from('admin_audit_log').insert({
      action: 'bulk_feature_toggle',
      scope: scope || 'all',
      details: { features, affected_orgs: configs.length },
      performed_by: 'admin'
    });

    invalidateCache(); // Clear all caches
    res.json({ success: true, updated: configs.length });
  } catch (e) {
    logger.error('Bulk feature toggle failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Bulk Skill Update ────────────────────────────────────────────────────
router.post('/api/bulk/skills', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const { skills, scope } = req.body;

    if (scope === 'global') {
      const { data: current } = await sb.from('bloom_admin_settings').select('global_skill_config').single();
      const merged = { ...current.global_skill_config, ...skills };
      await sb.from('bloom_admin_settings').update({
        global_skill_config: merged,
        updated_at: new Date().toISOString(),
        updated_by: 'admin'
      }).not('id', 'is', null);
    }

    const { data: configs } = await sb.from('org_config').select('*');
    for (const config of configs) {
      const merged = { ...(config.skill_config || {}), ...skills };
      await sb.from('org_config').update({
        skill_config: merged,
        updated_at: new Date().toISOString()
      }).eq('id', config.id);
    }

    await sb.from('admin_audit_log').insert({
      action: 'bulk_skill_update',
      scope: scope || 'all',
      details: { skills, affected_orgs: configs.length },
      performed_by: 'admin'
    });

    invalidateCache(); // Clear all caches
    res.json({ success: true, updated: configs.length });
  } catch (e) {
    logger.error('Bulk skill update failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Tech Support: Client Logs ────────────────────────────────────────────
router.get('/api/support/:orgId/logs', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const { orgId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type || 'all'; // 'messages', 'errors', 'tools', 'all'

    // Check support access
    const { data: config } = await sb.from('org_config')
      .select('support_access_granted, support_access_expires_at')
      .eq('organization_id', orgId)
      .single();

    const hasAccess = config?.support_access_granted &&
      (!config.support_access_expires_at || new Date(config.support_access_expires_at) > new Date());

    const result = { org_id: orgId, support_access: hasAccess, logs: {} };

    // Recent messages (conversations)
    if (type === 'all' || type === 'messages') {
      const { data: messages } = await sb.from('messages')
        .select('id, role, content, created_at, metadata')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      result.logs.messages = messages || [];
    }

    // Recent sessions
    if (type === 'all' || type === 'sessions') {
      const { data: sessions } = await sb.from('sessions')
        .select('id, agent_id, started_at, ended_at, metadata')
        .eq('organization_id', orgId)
        .order('started_at', { ascending: false })
        .limit(20);
      result.logs.sessions = sessions || [];
    }

    // Rejection log (errors / failed tool calls)
    if (type === 'all' || type === 'errors') {
      const { data: rejections } = await sb.from('rejection_log')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      result.logs.errors = rejections || [];
    }

    // Usage metrics
    if (type === 'all' || type === 'usage') {
      const { data: usage } = await sb.from('usage_metrics')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(30);
      result.logs.usage = usage || [];
    }

    res.json(result);
  } catch (e) {
    logger.error('Failed to fetch support logs', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Grant/Revoke Support Access ──────────────────────────────────────────
router.post('/api/support/:orgId/access', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const { orgId } = req.params;
    const { grant, hours } = req.body; // grant: true/false, hours: how long

    const updates = {
      support_access_granted: grant,
      support_access_granted_at: grant ? new Date().toISOString() : null,
      support_access_expires_at: grant && hours
        ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb.from('org_config')
      .update(updates)
      .eq('organization_id', orgId)
      .select()
      .single();
    if (error) throw error;

    await sb.from('admin_audit_log').insert({
      action: grant ? 'support_access_granted' : 'support_access_revoked',
      scope: 'org',
      organization_id: orgId,
      details: { hours: hours || 'unlimited' },
      performed_by: 'admin'
    });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Audit Log ────────────────────────────────────────────────────────────
router.get('/api/audit', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ══════════════════════════════════════════════════════════════════════════
// ADMIN UI — Single-page HTML
// ══════════════════════════════════════════════════════════════════════════

router.get('/', (req, res) => {
  // Check if already authed via cookie
  const isAuthed = req.cookies?.bloom_admin === hashPassword(ADMIN_PASSWORD);

  res.send(getAdminHTML(isAuthed));
});

function getAdminHTML(preAuthed = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BLOOM Admin — Command Center</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0f;
      --surface: #12121a;
      --surface2: #1a1a26;
      --border: #2a2a3a;
      --text: #e4e4ef;
      --text-dim: #8888a0;
      --bloom: #b388ff;
      --bloom-dim: #7c4dff;
      --green: #69f0ae;
      --red: #ff5252;
      --orange: #ffab40;
      --blue: #40c4ff;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

    /* Login */
    .login-screen { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .login-box { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 48px; width: 400px; text-align: center; }
    .login-box h1 { font-size: 24px; margin-bottom: 8px; color: var(--bloom); }
    .login-box p { color: var(--text-dim); margin-bottom: 24px; font-size: 14px; }
    .login-box input { width: 100%; padding: 12px 16px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; margin-bottom: 16px; outline: none; }
    .login-box input:focus { border-color: var(--bloom); }

    /* Layout */
    .app { display: none; }
    .app.active { display: flex; min-height: 100vh; }
    .sidebar { width: 240px; background: var(--surface); border-right: 1px solid var(--border); padding: 24px 0; flex-shrink: 0; }
    .sidebar-logo { padding: 0 24px 24px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
    .sidebar-logo h2 { font-size: 18px; color: var(--bloom); }
    .sidebar-logo span { font-size: 12px; color: var(--text-dim); }
    .nav-item { padding: 10px 24px; cursor: pointer; font-size: 14px; color: var(--text-dim); transition: all 0.2s; display: flex; align-items: center; gap: 10px; }
    .nav-item:hover { background: var(--surface2); color: var(--text); }
    .nav-item.active { color: var(--bloom); background: rgba(179,136,255,0.08); border-right: 2px solid var(--bloom); }
    .nav-icon { width: 18px; text-align: center; }

    /* Main content */
    .main { flex: 1; padding: 32px; overflow-y: auto; max-height: 100vh; }
    .page { display: none; }
    .page.active { display: block; }
    .page-title { font-size: 24px; font-weight: 600; margin-bottom: 24px; }

    /* Cards */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 16px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .card-title { font-size: 16px; font-weight: 600; }

    /* Org cards */
    .org-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }
    .org-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; transition: border-color 0.2s; }
    .org-card:hover { border-color: var(--bloom-dim); }
    .org-name { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    .org-plan { font-size: 12px; color: var(--bloom); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .org-stat { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid var(--border); }
    .org-stat:last-child { border-bottom: none; }
    .org-stat .label { color: var(--text-dim); }
    .org-agents { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .agent-chip { background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 4px 12px; font-size: 12px; }
    .agent-chip .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--green); margin-right: 6px; }

    /* Buttons */
    .btn { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); cursor: pointer; font-size: 13px; font-family: inherit; transition: all 0.2s; }
    .btn:hover { border-color: var(--bloom-dim); }
    .btn-primary { background: var(--bloom-dim); border-color: var(--bloom); color: white; }
    .btn-primary:hover { background: var(--bloom); }
    .btn-danger { border-color: var(--red); color: var(--red); }
    .btn-danger:hover { background: var(--red); color: white; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; }

    /* Toggle switches */
    .toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .toggle-row:last-child { border-bottom: none; }
    .toggle-label { font-size: 14px; }
    .toggle-label small { display: block; color: var(--text-dim); font-size: 12px; }
    .toggle { position: relative; width: 44px; height: 24px; cursor: pointer; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle .slider { position: absolute; inset: 0; background: var(--surface2); border: 1px solid var(--border); border-radius: 24px; transition: 0.3s; }
    .toggle .slider:before { content: ''; position: absolute; width: 18px; height: 18px; border-radius: 50%; background: var(--text-dim); top: 2px; left: 2px; transition: 0.3s; }
    .toggle input:checked + .slider { background: var(--bloom-dim); border-color: var(--bloom); }
    .toggle input:checked + .slider:before { transform: translateX(20px); background: white; }

    /* Select / Input */
    select, .input { width: 100%; padding: 10px 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 13px; font-family: inherit; outline: none; }
    select:focus, .input:focus { border-color: var(--bloom); }
    select option { background: var(--surface); }
    .form-group { margin-bottom: 16px; }
    .form-label { font-size: 13px; color: var(--text-dim); margin-bottom: 6px; display: block; }

    /* Status badges */
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
    .badge-green { background: rgba(105,240,174,0.15); color: var(--green); }
    .badge-orange { background: rgba(255,171,64,0.15); color: var(--orange); }
    .badge-red { background: rgba(255,82,82,0.15); color: var(--red); }
    .badge-blue { background: rgba(64,196,255,0.15); color: var(--blue); }
    .badge-purple { background: rgba(179,136,255,0.15); color: var(--bloom); }

    /* Log viewer */
    .log-entry { padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace; }
    .log-entry .timestamp { color: var(--text-dim); font-size: 11px; }
    .log-entry .level-error { color: var(--red); }
    .log-entry .level-warn { color: var(--orange); }
    .log-entry .level-info { color: var(--blue); }
    .log-scroll { max-height: 500px; overflow-y: auto; background: var(--bg); border-radius: 8px; border: 1px solid var(--border); }

    /* Toast */
    .toast { position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px; font-size: 14px; z-index: 1000; animation: slideIn 0.3s; }
    .toast-success { background: rgba(105,240,174,0.9); color: #0a0a0f; }
    .toast-error { background: rgba(255,82,82,0.9); color: white; }
    @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

    /* Bulk action bar */
    .bulk-bar { background: var(--surface2); border: 1px solid var(--bloom-dim); border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .bulk-bar h3 { font-size: 14px; color: var(--bloom); margin-bottom: 12px; }
    .bulk-bar .row { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; }
    .bulk-bar .row .form-group { margin-bottom: 0; flex: 1; min-width: 180px; }

    /* Tabs inside cards */
    .tab-bar { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
    .tab { padding: 8px 16px; font-size: 13px; cursor: pointer; color: var(--text-dim); border-bottom: 2px solid transparent; transition: all 0.2s; }
    .tab.active { color: var(--bloom); border-bottom-color: var(--bloom); }
  </style>
</head>
<body>

<!-- LOGIN SCREEN -->
<div class="login-screen" id="loginScreen">
  <div class="login-box">
    <h1>BLOOM Command Center</h1>
    <p>Agency Admin Panel</p>
    <input type="password" id="loginPassword" placeholder="Admin password" onkeypress="if(event.key==='Enter')doLogin()">
    <button class="btn btn-primary" style="width:100%;padding:12px" onclick="doLogin()">Enter</button>
  </div>
</div>

<!-- MAIN APP -->
<div class="app" id="mainApp">
  <div class="sidebar">
    <div class="sidebar-logo">
      <h2>BLOOM HQ</h2>
      <span>Command Center</span>
    </div>
    <div class="nav-item active" onclick="showPage('overview')"><span class="nav-icon">&#9632;</span> Org Overview</div>
    <div class="nav-item" onclick="showPage('models')"><span class="nav-icon">&#9881;</span> Model Control</div>
    <div class="nav-item" onclick="showPage('skills')"><span class="nav-icon">&#9733;</span> Skills</div>
    <div class="nav-item" onclick="showPage('features')"><span class="nav-icon">&#9889;</span> Features</div>
    <div class="nav-item" onclick="showPage('support')"><span class="nav-icon">&#9998;</span> Tech Support</div>
    <div class="nav-item" onclick="showPage('audit')"><span class="nav-icon">&#9776;</span> Audit Log</div>
  </div>

  <div class="main">
    <!-- ═══ ORG OVERVIEW ═══ -->
    <div class="page active" id="page-overview">
      <h1 class="page-title">Organization Overview</h1>
      <div class="org-grid" id="orgGrid">Loading...</div>
    </div>

    <!-- ═══ MODEL CONTROL ═══ -->
    <div class="page" id="page-models">
      <h1 class="page-title">Model Control</h1>

      <div class="bulk-bar">
        <h3>Bulk Model Switch</h3>
        <div class="row">
          <div class="form-group">
            <label class="form-label">Target Model</label>
            <select id="bulkModel">
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="deepseek-chat">DeepSeek</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Apply To</label>
            <select id="bulkScope">
              <option value="all">All Orgs</option>
              <option value="clients">Client Orgs Only</option>
              <option value="bloom">BLOOM HQ Only</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="bulkModelSwitch()">Apply to All</button>
        </div>
      </div>

      <div id="modelCards">Loading...</div>
    </div>

    <!-- ═══ SKILLS ═══ -->
    <div class="page" id="page-skills">
      <h1 class="page-title">Skill Management</h1>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Agency-Wide Skills</span>
          <button class="btn btn-sm btn-primary" onclick="saveGlobalSkills()">Save Changes</button>
        </div>
        <div id="skillToggles">Loading...</div>
      </div>
    </div>

    <!-- ═══ FEATURES ═══ -->
    <div class="page" id="page-features">
      <h1 class="page-title">Feature Flags</h1>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Global Feature Defaults</span>
          <button class="btn btn-sm btn-primary" onclick="saveGlobalFeatures()">Save & Push to All</button>
        </div>
        <div id="featureToggles">Loading...</div>
      </div>
    </div>

    <!-- ═══ TECH SUPPORT ═══ -->
    <div class="page" id="page-support">
      <h1 class="page-title">Tech Support</h1>
      <div class="card" style="margin-bottom:16px">
        <div class="row" style="display:flex;gap:12px;align-items:end">
          <div class="form-group" style="flex:1">
            <label class="form-label">Select Organization</label>
            <select id="supportOrg" onchange="loadSupportLogs()">
              <option value="">Choose an org...</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Log Type</label>
            <select id="supportLogType" onchange="loadSupportLogs()">
              <option value="all">All</option>
              <option value="errors">Errors Only</option>
              <option value="messages">Messages</option>
              <option value="sessions">Sessions</option>
              <option value="usage">Usage</option>
            </select>
          </div>
          <button class="btn btn-sm" onclick="grantSupportAccess()">Grant 24h Access</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">Logs</div>
        <div class="log-scroll" id="supportLogs">
          <div style="padding:40px;text-align:center;color:var(--text-dim)">Select an organization to view logs</div>
        </div>
      </div>
    </div>

    <!-- ═══ AUDIT LOG ═══ -->
    <div class="page" id="page-audit">
      <h1 class="page-title">Audit Log</h1>
      <div class="card">
        <div class="log-scroll" id="auditLogs">Loading...</div>
      </div>
    </div>
  </div>
</div>

<script>
const BASE = '/admin';
let globalSettings = {};
let orgs = [];
let authed = ${preAuthed};

// ── Auth ──
if (authed) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').classList.add('active');
  loadAll();
}

async function doLogin() {
  const pw = document.getElementById('loginPassword').value;
  const res = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw })
  });
  if (res.ok) {
    authed = true;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').classList.add('active');
    loadAll();
  } else {
    toast('Invalid password', 'error');
  }
}

// ── Navigation ──
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  event.target.closest('.nav-item').classList.add('active');
}

// ── Data Loading ──
async function loadAll() {
  await Promise.all([loadSettings(), loadOrgs()]);
  loadAudit();
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadSettings() {
  globalSettings = await api('/api/settings');
  renderFeatures();
  renderSkills();
}

async function loadOrgs() {
  orgs = await api('/api/orgs');
  renderOrgOverview();
  renderModelCards();
  renderSupportOrgs();
}

// ── Org Overview ──
function renderOrgOverview() {
  const grid = document.getElementById('orgGrid');
  grid.innerHTML = orgs.map(org => {
    const tier = org.config?.model_tier || 'standard';
    const model = org.config?.model_override || getDefaultModelForTier(tier);
    const tierBadge = { bloom: 'badge-purple', premium: 'badge-blue', standard: 'badge-green', budget: 'badge-orange' }[tier] || 'badge-green';
    return \`
      <div class="org-card">
        <div class="org-name">\${org.name}</div>
        <div class="org-plan">\${org.plan} <span class="badge \${tierBadge}" style="margin-left:8px">\${tier}</span></div>
        <div class="org-stat"><span class="label">Model</span><span>\${shortModel(model)}</span></div>
        <div class="org-stat"><span class="label">Messages (7d)</span><span>\${org.messages_7d}</span></div>
        <div class="org-stat"><span class="label">Support Access</span><span>\${org.config?.support_access_granted ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">None</span>'}</span></div>
        <div class="org-agents">
          \${org.agents.map(a => \`<span class="agent-chip"><span class="dot"></span>\${a.name}</span>\`).join('')}
        </div>
      </div>
    \`;
  }).join('');
}

// ── Model Control ──
function renderModelCards() {
  const container = document.getElementById('modelCards');
  container.innerHTML = orgs.map(org => {
    const tier = org.config?.model_tier || 'standard';
    const model = org.config?.model_override || getDefaultModelForTier(tier);
    return \`
      <div class="card">
        <div class="card-header">
          <span class="card-title">\${org.name}</span>
          <span class="badge badge-purple">\${tier}</span>
        </div>
        <div style="display:flex;gap:12px;align-items:end">
          <div class="form-group" style="flex:1">
            <label class="form-label">Active Model</label>
            <select id="model-\${org.id}" value="\${model}">
              <option value="" \${!org.config?.model_override ? 'selected' : ''}>Default (tier: \${tier})</option>
              <option value="claude-sonnet-4-6" \${model==='claude-sonnet-4-6'?'selected':''}>Claude Sonnet 4.6</option>
              <option value="claude-haiku-4-5-20251001" \${model==='claude-haiku-4-5-20251001'?'selected':''}>Claude Haiku 4.5</option>
              <option value="claude-opus-4-6" \${model==='claude-opus-4-6'?'selected':''}>Claude Opus 4.6</option>
              <option value="gpt-4o" \${model==='gpt-4o'?'selected':''}>GPT-4o</option>
              <option value="gpt-4o-mini" \${model==='gpt-4o-mini'?'selected':''}>GPT-4o Mini</option>
              <option value="gemini-2.5-flash" \${model==='gemini-2.5-flash'?'selected':''}>Gemini 2.5 Flash</option>
              <option value="deepseek-chat" \${model==='deepseek-chat'?'selected':''}>DeepSeek</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tier</label>
            <select id="tier-\${org.id}">
              <option value="bloom" \${tier==='bloom'?'selected':''}>BLOOM (Sonnet)</option>
              <option value="premium" \${tier==='premium'?'selected':''}>Premium (GPT-4o)</option>
              <option value="standard" \${tier==='standard'?'selected':''}>Standard (Gemini)</option>
              <option value="budget" \${tier==='budget'?'selected':''}>Budget (GPT-4o Mini)</option>
              <option value="custom" \${tier==='custom'?'selected':''}>Custom</option>
            </select>
          </div>
          <button class="btn btn-sm btn-primary" onclick="saveOrgModel('\${org.id}')">Save</button>
        </div>
      </div>
    \`;
  }).join('');
}

async function saveOrgModel(orgId) {
  const model = document.getElementById('model-' + orgId).value;
  const tier = document.getElementById('tier-' + orgId).value;
  await api('/api/orgs/' + orgId + '/config', {
    method: 'PUT',
    body: JSON.stringify({ model_override: model || null, model_tier: tier })
  });
  toast('Model updated');
  loadOrgs();
}

async function bulkModelSwitch() {
  const model = document.getElementById('bulkModel').value;
  const scope = document.getElementById('bulkScope').value;
  const res = await api('/api/bulk/model', {
    method: 'POST',
    body: JSON.stringify({ model, scope })
  });
  toast(\`Switched \${res.updated} orgs to \${shortModel(model)}\`);
  loadOrgs();
}

// ── Features ──
function renderFeatures() {
  const flags = globalSettings.global_feature_flags || {};
  const container = document.getElementById('featureToggles');
  const descriptions = {
    image_generation: 'AI image generation (flyers, social posts, logos)',
    web_search: 'Live web search for research and current info',
    blog_posting: 'Create and publish blog posts via GHL',
    email_templates: 'Design and save email templates in GHL',
    sms_sending: 'Send SMS messages through GHL',
    calendar_booking: 'Book and manage calendar appointments',
    pipeline_management: 'Manage CRM pipeline stages and deals',
    voice_calls: 'Make and receive phone calls',
    browser_automation: 'Browse websites and take screenshots',
    file_creation: 'Create documents, spreadsheets, and files'
  };
  container.innerHTML = Object.entries(flags).map(([key, val]) => \`
    <div class="toggle-row">
      <div class="toggle-label">
        \${key.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase())}
        <small>\${descriptions[key] || ''}</small>
      </div>
      <label class="toggle">
        <input type="checkbox" data-feature="\${key}" \${val ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    </div>
  \`).join('');
}

async function saveGlobalFeatures() {
  const flags = {};
  document.querySelectorAll('[data-feature]').forEach(el => {
    flags[el.dataset.feature] = el.checked;
  });
  await api('/api/bulk/features', {
    method: 'POST',
    body: JSON.stringify({ features: flags, scope: 'global' })
  });
  toast('Features updated across all orgs');
  loadSettings();
}

// ── Skills ──
function renderSkills() {
  const skills = globalSettings.global_skill_config || {};
  const container = document.getElementById('skillToggles');
  container.innerHTML = Object.entries(skills).map(([key, val]) => \`
    <div class="toggle-row">
      <div class="toggle-label">\${key.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase())}</div>
      <label class="toggle">
        <input type="checkbox" data-skill="\${key}" \${val ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    </div>
  \`).join('');
}

async function saveGlobalSkills() {
  const skills = {};
  document.querySelectorAll('[data-skill]').forEach(el => {
    skills[el.dataset.skill] = el.checked;
  });
  await api('/api/bulk/skills', {
    method: 'POST',
    body: JSON.stringify({ skills, scope: 'global' })
  });
  toast('Skills updated across all orgs');
  loadSettings();
}

// ── Tech Support ──
function renderSupportOrgs() {
  const sel = document.getElementById('supportOrg');
  sel.innerHTML = '<option value="">Choose an org...</option>' +
    orgs.map(o => \`<option value="\${o.id}">\${o.name}</option>\`).join('');
}

async function loadSupportLogs() {
  const orgId = document.getElementById('supportOrg').value;
  const type = document.getElementById('supportLogType').value;
  const container = document.getElementById('supportLogs');
  if (!orgId) { container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-dim)">Select an organization</div>'; return; }

  try {
    const data = await api(\`/api/support/\${orgId}/logs?type=\${type}&limit=50\`);
    let html = '';

    if (!data.support_access) {
      html += '<div style="padding:16px;color:var(--orange);text-align:center">Support access not granted for this org. Click "Grant 24h Access" to enable.</div>';
    }

    // Errors
    if (data.logs.errors?.length) {
      html += '<div style="padding:8px 14px;color:var(--red);font-weight:600;font-size:12px;border-bottom:1px solid var(--border)">ERRORS (' + data.logs.errors.length + ')</div>';
      data.logs.errors.slice(0, 20).forEach(e => {
        html += \`<div class="log-entry"><span class="timestamp">\${new Date(e.created_at).toLocaleString()}</span> <span class="level-error">[ERROR]</span> \${escapeHtml(JSON.stringify(e).slice(0, 200))}</div>\`;
      });
    }

    // Messages
    if (data.logs.messages?.length) {
      html += '<div style="padding:8px 14px;color:var(--blue);font-weight:600;font-size:12px;border-bottom:1px solid var(--border)">MESSAGES (' + data.logs.messages.length + ')</div>';
      data.logs.messages.slice(0, 20).forEach(m => {
        const role = m.role === 'user' ? '<span class="level-info">[USER]</span>' : '<span class="level-warn">[AGENT]</span>';
        const content = typeof m.content === 'string' ? m.content.slice(0, 150) : JSON.stringify(m.content).slice(0, 150);
        html += \`<div class="log-entry"><span class="timestamp">\${new Date(m.created_at).toLocaleString()}</span> \${role} \${escapeHtml(content)}</div>\`;
      });
    }

    // Sessions
    if (data.logs.sessions?.length) {
      html += '<div style="padding:8px 14px;color:var(--green);font-weight:600;font-size:12px;border-bottom:1px solid var(--border)">SESSIONS (' + data.logs.sessions.length + ')</div>';
      data.logs.sessions.forEach(s => {
        html += \`<div class="log-entry"><span class="timestamp">\${new Date(s.started_at).toLocaleString()}</span> Session \${s.id.slice(0,8)}... \${s.ended_at ? '(ended)' : '<span class="badge badge-green">active</span>'}</div>\`;
      });
    }

    if (!html) html = '<div style="padding:40px;text-align:center;color:var(--text-dim)">No logs found</div>';
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div style="padding:20px;color:var(--red)">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

async function grantSupportAccess() {
  const orgId = document.getElementById('supportOrg').value;
  if (!orgId) { toast('Select an org first', 'error'); return; }
  await api(\`/api/support/\${orgId}/access\`, {
    method: 'POST',
    body: JSON.stringify({ grant: true, hours: 24 })
  });
  toast('24h support access granted');
  loadSupportLogs();
}

// ── Audit Log ──
async function loadAudit() {
  try {
    const data = await api('/api/audit');
    const container = document.getElementById('auditLogs');
    if (!data.length) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-dim)">No audit entries yet</div>';
      return;
    }
    container.innerHTML = data.map(e => {
      const orgName = orgs.find(o => o.id === e.organization_id)?.name || e.scope;
      return \`<div class="log-entry">
        <span class="timestamp">\${new Date(e.created_at).toLocaleString()}</span>
        <span class="badge badge-purple">\${e.action}</span>
        <span class="badge badge-blue">\${orgName}</span>
        \${escapeHtml(JSON.stringify(e.details).slice(0, 120))}
      </div>\`;
    }).join('');
  } catch(e) {}
}

// ── Helpers ──
function shortModel(m) {
  const map = {
    'claude-sonnet-4-6': 'Sonnet 4.6',
    'claude-haiku-4-5-20251001': 'Haiku 4.5',
    'claude-opus-4-6': 'Opus 4.6',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gemini-2.5-flash': 'Gemini Flash',
    'deepseek-chat': 'DeepSeek'
  };
  return map[m] || m || 'Default';
}

function getDefaultModelForTier(tier) {
  const map = {
    bloom: globalSettings.default_model || 'claude-sonnet-4-6',
    premium: globalSettings.default_client_model || 'gpt-4o',
    standard: globalSettings.default_client_model_after_trial || 'gemini-2.5-flash',
    budget: 'gpt-4o-mini'
  };
  return map[tier] || map.standard;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
</script>

</body>
</html>`;
}

export default router;
