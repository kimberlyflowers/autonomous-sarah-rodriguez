---
name: website-landing-page
description: "Design and build stunning, conversion-optimized websites that look like they cost $5,000+. Triggers for any website, landing page, sales page, funnel page, or web presence request. Every page must have a unique design personality — never the same site twice, never generic AI output."
---

# Website & Landing Page — Data-Driven, Conversion-Focused, Unique Every Time

## Rule #1: NEVER BUILD THE SAME SITE TWICE
Every website must have its own personality. Vary themes, fonts, layouts, animation styles, and composition between projects. The client should never feel like they got a template.

## Rule #2: BRAND KIT FIRST
If a Brand Kit is in your system prompt, use those EXACT colors and fonts. Do NOT ask about colors, fonts, or style. Only ask about content: what the page is for, who the audience is, what action visitors should take. If NO Brand Kit exists, choose a palette appropriate for THAT client's industry.

## Rule #3: ALWAYS DELIVER
If image generation is unavailable, use CSS gradients, patterns, SVG, and emoji. Never abandon a build because a tool failed.

---

## Phase 1: Conversion Strategy (before ANY code)

### The 5-Second Test (data: users form opinions in 0.05 seconds — Stanford)
1. **Who lands here?** What do they know? What do they feel?
2. **What's the ONE action?** Book, buy, sign up, download.
3. **What's their biggest objection?** Address it within the first viewport.

### Conversion Principles (research-backed)
- **Value prop above the fold** — if visitors can't understand what you offer in 5 seconds, you lose them (Clutch 2025)
- **Single CTA per page** — multiple CTAs cause confusion, stick to ONE primary action (WebFX)
- **Social proof near the CTA** — testimonials, logos, star ratings within eyeshot of the button. 92% of consumers trust peer recommendations over ads
- **Fewer form fields = more conversions** — each field reduces conversions. Ask only what's essential
- **Speed matters** — 1 second delay = 90% bounce increase (Google). Inline CSS, lazy load, no heavy frameworks
- **Mobile-first** — 70%+ of traffic is mobile in 2025-2026. Design for 375px first, enhance for desktop

---

## Phase 2: Industry-Appropriate Design Direction

Choose the design approach based on WHO the client is and WHO their customers are. These are data-backed patterns from the highest-converting sites in each category:

### 1. SaaS / Tech / AI Companies
- **Layout**: Clean, structured, high-contrast. Bento grid for features (guides eyes toward CTAs — Clutch)
- **Typography**: Modern sans-serif headings (bold, tight letter-spacing), clean body font
- **Color**: Dark mode or light with one strong accent color. Monochromatic + single highlight
- **Hero**: Clear headline + subtext + single CTA + product screenshot or animated demo
- **Trust**: Client logos, "Trusted by X companies", security badges, uptime stats
- **Personality**: Precision, clarity, authority. Linear and Stripe are benchmarks — restrained, intentional
- **Key pattern**: Interactive product previews, animated demos, feature comparison tables

### 2. Service Business / Agency / Consulting
- **Layout**: Generous white space, editorial feel, case study focused
- **Typography**: Distinctive serif or modern sans pairing that conveys expertise
- **Color**: Sophisticated palette — navy, forest, charcoal with warm accent. Avoid neon
- **Hero**: Bold statement of transformation + "Book a call" CTA
- **Trust**: Case studies with specific results ("Increased revenue 340%"), named testimonials with photos
- **Personality**: Confident authority. "We've done this before and we're great at it"
- **Key pattern**: Before/after results, process timeline, team photos

### 3. E-Commerce / Product / DTC Brand
- **Layout**: Product-forward, visual-heavy, minimal text. Grid or masonry
- **Typography**: Brand-appropriate — luxury=serif, youth=bold sans, wellness=soft rounded
- **Color**: Match product aesthetic. Luxury=muted. Youth=bold. Wellness=pastels
- **Hero**: Hero product image/video + single "Shop Now" CTA
- **Trust**: Reviews with star ratings, user-generated content, "As seen in" press logos
- **Personality**: Aspirational. Make visitors WANT the product before reading a word
- **Key pattern**: Quick-buy buttons, lifestyle photography, social proof integration

### 4. Local Business / Small Business
- **Layout**: Simple, warm, approachable. Maximum 5-6 sections
- **Typography**: Friendly, readable. Nothing too corporate or too trendy
- **Color**: Warm and inviting OR clean and professional depending on business type
- **Hero**: What you do + where + CTA (Book/Call/Visit)
- **Trust**: Google reviews, "Serving [area] since [year]", real team/location photos
- **Personality**: Human, trustworthy, local. "We're your neighbors"
- **Key pattern**: Embedded map, click-to-call, hours of operation prominently displayed

### 5. Non-Profit / Education / Faith-Based
- **Layout**: Story-driven, emotional, mission-focused
- **Typography**: Warm, humanist fonts. Nothing cold or corporate
- **Color**: Earth tones, deep blues, warm neutrals. Accent for CTAs
- **Hero**: Emotional headline about impact + "Donate/Enroll/Join" CTA
- **Trust**: Impact stats ("500 children served"), real photos of beneficiaries, donor/parent testimonials
- **Personality**: Hopeful, purposeful, community. Make visitors feel part of something bigger
- **Key pattern**: Impact counter, story cards, volunteer/enrollment forms

### 6. Creator / Personal Brand / Portfolio
- **Layout**: Bold, unconventional, personality-driven. Break the grid
- **Typography**: Expressive display fonts, oversized headings, unexpected pairings
- **Color**: Signature palette that IS the brand. Can be bold or muted — must be distinctive
- **Hero**: Name/face + what you do + "Work with me" or "Follow"
- **Trust**: Social follower counts, featured in logos, video testimonials
- **Personality**: Authentic, magnetic. The person IS the brand
- **Key pattern**: Content showcase, about story, booking calendar embed

---

## Phase 3: Technical Quality Standards (apply to ALL sites)

### Typography
- **ALWAYS Google Fonts** via CDN `<link>` with `display=swap`
- **NEVER** Arial, Helvetica, Times New Roman, system defaults
- **VARY choices** between projects — don't reuse the same fonts
- Responsive: `clamp()` for all sizes. Hero `clamp(2.5rem,5vw,4.5rem)`, body `1.05-1.15rem`
- `line-height:1.7` for body, `-0.02em` letter-spacing on large headings

### Color
- CSS variables in `:root{}` — primary, accent, dark, light, surface, text
- Never pure `#000` text — use `#111827` or similar
- Never pure `#fff` background — use `#fafafa` or similar
- Alternate section backgrounds for visual rhythm

### Animations (include by default)
```css
.reveal{opacity:0;transform:translateY(30px);transition:opacity .6s ease,transform .6s ease}
.reveal.visible{opacity:1;transform:translateY(0)}
```
```javascript
const obs=new IntersectionObserver(e=>e.forEach(el=>{if(el.isIntersecting){el.target.classList.add('visible');obs.unobserve(el.target)}}),{threshold:.1});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
```
Stagger children: `transition-delay: 0s, .15s, .3s, .45s`

### Micro-interactions
- Buttons: hover lift + shadow growth
- Cards: hover translateY(-6px) + shadow
- Images: hover scale(1.05) inside overflow:hidden
- Links: underline animation or color shift

### Sticky Navigation
```css
nav{position:fixed;top:0;width:100%;z-index:1000;transition:all .3s;padding:16px 0}
nav.scrolled{background:rgba(255,255,255,.9);backdrop-filter:blur(20px);box-shadow:0 1px 20px rgba(0,0,0,.05);padding:10px 0}
```
Mobile hamburger at `max-width:768px`. Always.

### Background & Depth
Create atmosphere — don't just use flat colors:
- Gradient blobs (radial-gradient, low opacity, positioned with ::before/::after)
- Subtle noise/grain texture (2-3% opacity)
- Geometric patterns for tech sites
- Warm gradients for lifestyle/wellness

### Images
- **HERO IMAGES MUST BE FULL-WIDTH** — Hero section images should span 100% of viewport width (`width: 100vw; margin-left: calc(-50vw + 50%);` or use full-width container)
- Hero images should be large, immersive, and edge-to-edge with no side margins
- If `image_generate` available: generate FIRST, use returned URLs
- If NOT available: CSS gradients, SVG, emoji, styled divs. NEVER broken links, NEVER placeholders
- All images: `alt` text, `object-fit:cover`, `loading="lazy"`

### Mobile (non-negotiable)
- `<meta name="viewport" content="width=device-width,initial-scale=1">`
- 768px breakpoint — grid → single column
- Touch targets 44px minimum
- No horizontal scroll

### Performance
- Single HTML file, inline CSS, inline JS
- Google Fonts via CDN only
- No jQuery, no Bootstrap

---

## Phase 4: Page Structure

1. `<nav>` — Sticky + blur + mobile hamburger
2. `<section class="hero">` — Value prop + CTA + social proof
3. `<section>` — Benefits/features grid
4. `<section>` — Story/about/how-it-works
5. `<section>` — Testimonials/social proof
6. `<section>` — Final CTA
7. `<footer>` — Links + social + copyright

Save with `create_artifact` as `.html`.

---

## Quality Gate
- [ ] Unique design (not a copy of previous work)
- [ ] Industry-appropriate aesthetic
- [ ] Value prop clear in 5 seconds
- [ ] Single CTA, not competing actions
- [ ] Social proof near CTA
- [ ] Scroll animations below fold
- [ ] Hover effects on interactive elements
- [ ] Mobile responsive at 375px
- [ ] Google Fonts (distinctive, not generic)
- [ ] CSS variables for colors
- [ ] Would someone pay $5,000+ for this?
