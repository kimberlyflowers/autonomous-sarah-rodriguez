import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const billingSource = fs.readFileSync(new URL('../src/api/billing.js', import.meta.url), 'utf8');
const chatSource = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const loginSource = fs.readFileSync(new URL('../dashboard/src/Login.jsx', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../dashboard/src/main.jsx', import.meta.url), 'utf8');

test('Whop plan IDs are allowlisted and hosted checkout is user-approved', () => {
  assert.match(billingSource, /plan_tVPJ5E6YjVrHB/);
  assert.match(billingSource, /plan_n9PvSqVdstxh9/);
  assert.match(billingSource, /plan_SfN6obHBORCwM/);
  assert.match(billingSource, /plan_wAW1COKDgRNWm/);
  assert.match(billingSource, /WHOP_PLAN_BOOK_CREATOR_BOOSTER/);
  assert.match(billingSource, /requiresUserAction: true/);
  assert.match(billingSource, /https:\/\/whop\.com\/checkout\//);
});

test('Whop webhook is verified before entitlement changes', () => {
  assert.match(billingSource, /new Webhook\(secret\.startsWith\('ws_'\)/);
  assert.match(billingSource, /secret\.startsWith\('ws_'\) \? secret\.slice\(3\) : secret/);
  assert.match(billingSource, /verifier\.verify\(req\.body/);
  assert.match(billingSource, /\['payment\.succeeded', 'membership\.activated'\]/);
  assert.match(billingSource, /PLAN_ID_TO_ORG_PLAN\[planId\]/);
  assert.match(billingSource, /PLAN_ID_TO_PRODUCT\[planId\]/);
  assert.match(billingSource, /\.from\('product_entitlements'\)/);
  assert.match(indexSource, /express\.raw\(\{ type: 'application\/json' \}\)/);
  assert.ok(indexSource.indexOf("app.post('/api/billing/webhook'") < indexSource.indexOf("app.use(express.json"));
});

test('Book Creator is a one-time Whop product entitlement, not a tenant plan upgrade', () => {
  assert.match(billingSource, /key: 'book_creator'/);
  assert.match(billingSource, /productKey: 'book_creator'/);
  assert.match(billingSource, /key: 'book_creator_booster'/);
  assert.match(billingSource, /tier: 'booster'/);
  assert.match(billingSource, /cadence: 'one_time'/);
  assert.match(billingSource, /organizationPlan: null/);
  assert.match(loginSource, /Get Book Creator — \$37 once/);
  assert.match(loginSource, /data-whop-checkout-plan-id="plan_SfN6obHBORCwM"/);
  assert.match(mainSource, /\/book-creator\/checkout/);
  assert.match(mainSource, /initialBookCheckout/);
});

test('Bloom Studio is a standalone one-time Whop entitlement with its own login route', () => {
  assert.match(billingSource, /key: 'bloom_studio'/);
  assert.match(billingSource, /productKey: 'bloom_studio'/);
  assert.match(billingSource, /WHOP_PLAN_BLOOM_STUDIO/);
  assert.match(billingSource, /tier: 'video_pro'/);
  assert.match(billingSource, /price: 67/);
  assert.match(mainSource, /\/studio/);
  assert.match(loginSource, /BLOOM STUDIO/);
  assert.match(loginSource, /Create password & open Bloom Studio/);
});

test('Verified BookMint purchases can provision access and new buyers create their own password', () => {
  assert.match(billingSource, /router\.post\('\/provision-book-creator'/);
  assert.match(billingSource, /BOOK_CREATOR_PROVISIONING_SECRET/);
  assert.match(billingSource, /timingSafeEqual/);
  assert.match(billingSource, /verified_bookmint_bridge/);
  assert.match(loginSource, /Purchase confirmed\. Create your password/);
  assert.match(loginSource, /Create password & open Book Creator/);
  assert.match(loginSource, /isBookCreator \? 'BookMint'/);
});

test('Bloomies can prepare but cannot auto-charge an upgrade', () => {
  assert.match(chatSource, /name: "billing_prepare_upgrade"/);
  assert.match(chatSource, /This never charges automatically/);
  assert.match(chatSource, /prepareHostedCheckout\(resolvedOrgId, toolInput\.plan\)/);
});
