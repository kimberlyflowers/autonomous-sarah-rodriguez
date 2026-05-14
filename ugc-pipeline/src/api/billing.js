const express = require('express');

const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const Stripe = require('stripe');
  return new Stripe(key, { apiVersion: '2026-02-25.clover' });
}

function getBaseUrl(req) {
  return process.env.PUBLIC_APP_URL
    || `${req.protocol}://${req.get('host')}`;
}

function getBillingConfig() {
  const priceId = process.env.STRIPE_UGC_PRICE_ID;
  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
  return {
    planName: process.env.UGC_PLAN_NAME || 'Bloom Studio Creator',
    amountMonthly: Number(process.env.UGC_PLAN_AMOUNT_MONTHLY || 99),
    currency: 'usd',
    interval: 'month',
    mode: stripeConfigured ? 'test-ready' : 'setup',
    stripeConfigured,
    priceConfigured: !!priceId,
    publishableKeyConfigured: !!process.env.STRIPE_PUBLISHABLE_KEY
  };
}

router.get('/config', (req, res) => {
  res.json(getBillingConfig());
});

router.post('/checkout', async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({
        error: 'Stripe is not configured yet.',
        detail: 'Add STRIPE_SECRET_KEY and either STRIPE_UGC_PRICE_ID or allow this endpoint to create a $99/mo test subscription price.'
      });
    }

    const config = getBillingConfig();
    let lineItem;

    if (process.env.STRIPE_UGC_PRICE_ID) {
      lineItem = { price: process.env.STRIPE_UGC_PRICE_ID, quantity: 1 };
    } else {
      lineItem = {
        price_data: {
          currency: config.currency,
          unit_amount: config.amountMonthly * 100,
          recurring: { interval: config.interval },
          product_data: {
            name: config.planName,
            description: 'Monthly access to Bloom Studio lip-sync and UGC video creation tools.'
          }
        },
        quantity: 1
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [lineItem],
      success_url: `${getBaseUrl(req)}/?billing=success`,
      cancel_url: `${getBaseUrl(req)}/?billing=cancelled`,
      client_reference_id: req.tenant.id || req.tenant.slug,
      metadata: {
        tenant_id: req.tenant.id || '',
        tenant_slug: req.tenant.slug || req.tenant.id || '',
        service: 'ugc-studio'
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/portal', async (req, res) => {
  res.status(400).json({
    error: 'Billing portal is not connected yet.',
    detail: 'Once subscriptions store Stripe customer IDs on ugc_tenants, this endpoint can create Stripe customer portal sessions.'
  });
});

module.exports = router;
