---
name: flyer-generation
description: "Generate professional event flyers, promotional posters, and print marketing materials. Use this skill whenever the user asks for a flyer, poster, event announcement, promotional material, or print marketing collateral. Triggers on: 'flyer', 'poster', 'event flyer', 'promotional flyer', 'print material', 'concert flyer', 'event poster'. Even if they don't say 'flyer' specifically, trigger when they need single-page promotional designs for events, sales, workshops, or community gatherings."
---

# Professional Flyer Generation — Print-Ready Marketing Materials

**MISSION:** Create stunning, attention-grabbing flyers that stop people in their tracks and make them take action. Every flyer should look like a professional graphic designer made it — not like a Canva template.

**COMPANION SKILL:** The `image-generation` skill is auto-loaded alongside this one. It contains the core prompting framework (7-element structure, engine selection, photorealistic defaults). This skill adds print-specific design rules, layout formulas, and flyer-type templates on top of that foundation.

---

## MANDATORY PRE-BUILD GATE — NO EXCEPTIONS

**You MUST collect all required information via bloom_clarify BEFORE creating any flyer. Zero exceptions.**

### The 5 things you MUST know before designing:
1. **What is the flyer for?** — Event, promotion, announcement, menu, service ad
2. **Key details** — Event name, date, time, location, prices, contact info
3. **Target audience** — Who should this attract?
4. **Brand or colors** — Follow brand kit or custom look?
5. **Call to action** — What should people do?

### Discovery Flow — call bloom_clarify for each missing piece (one at a time):

**Question 1 — What is this flyer for?**
Options: "Event (workshop, concert, fundraiser, etc.)", "Product or service promotion", "Business announcement or grand opening", "Menu or price list", "Other (I'll describe)"
Context: "What's the flyer promoting? This shapes the layout, imagery, and messaging."

**Question 2 — Key details (FREE TEXT — do not use buttons):**
Ask: "Give me all the details that need to appear on this flyer — event name, date, time, location, price, who's performing/speaking, contact info, website, or any must-have information. I'll use REAL details only — no placeholders."

**Question 3 — Design direction:**
Options: "Use my brand kit colors and fonts", "Bold and eye-catching (high energy)", "Clean and elegant (upscale)", "Fun and playful (community/family)", "I have specific colors in mind (I'll share)"

**Question 4 — What should people do?**
Options: "Register or sign up online", "Call or text a number", "Visit a location", "Scan a QR code", "No specific CTA needed"

### SKIP LOGIC:
- User provided event details upfront → skip Question 2
- Brand kit loaded and no alternative requested → skip Question 3
- NEVER ask more than one bloom_clarify at a time

### HARD STOP: Do NOT create flyer or generate images until at least Questions 1 and 2 are answered.

---

## ENGINE SELECTION FOR FLYERS

**Flyers use GPT Image 1.5 as primary engine** (set `engine: "gpt"`).

GPT excels at:
- Composed designs with text + imagery together
- Bold layouts with clear visual hierarchy
- Text rendering within the image (short headlines)
- High-contrast, attention-grabbing compositions
- Product + scene compositions

**Fall back to Gemini for:**
- Pure photographic backgrounds (no text baked in)
- Natural/lifestyle scene generation for the background layer
- When you'll composite all text via HTML overlay

---

## THE 3-SECOND RULE

**YOU HAVE 3 SECONDS.** If your flyer can't communicate its message in a single glance, it fails. Every design decision must serve instant comprehension.

---

## DEFAULT SIZE: PORTRAIT 2:3

**Standard flyer generation:**
- Size parameter: `1024x1536` (portrait)
- Target: `1024x1536` (or `2048x3072` for print-ready)
- This fits standard 11×17 or A4/A3 print
- Optimal for bulletin boards and hand distribution

**Other sizes when requested:**
- Landscape banner: `1536x1024`
- Square (social-friendly): `1024x1024`
- Always ask or infer from context

---

## VISUAL HIERARCHY (Priority Order)

Every flyer must follow this hierarchy. The eye reads in this order:

1. **Hero Headline** — Largest, boldest element (the "what")
2. **Hero Image** — Emotional connection, fills negative space
3. **Supporting Details** — Date, time, location (scannable)
4. **Call-to-Action** — Clear next step ("Register Now", "Buy Tickets")
5. **Contact/Location** — Small but legible

### Z-Pattern Layout
Guide the eye naturally:
```
Top-left (Start → Headline)  →  Top-right (Key detail / image)
          ↓ Diagonal scan ↓
Bottom-left (Details)  →  Bottom-right (CTA / Contact / QR)
```

---

## TYPOGRAPHY RULES (STRICT)

- **Maximum 2 fonts** — One bold for headlines, one clean for body
- **Headline**: 24-36pt equivalent (visible from reading distance)
- **Subheadings**: 14-18pt (organize content)
- **Body text**: 10-12pt (comfortable reading)
- **Font pairing**: Bold sans-serif headline + Clean sans-serif body (Impact/Bebas + Roboto/Open Sans)

---

## FLYER TYPE PROMPT FORMULAS

### 1. Concert / Music Event Flyer

**Use this prompt structure (adapt to specific event):**
```
A professional concert event poster for [EVENT NAME], portrait format.
[Describe the visual scene — stage, performer silhouette, crowd energy, lighting atmosphere].
The headline "[EVENT NAME]" dominates the top third in massive bold [white/gold] sans-serif
letters with a [subtle glow/dark shadow] for readability against the background.
Artist lineup — [Artist 1, Artist 2, Artist 3] — in bold condensed type below the headline.
Event details in the lower third: "[DATE]" and "[VENUE, CITY]" in clean sans-serif.
[Color palette — describe specific colors that match the event vibe: neon for EDM, warm golds
for jazz, dark moody for rock, bright pastels for indie].
Dramatic [stage lighting / golden hour / neon glow] creating depth and energy.
Professional event poster design, high-contrast, print-ready quality. Shot on [camera] with
[lens] for any photographic elements. Bold, high-energy, makes you want to buy tickets.
```

### 2. Workshop / Class Flyer

**Prompt structure:**
```
A professional workshop flyer for "[WORKSHOP TITLE]", portrait format.
[Describe the visual — instructor at whiteboard, hands-on activity, learning environment,
or relevant subject matter imagery]. Clean, organized, approachable design.
Headline "[WORKSHOP TITLE]" in professional bold [navy/teal/brand color] sans-serif at the top.
Subtitle: "[What you'll learn — one sentence]" in lighter weight below.
Bento-grid layout for details: date/time block, location block, instructor name + credentials,
price, and registration CTA. Each section clearly separated with clean borders or background
color blocks. QR code in bottom-right linking to registration.
[Trust-building color scheme — blues, greens, or warm professional tones].
Soft professional lighting, [natural window light / bright studio].
Clean modern design, organized hierarchy, easy to scan. Professional educational aesthetic.
```

### 3. Sale / Promotion Flyer

**Prompt structure:**
```
An attention-grabbing promotional flyer for [BUSINESS NAME] [SALE TYPE], portrait format.
Massive bold "[X]% OFF" or "[SALE NAME]" in [red/yellow/orange] Impact-style font dominating
the center — this is the first thing anyone sees. [Product photography or store imagery]
arranged dynamically around the discount text.
"[DATES: Month Day - Month Day]" in contrasting clean font below the headline.
Key details: "[what's included, exclusions, special offers]" in scannable bullet format.
Store info at bottom: "[ADDRESS]" | "[PHONE]" | "[WEBSITE]". QR code for online shopping.
High-energy urgency colors — [red, orange, yellow, white]. Bold diagonal elements or starburst
shapes to create movement and urgency.
Bright, high-contrast design optimized for [window display / hand distribution / social media].
Professional retail promotion aesthetic — makes people feel like they'll miss out if they don't act.
```

### 4. Restaurant / Food Event Flyer

**Prompt structure:**
```
A mouth-watering [restaurant event / menu / grand opening] flyer for [NAME], portrait format.
Hero food photography filling 60% of the space — [describe the signature dish in vivid detail:
colors, textures, plating, garnishes, steam rising]. Shot with 50mm f/1.4 lens, shallow depth
of field, [warm ambient / golden hour / soft studio] lighting creating appetite-triggering
highlights on the food. Rich, warm color palette — [golds, deep reds, rich browns, fresh greens].
Restaurant name "[NAME]" in [elegant serif for fine dining / bold sans-serif for casual] at top.
Event details: "[SPECIAL EVENT NAME]" | "[DATE]" | "[TIME]" | "[PRICE if applicable]".
Reservation info: "[PHONE]" or "[WEBSITE]". QR code for reservations bottom-right.
[Upscale elegant / rustic authentic / modern clean] design matching the restaurant's vibe.
Professional food photography quality, editorial magazine aesthetic, makes the viewer hungry.
```

### 5. Community / Church / Nonprofit Event Flyer

**Prompt structure:**
```
A warm, welcoming community event flyer for "[EVENT NAME]", portrait format.
[Describe the visual — families gathering, community space, volunteers, relevant activity].
Warm, inclusive photography style — diverse group of people, genuine smiles, natural interaction.
Headline "[EVENT NAME]" in friendly, approachable bold sans-serif at top.
Key details clearly organized: "[DATE]" | "[TIME]" | "[LOCATION]" | "FREE" or "[COST]".
[What to expect / bring / activities listed in scannable format].
Contact: "[ORGANIZER NAME]" | "[PHONE]" | "[EMAIL]".
Warm, inviting color palette — [soft blues, warm yellows, community greens, sunset oranges].
Natural outdoor or community center lighting, authentic feel, NOT corporate.
Professional but approachable design — feels like a personal invitation, not a sales pitch.
```

---

## PHOTOGRAPHY LANGUAGE FOR REALISTIC FLYER IMAGES

When the flyer needs photorealistic imagery (most of the time), include camera-specific language from the image-generation core skill:

**Camera Angles:**
- "wide-angle shot" — captures full event scene
- "medium shot" — balanced subject framing
- "close-up" — food, product detail, emotional face
- "bird's eye view" — overhead layout, flat-lays
- "low-angle shot" — dramatic, imposing (concerts, buildings)

**Lenses:**
- "35mm" — natural environmental context
- "50mm f/1.4" — classic portrait, beautiful bokeh
- "85mm portrait lens" — tight portraits, speaker headshots
- "24mm wide-angle" — full scene, event spaces

**Lighting (always specify):**
- "golden hour lighting" — warm, flattering, outdoor events
- "studio softbox" — professional, even, controlled
- "dramatic rim lighting" — concerts, nightlife
- "natural window light" — workshops, offices, cafes
- "neon glow" — clubs, modern events, tech

---

## TEXT IN FLYERS — THE RULES

**Short text (headline, 5 words or fewer) → bake it into the image prompt:**
Include the exact text in quotes in the prompt. Specify font style, size, color, position, and shadow/outline treatment.

**Medium text (details block, 10-30 words) → two options:**
- Option A: Include in prompt if it's a simple list (date, time, place)
- Option B: Generate image WITHOUT text, then composite via HTML overlay

**Long text (paragraph, menu, lineup) → always use HTML overlay:**
Generate the visual background, then create an HTML artifact with the image as background and all text styled with CSS.

**NEVER let the image model render:**
- Phone numbers (too many digits — will garble)
- URLs or email addresses
- Paragraphs or long descriptions
- Fine print or disclaimers

---

## COMMON MISTAKES TO AVOID

1. **Wrong dimensions** → Default to portrait 1024x1536. Always set target dimensions.
2. **No clear hierarchy** → Headline must be 3x larger than body text minimum
3. **Too much text baked in** → Use HTML overlay for anything beyond headline + date
4. **Weak or missing CTA** → Every flyer needs "Call Now", "Register Here", "Visit [URL]"
5. **No QR code in 2026** → Always include or mention adding one
6. **Cartoonish/stylized default** → Flyers should be photorealistic + bold typography by default
7. **Missing contact info** → Flyers without a way to respond are useless
8. **Placeholder text** → NEVER use "Lorem ipsum", "Your Company", "555-1234". Use REAL details from the user or leave blank and ask.
9. **Flat lighting** → Always specify dramatic or professional lighting in the prompt
10. **Keyword-list prompts** → Write narrative paragraphs following the 7-element framework

---

## EXECUTION CHECKLIST

**Before generating:**
- [ ] Flyer type identified (concert, workshop, sale, restaurant, community)
- [ ] Engine set to `gpt` (primary for composed designs)
- [ ] Size: 1024x1536 portrait (default) or user-specified
- [ ] All real details collected (name, date, time, location, price, CTA)
- [ ] Visual style determined (photorealistic default)
- [ ] Color scheme chosen (matches event vibe + brand)
- [ ] Prompt follows 7-element framework (subject, action, wardrobe/details, environment, lighting, camera, mood)

**After generation:**
- [ ] Headline readable at arm's length
- [ ] Z-pattern flow guides eye naturally
- [ ] CTA is obvious and actionable
- [ ] Contact info is legible
- [ ] Text is sharp (not garbled by AI)
- [ ] Typography limited to 2 font styles
- [ ] Professional, photorealistic look (not cartoonish)
- [ ] Correct portrait dimensions
