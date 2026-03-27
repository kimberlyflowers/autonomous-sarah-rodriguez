---
name: marketing-graphics
description: "Create professional marketing graphics, social media visuals, YouTube thumbnails, quote cards, promotional banners, email headers, Instagram carousels, story graphics, LinkedIn banners, Facebook covers, Pinterest pins, ad creatives, and any visual marketing asset that isn't a full website or print flyer. Triggers on: 'graphic', 'thumbnail', 'banner', 'cover image', 'social graphic', 'Instagram graphic', 'YouTube thumbnail', 'quote card', 'ad creative', 'promo image', 'visual', 'design a post', 'create a graphic', 'make an image for', 'carousel design', 'story graphic', 'header image', 'profile banner'. Use this skill ANY time the user wants a designed visual asset for digital marketing — not raw AI image generation (use image-generation for that) and not a full webpage (use website-creation for that)."
---

# Marketing Graphics — Scroll-Stopping Visual Assets

**MISSION:** Create professional marketing graphics that look like a designer made them — correctly sized for each platform, on-brand, with proper text hierarchy, and ready to post or publish.

---

## MANDATORY PRE-BUILD GATE — NO EXCEPTIONS

**You MUST collect all required information via bloom_clarify BEFORE generating any images or creating any artifacts. This is a hard rule with zero exceptions.**

### The 6 things you MUST know before designing:
1. **Platform & format** — Where will this graphic be used? (Instagram post, YouTube thumbnail, LinkedIn banner, etc.)
2. **Graphic style** — What visual style? (photorealistic, cartoon/illustrated, minimalist, bold/vibrant, text-heavy)
3. **Message** — What's the main text or message on the graphic?
4. **Brand alignment** — Follow brand kit or custom look?
5. **Mood & tone** — Professional, fun, urgent, inspirational, edgy?
6. **Reference or inspiration** — Any examples of what they want it to look like?

### Discovery Flow — call bloom_clarify for each missing piece (one at a time):

**Question 1 — Where will this graphic be used?**
Options: "Instagram post or story", "YouTube thumbnail", "LinkedIn banner or post", "Facebook cover or post", "Email header or banner", "Ad creative (paid ads)", "Other (I'll describe)"
Context: "Where is this graphic going? This determines the exact dimensions and design approach."

**Question 2 — What visual style?**
Options: "Photorealistic (looks like a real photo)", "Cartoon or illustrated", "Bold text & colors (minimal imagery)", "Clean and minimalist", "Collage or multi-image layout", "Match my brand style"
Context: "What should this graphic look like? This drives the entire creative direction."

**Question 3 — What's the message or content?**
Options: "Promoting a product or service", "Announcing an event or news", "Sharing a tip or quote", "Before/after or transformation", "Personal brand / authority post", "Other (I'll describe)"
Context: "What's the main thing this graphic needs to communicate?"

**Question 4 — Text & details (FREE TEXT — do not use buttons):**
Ask: "What text should appear on the graphic? Give me the headline, any subtext, and key details like dates, prices, names, or URLs. Also — should I use your brand kit colors, or do you have something else in mind?"

### INTENT-AWARE SKIP LOGIC — be smart, read what the user already told you:

**Platform shortcuts — when the platform is obvious from the request, skip Question 1 AND auto-set dimensions:**
- "YouTube thumbnail" → skip Q1, set 1280x720, likely bold text + face + emotion
- "Instagram post" → skip Q1, set 1080x1080
- "Instagram story" → skip Q1, set 1080x1920
- "Instagram carousel" → skip Q1, set 1080x1080 per slide, ask how many slides
- "LinkedIn banner" → skip Q1, set 1584x396
- "Facebook cover" → skip Q1, set 820x312
- "Pinterest pin" → skip Q1, set 1000x1500
- "Twitter/X header" → skip Q1, set 1500x500
- "Email header" → skip Q1, set 600x200

**Style shortcuts — when the style is implied by the request:**
- "cartoon" or "illustrated" in request → skip Q2, style = illustration
- "photo" or "realistic" in request → skip Q2, style = photorealistic
- "text graphic" or "quote card" in request → skip Q2, style = bold text
- "thumbnail" usually implies bold text + photorealistic face → suggest this, don't ask

**Content shortcuts — when the message is already clear:**
- If user said "make a YouTube thumbnail for my video about X" → skip Q3, topic is X
- If user said "create an Instagram post announcing our sale" → skip Q3, message is sale announcement
- If user provided specific text to put on the graphic → skip Q4

**General rules:**
- NEVER ask more than one bloom_clarify at a time
- If the user gave a detailed request with platform + topic + text, you may only need 1-2 clarifying questions (style and brand)
- If the request is vague ("make me a graphic"), ask all questions
- Always confirm the final concept before generating: "Here's what I'll create: [description]. Sound good?"

### HARD STOP: Do NOT generate images or create artifacts until you know platform, style, and message content.

---

## PLATFORM DIMENSION REFERENCE

Every graphic MUST be the correct size for its platform. Using wrong dimensions looks amateur.

| Platform | Format | Dimensions | Aspect Ratio |
|----------|--------|-----------|--------------|
| Instagram | Feed post | 1080×1080 | 1:1 |
| Instagram | Story / Reel cover | 1080×1920 | 9:16 |
| Instagram | Carousel slide | 1080×1080 | 1:1 |
| YouTube | Thumbnail | 1280×720 | 16:9 |
| YouTube | Channel banner | 2560×1440 | 16:9 |
| LinkedIn | Post image | 1200×627 | 1.91:1 |
| LinkedIn | Banner/cover | 1584×396 | 4:1 |
| Facebook | Post image | 1200×630 | 1.91:1 |
| Facebook | Cover photo | 820×312 | 2.63:1 |
| Twitter/X | Post image | 1600×900 | 16:9 |
| Twitter/X | Header | 1500×500 | 3:1 |
| Pinterest | Pin | 1000×1500 | 2:3 |
| Email | Header banner | 600×200 | 3:1 |
| Ad Creative | Facebook/Instagram ad | 1080×1080 | 1:1 |
| Ad Creative | Google Display | 1200×628 | 1.91:1 |
| General | Quote card | 1080×1080 | 1:1 |
| General | Blog featured image | 1200×630 | 1.91:1 |

---

## GRAPHIC STYLE GUIDES

### YouTube Thumbnails
YouTube thumbnails are the #1 driver of click-through rate. They need to be BOLD, EMOTIONAL, and INSTANTLY READABLE.

**The winning formula:**
1. **Face with strong emotion** — Surprise, excitement, curiosity, shock. Close-up, eyes visible.
2. **3-5 words max** — Large, bold, high-contrast text. Often ALL CAPS.
3. **Bright, saturated colors** — Yellow, red, orange dominate top-performing thumbnails.
4. **Visual contrast** — Dark subject on bright background or vice versa. Never flat.
5. **Before/after or comparison** — Split layouts perform extremely well.

**Text rules for thumbnails:**
- Font: Ultra-bold sans-serif (Impact, Montserrat Black, Bebas Neue)
- Size: Text should be readable at 100px wide (mobile search results)
- Outline or shadow: ALWAYS add a dark stroke/shadow so text reads on any background
- Max 5 words. If you need more, you have too many.
- Position: Usually right side or bottom third, never covering the face

**Image prompt approach:**
- Generate the background/person image FIRST without text
- Then composite text onto it using HTML/CSS overlay in create_artifact
- NEVER ask the image generator to render text — it will be illegible

### Instagram Feed Posts
- **Square format** (1080×1080) unless carousel
- **Brand-consistent** — use brand kit colors as primary palette
- **Text-to-image ratio** — Instagram penalizes too much text. Keep text minimal on the image itself, put details in caption
- **Hook in first 3 seconds** of viewing — bold visual or intriguing text
- **Carousel strategy**: Slide 1 = hook/title, Slides 2-7 = one point each, Final slide = CTA + follow prompt

### LinkedIn Graphics
- **Professional tone** — avoid overly casual or flashy designs
- **Data visualizations** and infographics perform well
- **Quote cards** with thought leadership text get high engagement
- **Company colors** should dominate — LinkedIn audiences expect brand consistency
- **Recommended: clean, minimal, authoritative**

### Quote Cards
- **Large quote text** centered with generous margins
- **Attribution** below the quote (smaller, lighter weight)
- **Background**: solid brand color, subtle gradient, or blurred photo
- **Font**: elegant serif for the quote, clean sans-serif for attribution
- **Keep it to 2-3 sentences max** — if longer, it won't be readable as a graphic

### Ad Creatives
- **One message, one CTA** — ads that try to say everything say nothing
- **Product image dominant** if selling a product
- **Before/after** for transformation-based services
- **Social proof** — include a stat, testimonial, or trust badge
- **Text overlay**: headline (benefit) + subtext (proof) + CTA button
- **A/B variations**: always create 2-3 versions with different hooks

---

## TECHNICAL EXECUTION

### Workflow for ALL marketing graphics:

**Step 1: Generate base image(s)**
- Use `image_generate` for photorealistic backgrounds, product shots, people
- Use the 6-Element Framework from the image-generation skill
- Generate at the CORRECT dimensions for the platform
- NEVER ask image generator to render text — it will be garbled

**Step 2: Composite with text overlay**
- Create an HTML artifact with the image as background
- Overlay text using CSS (absolute positioning, proper z-index)
- Use web fonts from Google Fonts for headline text
- Apply text shadows or outlines for readability on busy backgrounds

**Step 3: Deliver**
- Save as HTML artifact (the user can screenshot or we can render)
- Include the `<!-- file:graphic-name.html -->` delivery tag
- Describe what was created and suggest how to use it

### HTML Graphic Template:
```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .graphic {
    width: [WIDTH]px;
    height: [HEIGHT]px;
    position: relative;
    overflow: hidden;
    background: #000;
  }
  .graphic img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 40px;
    /* Gradient overlay for text readability */
    background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%);
  }
  .headline {
    font-family: 'Montserrat', sans-serif;
    font-weight: 900;
    color: #fff;
    text-align: center;
    text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
    /* Size varies by platform — see dimension table */
  }
  .subtext {
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    color: rgba(255,255,255,0.9);
    text-align: center;
    margin-top: 12px;
  }
</style>
</head>
<body>
<div class="graphic">
  <img src="[IMAGE_URL]" alt="[DESCRIPTION]">
  <div class="overlay">
    <div class="headline">[HEADLINE TEXT]</div>
    <div class="subtext">[SUBTEXT]</div>
  </div>
</div>
</body>
</html>
```

### Text Sizing by Platform:
- **YouTube thumbnail**: headline 72-96px, subtext 36-48px
- **Instagram post**: headline 48-64px, subtext 24-32px
- **LinkedIn post**: headline 40-56px, subtext 20-28px
- **Email header**: headline 32-40px, subtext 16-20px
- **Quote card**: quote 36-48px, attribution 18-24px

---

## BRAND KIT APPLICATION

If a brand kit is loaded:
- **Primary color** → background accents, text highlights
- **Secondary color** → supporting elements, borders
- **Accent color** → CTA buttons, emphasis text, badges
- **Heading font** → headline text on graphics
- **Body font** → subtext, descriptions

If NO brand kit:
- Ask the user's preference (Question 4 in clarify gate)
- Or pick a palette that matches the content mood:
  - Urgent/sale → red, orange, yellow
  - Professional/authority → navy, dark green, charcoal
  - Fun/creative → bright, multi-color
  - Luxury/premium → black, gold, cream
  - Health/wellness → green, earth tones, white space

---

## COMMON MISTAKES TO AVOID

1. **Wrong dimensions** → ALWAYS use platform-correct sizes from the table above
2. **Too much text** → Graphics are visual-first. If you need a paragraph, it's a document not a graphic
3. **Text on busy backgrounds** → Always use overlays, shadows, or solid color blocks behind text
4. **AI-generated text in images** → NEVER let the image model render text. Composite it with HTML/CSS
5. **Ignoring mobile** → Most social media is viewed on phones. Test readability at small sizes
6. **No brand consistency** → Every graphic from the same brand should feel like it belongs together
7. **Missing CTA** — If the graphic promotes something, it needs a clear next step
8. **Low contrast** → Text must be readable at a glance. Use WCAG AA contrast ratios minimum

---

## QUALITY CHECKLIST

Before delivering any graphic:
- [ ] Correct dimensions for the target platform
- [ ] Text is readable at thumbnail size (especially YouTube)
- [ ] Brand colors applied (or intentional departure explained)
- [ ] No AI-rendered text in the image (text composited via HTML)
- [ ] One clear message — not trying to say everything
- [ ] Visual hierarchy: headline > subtext > supporting elements
- [ ] CTA present if promoting something
- [ ] File delivery tag included: `<!-- file:graphic-name.html -->`
