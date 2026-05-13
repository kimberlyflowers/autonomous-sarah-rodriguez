const crypto = require('crypto');
const { createUserClient, getSupabaseConfig } = require('./supabase');

function cleanSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getSecret() {
  return process.env.UGC_AUTH_SECRET || process.env.RAILWAY_SERVICE_ID || 'local-dev-secret-change-me';
}

function getTenants() {
  const raw = process.env.UGC_TENANTS || '';
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed.map((tenant) => ({
        id: cleanSlug(tenant.id || tenant.slug || tenant.name),
        name: tenant.name || tenant.id,
        accessKey: tenant.accessKey || tenant.apiKey || tenant.key
      })).filter((tenant) => tenant.id && tenant.accessKey);
    } catch (error) {
      throw new Error('UGC_TENANTS must be valid JSON.');
    }
  }

  // Local-only fallback so the studio can be tested before Railway secrets are set.
  if (process.env.NODE_ENV !== 'production') {
    return [{ id: 'kimberly', name: 'Kimberly', accessKey: 'local-kimberly-dev' }];
  }

  return [];
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function createToken(tenantId) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
  const payload = `${tenantId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [tenantId, exp, signature] = parts;
  const payload = `${tenantId}.${exp}`;
  if (signature !== sign(payload)) return null;
  if (Number(exp) < Date.now()) return null;
  const tenant = getTenants().find((item) => item.id === tenantId);
  if (!tenant) return null;
  return { id: tenant.id, name: tenant.name };
}

function getTokenFromRequest(req) {
  const header = req.header('Authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return req.query.token || req.header('X-UGC-Token') || '';
}

async function requireTenant(req, res, next) {
  const { configured } = getSupabaseConfig();
  if (configured) {
    try {
      const token = getTokenFromRequest(req);
      if (!token) return res.status(401).json({ error: 'Supabase login required' });

      const supabase = createUserClient(token);
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user) return res.status(401).json({ error: 'Invalid Supabase session' });

      const requestedTenant = cleanSlug(req.header('X-Tenant-Slug') || req.query.tenant || req.body?.tenantSlug);
      const { data: memberships, error: memberError } = await supabase
        .from('ugc_tenant_members')
        .select('role, tenant:ugc_tenants(id, slug, name)')
        .eq('user_id', userData.user.id);

      if (memberError) throw memberError;

      const membership = (memberships || []).find((row) => row.tenant && (!requestedTenant || row.tenant.slug === requestedTenant));
      if (!membership) return res.status(403).json({ error: 'No tenant access for this user' });

      req.user = userData.user;
      req.tenant = membership.tenant;
      req.tenantRole = membership.role;
      req.supabase = supabase;
      req.accessToken = token;
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  const tenant = verifyToken(getTokenFromRequest(req));
  if (!tenant) {
    return res.status(401).json({
      error: 'Tenant login required',
      setupRequired: getTenants().length === 0
    });
  }
  req.tenant = tenant;
  next();
}

function login(workspace, accessKey) {
  const requested = cleanSlug(workspace);
  const tenant = getTenants().find((item) => item.id === requested && item.accessKey === accessKey);
  if (!tenant) return null;
  return {
    tenant: { id: tenant.id, name: tenant.name },
    token: createToken(tenant.id)
  };
}

module.exports = {
  cleanSlug,
  createToken,
  getTenants,
  login,
  requireTenant,
  verifyToken
};
