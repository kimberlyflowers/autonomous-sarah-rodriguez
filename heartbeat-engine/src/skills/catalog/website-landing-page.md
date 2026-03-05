---
name: website-landing-page
description: "Design and build distinctive, production-grade websites, landing pages, and web interfaces that convert visitors into leads. Use when the task involves creating a website, landing page, sales page, opt-in page, booking page, web mockup, dashboard UI, or any web presence. Also triggers for website redesigns, page mockups, conversion optimization, and any HTML/CSS/React creation. Generates polished, working code with exceptional design quality — never generic AI aesthetics."
---

# Website & Landing Page Design

This skill combines two disciplines: **design excellence** (making it look unforgettable) and **conversion thinking** (making it actually work). Both matter. A beautiful page that doesn't convert is art. An ugly page that converts is a missed opportunity. The goal is both.

## Phase 1: Think Before You Code

### Conversion Thinking
Before writing a single line of code, answer three questions:
1. **Who is landing on this page?** Where did they come from? What do they already know? What are they feeling?
2. **What is the ONE action we want them to take?** Book a call, sign up, buy, download. ONE. If you can't name it in one sentence, the page will fail.
3. **What is their biggest objection?** Cost? Trust? Time? "Is this legit?" The page must address this head-on.

Pull from the client's memory and Company Skills for brand voice, colors, audience, and industry context.

### Design Thinking
Commit to a BOLD aesthetic direction. Don't default to generic:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick a direction and commit — brutally minimal, luxury/refined, editorial/magazine, organic/natural, retro-futuristic, art deco/geometric, soft/pastel, industrial/utilitarian, playful. There are endless flavors. Choose one that fits the client and execute with precision.
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember about this page?

Bold maximalism and refined minimalism both work. The key is intentionality, not intensity.

## Phase 2: Page Structure That Converts

### Section 1: Hero (Above the Fold)
This is the ONLY section guaranteed to be seen. It must do three things in under 5 seconds:

1. **Headline:** State the transformation, not the product. "Stop losing clients to missed follow-ups" beats "AI-Powered CRM Assistant." The headline makes the visitor think "that's exactly my problem."
2. **Subheadline:** One sentence that explains HOW.
3. **CTA Button:** Action-oriented, specific, low-friction. "See It In Action" beats "Submit." The button text completes "I want to ___."

NEVER put a navigation menu with 8 links on a landing page. Every link is an exit.

### Section 2: Problem Agitation
Name the pain. Be specific — use their language.
"You know the feeling: it's 10pm and you realize you forgot to follow up with that hot lead from Tuesday."
This section makes them nod and think "yes, that's me."

### Section 3: Solution / How It Works
3 steps max. Simple. Visual.
- Step 1 → Step 2 → Step 3
- Icons or illustrations. Never a wall of text.

### Section 4: Social Proof
- Testimonials with NAMES (first name + role minimum)
- Specific results: "Saved me 15 hours a week" > "Great product!"
- If no testimonials: metrics, logos, case study preview

### Section 5: Features as Benefits
Benefits, not features. "Never miss a follow-up" not "Automated email sequences."
3-6 items max. Each is a mini pain→solution.

### Section 6: Objection Handling
FAQ or direct addressing. Top 3-4 concerns. Answer honestly.

### Section 7: Final CTA
Repeat the primary CTA. Restate the transformation. Add urgency only if REAL.

## Phase 3: Design Excellence

### Typography
Choose fonts that are beautiful, unique, and interesting. NEVER default to generic fonts like Arial, Inter, Roboto, or system fonts. These are the hallmark of AI-generated design.

- **Headings**: Pick a distinctive display font that has character. Use Google Fonts — there are hundreds of excellent options. Pair it with a refined body font.
- **Body**: Comfortable reading size (16-18px), line-height 1.5-1.7
- **Headlines**: Bold, large (36-48px on desktop), high contrast
- Use font weight and size for hierarchy, not just color

### Color & Theme
- Use the client's brand colors when known. If unknown, choose something bold — not the default purple-gradient-on-white that every AI generates.
- Commit to a cohesive palette. Use CSS variables for consistency.
- Dominant color with sharp accents outperforms timid, evenly-distributed palettes.
- CTA buttons should be the MOST visually prominent element. High contrast against background.
- Never pure black text — #1a1a2e or #2D2D2D reads better than #000000.

### Motion & Micro-interactions
- Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered animations.
- Smooth scroll behavior
- Hover states that surprise — subtle scale, color shifts, shadow changes
- Use CSS animations for HTML pages. Keep it performant.
- Scroll-triggered reveals for sections below the fold

### Spatial Composition
- Generous whitespace between sections (80-120px). Don't cram.
- Unexpected layouts when appropriate: asymmetry, overlap, diagonal flow, grid-breaking elements
- Mobile-first: everything must work beautifully on a phone screen
- Breathing room signals quality

### Backgrounds & Visual Depth
Don't default to flat solid colors. Create atmosphere:
- Gradient meshes, subtle noise textures, geometric patterns
- Layered transparencies, dramatic shadows
- Grain overlays for texture
- Match the overall aesthetic direction

### What to NEVER Do
- Generic AI aesthetics: Inter font, purple gradients, predictable card layouts
- Cookie-cutter design that lacks context-specific character
- Same design every time — vary themes, fonts, color palettes
- Navigation menus on landing pages (every link is an exit)
- Multiple CTAs competing (pick ONE action)
- "Submit" or "Click Here" as button text
- Walls of text with no visual breaks
- Forgetting mobile responsiveness
- Stock photos that scream "stock photo"

## Phase 4: Technical Output

Output as a single HTML file with:
- Inline CSS (no external stylesheets needed)
- Mobile-responsive (media queries or flexible units)
- Google Fonts loaded via CDN
- Smooth scroll, scroll-triggered animations
- Clean, semantic HTML
- CSS variables for colors and spacing
- CTA buttons that visually dominate

Use `create_artifact` to deliver the HTML so the client can preview immediately.

For React projects: use Tailwind utility classes, lucide-react for icons, and recharts for any data visualization. Import from available libraries only.

## The Standard

Every page should pass this test:
- Would a real person be glad they landed here?
- Does it look like a human designer built it, not an AI?
- Is the ONE action obvious within 5 seconds?
- Does it address the visitor's main objection?
- Would you be proud to show this to a client?

Remember: you are capable of extraordinary creative work. Don't hold back. Commit fully to a distinctive vision and execute it with precision.
