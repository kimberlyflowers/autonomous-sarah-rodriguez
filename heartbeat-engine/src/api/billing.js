import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { Webhook } from 'standardwebhooks';
import { timingSafeEqual } from 'node:crypto';
import { getUserOrgId } from './org-boundary.js';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('billing-api');

const PLAN_CATALOG = {
  part_time: {
    key: 'part_time',
    name: 'AI Employee - Part Time',
    organizationPlan: 'pro',
    price: 597,
    planId: process.env.WHOP_PLAN_PART_TIME || 'plan_tVPJ5E6YjVrHB',
    description: 'Part-time AI employee access with expanded execution capacity.',
  },
  full_time: {
    key: 'full_time',
    name: 'AI Employee - Full Time',
    organizationPlan: 'enterprise',
    price: 997,
    planId: process.env.WHOP_PLAN_FULL_TIME || 'plan_n9PvSqVdstxh9',
    description: 'Full-time AI employee access, including full video-generation entitlement.',
  },
  book_creator: {
    key: 'book_creator',
    name: 'Bloomie Book Creator',
    organizationPlan: null,
    productKey: 'book_creator',
    tier: 'standard',
    price: 37,
    cadence: 'one_time',
    planId: process.env.WHOP_PLAN_BOOK_CREATOR || 'plan_SfN6obHBORCwM',
    description: 'Create, revise, preview, and export complete 10,000-word books.',
  },
  book_creator_booster: {
    key: 'book_creator_booster',
    name: 'Book Creator Quick-Launch Booster',
    organizationPlan: null,
    productKey: 'book_creator',
    tier: 'booster',
    price: 46.95,
    cadence: 'one_time',
    planId: process.env.WHOP_PLAN_BOOK_CREATOR_BOOSTER || 'plan_wAW1COKDgRNWm',
    description: 'Book Creator plus the protected Quick-Launch training, templates, checklist, and fast-start blueprint.',
  },
};

const PLAN_ID_TO_ORG_PLAN = Object.fromEntries(
  Object.values(PLAN_CATALOG).filter(plan => plan.organizationPlan).map(plan => [plan.planId, plan.organizationPlan])
);
const PLAN_ID_TO_PRODUCT = Object.fromEntries(
  Object.values(PLAN_CATALOG).filter(plan => plan.productKey).map(plan => [plan.planId, plan])
);

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function publicPlan(plan) {
  return {
    key: plan.key,
    name: plan.name,
    price: plan.price,
    cadence: plan.cadence || 'month',
    description: plan.description,
  };
}

export async function prepareHostedCheckout(organizationId, targetPlan) {
  const plan = PLAN_CATALOG[targetPlan];
  if (!plan) return { success: false, error: 'Choose part_time, full_time, or book_creator.' };
  if (!organizationId) return { success: false, error: 'Authenticated organization context is required.' };

  const { data: organization, error } = await supabase()
    .from('organizations')
    .select('id, name, owner_email, plan')
    .eq('id', organizationId)
    .maybeSingle();
  if (error || !organization) {
    return { success: false, error: error?.message || 'Organization not found.' };
  }

  if (plan.productKey) {
    const { data: entitlement } = await supabase()
      .from('product_entitlements')
      .select('id, status, tier, expires_at')
      .eq('organization_id', organizationId)
      .eq('product_key', plan.productKey)
      .eq('status', 'active')
      .maybeSingle();
    const tierSatisfiesPlan = plan.tier !== 'booster' || entitlement?.tier === 'booster';
    const isCurrent = entitlement
      && tierSatisfiesPlan
      && (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date());
    if (isCurrent) {
      return {
        success: true,
        alreadyActive: true,
        plan: publicPlan(plan),
        message: `${plan.name} is already active for ${organization.name}. No payment is needed.`,
      };
    }
  } else if (organization.plan === plan.organizationPlan) {
    return {
      success: true,
      alreadyActive: true,
      plan: publicPlan(plan),
      message: `${plan.name} is already active for ${organization.name}. No payment is needed.`,
    };
  }

  const checkoutUrl = `https://whop.com/checkout/${encodeURIComponent(plan.planId)}/`;
  return {
    success: true,
    requiresUserAction: true,
    checkoutUrl,
    checkoutPlanId: plan.planId,
    plan: publicPlan(plan),
    message: `I prepared the ${plan.name} checkout. Review and approve the payment in the secure Whop checkout shown inside Bloomie.`,
  };
}

router.get('/plans', async (req, res) => {
  const organizationId = await getUserOrgId(req);
  if (!organizationId) return res.status(401).json({ success: false, error: 'Authentication required.' });

  const { data, error } = await supabase()
    .from('organizations')
    .select('name, owner_email, plan')
    .eq('id', organizationId)
    .maybeSingle();
  if (error || !data) return res.status(404).json({ success: false, error: error?.message || 'Organization not found.' });

  return res.json({
    success: true,
    currentPlan: data.plan || 'starter',
    organizationName: data.name,
    plans: Object.values(PLAN_CATALOG).map(publicPlan),
  });
});

router.post('/prepare-checkout', async (req, res) => {
  const organizationId = await getUserOrgId(req);
  if (!organizationId) return res.status(401).json({ success: false, error: 'Authentication required.' });
  const result = await prepareHostedCheckout(organizationId, req.body?.plan);
  return res.status(result.success ? 200 : 400).json(result);
});

function secureSecretMatch(received, expected) {
  const receivedBuffer = Buffer.from(String(received || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return receivedBuffer.length === expectedBuffer.length
    && receivedBuffer.length > 0
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

router.post('/provision-book-creator', async (req, res) => {
  const expectedSecret = process.env.BOOK_CREATOR_PROVISIONING_SECRET;
  const receivedSecret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expectedSecret || !secureSecretMatch(receivedSecret, expectedSecret)) {
    return res.status(401).json({ success: false, error: 'Invalid provisioning authorization.' });
  }

  const buyerEmail = String(req.body?.buyerEmail || '').trim().toLowerCase();
  const planId = String(req.body?.planId || '').trim();
  const productPlan = PLAN_ID_TO_PRODUCT[planId];
  if (!productPlan || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
    return res.status(400).json({ success: false, error: 'A valid Book Creator plan and buyer email are required.' });
  }

  const client = supabase();
  const [{ data: organization }, { data: user }] = await Promise.all([
    client.from('organizations').select('id').eq('owner_email', buyerEmail).maybeSingle(),
    client.from('users').select('id').eq('email', buyerEmail).maybeSingle(),
  ]);
  const now = new Date().toISOString();
  const entitlement = {
    product_key: productPlan.productKey,
    tier: productPlan.tier || 'standard',
    status: 'active',
    organization_id: organization?.id || null,
    user_id: user?.id || null,
    buyer_email: buyerEmail,
    source: 'whop',
    external_plan_id: planId,
    external_payment_id: String(req.body?.paymentId || '').trim() || null,
    external_event_id: String(req.body?.eventId || '').trim() || null,
    activated_at: now,
    updated_at: now,
    metadata: { eventType: 'verified_bookmint_bridge' },
  };

  let existingQuery = client
    .from('product_entitlements')
    .select('id')
    .eq('product_key', productPlan.productKey);
  existingQuery = organization?.id
    ? existingQuery.eq('organization_id', organization.id)
    : existingQuery.is('organization_id', null).ilike('buyer_email', buyerEmail);
  const { data: existingEntitlement, error: lookupError } = await existingQuery.maybeSingle();
  if (lookupError) {
    logger.error('Book Creator provisioning lookup failed', { buyerEmail, error: lookupError.message });
    return res.status(500).json({ success: false, error: 'Entitlement lookup failed.' });
  }

  const write = existingEntitlement
    ? client.from('product_entitlements').update(entitlement).eq('id', existingEntitlement.id)
    : client.from('product_entitlements').insert(entitlement);
  const { error: entitlementError } = await write;
  if (entitlementError) {
    logger.error('Book Creator provisioning write failed', { buyerEmail, error: entitlementError.message });
    return res.status(500).json({ success: false, error: 'Entitlement update failed.' });
  }

  logger.info('Book Creator access provisioned from verified BookMint purchase', {
    buyerEmail,
    organizationId: organization?.id || null,
    existing: !!existingEntitlement,
  });
  return res.json({
    success: true,
    accessUrl: 'https://app.bloomiestaffing.com/book-creator?purchase=success',
    accountRequired: !user,
  });
});

function extractPlanId(event) {
  const data = event?.data || {};
  return data.plan?.id
    || data.membership?.plan?.id
    || data.membership?.plan_id
    || data.plan_id
    || null;
}

function extractBuyerEmail(event) {
  const data = event?.data || {};
  return data.member?.email
    || data.user?.email
    || data.customer?.email
    || data.email
    || null;
}

function extractExternalId(event, key) {
  const data = event?.data || {};
  if (key === 'payment') return data.payment?.id || (event?.type === 'payment.succeeded' ? data.id : null);
  if (key === 'membership') return data.membership?.id || (event?.type === 'membership.activated' ? data.id : null);
  return null;
}

export async function handleWhopWebhook(req, res) {
  const secret = process.env.WHOP_BILLING_WEBHOOK_SECRET;
  if (!secret) return res.status(503).send('Webhook is not configured.');

  let event;
  try {
    // Current Whop webhook secrets use ws_; Standard Webhooks expects the
    // underlying base64 key (or a whsec_ prefix).
    const verifier = new Webhook(secret.startsWith('ws_') ? secret.slice(3) : secret);
    event = verifier.verify(req.body, {
      'webhook-id': req.headers['webhook-id'],
      'webhook-timestamp': req.headers['webhook-timestamp'],
      'webhook-signature': req.headers['webhook-signature'],
    });
  } catch (error) {
    logger.warn('Rejected Whop billing webhook', { error: error.message });
    return res.status(401).send('Invalid webhook signature.');
  }

  if (!['payment.succeeded', 'membership.activated'].includes(event?.type)) {
    return res.status(200).send('Ignored.');
  }

  const planId = extractPlanId(event);
  const organizationPlan = PLAN_ID_TO_ORG_PLAN[planId];
  const productPlan = PLAN_ID_TO_PRODUCT[planId];
  const buyerEmail = extractBuyerEmail(event)?.trim().toLowerCase();
  if ((!organizationPlan && !productPlan) || !buyerEmail) {
    logger.warn('Whop webhook missing allowlisted plan or buyer email', {
      eventType: event?.type,
      planId,
      hasEmail: !!buyerEmail,
    });
    return res.status(202).send('Not applicable.');
  }

  const client = supabase();
  const { data: organization, error: lookupError } = await client
    .from('organizations')
    .select('id, plan')
    .eq('owner_email', buyerEmail)
    .maybeSingle();
  if (lookupError) {
    logger.warn('No Bloomie tenant matched Whop buyer email', { buyerEmail, error: lookupError?.message });
    return res.status(500).send('Tenant lookup failed.');
  }

  if (productPlan) {
    const { data: user } = await client
      .from('users')
      .select('id')
      .eq('email', buyerEmail)
      .maybeSingle();
    const entitlement = {
      product_key: productPlan.productKey,
      tier: productPlan.tier || 'standard',
      status: 'active',
      organization_id: organization?.id || null,
      user_id: user?.id || null,
      buyer_email: buyerEmail,
      source: 'whop',
      external_plan_id: planId,
      external_payment_id: extractExternalId(event, 'payment'),
      external_membership_id: extractExternalId(event, 'membership'),
      external_event_id: event?.id || null,
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: { eventType: event.type },
    };
    let existingQuery = client
      .from('product_entitlements')
      .select('id')
      .eq('product_key', productPlan.productKey);
    existingQuery = organization?.id
      ? existingQuery.eq('organization_id', organization.id)
      : existingQuery.is('organization_id', null).ilike('buyer_email', buyerEmail);
    const { data: existingEntitlement } = await existingQuery.maybeSingle();
    const entitlementWrite = existingEntitlement
      ? client.from('product_entitlements').update(entitlement).eq('id', existingEntitlement.id)
      : client.from('product_entitlements').insert(entitlement);
    const { error: entitlementError } = await entitlementWrite;
    if (entitlementError) {
      logger.error('Failed to apply Whop product entitlement', {
        organizationId: organization?.id || null,
        productKey: productPlan.productKey,
        error: entitlementError.message,
      });
      return res.status(500).send('Product entitlement update failed.');
    }
    logger.info('Whop product entitlement applied', {
      organizationId: organization?.id || null,
      productKey: productPlan.productKey,
      eventType: event.type,
    });
    return res.status(200).send('OK');
  }

  if (!organization) {
    logger.warn('No Bloomie tenant matched Whop buyer email', { buyerEmail });
    return res.status(202).send('No matching tenant.');
  }

  const { error: updateError } = await client
    .from('organizations')
    .update({ plan: organizationPlan, updated_at: new Date().toISOString() })
    .eq('id', organization.id);
  if (updateError) {
    logger.error('Failed to apply Whop plan entitlement', { organizationId: organization.id, error: updateError.message });
    return res.status(500).send('Entitlement update failed.');
  }

  logger.info('Whop plan entitlement applied', {
    organizationId: organization.id,
    organizationPlan,
    eventType: event.type,
  });
  return res.status(200).send('OK');
}

export default router;
