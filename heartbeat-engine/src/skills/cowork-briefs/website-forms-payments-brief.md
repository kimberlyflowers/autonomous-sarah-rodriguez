# BLOOM Website Forms, Payments & Complete Templates
## Cowork Implementation Brief — Full Autonomous Build

**Filed by:** Claude (via Kimberly)
**Priority:** P1 — High
**Category:** Feature
**Repo:** kimberlyflowers/autonomous-sarah-rodriguez
**Branch to use:** `feature/forms-payments-templates`

---

## CONTEXT — READ THIS FIRST

Database tables already created:
- `form_submissions` ✓
- `payment_events` ✓

Key files:
- Editor:    `heartbeat-engine/dashboard/src/PageEditor.jsx`
- Templates: `heartbeat-engine/src/templates/templates-registry.js`
- Backend:   `heartbeat-engine/src/index.js` (forms/submit at line ~1029)
- Dashboard: `heartbeat-engine/dashboard/src/App.jsx`

**GOAL: Every template ships COMPLETE with working forms + payments.**

---

## PHASE 1 — Create branch

```bash
git checkout -b feature/forms-payments-templates
```
Never push to main. Kimberly reviews the PR.

---

## PHASE 2 — Backend: 4 route changes in `src/index.js`

### 2A — Update `POST /api/forms/submit` (line ~1029)

Keep all existing GHL logic. Before `res.json(...)`, add:

```js
// Write to form_submissions table
try {
  const { createClient } = await import('@supabase/supabase-js');
  const _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const orgSlug = req.body.orgSlug || req.body.org_slug || 'unknown';
  await _sb.from('form_submissions').insert({
    org_id:         orgSlug,
    form_id:        req.body.formId || null,
    form_name:      req.body.formName || req.body.form_name || 'contact',
    page_slug:      req.body.pageSlug || req.body.page_slug || null,
    email:          email || null,
    phone:          req.body.phone || null,
    first_name:     fName || null,
    last_name:      lName || null,
    fields:         { ...req.body },
    ghl_contact_id: contactId || null,
    source_url:     req.headers.referer || null,
    ip_address:     req.ip || null,
  });

  // Get count for response
  const { count } = await _sb
    .from('form_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgSlug)
    .eq('form_name', req.body.formName || 'contact');

  return res.json({
    success: true,
    contactId,
    submissionCount: count || 0,
    message: "Thank you! We'll be in touch soon."
  });
} catch (sbErr) {
  logger.warn('form_submission DB write failed (non-fatal):', sbErr.message);
}
```

### 2B — New route: `POST /api/payments/create-checkout`

Add after the OPTIONS preflight for `/api/forms/submit`:

```js
app.post('/api/payments/create-checkout', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { orgSlug, productName, amount, currency = 'usd', successUrl, cancelUrl, quantity = 1, metadata = {} } = req.body;
    if (!amount || !productName) return res.status(400).json({ success: false, error: 'amount and productName are required' });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ success: false, error: 'Stripe not configured. Add STRIPE_SECRET_KEY to Railway env vars.' });

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(stripeKey);
    const origin = req.headers.origin || process.env.APP_URL || 'https://autonomous-sarah-rodriguez-production.up.railway.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency, product_data: { name: productName }, unit_amount: Math.round(amount * 100) }, quantity }],
      mode: 'payment',
      success_url: successUrl || `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&org=${orgSlug}`,
      cancel_url:  cancelUrl  || `${origin}/payment-cancelled?org=${orgSlug}`,
      metadata: { orgSlug, ...metadata },
    });

    // Record pending payment
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
      await _sb.from('payment_events').insert({
        org_id: orgSlug || 'unknown', provider: 'stripe',
        checkout_session_id: session.id,
        amount: Math.round(amount * 100), currency,
        status: 'pending', product_name: productName, quantity, metadata,
      });
    } catch (sbErr) { logger.warn('payment_events insert failed (non-fatal):', sbErr.message); }

    logger.info('Stripe checkout session created', { sessionId: session.id, orgSlug, productName, amount });
    res.json({ success: true, checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    logger.error('create-checkout failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.options('/api/payments/create-checkout', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});
```

### 2C — New route: `POST /api/payments/webhook`

```js
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = process.env.STRIPE_WEBHOOK_SECRET
      ? stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
      : JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      await _sb.from('payment_events').update({
        status: 'completed',
        payer_email: s.customer_details?.email || null,
        payer_name:  s.customer_details?.name  || null,
        webhook_raw: s,
        updated_at: new Date().toISOString(),
      }).eq('checkout_session_id', s.id);
      logger.info('Payment completed', { sessionId: s.id, email: s.customer_details?.email });
    }

    if (event.type === 'checkout.session.expired') {
      await _sb.from('payment_events')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('checkout_session_id', event.data.object.id);
    }
  } catch (dbErr) { logger.warn('Webhook DB update failed:', dbErr.message); }

  res.json({ received: true });
});
```

### 2D — New route: `GET /api/analytics/site/:orgSlug`

```js
app.get('/api/analytics/site/:orgSlug', async (req, res) => {
  try {
    const { orgSlug } = req.params;
    const { createClient } = await import('@supabase/supabase-js');
    const _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

    const { data: submissions } = await _sb.from('form_submissions')
      .select('id, form_name, page_slug, email, first_name, last_name, created_at')
      .eq('org_id', orgSlug).order('created_at', { ascending: false }).limit(100);

    const { data: payments } = await _sb.from('payment_events')
      .select('id, product_name, amount, currency, status, payer_email, created_at')
      .eq('org_id', orgSlug).order('created_at', { ascending: false }).limit(100);

    const formCounts = {};
    (submissions || []).forEach(s => { formCounts[s.form_name] = (formCounts[s.form_name] || 0) + 1; });
    const completed = (payments || []).filter(p => p.status === 'completed');
    const revenueCents = completed.reduce((sum, p) => sum + (p.amount || 0), 0);

    res.json({
      success: true, orgSlug,
      forms: { total: (submissions||[]).length, byForm: formCounts, recent: (submissions||[]).slice(0,20) },
      payments: {
        total: (payments||[]).length, completed: completed.length,
        revenueCents, revenueFormatted: `$${(revenueCents/100).toFixed(2)}`,
        recent: (payments||[]).slice(0,20),
      },
    });
  } catch (err) {
    logger.error('analytics/site failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
app.options('/api/analytics/site/:orgSlug', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});
```

---

## PHASE 3 — Update `buildLeadForm()` in templates-registry.js (~line 201)

Replace the entire `buildLeadForm` function with:

```js
function buildLeadForm(d, orgSlug, heading = 'Get In Touch', subheading = '', formName = 'contact') {
  return `
<section class="section" id="contact" style="background:var(--primary);color:#fff">
  <div class="container text-center">
    <h2 style="font-size:clamp(1.5rem,3vw,2.2rem);font-weight:800;margin-bottom:12px">${escHtml(heading)}</h2>
    ${subheading ? `<p style="margin-bottom:24px;opacity:.85">${escHtml(subheading)}</p>` : ''}
    <div id="bloom-sub-count-${formName}" style="font-size:.85rem;opacity:.7;margin-bottom:20px"></div>
    <form class="form" id="bloom-form-${formName}" onsubmit="bloomSubmitForm(event,'${escHtml(orgSlug)}','${escHtml(formName)}')">
      <input type="text"  name="name"    placeholder="Your Name"     required>
      <input type="email" name="email"   placeholder="Email Address" required>
      <input type="tel"   name="phone"   placeholder="Phone Number">
      <textarea           name="message" placeholder="How can we help you?"></textarea>
      <button type="submit" class="btn btn-secondary" style="color:#fff;border-color:#fff">Send Message</button>
      <p id="bloom-form-msg-${formName}" style="font-size:.9rem;min-height:20px;margin-top:8px"></p>
    </form>
  </div>
</section>
<script>
if(!window.bloomSubmitForm){
async function bloomSubmitForm(e,slug,formName){
  e.preventDefault();
  var msgEl=document.getElementById('bloom-form-msg-'+formName);
  var form=e.target;
  if(msgEl){msgEl.textContent='Sending...';msgEl.style.color='rgba(255,255,255,0.8)';}
  try{
    var data=Object.fromEntries(new FormData(form).entries());
    data.orgSlug=slug;data.formName=formName;
    data.pageSlug=window.location.pathname.split('/').filter(Boolean).pop()||'home';
    var res=await fetch('/api/forms/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    var json=await res.json();
    if(json.success){
      if(msgEl){msgEl.textContent=json.message||"Thank you! We'll be in touch soon.";msgEl.style.color='#4ade80';}
      form.reset();
      if(json.submissionCount>1){var c=document.getElementById('bloom-sub-count-'+formName);if(c)c.textContent=json.submissionCount+' people have reached out';}
    }else{if(msgEl){msgEl.textContent=json.error||'Something went wrong.';msgEl.style.color='#f87171';}}
  }catch(err){if(msgEl){msgEl.textContent='Network error. Please try again.';msgEl.style.color='#f87171';}}
}
window.bloomSubmitForm=bloomSubmitForm;
}
// Load submission count on page load
(async()=>{try{var r=await fetch('/api/analytics/site/${escHtml(orgSlug)}');var j=await r.json();var cnt=j?.forms?.byForm?.['${escHtml(formName)}']||0;if(cnt>0){var el=document.getElementById('bloom-sub-count-${formName}');if(el)el.textContent=cnt+' people have already reached out';}}catch{}})();
</script>`;
}
```

---

## PHASE 4 — Add 3 new shared helpers in templates-registry.js (after buildLeadForm)

### `buildPaymentButton(d, orgSlug, productName, amount, currency, label, btnClass)`

```js
function buildPaymentButton(d, orgSlug, productName, amount, currency='usd', label='Enroll Now', btnClass='btn-primary') {
  const btnId = 'bloom-pay-'+productName.replace(/[^a-z0-9]/gi,'-').toLowerCase().slice(0,20)+'-'+Math.random().toString(36).slice(2,6);
  return `<button id="${escHtml(btnId)}" class="btn ${escHtml(btnClass)}" onclick="bloomCheckout('${escHtml(orgSlug)}','${escHtml(productName)}',${Number(amount)},'${escHtml(currency)}','${escHtml(btnId)}')">${escHtml(label)}</button>
<script>
if(!window.bloomCheckout){
async function bloomCheckout(orgSlug,productName,amount,currency,btnId){
  var btn=document.getElementById(btnId);
  if(btn){btn.disabled=true;btn.textContent='Redirecting...';}
  try{
    var res=await fetch('/api/payments/create-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orgSlug,productName,amount,currency,quantity:1})});
    var json=await res.json();
    if(json.success&&json.checkoutUrl){window.location.href=json.checkoutUrl;}
    else{alert(json.error||'Payment setup failed.');if(btn){btn.disabled=false;btn.textContent='${escHtml(label)}';}}
  }catch(err){alert('Network error.');if(btn){btn.disabled=false;btn.textContent='${escHtml(label)}';}}
}
window.bloomCheckout=bloomCheckout;
}
</script>`;
}
```

### `buildPricingSection(d, orgSlug, heading)`

```js
function buildPricingSection(d, orgSlug, heading='Choose Your Plan') {
  const tiers = d.pricingTiers || [
    { name:'Basic',    price:0,   label:'Free',  features:['Feature one','Feature two'], cta:'Get Started', free:true },
    { name:'Standard', price:97,  label:'$97',   features:['Everything in Basic','Feature three','Feature four'], cta:'Enroll Now', featured:true },
    { name:'Premium',  price:197, label:'$197',  features:['Everything in Standard','Priority support','1-on-1 session'], cta:'Go Premium' },
  ];
  return `
<section class="section" id="pricing">
  <div class="container">
    <h2 class="text-center" style="font-size:clamp(1.5rem,3vw,2rem);font-weight:800;margin-bottom:${d.pricingSubheading?'12px':'40px'}">${escHtml(heading)}</h2>
    ${d.pricingSubheading?`<p class="text-center" style="color:#666;margin-bottom:40px">${escHtml(d.pricingSubheading)}</p>`:''}
    <div class="pricing-grid">
      ${tiers.map(t=>`
        <div style="padding:32px 24px;border-radius:16px;border:${t.featured?'2px solid var(--primary)':'1px solid #e5e7eb'};background:#fff;text-align:center;position:relative">
          ${t.featured?`<div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;padding:4px 16px;border-radius:20px;font-size:.8rem;font-weight:700;white-space:nowrap">Most Popular</div>`:''}
          <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:8px">${escHtml(t.name)}</h3>
          <div style="font-size:2.5rem;font-weight:800;color:var(--primary);margin-bottom:4px">${escHtml(t.label)}</div>
          ${t.period?`<div style="font-size:.85rem;color:#888;margin-bottom:20px">${escHtml(t.period)}</div>`:'<div style="margin-bottom:20px"></div>'}
          <ul style="list-style:none;padding:0;margin:0 0 28px;text-align:left">
            ${(t.features||[]).map(f=>`<li style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:.9rem;display:flex;align-items:center;gap:8px"><span style="color:var(--primary);font-weight:700">&#10003;</span>${escHtml(f)}</li>`).join('')}
          </ul>
          ${t.free
            ?`<a href="#contact" class="btn btn-secondary" style="display:block;text-align:center">${escHtml(t.cta||'Get Started')}</a>`
            :buildPaymentButton(d, orgSlug, `${t.name} — ${escHtml(d.businessName||'BLOOM')}`, t.price, 'usd', `${t.cta||'Enroll Now'} — ${t.label}`, t.featured?'btn-primary':'btn-secondary')
          }
        </div>`).join('')}
    </div>
  </div>
</section>`;
}
```

### `buildSubmissionCounter(orgSlug, formName, label)`

```js
function buildSubmissionCounter(orgSlug, formName='contact', label='people have already signed up') {
  const id = 'bloom-counter-'+formName;
  return `<div style="text-align:center;margin:8px 0"><span id="${id}" style="font-size:.9rem;color:rgba(255,255,255,0.7)"></span></div>
<script>
(async()=>{try{var r=await fetch('/api/analytics/site/${escHtml(orgSlug)}');var j=await r.json();var c=j?.forms?.byForm?.['${escHtml(formName)}']||0;if(c>0){var el=document.getElementById('${id}');if(el)el.textContent=c+' ${escHtml(label)}';}}catch{}})();
</script>`;
}
```

---

## PHASE 5 — Update 5 templates

### T01 — Service Business
After the stats section and before `buildLeadForm`, insert:
```js
${d.pricingTiers ? buildPricingSection(d, d.orgSlug||'', d.pricingHeading||'Our Pricing') : ''}
```
Update `buildLeadForm` call to pass `'contact'` as 5th arg.

### T04 — School / Nonprofit (rename to Education)
Update `name` to `'School / Education'`.
Replace `buildLeadForm` call with:
```js
${d.pricingTiers||d.tuitionTiers ? buildPricingSection({...d, pricingTiers: d.tuitionTiers||d.pricingTiers}, d.orgSlug||'', d.tuitionHeading||'Tuition & Programs') : ''}
${buildSubmissionCounter(d.orgSlug||'', 'enrollment', 'families have applied this semester')}
${buildLeadForm(d, d.orgSlug||'', 'Apply for Enrollment', d.enrollmentSubheading||'Fill out the form and we will be in touch within 24 hours.', 'enrollment')}
```

### T11 — Event / Conference
Replace `buildLeadForm` call with:
```js
${buildPricingSection({...d, pricingTiers: d.ticketTiers||d.pricingTiers}, d.orgSlug||'', d.ticketHeading||'Event Tickets')}
${buildSubmissionCounter(d.orgSlug||'', 'registration', 'people registered')}
${buildLeadForm(d, d.orgSlug||'', d.registrationHeading||'Register Now', d.registrationSubheading||'', 'registration')}
```

### T13 — E-Commerce Brand
In the product card map, replace the static CTA with:
```js
${(p.price && p.buyable !== false)
  ? buildPaymentButton(d, d.orgSlug||'', p.name, parseFloat((p.price||'0').replace(/[^0-9.]/g,'')), 'usd', 'Buy Now — '+p.price)
  : `<a href="#contact" class="btn btn-primary">Learn More</a>`}
```

### T17 (or whichever is Membership / Community)
Find the template with `name: 'Membership / Community'`.
Replace its `buildLeadForm` call with:
```js
${buildPricingSection(d, d.orgSlug||'', d.membershipHeading||'Membership Plans')}
${buildSubmissionCounter(d.orgSlug||'', 'membership', 'members have joined')}
${buildLeadForm(d, d.orgSlug||'', 'Join the Community', d.joinSubheading||'', 'membership')}
```

---

## PHASE 6 — GrapesJS blocks in PageEditor.jsx

Inside `onEditor` callback, find the existing `editor.on('load', () => {` block and at the END of that callback (after the button trait extend code), add the 6 BLOOM blocks.

Each block needs: `label`, `category: 'BLOOM'`, `content` (HTML string), `attributes`.

**Block 1 — bloom-lead-form**
- Content: Full HTML form POSTing to `/api/forms/submit`
- Traits to expose: `orgSlug` (text), `formName` (text), `heading` (text)
- Uses `bloomSubmitForm()` inline script (guard with `if(!window.bloomSubmitForm)`)

**Block 2 — bloom-registration-form**
- Content: Form with name, email, phone, ticket type select dropdown
- Same submit handler, `formName: 'registration'`

**Block 3 — bloom-pay-button**
- Content: Single button calling `/api/payments/create-checkout`
- Traits: `orgSlug`, `productName`, `amount` (number), `currency`, `buttonLabel`
- Uses `bloomCheckout()` inline script (guard with `if(!window.bloomCheckout)`)

**Block 4 — bloom-pricing-table**
- Content: 3-column pricing grid (Free / $97 / $197) with pay buttons on paid tiers
- Traits: `orgSlug`

**Block 5 — bloom-sub-counter**
- Content: `<span>` that fetches `/api/analytics/site/ORG_SLUG` on load and shows count
- Trait: `orgSlug`, `formName`, `label`

**Block 6 — bloom-success**
- Content: Success section, hidden by default, shown when `window.location.search.includes('success')`
- Traits: `heading`, `message`, `ctaLabel`, `ctaHref`

For traits, use GrapesJS trait API:
```js
bm.add('bloom-lead-form', {
  label: 'Lead Form',
  category: 'BLOOM',
  content: { ... },
  // After placing, allow editing orgSlug via traits:
  // Define component type if needed for trait support
});
```

The simplest approach for traits: use `data-org-slug` attributes in the HTML and a `component:selected` handler that reads them. Or define a custom component type per block.

---

## PHASE 7 — Analytics panel in App.jsx

### Add state (near `pageEditor` state):
```jsx
const [analyticsPanel, setAnalyticsPanel] = React.useState(null);
```

### Add SiteAnalyticsPanel component (add near other panel components):

Full component with:
- Modal overlay
- Tabs: "Form Submissions" | "Payments"
- Summary metric cards (total, by-form, revenue)
- Recent submissions table (name, email, form, date)
- Recent payments table (product, amount, status, date)
- Fetches from `/api/analytics/site/${orgSlug}` on mount

Use `c.ac` (#F4A261), `c.a2` (#E76F8B), `c.gr` (#34A853) for metric card accents.

### Add Analytics button to HTML file cards:
Find the div with "Edit Page" and "Publish" buttons for HTML files.
Add a third button alongside them:
```jsx
<button onClick={(e) => {
  e.stopPropagation();
  const slug = currentOrg?.slug || orgId || 'unknown';
  setAnalyticsPanel({ fileId: f.fileId, orgSlug: slug });
}} style={{
  flex:1, padding:'7px 0', borderRadius:8,
  border:`1px solid ${c.ln}`, background:'transparent',
  cursor:'pointer', fontSize:11, fontWeight:700,
  color:c.so, fontFamily:'inherit'
}}>Analytics</button>
```

### Render panel near PageEditor render:
```jsx
{analyticsPanel && (
  <SiteAnalyticsPanel
    c={c}
    fileId={analyticsPanel.fileId}
    orgSlug={analyticsPanel.orgSlug}
    onClose={() => setAnalyticsPanel(null)}
  />
)}
```

---

## PHASE 8 — Add stripe to package.json

In `heartbeat-engine/package.json` dependencies:
```json
"stripe": "^14.0.0"
```

Run `npm install` in `heartbeat-engine/`.

---

## VERIFICATION CHECKLIST

- [ ] `POST /api/forms/submit` with orgSlug+formName → inserts in `form_submissions`
- [ ] `GET /api/analytics/site/a1000000` → returns forms + payments JSON
- [ ] `POST /api/payments/create-checkout` with STRIPE_SECRET_KEY set → returns checkoutUrl
- [ ] `POST /api/payments/create-checkout` WITHOUT stripe key → returns clear 500 error message
- [ ] T01 with `pricingTiers` → shows pricing section with pay buttons
- [ ] T04 → shows enrollment form with counter
- [ ] T11 → shows ticket tiers + registration form + counter
- [ ] T13 → product cards have pay buttons
- [ ] GrapesJS editor → BLOOM section visible in left panel with 6 blocks
- [ ] Analytics button on HTML file cards → opens panel with form + payment tabs

---

## IMPORTANT NOTES

1. **ORG_SLUG in blocks** — `'ORG_SLUG'` is a literal placeholder. Instruct editors (via block description) to replace it with their actual org slug. Ideal: add a trait for it.

2. **Stripe not yet configured** — `STRIPE_SECRET_KEY` must be added to Railway env vars by Kimberly after reviewing. Route handles missing key gracefully with a clear error.

3. **STRIPE_WEBHOOK_SECRET** — after Kimberly adds the webhook endpoint in Stripe Dashboard pointing to `/api/payments/webhook`, she gets the signing secret and adds `STRIPE_WEBHOOK_SECRET` to Railway.

4. **Branch only** — do NOT merge to main. Open a PR and leave it for review.

5. **Don't rebuild templates from scratch** — read each render function carefully, make surgical edits only.

6. **No emoji in SVG icons** — if adding UI elements to the analytics panel, use SVG not emoji.

---

## FILES CHANGED

| File | Change |
|------|--------|
| `src/index.js` | Update forms/submit + 3 new routes |
| `src/templates/templates-registry.js` | Update buildLeadForm + 3 new helpers + 5 template updates |
| `dashboard/src/PageEditor.jsx` | 6 BLOOM GrapesJS blocks |
| `dashboard/src/App.jsx` | SiteAnalyticsPanel + Analytics button |
| `package.json` | Add stripe dependency |

*Brief written by Claude. DB tables already created. All code patterns follow existing BLOOM conventions.*
