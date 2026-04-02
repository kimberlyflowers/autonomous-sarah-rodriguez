---
name: website-creation
description: Build professional, conversion-optimized websites and landing pages that look like they cost $5,000+. Handles the FULL pipeline — brand kit styling, AI image generation, mobile-first HTML, multi-page linking, CRM forms, and publishing. Use for ANY website request including landing pages, marketing sites, event pages, conference sites, portfolio sites, business sites, sales pages, or any web presence. Triggers on keywords like website, landing page, web page, site, homepage, online presence, web design, event site, conference, build a site, add a page, edit my website. CRITICAL: EVERY website must be mobile responsive and have CRM-connected forms - NO EXCEPTIONS EVER.
---

# Professional Website Creation

**MISSION:** Build conversion-focused, mobile-first websites with brand kit styling, real AI-generated images, CRM-connected forms, multi-page support, and 2026 design trends.

---

## MANDATORY PRE-BUILD GATE — NO EXCEPTIONS

**You MUST collect all required information via bloom_clarify BEFORE writing any code, generating images, or calling create_artifact. This is a hard rule with zero exceptions.**

### The 8 things you MUST know before building:
1. **Brand** — Which brand/business is this website for?
2. **Purpose** — What should the website do for the business? (capture leads, sell products, get registrations, share info)
3. **Pages** — How many pages and what are they?
4. **CTA** — What is the single primary call to action?
5. **Colors** — Should the site follow the brand kit colors, or does the user have a different palette?
6. **Domain** — Does the user have an existing domain to connect, or is this a standalone new site?
7. **Content source** — Does the user have existing content/copy to include, or should you write it based on what you know about the business?
8. **Real details** — Actual text: business name, event name, dates, speaker names, prices, contact info. NOT placeholders.

### Discovery Flow — call bloom_clarify for each missing piece (one question at a time):

**Question 1 — Brand:**
Options: "Use my brand kit on file", "This is for a different brand (I'll describe)", "I don't have a brand yet — suggest something"
Context: "Which brand or business is this website for? I want to make sure I use the right name, logo, and identity."

**Question 2 — What should the website do for your business?**
Options: "Capture leads & sign-ups", "Sell products or services", "Get event registrations", "Share info about the business", "Other (I'll describe)"
Context: "What's the main job of this website? This helps me structure the layout, messaging, and calls to action."

**Question 3 — Pages needed:**
Options: "Just one page (landing page)", "Homepage + About", "Homepage + About + Details page", "Full site (Home, About, Services, Contact)"

**Question 4 — Call to action:**
Options: "Register / Sign Up", "Book a consultation", "Buy now / Shop", "Contact us", "No CTA needed"

**Question 5 — Color scheme:**
Options: "Use my brand kit colors", "I have specific colors in mind (I'll share them)", "Surprise me — pick something that fits", "Match colors from a reference site or image"
Context: "Should I follow your brand kit color scheme, or do you have a different palette in mind for this site?"

**Question 6 — Domain & hosting:**
Options: "I have a domain — connect it", "This is a new standalone site (no domain yet)", "Add this as a page on my existing site", "I'm not sure yet — just build it first"
Context: "Do you have an existing domain name you want this site connected to, or should this be its own new site?"

**Question 7 — Content source:**
Options: "I have content/copy to provide — I'll paste or upload it", "Write the copy for me based on what you know about my business", "I'll give you bullet points and you polish them", "Use content from my existing site/materials"
Context: "Do you have written content you'd like included, or should I write the copy for you?"

**Question 8 — Real details (FREE TEXT — do not use buttons):**
Ask: "Give me the real details that should appear on this site — business name, tagline, services offered, pricing, contact info, team names, event dates, or any key information. I won't use placeholders — everything on the site will be real."

### HARD STOP RULE:
Do NOT call `image_generate`, `create_artifact`, or write any HTML until ALL 8 are answered.
If the user says "just build it" or "use your judgment" on content — ask one more time:
"I want the site to be accurate and on-brand. What are the real details? (business name, services, pricing, contact, etc.)"

### SKIP LOGIC — be smart, don't re-ask what you already know:
- If the user already named the brand in their request → skip Question 1
- If the user described the purpose clearly → skip Question 2
- If you already have their brand kit loaded → skip Question 5 (but confirm you'll use it)
- If the user pasted content in their message → skip Question 7
- Combine related questions if the user is giving detailed answers
- NEVER ask more than one bloom_clarify at a time — wait for each answer before asking the next

---

## CRITICAL RULES (NON-NEGOTIABLE)

### Rule #0: EDITING VS NEW CREATION
**When the user asks to MODIFY an existing website, DO NOT create a new one from scratch.**

**Signs the user wants to EDIT:**
- "Change the hero image to..."
- "Make the text bigger"
- "Update the contact form"
- "Fix the mobile layout"
- "Add a new section about..."
- "Change the colors to..."

**What to do:**
1. Call get_session_files to retrieve the existing HTML
2. READ the HTML carefully to find the EXACT strings to change
3. Call edit_artifact with precise find→replace operations
4. NEVER call create_artifact with the same filename (that rebuilds from scratch)

**Signs the user wants a NEW website:**
- "Create a website for..."
- "Build me a landing page..."
- "Make a site for my business"
- No mention of existing website

### Rule #1: MOBILE RESPONSIVE - ZERO TOLERANCE
**EVERY SINGLE WEBSITE MUST BE MOBILE RESPONSIVE. NO EXCEPTIONS.**

Required mobile specs:
- `<meta name="viewport" content="width=device-width,initial-scale=1">` in `<head>`
- Works perfectly at 375px width (iPhone SE)
- Breakpoint at 768px: multi-column layouts → single column
- Touch targets minimum 44px × 44px
- No horizontal scroll at any width
- Text readable without zooming
- Images scale proportionally

### Rule #2: GENERATE REAL IMAGES
**ALWAYS use `image_generate` tool for hero images and key visuals.**

Before writing ANY HTML, generate images for:
- Hero sections (primary visual)
- Feature showcases
- About/team sections
- Testimonial backgrounds

Workflow:
1. Call `image_generate` FIRST for each image needed
2. Tool returns `image_url` (e.g., `/api/files/preview/art_12345`)
3. Use URL in HTML: `<img src="/api/files/preview/art_12345" alt="...">`
4. THEN create the HTML artifact with all URLs embedded
5. NEVER embed base64 in HTML — it breaks layouts and bloats files
6. NEVER use placeholder images (via.placeholder.com, placehold.it, unsplash random)

### Rule #3: CRM FORMS ON EVERY SITE
**EVERY website MUST have at least one form connected to `/api/forms/submit`.**
See FORMS section below. No exceptions.

### Rule #4: THE 3-SECOND TEST
Visitor decides in 3 seconds whether to stay or bounce.
Must be instantly clear:
1. What is this? (value proposition)
2. Who is it for? (target audience)
3. What action to take? (single CTA)

---

## BRAND KIT APPLICATION

Pull colors and fonts from the loaded brand kit:

- **Primary color (60%)** → Navigation background, hero section, headings, footer background
- **Secondary color (30%)** → Buttons, accent borders, section backgrounds (alternating)
- **Accent color (10%)** → CTA buttons, hover states, badges, highlights
- **Dark color** → Body text, footer text
- **Light color** → Page background, card backgrounds, section alternates
- **Heading font** → h1, h2, h3, navigation links
- **Body font** → Paragraphs, list items, form labels (16px minimum base size)

Map brand kit to CSS variables:
```css
:root {
  --color-primary: /* from brand kit primary */;
  --color-secondary: /* from brand kit secondary */;
  --color-accent: /* from brand kit accent */;
  --color-dark: /* from brand kit dark */;
  --color-light: /* from brand kit light */;
  --font-heading: /* from brand kit heading font */;
  --font-body: /* from brand kit body font */;
}
```

If NO brand kit exists, choose palette based on industry:
- **Tech/SaaS:** Bold modern (blues, purples, neon accents)
- **Corporate/Finance:** Professional (navy, forest, gray + orange)
- **Creative/Agency:** Experimental (break rules, asymmetric)
- **E-commerce:** Product-forward (match product aesthetic)
- **Non-profit/Education:** Warm, hopeful (earth tones, deep blues)
- **Local Business:** Approachable (warm or clean professional)

---

## DESIGN FRAMEWORK

### Visual Hierarchy
1. **Hero Headline** — Largest, boldest: clamp(2.5rem, 5vw, 4.5rem)
2. **Hero CTA** — Prominent button, sticky in nav
3. **Hero Image** — Full-width, immersive, edge-to-edge
4. **Supporting Sections** — Scannable content
5. **Social Proof** — Near CTA
6. **Footer** — Contact/links

### Typography Rules
**Maximum 2-3 fonts** from Google Fonts:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Font:wght@400;700&display=swap" rel="stylesheet">
```

Size hierarchy:
- H1 (Hero): clamp(2.5rem, 5vw, 4.5rem)
- H2: clamp(1.8rem, 3vw, 2.5rem)
- H3: clamp(1.3rem, 2vw, 1.8rem)
- Body: clamp(1rem, 1.5vw, 1.15rem)

**Never use:** Arial, Helvetica, Times New Roman, system defaults
**Contrast:** WCAG AA minimum (4.5:1 for body, 3:1 for headings)

### Whitespace
- Generous padding between sections: clamp(3rem, 8vw, 6rem)
- Don't crowd content — let it breathe
- Asymmetric layouts create visual interest

---

## IMAGE GENERATION GUIDE

### Image Prompting — 6-Element Framework

1. **Subject** — Who/what (specific details)
2. **Composition** — Camera angle, framing, perspective
3. **Action** — What's happening
4. **Location** — Setting, environment, background
5. **Style** — Photography style, mood, aesthetic
6. **Technical** — Lighting, camera specs, quality

**Example prompt:**
```
Professional conference hero image for women's leadership summit.
SUBJECT: Diverse group of professional women in business attire standing confidently on a modern stage. Seven women of varying ethnicities, ages 30-50, wearing colorful blazers.
COMPOSITION: Wide-angle shot, low angle looking up to convey power. Centered with stage lights creating dramatic atmosphere.
ACTION: Women standing in powerful poses, looking directly at camera.
LOCATION: Modern conference stage with professional lighting and subtle geometric backdrop.
STYLE: Professional photography, editorial quality. Empowering, aspirational mood.
TECHNICAL: Shot with 35mm lens, dramatic stage lighting with rim lights. Sharp focus, slight depth of field.
```

**For photorealistic images:**
- Camera language: "35mm lens", "shallow depth of field", "golden hour lighting"
- Lighting: "studio softbox", "natural window light", "dramatic rim lighting"
- Composition: "rule of thirds", "low-angle perspective", "bird's eye view"

### Aspect Ratios
- Hero images: 1536x1024 (landscape) — ALWAYS landscape for heroes
- Feature images: 1024x1024 (square)
- Tall sections/profiles: 1024x1536 (portrait)
- CRITICAL: Match uploaded reference image aspect ratios

### Multi-Character Consistency
When a project has MULTIPLE characters:
- Use `no_reference: true` when creating a NEW character
- Use `reference_image_url` with the SPECIFIC character's URL when re-generating them
- Track each character's image URL: "Marcus = [url1], Emma = [url2]"
- For group shots: use primary character as reference, describe others in detail in prompt

---

## WEBSITE STRUCTURE PATTERNS

### Conference/Event Sites
1. **Hero** — Event name, date, location, Register CTA, full-width hero image
2. **What to Expect** — 3-4 key benefits
3. **Speakers** — Grid of headshots + bios
4. **Schedule** — Filterable or tabbed by day
5. **Social Proof** — Testimonials, attendance numbers
6. **Registration** — CRM-connected form (name, email, ticket type)
7. **Footer** — Contact, social, copyright

### Business/Agency Sites
1. **Hero** — Value prop + CTA + visual
2. **Client Logos** — "Trusted by..."
3. **Services/Features** — Card grid or bento layout
4. **Case Studies** — Before/after, specific results
5. **About/Team** — Build trust
6. **Contact** — CRM-connected form
7. **Footer**

### E-commerce/Product Sites
1. **Hero** — Product image + "Shop Now"
2. **Product Grid** — Lifestyle photography
3. **Social Proof** — Reviews, star ratings
4. **Benefits** — Why buy?
5. **Checkout** — GHL order form or lead capture form

### Portfolio/Creator Sites
1. **Hero** — Name/face + what you do
2. **Work Showcase** — Portfolio grid
3. **About Story** — Personal narrative
4. **Testimonials** — Client feedback
5. **Contact/Book** — CRM-connected form

---

## TECHNICAL STANDARDS

### HTML Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Business Name] — [Page Title]</title>
  <meta name="description" content="[SEO description]">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=[Heading+Font]:wght@400;700&family=[Body+Font]&display=swap" rel="stylesheet">
  <style>/* ALL CSS INLINE */</style>
</head>
<body>
  <nav><!-- Sticky nav with CTA --></nav>
  <section class="hero"><!-- Full-width hero --></section>
  <section><!-- Content sections --></section>
  <section><!-- CRM-connected form --></section>
  <footer><!-- Footer --></footer>
  <script>/* ALL JAVASCRIPT INLINE — including form handler */</script>
</body>
</html>
```

### CSS Essentials

**Responsive Grid:**
```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}
@media (max-width: 768px) {
  .grid { grid-template-columns: 1fr; }
}
```

**Sticky Navigation:**
```css
.nav {
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 1000;
  transition: all 0.3s;
}
.nav.scrolled {
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(20px);
  box-shadow: 0 1px 20px rgba(0,0,0,0.05);
}
```

**Mobile Hamburger:**
```css
.hamburger { display: none; }
@media (max-width: 768px) {
  .hamburger { display: block; }
  .nav-links { display: none; }
  .nav-links.active { display: flex; flex-direction: column; }
}
```

**Full-Width Hero:**
```css
.hero {
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  position: relative;
}
```

### Animations (Enhance, Don't Distract)

**Scroll-triggered fade-in:**
```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
```

**Hover effects:**
```css
.card {
  transition: transform 0.3s, box-shadow 0.3s;
}
.card:hover {
  transform: translateY(-6px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.15);
}
```

---

## SECTION TEMPLATES

**Hero Section:**
```html
<section class="hero">
  <img src="/api/files/preview/art_12345" alt="Hero" class="hero-bg">
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <h1>Headline</h1>
    <p>Subheading with value proposition</p>
    <a href="#contact" class="btn-primary">Get Started</a>
  </div>
</section>
```
- Full-width background, large heading (48-64px desktop, 28-36px mobile)
- CTA button using accent color with hover state

**About Section:**
- Two-column layout: image left, text right (stack on mobile)
- Brief business story or mission

**Services/Features — Bento Grid:**
```html
<div class="bento-grid">
  <div class="bento-item large"><h3>Feature 1</h3><p>Description</p></div>
  <div class="bento-item"><h3>Feature 2</h3></div>
  <div class="bento-item"><h3>Feature 3</h3></div>
</div>
```

**Testimonials:**
```html
<section class="social-proof">
  <div class="testimonial">
    <p class="quote">"This changed everything..."</p>
    <p class="author">— Jane Doe, CEO</p>
  </div>
  <div class="stats">
    <strong>10,000+</strong><span>Happy Users</span>
  </div>
</section>
```

**Contact Section:**
- CRM-connected form (see FORMS section below)
- Business address, phone, email alongside the form
- Map embed or business hours

**Checkout / Payment Section (if applicable):**
- Check for existing GHL order forms using `ghl_list_forms`
- If GHL order form exists: embed via iframe
- If not: create lead capture form tagged "checkout-lead" + "payment-pending"
- Include order summary, pricing, trust badges

**Footer:**
- Brand logo or name
- Navigation links to all pages
- Social media icons (SVG, not emoji)
- Copyright with current year

---

## FORMS — AUTOMATIC CRM INTEGRATION (MANDATORY)

**EVERY website MUST have forms that send leads directly to BLOOM CRM (GoHighLevel).**
This is NON-NEGOTIABLE. When someone fills out a form on a Bloomie-created site, that person
must automatically become a contact in GHL. No exceptions.

### How It Works
All forms POST to `/api/forms/submit` (same domain as the published site). The endpoint:
- Creates a GHL contact with name, email, phone
- Tags them as "website-lead" (or custom tags)
- Sets the source to the page title so the user knows which site generated the lead
- Adds message/extra fields as a note on the contact

### REQUIRED JavaScript Pattern — Use in ALL Websites

```html
<form id="contact-form" onsubmit="handleSubmit(event)">
  <input type="text" name="name" placeholder="Your Name" required />
  <input type="email" name="email" placeholder="Your Email" required />
  <input type="tel" name="phone" placeholder="Phone (optional)" />
  <textarea name="message" placeholder="Tell us about your project..." required></textarea>
  <button type="submit">Get Started</button>
</form>
<script>
async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const origText = btn.textContent;
  btn.textContent = 'Sending...';
  btn.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    data.source = document.title + ' — Contact Form';
    data.tags = ['website-lead'];
    const res = await fetch('/api/forms/submit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      form.innerHTML = '<div style="text-align:center;padding:40px 20px"><h3 style="color:#27ae60">Thank you!</h3><p>We will be in touch soon.</p></div>';
    } else { btn.textContent = 'Try Again'; btn.disabled = false; }
  } catch { btn.textContent = 'Try Again'; btn.disabled = false; }
}
</script>
```

### Form Types (adjust fields and tags)
- **Contact form**: name, email, phone, message → tags: ["website-lead"]
- **Book a Demo**: name, email, phone, company, dropdown → tags: ["demo-lead"]
- **Sign Up**: name, email, phone → tags: ["signup-lead"]
- **Get a Quote**: name, email, phone, service type, message → tags: ["quote-request"]
- **Newsletter**: email only → tags: ["newsletter"]

### Calendar / Booking Widgets (Schedule a Demo, Book a Call, etc.)
When the user wants visitors to schedule a meeting, demo, or call:
1. Call `ghl_list_calendars` to find the right calendar
2. Use the calendar's `widgetSlug` to build the embed URL
3. Embed via iframe: `<iframe src="https://api.leadconnectorhq.com/widget/booking/{widgetSlug}" style="width:100%;min-height:700px;border:none;" scrolling="no"></iframe>`
4. This is a REAL GHL booking widget — visitors pick a time slot and book directly into the CRM calendar
5. DO NOT create a fake/mock form that pretends to book — ALWAYS use the real GHL calendar iframe
6. If no calendar exists, tell the user they need to create one in GHL first

**Example:** If `ghl_list_calendars` returns `widgetSlug: "rpldemo"`, embed:
```html
<iframe src="https://api.leadconnectorhq.com/widget/booking/rpldemo" style="width:100%;min-height:700px;border:none;" scrolling="no" title="Schedule a Demo"></iframe>
```

### GHL Form Widgets (Embed CRM Forms)
When the user asks to embed a CRM form (not a calendar):
1. Call `ghl_list_forms` to find existing forms
2. Embed via iframe: `<iframe src="https://api.leadconnectorhq.com/widget/form/{formId}" style="width:100%;min-height:600px;border:none;" scrolling="no"></iframe>`

### Checkout / Payment Forms
1. Call `ghl_list_forms` to check for existing GHL order forms
2. If found: embed via iframe → `<iframe src="https://api.leadconnectorhq.com/widget/form/{formId}" style="width:100%;min-height:600px;border:none;" scrolling="no"></iframe>`
3. If not found: create lead-capture form tagged "checkout-lead" + "payment-pending"

### IMPORTANT: Form Hosting Reality
Websites created as HTML artifacts are hosted on Supabase storage — NOT on the Railway server.
The `/api/forms/submit` endpoint only works on sites published to the Railway domain.
For artifact websites, ALWAYS prefer embedding real GHL widgets (calendar iframe, form iframe) which work on ANY domain.
If you must use a custom form on an artifact site, the form action must point to the full Railway URL:
`https://autonomous-sarah-rodriguez-production.up.railway.app/api/forms/submit`

### Form Rules
1. EVERY website = at least one CRM-connected form or embedded GHL widget
2. For artifact sites: prefer GHL iframe widgets (they work on any domain)
3. For Railway-hosted sites: use `/api/forms/submit`
4. For artifact sites with custom forms: use the full Railway URL as action
5. Always include `data.source = document.title` so leads are traceable
6. Show success message after submission (replace form with thank you)
7. Style forms to match brand kit (colors, fonts, border-radius)
8. Full-width inputs on mobile
9. NEVER create forms that don't connect to the CRM
10. NEVER create mock/fake booking forms — use real GHL calendar iframe

---

## MULTI-PAGE WEBSITES

### Creating Additional Pages
1. Use `create_artifact` for each new page
2. Use `get_site_pages` to retrieve all existing pages for the site
3. Update navigation on ALL pages to include links to every page using `edit_artifact`
4. Maintain consistent header/footer/navigation across all pages
5. Each page shares the same brand kit styling and CSS variables

### Navigation Linking
All pages must have identical navigation linking to every page:
```html
<nav>
  <a href="/p/business-name">Home</a>
  <a href="/p/business-name-about">About</a>
  <a href="/p/business-name-services">Services</a>
  <a href="/p/business-name-contact">Contact</a>
</nav>
```
Use `get_site_pages` to get correct slugs. Never hardcode or guess slugs.

### Editing Existing Pages
1. Call `get_session_files` to retrieve existing HTML
2. For small changes (text, links, CSS): use `edit_artifact` with find-and-replace or CSS-targeted mode
3. For large changes (adding/removing sections, restructuring): use `edit_artifact` with `fullRewrite` mode — pass the complete updated HTML as the `fullRewrite` parameter. This replaces the entire file and is much more reliable than find-and-replace for major changes.
4. If find-and-replace fails TWICE, immediately switch to `fullRewrite` mode — do NOT keep retrying find-and-replace.
5. If edit affects navigation (adding/removing pages), update ALL pages
6. NEVER change things the user didn't ask to change

---

## CONVERSION PRINCIPLES

### Single Primary CTA
- ONE action per page (register, buy, book, download)
- Sticky nav keeps CTA visible
- Repeated at logical points (hero, after social proof, footer)
- High contrast button using accent color

### Social Proof Near CTA
- Testimonials within eyeshot of button
- "Join 10,000+ users"
- Star ratings, client logos

### Reduce Form Friction
- Each field reduces conversions ~5%
- Ask ONLY essential info
- Use smart defaults
- Show progress if multi-step

### Speed
- Inline CSS (no external stylesheet)
- Inline JavaScript (no external files)
- Lazy load images below fold
- No heavy frameworks (Bootstrap, jQuery)

---

## COMMON MISTAKES TO AVOID

- **Poor Contrast** → Dark overlay on hero images, high contrast text
- **Competing CTAs** → ONE primary action per page
- **Color Chaos** → Pick 2-3 colors maximum (use brand kit)
- **Emojis in Content** → Use SVG icons, CSS shapes, or icon font characters (NEVER Unicode emoji)
- **Generic Stock Photos** → Generate specific, contextual images with image_generate
- **Intimidating Forms** → Ask ONLY essential info, keep fields minimal
- **Inconsistent Spacing** → Use consistent padding with CSS variables
- **Missing Mobile** → Design mobile-first, enhance for desktop

---

## FILE DELIVERY

After creating or editing any page, ALWAYS include the file delivery tag:
```
<!-- file:website-page-name.html -->
```
This renders the file card in chat so the client can preview the page.

---

## QUALITY CHECKLIST

Before delivering, verify:

**Mobile (NON-NEGOTIABLE):**
- [ ] Works at 375px width
- [ ] No horizontal scroll
- [ ] Touch targets 44px+
- [ ] Readable text (no zooming)
- [ ] Navigation accessible (hamburger menu)

**Brand:**
- [ ] Brand kit colors applied (primary, secondary, accent, dark, light)
- [ ] Brand fonts loaded via Google Fonts
- [ ] CSS variables set for consistency

**Design:**
- [ ] 3-second test passes (clear value prop)
- [ ] Full-width hero image
- [ ] Single primary CTA
- [ ] Generous whitespace
- [ ] Contrast meets WCAG AA

**Content:**
- [ ] Real generated images (not placeholders)
- [ ] Alt text on all images
- [ ] No Lorem Ipsum
- [ ] Social proof near CTA
- [ ] Page title and meta description set for SEO

**Forms:**
- [ ] At least one CRM-connected form
- [ ] Posts to `/api/forms/submit`
- [ ] Source field included
- [ ] Success message on submit
- [ ] Styled to match brand kit

**Multi-Page (if applicable):**
- [ ] All pages share consistent nav, header, footer
- [ ] Navigation links work across all pages
- [ ] `get_site_pages` used for correct slugs
- [ ] Footer has current year and business name

---

## FINAL REMINDERS

1. **Mobile first** — If it doesn't work on mobile, it's broken
2. **Generate images** — Use `image_generate` for all key visuals
3. **Brand kit** — Pull colors and fonts from stored brand kit
4. **CRM forms** — EVERY form posts to `/api/forms/submit`
5. **Edit, don't rebuild** — Use `edit_artifact` for modifications
6. **Multi-page links** — Use `get_site_pages` for correct slugs
7. **File delivery** — Include `<!-- file:name.html -->` tag
8. **3-second test** — Clear value prop immediately
9. **No placeholders** — No Lorem Ipsum, no stock photos, no dummy forms

The goal: A website that converts visitors to action, looks professional, works flawlessly on every device, and sends every lead directly to the CRM.
