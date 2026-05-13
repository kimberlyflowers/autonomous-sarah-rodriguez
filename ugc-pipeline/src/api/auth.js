const express = require('express');
const { getSupabaseConfig } = require('../services/supabase');
const { getTenants, login, requireTenant } = require('../services/auth');

const router = express.Router();

router.get('/config', (req, res) => {
  const { url, anonKey, configured } = getSupabaseConfig();
  res.json({
    mode: configured ? 'supabase' : 'access-key',
    supabaseUrl: configured ? url : null,
    supabaseAnonKey: configured ? anonKey : null,
    localTenants: configured ? [] : getTenants().map((tenant) => ({ id: tenant.id, name: tenant.name }))
  });
});

router.post('/login', (req, res) => {
  const { configured } = getSupabaseConfig();
  if (configured) {
    return res.status(400).json({ error: 'Use Supabase email/password auth for this deployment.' });
  }

  const result = login(req.body.workspace, req.body.accessKey);
  if (!result) return res.status(401).json({ error: 'Invalid workspace or access key' });
  res.json(result);
});

router.get('/me', requireTenant, (req, res) => {
  res.json({
    user: req.user ? { id: req.user.id, email: req.user.email } : null,
    tenant: req.tenant,
    role: req.tenantRole || 'owner'
  });
});

module.exports = router;
