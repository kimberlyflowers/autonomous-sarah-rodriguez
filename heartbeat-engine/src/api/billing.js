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
  bloom_studio: {
    key: 'bloom_studio',
    name: 'Bloom Studio Pro',
    organizationPlan: null,
    productKey: 'bloom_studio',
    tier: 'video_pro',
    price: 67,
    cadence: 'one_time',
    planId: process.env.WHOP_PLAN_BLOOM_STUDIO || 'plan_JPSF3dt1MBRB2',
    description: 'Create images, characters, shorts, lip-sync videos, and motion projects in Bloom Studio.',
  },
};

const PLAN_ID_TO_ORG_PLAN = Object.fromEntries(
  Object.values(PLAN_CATALOG).filter(plan => plan.organizationPlan).map(plan => [plan.planId, plan.organizationPlan])
);
const PLAN_ID_TO_PRODUCT = Object.fromEntries(
  Object.values(PLAN_CATALOG).filter(plan => plan.productKey && plan.planId).map(plan => [plan.planId, plan])
);

// Sandbox plans are deliberately isolated from the live catalog. They are used
// only by the no-charge Whop test environment and never change production
// checkout URLs or entitlements.
const SANDBOX_PLAN_ID_TO_PRODUCT = {
  [process.env.WHOP_SANDBOX_PLAN_BLOOM_STUDIO || 'plan_I2YgEDf9p4Gt4']: {
    ...PLAN_CATALOG.bloom_studio,
    planId: process.env.WHOP_SANDBOX_PLAN_BLOOM_STUDIO || 'plan_I2YgEDf9p4Gt4',
    name: 'Bloom Studio Pro — Sandbox',
  },
  [process.env.WHOP_SANDBOX_PLAN_BOOK_CREATOR || 'plan_nyfK9e5h58hnL']: {
    ...PLAN_CATALOG.book_creator,
    planId: process.env.WHOP_SANDBOX_PLAN_BOOK_CREATOR || 'plan_nyfK9e5h58hnL',
    name: 'Bloomie Book Creator — Sandbox',
  },
};

const BLOOM_STUDIO_ACCESS_URL = 'https://app.bloomiestaffing.com/studio?purchase=success';
const BOOK_CREATOR_ACCESS_URL = 'https://app.bloomiestaffing.com/book-creator?purchase=success';

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

function clean(value, maxLength = 240) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function ghlFetch(path, options = {}) {
  const token = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) throw new Error('GHL access-email configuration is missing.');
  const response = await fetch(`https://services.leadconnectorhq.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: options.version || '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GHL ${path} failed (${response.status}): ${result?.message || result?.error || 'Unknown error'}`);
  return result;
}

async function deliverBloomStudioAccess(buyerEmail) {
  const upsert = await ghlFetch('/contacts/upsert', {
    method: 'POST',
    body: JSON.stringify({
      locationId: process.env.GHL_LOCATION_ID,
      email: buyerEmail,
      source: 'Bloom Studio Whop Purchase',
      tags: ['bloom-studio', 'bloom-studio-customer', 'bloom-studio-access-delivered'],
    }),
  });
  const contactId = upsert?.contact?.id || upsert?.id;
  if (!contactId) throw new Error('GHL contact upsert returned no contact ID.');

  const safeEmail = escapeHtml(clean(buyerEmail));
  await ghlFetch('/conversations/messages', {
    method: 'POST',
    version: '2021-04-15',
    body: JSON.stringify({
      type: 'Email',
      contactId,
      subject: 'Your Bloom Studio access is ready',
      emailFrom: 'Bloom Studio <kimberly@bloomiestaffing.com>',
      emailReplyTo: 'kimberly@bloomiestaffing.com',
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#f5f5f5;line-height:1.65;background:#17151c;padding:34px;border-radius:18px"><div style="display:inline-block;background:linear-gradient(100deg,#ff995f,#ed6f92);color:#241721;font-weight:800;padding:8px 12px;border-radius:8px">BLOOM STUDIO</div><h1 style="font-size:30px;line-height:1.15;color:#fff;margin:22px 0 12px">Your creative studio is ready</h1><p>Your $67 Bloom Studio Pro purchase is confirmed and access has been activated for <strong>${safeEmail}</strong>.</p><p>For security, we do not email temporary passwords. Click below and create your password with the same email address used at checkout. If you already have a Bloomie account with this email, simply sign in.</p><p style="margin:28px 0"><a href="${BLOOM_STUDIO_ACCESS_URL}" style="display:inline-block;background:linear-gradient(100deg,#ff995f,#ed6f92);color:#241721;text-decoration:none;font-weight:800;padding:15px 24px;border-radius:10px">CREATE MY PASSWORD &amp; OPEN BLOOM STUDIO</a></p><p>Inside Bloom Studio you can create images, characters, shorts, lip-sync videos, voice, and motion projects—or ask your Bloomie to produce them for you.</p><p style="font-size:13px;color:#b7b0bc">If the button does not open, copy this link into your browser:<br><a style="color:#ff9c77" href="${BLOOM_STUDIO_ACCESS_URL}">${BLOOM_STUDIO_ACCESS_URL}</a></p><p>Welcome to Bloom Studio,<br>Kimberly Flowers<br>Bloomie Staffing</p></div>`,
    }),
  });
  return contactId;
}

async function deliverBookCreatorAccess(buyerEmail) {
  const upsert = await ghlFetch('/contacts/upsert', {
    method: 'POST',
    body: JSON.stringify({
      locationId: process.env.GHL_LOCATION_ID,
      email: buyerEmail,
      source: 'BookMint Whop Purchase',
      tags: ['bookmint', 'book-creator-customer', 'book-creator-access-delivered'],
    }),
  });
  const contactId = upsert?.contact?.id || upsert?.id;
  if (!contactId) throw new Error('GHL contact upsert returned no contact ID.');

  const safeEmail = escapeHtml(clean(buyerEmail));
  await ghlFetch('/conversations/messages', {
    method: 'POST',
    version: '2021-04-15',
    body: JSON.stringify({
      type: 'Email',
      contactId,
      subject: 'Your BookMint access is ready',
      emailFrom: 'BookMint <kimberly@bloomiestaffing.com>',
      emailReplyTo: 'kimberly@bloomiestaffing.com',
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#2b1d25;line-height:1.65;background:#fff8f1;padding:34px;border-radius:18px"><div style="display:inline-block;background:linear-gradient(100deg,#f0c7ad,#d98b79);color:#321b26;font-weight:800;padding:8px 12px;border-radius:8px">BOOKMINT</div><h1 style="font-size:30px;line-height:1.15;color:#321b26;margin:22px 0 12px">Your book studio is ready</h1><p>Your BookMint purchase is confirmed and access has been activated for <strong>${safeEmail}</strong>.</p><p>For security, we do not email temporary passwords. Click below and create your password with the same email address used at checkout. If you already have a Bloomie account with this email, simply sign in.</p><p style="margin:28px 0"><a href="${BOOK_CREATOR_ACCESS_URL}" style="display:inline-block;background:linear-gradient(100deg,#d98b79,#8b4e61);color:#fff;text-decoration:none;font-weight:800;padding:15px 24px;border-radius:10px">CREATE MY PASSWORD &amp; OPEN BOOKMINT</a></p><p>Inside BookMint you can build, revise, preview, and export your complete book project.</p><p style="font-size:13px;color:#715b62">If the button does not open, copy this link into your browser:<br><a style="color:#8b4e61" href="${BOOK_CREATOR_ACCESS_URL}">${BOOK_CREATOR_ACCESS_URL}</a></p><p>Welcome to BookMint,<br>Kimberly Flowers<br>Bloomie Staffing</p></div>`,
    }),
  });
  return contactId;
}

export async function prepareHostedCheckout(organizationId, targetPlan) {
  const plan = PLAN_CATALOG[targetPlan];
  if (!plan) return { success: false, error: 'Choose part_time, full_time, book_creator, or bloom_studio.' };
  if (!plan.planId) return { success: false, error: `${plan.name} checkout is not configured yet.` };
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
    || data.payment?.plan?.id
    || data.payment?.plan_id
    || data.membership?.plan?.id
    || data.membership?.plan_id
    || data.plan_id
    || null;
}

function extractBuyerEmail(event) {
  const data = event?.data || {};
  return data.member?.email
    || data.payment?.member?.email
    || data.payment?.member?.user?.email
    || data.payment?.user?.email
    || data.payment?.customer_email
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

export async function handleWhopWebhook(
  req,
  res,
  secretOverride = process.env.WHOP_BILLING_WEBHOOK_SECRET,
  productMapOverride = PLAN_ID_TO_PRODUCT,
) {
  const secret = secretOverride;
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
  const productPlan = productMapOverride[planId];
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
      .select('id, metadata')
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
    if (['bloom_studio', 'book_creator'].includes(productPlan.productKey) && event.type === 'payment.succeeded' && !existingEntitlement?.metadata?.accessEmailSent) {
      try {
        const contactId = productPlan.productKey === 'bloom_studio'
          ? await deliverBloomStudioAccess(buyerEmail)
          : await deliverBookCreatorAccess(buyerEmail);
        const emailMetadata = { ...(entitlement.metadata || {}), accessEmailSent: true, accessEmailSentAt: new Date().toISOString(), contactId };
        let emailUpdate = client
          .from('product_entitlements')
          .update({ metadata: emailMetadata, updated_at: new Date().toISOString() })
          .eq('product_key', productPlan.productKey);
        emailUpdate = organization?.id
          ? emailUpdate.eq('organization_id', organization.id)
          : emailUpdate.is('organization_id', null).ilike('buyer_email', buyerEmail);
        const { error: emailMetadataError } = await emailUpdate;
        if (emailMetadataError) throw new Error(`Could not record access-email delivery: ${emailMetadataError.message}`);
      } catch (error) {
        logger.error('Bloom Studio access email failed', { buyerEmail, error: error.message });
        return res.status(502).send('Bloom Studio access email failed.');
      }
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

export async function handleWhopSandboxWebhook(req, res) {
  return handleWhopWebhook(
    req,
    res,
    process.env.WHOP_BILLING_SANDBOX_WEBHOOK_SECRET,
    SANDBOX_PLAN_ID_TO_PRODUCT,
  );
}

export default router;
