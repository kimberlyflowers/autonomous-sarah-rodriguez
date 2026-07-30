import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { getUserOrgId } from './org-boundary.js';

const router = express.Router();
const studioOrigin = String(
  process.env.BLOOM_STUDIO_URL || 'https://lovely-wonder-production-3c61.up.railway.app'
).replace(/\/$/, '');

router.post('/session', async (req, res) => {
  try {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return res.status(401).json({ error: 'Bloomie login required' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !authData?.user) return res.status(401).json({ error: 'Bloomie session is invalid or expired' });

    const organizationId = await getUserOrgId(req);
    if (!organizationId) return res.status(403).json({ error: 'No Bloom Studio workspace is assigned to this account' });
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle();

    const internalKey = process.env.BLOOM_STUDIO_API_KEY;
    if (!internalKey) return res.status(503).json({ error: 'Bloom Studio sign-in is not configured' });
    const response = await fetch(`${studioOrigin}/api/auth/internal-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': internalKey },
      body: JSON.stringify({
        tenantId: organizationId,
        tenantName: organization?.name || 'Bloomie workspace'
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(502).json({ error: payload.error || 'Bloom Studio sign-in failed' });
    }
    return res.json({
      studioOrigin,
      token: payload.token,
      tenant: payload.tenant,
      defaultSection: 'characters'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Bloom Studio could not open' });
  }
});

export default router;
