import { createClient } from '@supabase/supabase-js';
import { getUserOrgId, validateAgentAccess } from './org-boundary.js';

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

// Book Creator shares Bloomie's login, but owns a separate tenant access
// boundary. This is the same one-login/separate-workspace pattern as Studio.
export async function authenticateBookAccess(req, agentId = null) {
  const token = bearerToken(req);
  if (!token) return { authorized: false, status: 401, error: 'Book Creator login required' };

  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    return { authorized: false, status: 401, error: 'Book Creator session is invalid or expired' };
  }
  const organizationId = await getUserOrgId(req);
  if (!organizationId) {
    return { authorized: false, status: 403, error: 'No Book Creator workspace is assigned to this account' };
  }
  if (agentId) {
    const agentAccess = await validateAgentAccess(req, agentId);
    if (!agentAccess.authorized) return agentAccess;
  }
  const { data: organization } = await client
    .from('organizations')
    .select('plan')
    .eq('id', organizationId)
    .maybeSingle();
  const includedWithBloomie = ['pro', 'enterprise'].includes(organization?.plan);
  const now = new Date().toISOString();
  let { data: directEntitlement } = await client
    .from('product_entitlements')
    .select('id, tier, expires_at, organization_id')
    .eq('product_key', 'book_creator')
    .eq('status', 'active')
    .or(`organization_id.eq.${organizationId},user_id.eq.${data.user.id}`)
    .limit(1)
    .maybeSingle();
  if (!directEntitlement && data.user.email) {
    const emailResult = await client
      .from('product_entitlements')
      .select('id, tier, expires_at, organization_id')
      .eq('product_key', 'book_creator')
      .eq('status', 'active')
      .ilike('buyer_email', data.user.email)
      .limit(1)
      .maybeSingle();
    directEntitlement = emailResult.data || null;
  }
  const entitlementCurrent = directEntitlement
    && (!directEntitlement.expires_at || directEntitlement.expires_at > now);
  if (!includedWithBloomie && !entitlementCurrent) {
    return {
      authorized: false,
      status: 402,
      error: 'Bloomie Book Creator access is required',
      checkoutRequired: true,
    };
  }
  if (directEntitlement && !directEntitlement.organization_id) {
    await client
      .from('product_entitlements')
      .update({ organization_id: organizationId, user_id: data.user.id, updated_at: now })
      .eq('id', directEntitlement.id);
  }
  return {
    authorized: true,
    userId: data.user.id,
    organizationId,
    accessToken: token,
    entitlement: includedWithBloomie ? { source: 'bloomie_plan', tier: organization.plan } : { source: 'whop', tier: directEntitlement.tier },
  };
}
