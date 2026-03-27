---
name: flyer-generation
description: Generate professional event flyers, promotional posters, and print marketing materials. Use this skill whenever the user asks for a flyer, poster, event announcement, promotional material, or print marketing collateral. Also trigger when the user mentions creating marketing materials for events, concerts, festivals, workshops, sales, fundraisers, or community gatherings. Even if they don't say "flyer" specifically, trigger this when they need single-page promotional designs.
---

# Professional Flyer Generation

Create stunning, attention-grabbing flyers that follow proven design principles and leverage Google Gemini's image generation capabilities for maximum impact.

## MANDATORY PRE-BUILD GATE — NO EXCEPTIONS

**You MUST collect all required information via bloom_clarify BEFORE creating any flyer or generating images. This is a hard rule with zero exceptions.**

### The 5 things you MUST know before designing:
1. **What is the flyer for?** — Event, promotion, announcement, menu, service ad
2. **Key details** — Event name, date, time, location, prices, contact info
3. **Target audience** — Who should this attract? (customers, community, professionals)
4. **Brand or colors** — Follow brand kit or custom colors?
5. **Call to action** — What should people do? (register, call, visit, scan QR code)

### Discovery Flow — call bloom_clarify for each missing piece (one at a time):

**Question 1 — What is this flyer for?**
Options: "Event (workshop, concert, fundraiser, etc.)", "Product or service promotion", "Business announcement or grand opening", "Menu or price list", "Other (I'll describe)"
Context: "What's the flyer promoting? This shapes the layout, imagery, and messaging."

**Question 2 — Key details (FREE TEXT — do not use buttons):**
Ask: "Give me all the details that need to appear on this flyer — event name, date, time, location, price, who's performing/speaking, contact info, website, or any must-have information. I won't use placeholders."

**Question 3 — Design direction:**
Options: "Use my brand kit colors and fonts", "I have specific colors in mind (I'll share)", "Bold and eye-catching", "Clean and elegant", "Fun and playful"

**Question 4 — What should people do?**
Options: "Register or sign up online", "Call or text a number", "Visit a location", "Scan a QR code", "No specific CTA needed"

### SKIP LOGIC:
- If the user provided event details upfront → skip Question 2
- If brand kit is on file and no alternative requested → skip Question 3
- NEVER ask more than one bloom_clarify at a time

### HARD STOP: Do NOT create flyer or generate images until at least Questions 1 and 2 are answered.

---

## The 3-Second Rule

**YOU HAVE 3 SECONDS.** If your flyer can't communicate its message in a single glance, it fails. Every design decision must serve instant comprehension.

## Core Design Framework

### Visual Hierarchy (Priority Order)
1. **Hero Headline** - Largest, boldest element (24-36pt minimum)
2. **Hero Image** - Emotional connection, fills negative space
3. **Supporting Details** - Scannable, essential information only
4. **Call-to-Action** - Clear next step ("Register Now", "Buy Tickets", "Visit Us")
5. **Contact/Location** - Small but legible

### Typography Rules (STRICT)
- **Maximum 2 fonts** - One bold for headlines, one clean for body
- **Headline**: 24-36pt (visible from reading distance)
- **Subheadings**: 14-18pt (organize content)
- **Body text**: 10-12pt (comfortable reading)
- **Font pairing**: Bold sans-serif + Clean sans-serif (e.g., Impact/Bebas + Helvetica/Roboto)

### Z-Pattern Layout
Guide the eye naturally:
```
Top-left (Start) → Top-right (Key detail)
       ↓ (Diagonal scan)
Bottom-left (Supporting) → Bottom-right (CTA/Contact)
```

This follows natural left-to-right reading patterns.

## 2026 Design Trends

### Authenticity Over Perfection
- Raw, handmade elements
- Intentional imperfections (torn edges, handwritten fonts)
- Real photography over stock images

### Bento Grid Layouts
- Modular sections with balanced structure
- Clear visual containers for different info types
- Works especially well for multi-event flyers

### Mixed-Media Design
- Layer photo + illustration + texture
- Combine realistic images with graphic elements
- Creates depth and visual interest

### Strategic QR Codes
- ALWAYS include a QR code in 2026
- Place in bottom corner or CTA area
- Bridge print to digital experience
- Link to: tickets, registration, more info

### Neo-Brutalism
- Raw layouts, oversized typography
- High contrast, bold colors
- Intentional friction creates memorability
- Use sparingly for edgy events

### Micrographics
- Small technical details brought forward
- Fine print as design element
- Creates sophistication

## Flyer Type Formulas

### 1. Concert/Music Festival Flyer

**Gemini Prompt Structure:**
```
A professional concert flyer poster for [EVENT NAME].

SUBJECT: Bold massive headline "[EVENT NAME]" text dominates the top third, festival vibes with [describe vibe - e.g., "vibrant Coachella energy" or "underground punk aesthetic"]. [Artist names] in large bold text. Date and venue details clearly visible.

COMPOSITION: Centered vertical portrait layout, Z-pattern flow. Main headline at top, hero image in middle third, lineup/details in lower third. QR code in bottom right corner.

ACTION: Dynamic concert atmosphere - [describe scene: crowd energy, stage lighting, artist performing, festival grounds at golden hour]

LOCATION: [Describe background - outdoor festival grounds, indoor venue, desert landscape, urban setting]. [Weather/time of day for mood]

STYLE: [2026 festival poster aesthetic | Neo-brutalist concert design | Authentic raw photography] with high contrast, bold typography, vibrant [color palette - e.g., "sunset gradients orange to purple" or "neon pink and electric blue"]. Modern sans-serif fonts (Bebas Neue style for headline, Helvetica for details).

TECHNICAL: Sharp focus on headline text and artist names. Dramatic lighting - [golden hour | stage spotlights | neon glow]. Professional print quality, vivid colors, portrait orientation 2:3 ratio.

MUST INCLUDE TEXT:
- Headline: "[EVENT NAME]" in massive bold letters
- Artists: "[Artist 1, Artist 2, Artist 3]"
- Date: "[Month Day, Year]"
- Location: "[Venue, City]"
- QR code graphic in bottom right
```

**Example:**
```
A professional concert flyer poster for RISE FESTIVAL.

SUBJECT: Bold massive "RISE" text dominates the top third, vibrant Coachella-style energy. Artists Kendrick Lamar, The Weeknd, Billie Eilish in large text. April 12-14 2024 and Indio, California details visible.

COMPOSITION: Centered vertical portrait layout. "RISE" headline at top, desert sunset landscape in middle, artist lineup in lower third with semi-transparent dark overlay. QR code bottom right.

ACTION: Epic music festival atmosphere - desert landscape at golden hour, silhouettes of palm trees, crowd energy in distance, stage lights beginning to glow

LOCATION: Southern California desert setting with iconic Coachella valley mountains. Golden hour sunset with warm orange and purple gradient sky transitioning to deep blue.

STYLE: Modern festival poster aesthetic with high contrast, bold typography. Sunset gradients from golden orange to deep purple to midnight blue. Bebas Neue style for "RISE", clean Helvetica for lineup. Professional photography mixed with graphic design elements.

TECHNICAL: Sharp focus on "RISE" headline and artist names. Dramatic golden hour lighting washing over landscape. Professional print quality, vivid saturated colors, portrait 2:3 ratio.

MUST INCLUDE TEXT:
- Headline: "RISE" in massive white bold letters
- Artists: "KENDRICK LAMAR • THE WEEKND • BILLIE EILISH • TYLER THE CREATOR • SZA • FRANK OCEAN"
- Date: "APRIL 12-14, 2024"
- Location: "INDIO, CALIFORNIA"
- QR code in bottom right corner
```

### 2. Workshop/Class Flyer

**Gemini Prompt Structure:**
```
A professional educational workshop flyer for [TOPIC/CLASS NAME].

SUBJECT: Clear headline "[WORKSHOP TITLE]" in professional sans-serif. Instructor photo or relevant topic imagery. Trust-building design - clean, organized, approachable.

COMPOSITION: Bento grid layout with distinct sections: headline box, image area, details box (date/time/location), instructor bio box, registration CTA box. Clean margins, organized hierarchy.

ACTION: [Learning environment - students engaged, instructor presenting, hands-on activity, collaborative work]

LOCATION: [Setting - modern classroom, workshop space, community center, online virtual background]. Professional, welcoming atmosphere.

STYLE: Clean professional design, organized bento grid structure. [Color scheme - trust colors like blue/green or warm orange/yellow]. Modern readable fonts (Montserrat for headings, Open Sans for body). Balanced whitespace.

TECHNICAL: Clean professional photography, even lighting. High readability, accessible design. Portrait 2:3 or square 1:1 depending on distribution method.

MUST INCLUDE TEXT:
- Headline: "[WORKSHOP TITLE]"
- Subtitle: "[What you'll learn in one sentence]"
- Date: "[Day, Month Date, Year]"
- Time: "[Start Time - End Time]"
- Location: "[Venue/Platform]"
- Instructor: "[Name, credentials]"
- Price: "$[Amount]" or "Free"
- CTA: "Register at [URL]" with QR code
```

### 3. Sale/Promotion Flyer

**Gemini Prompt Structure:**
```
An attention-grabbing promotional sale flyer for [BUSINESS/PRODUCT].

SUBJECT: Explosive bold headline "[X]% OFF" or "[SALE EVENT NAME]" in massive impact font. Product photography or store interior. High-energy, urgency-driven design.

COMPOSITION: Asymmetric dynamic layout - large discount number dominates one side, product images cascade on the other. Diagonal elements create movement and urgency.

ACTION: [Shopping energy - customers browsing, hands reaching for products, shopping bags, register activity]

LOCATION: [Store interior | Product display | E-commerce layout]. Vibrant retail environment.

STYLE: High-energy promotional design with bold contrasts. Red/yellow urgency colors with strategic white space. Impact or Anton font for discount, modern sans-serif for details. Neo-brutalist influences for edginess.

TECHNICAL: Bright even lighting on products. Sharp product photography. High contrast for shelf visibility. Portrait or landscape depending on display location.

MUST INCLUDE TEXT:
- Discount: "[50]% OFF" in huge bold numbers
- Event: "[LIMITED TIME SALE]"
- Dates: "[Month Day - Month Day]"
- Details: "[Exclusions or special terms]"
- Store name and location
- QR code for online shopping
```

### 4. Restaurant/Food Event Flyer

**Gemini Prompt Structure:**
```
A mouth-watering restaurant event flyer for [EVENT/RESTAURANT NAME].

SUBJECT: Appetizing hero food photography - [signature dish, drink, or dining scene]. Restaurant name in elegant or bold typography depending on vibe. Make viewers hungry.

COMPOSITION: Centered food hero image fills 60% of space. Restaurant name overlays or sits above. Event details in clean text block below. Golden ratio composition.

ACTION: [Dining experience - plated dish close-up with garnish, chef preparing food, diners enjoying meal, cocktails being poured]

LOCATION: [Restaurant interior ambiance - warm lighting, elegant table setting, rustic kitchen, outdoor patio]. Inviting, appetite-appealing environment.

STYLE: [Upscale elegant | Rustic authentic | Modern clean] depending on restaurant type. Food photography with professional styling. Warm color palette (browns, golds, reds, greens). Elegant serif for fine dining, bold sans-serif for casual.

TECHNICAL: Shallow depth of field on food hero shot. Warm ambient lighting. Professional food styling. Rich colors that trigger appetite. Portrait 2:3 ratio.

MUST INCLUDE TEXT:
- Restaurant Name: "[NAME]"
- Event: "[Special Menu | Wine Pairing | Chef's Table | Grand Opening]"
- Date: "[Day, Month Date]"
- Time: "[Dining Hours]"
- Reservation: "[Phone] or [Website]"
- Address: "[Street, City]"
- QR code for reservations
```

## Common Mistakes to AVOID

### ❌ No Clear Hierarchy
When everything screams, nothing is heard. Establish clear size/weight differences.

### ❌ Weak or Missing CTA
Don't make people guess. "Call Now", "Register Here", "Visit [URL]" - make it obvious.

### ❌ Wall of Text
Instant turn-off. Use bullet points, short phrases, scannable chunks.

### ❌ Too Many Fonts
3+ fonts = visual chaos. Stick to 2 maximum.

### ❌ Poor Photo Quality
Low-resolution or poorly lit photos kill credibility faster than bad typography.

### ❌ Missing QR Code in 2026
QR codes are expected in 2026. Always include one for digital engagement.

## Size Selection Guide

### Portrait (1024x1536 / 2:3 ratio)
- **Standard flyer size**
- Best for: Most events, workshops, sales, restaurants
- Fits standard 11x17 or A4/A3 print
- Optimal for bulletin boards and hand distribution

### Landscape (1536x1024 / 3:2 ratio)
- Wide format
- Best for: Banners, window displays, presentation slides
- Good for text-heavy content that needs width

### Square (1024x1024 / 1:1 ratio)
- Social media friendly
- Best for: Instagram posts, digital displays
- Less common for traditional print flyers

**Default to portrait 2:3 for most flyer requests unless user specifies otherwise.**

## Quality Guidelines

### When to use "high" quality:
- Final print-ready flyers
- Client presentations
- Professional events
- Anything that will be physically printed

### When to use "medium" quality:
- Draft iterations
- Quick mockups
- Digital-only distribution
- Social media versions

### When to use "low" quality:
- Rapid concept exploration
- Testing layouts
- Internal reviews only

**Default to "high" quality unless explicitly drafting.**

## Execution Checklist

Before generating, verify:
- [ ] Flyer type identified (concert, workshop, sale, restaurant, other)
- [ ] Size selected (default portrait 2:3)
- [ ] Key text content gathered (headline, date, location, CTA)
- [ ] Visual style determined (authentic, bento, neo-brutalist, mixed-media)
- [ ] Color scheme chosen (matches event vibe and brand)
- [ ] QR code planned (where it links, where it's placed)

After generation, check:
- [ ] Headline readable from 3 feet away
- [ ] Z-pattern flow guides eye naturally
- [ ] CTA is obvious and actionable
- [ ] Contact info is legible
- [ ] QR code is visible (bottom corner)
- [ ] Typography limited to 2 fonts
- [ ] No visual clutter

## Photography Language for Realism

When you want photorealistic flyer images (not illustrated/graphic designs), use camera-specific language:

**Camera Angles:**
- "wide-angle shot" - captures full scene
- "medium shot" - balanced framing
- "close-up shot" - intimate details
- "bird's eye view" - overhead perspective
- "low-angle shot" - dramatic upward view

**Lenses:**
- "35mm lens" - natural perspective
- "50mm lens" - classic portrait
- "85mm portrait lens" - beautiful bokeh
- "wide-angle 24mm" - environmental context

**Lighting:**
- "golden hour lighting" - warm sunset glow
- "studio softbox lighting" - professional even light
- "dramatic rim lighting" - edge highlights
- "natural window light" - soft directional
- "high-key lighting" - bright and airy
- "low-key lighting" - dramatic shadows

**Composition:**
- "rule of thirds composition"
- "shallow depth of field" - blurred background
- "leading lines" - guide viewer's eye
- "symmetrical composition" - balanced and formal

**Example Realistic Prompt:**
```
Professional food photography shot with 50mm f/1.4 lens. Shallow depth of field with background elegantly blurred. Golden hour natural window light from left creating warm highlights and gentle shadows. Rule of thirds composition. Sharp focus on foreground dish with restaurant interior softly visible behind. Photorealistic, editorial food magazine quality.
```

## Final Reminders

1. **Always embed the image in chat** using markdown after generation
2. **Always use portrait 2:3** for flyers unless specified otherwise  
3. **Always include a QR code** in the prompt
4. **Keep text content in the prompt** - specify exact headlines, dates, locations
5. **Follow the 6-element framework**: Subject, Composition, Action, Location, Style, Technical

The goal is a flyer that stops people in their tracks and makes them take action - not just look pretty.
