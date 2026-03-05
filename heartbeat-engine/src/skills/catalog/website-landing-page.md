---
name: website-landing-page
description: "Design and build stunning, conversion-optimized websites, landing pages, and web interfaces that look like they cost $5,000+ to build. Use this skill whenever the task involves creating a website, landing page, sales page, opt-in page, booking page, web mockup, funnel page, or any web presence. Also triggers for website redesigns, page mockups, conversion optimization, HTML/CSS/React creation, and any request mentioning 'site', 'page', 'web', 'landing', 'funnel', or 'online presence'. Every page should look like a premium agency built it — never generic, never template-looking, never the same design twice."
---

# Website & Landing Page — Premium, Unique, Every Time

## Core Rule: NEVER BUILD THE SAME SITE TWICE
Every website must have its own personality. If your last site used coral gradients and rounded cards, this one CANNOT. Vary between light/dark themes, different font families, different layout patterns, different animation styles. The client should never feel like they got a template.

## Phase 1: Design Thinking (before ANY code)

### Understand the Project
1. **Who lands here?** What do they know? What do they feel?
2. **What's the ONE action?** Book, buy, sign up, download.
3. **What's their biggest objection?** Address it head-on.

### Commit to a BOLD Aesthetic Direction
Pick a direction and COMMIT. Don't make "a nice website." Make one that's UNFORGETTABLE.

Choose one (or blend):
- **Brutally minimal** — massive white space, single accent, editorial feel
- **Dark & cinematic** — deep backgrounds, dramatic lighting effects, high contrast
- **Retro-futuristic** — neon accents, grid patterns, monospace type
- **Organic & warm** — rounded shapes, earth tones, hand-drawn feel
- **Luxury & refined** — serif fonts, muted palette, extreme restraint
- **Playful & bold** — bright colors, oversized type, unexpected layouts
- **Editorial / magazine** — column layouts, dramatic typography, pull quotes
- **Brutalist / raw** — exposed structure, harsh contrast, anti-design
- **Art deco / geometric** — patterns, gold accents, symmetry
- **Tech / glassmorphism** — blur effects, translucent cards, dark mode

What makes this design something someone will REMEMBER?

### Brand Kit Integration
If a Brand Kit is in your system prompt:
- Use those EXACT colors as CSS variables — do not pick your own
- Load Brand Kit fonts from Google Fonts — do not substitute
- Match Brand Kit voice in all copy
- DO NOT ask the user about colors, fonts, or style — you have it
- But DO vary the layout, composition, and design personality each time

If NO Brand Kit exists, choose a cohesive palette that matches the project mood.

---

## Phase 2: Technical Standards (apply to EVERY site)

### Typography (the #1 differentiator)
- **ALWAYS use Google Fonts** via CDN `<link>` in `<head>` with `display=swap`
- **Choose DISTINCTIVE fonts** — never Arial, Helvetica, Times New Roman, Inter, Roboto, system defaults
- **Vary your choices** across projects. Good options by mood:
  Elegant: Playfair Display, Cormorant Garamond, DM Serif Display, Libre Baskerville
  Modern: Plus Jakarta Sans, Space Grotesk, Outfit, Sora, Manrope
  Bold: Clash Display, Cabinet Grotesk, General Sans, Unbounded
  Friendly: Nunito, Quicksand, Comfortaa, Baloo 2
  Editorial: Source Serif 4, Lora, Fraunces, Newsreader
  Mono: JetBrains Mono, Fira Code, IBM Plex Mono
- **Sizes**: Hero `clamp(2.5rem,5vw,4.5rem)`, sections `clamp(1.75rem,3vw,2.75rem)`, body `1.05-1.15rem`, `line-height:1.7`
- **Letter-spacing**: `-0.02em` on large headings (tighter = premium)

### Color System
- Set up CSS variables in `:root{}` — primary, accent, dark, light, surface, text
- **Never pure black** `#000` → use `#111827`, `#0f172a`, or `#1a1a2e`
- **Never pure white** `#fff` → use `#fafafa`, `#f8f9fa`, or `#fefefe`
- Create visual rhythm: alternate section backgrounds

### Layout
- Max width `1200px` centered with `margin:0 auto`
- Section padding `clamp(60px,8vw,120px) clamp(20px,5vw,80px)`
- **White space is premium** — when in doubt, more space
- Feature grid: `display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:2rem`
- Try unexpected layouts: asymmetry, overlap, diagonal flow, bento grids, split screens

### Hero Section
- `min-height:80vh` minimum
- Value prop in under 10 words — a PROMISE, not a description
- Sub-headline: 1-2 sentences expanding value
- Single CTA button: large, high contrast, action verb ("Get Started", "Book a Demo", "Claim Your Spot")
- Social proof within eyeshot of the CTA

### Animations (include by default)
Scroll-triggered reveal on every section below the fold:
```css
.reveal{opacity:0;transform:translateY(30px);transition:opacity 0.6s ease,transform 0.6s ease}
.reveal.visible{opacity:1;transform:translateY(0)}
```
```javascript
const obs=new IntersectionObserver(e=>e.forEach(el=>{if(el.isIntersecting){el.target.classList.add('visible');obs.unobserve(el.target)}}),{threshold:0.1});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
```
Stagger children with `transition-delay: 0s, 0.15s, 0.3s, 0.45s`.

### Micro-interactions (include by default)
- Buttons: hover lift + shadow increase
- Cards: hover translateY(-6px) + shadow
- Images inside overflow:hidden containers: hover scale(1.05)
- Nav links: underline animation or color shift

### Sticky Navigation
```css
nav{position:fixed;top:0;width:100%;z-index:1000;transition:all .3s;padding:16px 0}
nav.scrolled{background:rgba(255,255,255,0.9);backdrop-filter:blur(20px);box-shadow:0 1px 20px rgba(0,0,0,0.05);padding:10px 0}
```
Always include mobile hamburger at `max-width:768px`.

### Background & Depth
Create atmosphere — don't just use flat colors:
- Gradient mesh / blob backgrounds (radial-gradient with low opacity)
- Subtle noise/grain texture overlay (2-3% opacity)
- Geometric patterns for tech sites
- Gradient overlays on hero sections for text readability

### Images
- If `image_generate` is available, generate images FIRST, use returned URLs
- If NOT available (check your capability notes), use CSS alternatives:
  gradient backgrounds, pattern fills, emoji/SVG icons, styled divs
- NEVER use placeholder URLs, NEVER base64 inline, NEVER broken links
- All images: `alt` text, `object-fit:cover`, `border-radius` matching design, `loading="lazy"`

### Mobile (non-negotiable)
- `<meta name="viewport" content="width=device-width,initial-scale=1">`
- Breakpoint at `768px` — grid collapses to 1 column
- Touch targets min 44x44px
- All font sizes use `clamp()`
- Hamburger nav on mobile
- No horizontal scroll — ever

### Performance
- Single HTML file, all CSS in `<style>`, JS in `<script>`
- Google Fonts via CDN
- No jQuery, no Bootstrap, no heavy frameworks
- Lazy load below-fold content

---

## Phase 3: Required Page Structure

1. `<nav>` — Sticky + blur on scroll + mobile hamburger
2. `<section class="hero">` — Full viewport, value prop, CTA, social proof
3. `<section class="features">` — Benefits grid with icons
4. `<section>` — Story/about/how-it-works section
5. `<section class="testimonials">` — Social proof cards
6. `<section class="cta-final">` — Final call to action
7. `<footer>` — Multi-column links + social + copyright

Save with `create_artifact` as `.html` file.

---

## Quality Gate (verify before saving)
- [ ] Design has a UNIQUE personality (not a copy of the last one)
- [ ] Hero communicates value in under 10 words
- [ ] Single clear CTA
- [ ] Social proof near CTA
- [ ] Scroll animations on all below-fold sections
- [ ] Hover effects on buttons, cards, images
- [ ] Sticky nav with blur
- [ ] Mobile responsive at 375px
- [ ] Google Fonts loaded (not system fonts)
- [ ] CSS variables for color system
- [ ] Generous white space
- [ ] Complete footer
- [ ] Would someone pay $5,000+ for this?

## NEVER:
- Build the same design twice
- Use "Submit" / "Click Here" as button text
- Center body paragraphs
- Body text under 16px
- Missing hover effects
- Missing mobile design
- System fonts
- Pure black on pure white
- Missing viewport meta
- Template-looking output
- Converge on the same fonts/colors across different projects
