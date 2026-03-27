---
name: marketing-graphics
description: "Create professional marketing graphics, social media visuals, YouTube thumbnails, quote cards, promotional banners, email headers, Instagram carousels, story graphics, LinkedIn banners, Facebook covers, Pinterest pins, ad creatives, and any visual marketing asset that isn't a full website or print flyer. Triggers on: 'graphic', 'thumbnail', 'banner', 'cover image', 'social graphic', 'Instagram graphic', 'YouTube thumbnail', 'quote card', 'ad creative', 'promo image', 'visual', 'design a post', 'create a graphic', 'make an image for', 'carousel design', 'story graphic', 'header image', 'profile banner'. Use this skill ANY time the user wants a designed visual asset for digital marketing."
---

# Marketing Graphics — Scroll-Stopping Visual Assets

**MISSION:** Create professional marketing graphics that look like a designer made them — correctly sized for each platform, on-brand, with proper text hierarchy, and ready to post or publish.

**COMPANION SKILL:** The `image-generation` skill is auto-loaded alongside this one. It contains the core prompting framework (7-element structure, engine selection, photorealistic defaults). This skill adds platform-specific sizing, layout rules, and social media design expertise on top of that foundation.

---

## MANDATORY PRE-BUILD GATE — NO EXCEPTIONS

**You MUST collect all required information via bloom_clarify BEFORE generating any images. Zero exceptions.**

### The 6 things you MUST know before designing:
1. **Platform & format** — Where will this graphic be used?
2. **Graphic style** — What visual style? (default: photorealistic/professional)
3. **Message** — What's the main text or message on the graphic?
4. **Brand alignment** — Follow brand kit or custom look?
5. **Mood & tone** — Professional, fun, urgent, inspirational, edgy?
6. **Reference or inspiration** — Any examples of what they want?

### Discovery Flow — call bloom_clarify for each missing piece (one at a time):

**Question 1 — Where will this graphic be used?**
Options: "Instagram post or story", "YouTube thumbnail", "LinkedIn banner or post", "Facebook cover or post", "Email header or banner", "Ad creative (paid ads)", "Other (I'll describe)"
Context: "Where is this graphic going? This determines the exact dimensions and design approach."

**Question 2 — What visual style?**
Options: "Professional and polished (real photo look)", "Bold text & colors (minimal imagery)", "Clean and minimalist", "Match my brand style", "Vibrant and eye-catching", "Other (I'll describe)"
Context: "What should this graphic look like? Default is professional/photorealistic."

**Question 3 — What's the message or content?**
Options: "Promoting a product or service", "Announcing an event or news", "Sharing a tip or quote", "Before/after or transformation", "Personal brand / authority post", "Other (I'll describe)"
Context: "What's the main thing this graphic needs to communicate?"

**Question 4 — Text & details (FREE TEXT — do not use buttons):**
Ask: "What text should appear on the graphic? Give me the headline, any subtext, and key details like dates, prices, names, or URLs. Also — should I use your brand kit colors, or do you have something else in mind?"

### INTENT-AWARE SKIP LOGIC:

**Platform shortcuts — when the platform is obvious from the request, skip Q1 AND auto-set dimensions:**
- "YouTube thumbnail" → skip Q1, set 1280x720, engine=gpt, likely bold + face + emotion
- "Instagram post" → skip Q1, set 1080x1080, engine=gpt
- "Instagram story" → skip Q1, set 1080x1920, engine=gpt
- "Instagram carousel" → skip Q1, set 1080x1080 per slide, ask how many slides
- "LinkedIn banner" → skip Q1, set 1584x396, engine=gpt
- "Facebook cover" → skip Q1, set 820x312, engine=gpt
- "Pinterest pin" → skip Q1, set 1000x1500, engine=gpt
- "Twitter/X header" → skip Q1, set 1500x500, engine=gpt
- "Email header" → skip Q1, set 600x200, engine=gpt

**Style shortcuts:**
- Default is ALWAYS professional/photorealistic unless user says otherwise
- "cartoon" or "illustrated" in request → style = illustration
- "text graphic" or "quote card" → style = bold text on color/gradient
- "thumbnail" usually implies bold + photorealistic face → suggest this, don't ask

**Content shortcuts:**
- "make a YouTube thumbnail for my video about X" → skip Q3, topic is X
- "create an Instagram post announcing our sale" → skip Q3, message is sale
- If user provided specific text → skip Q4

**General rules:**
- NEVER ask more than one bloom_clarify at a time
- Detailed request with platform + topic + text → maybe only 1-2 questions needed
- Vague request ("make me a graphic") → ask all questions
- Always confirm concept before generating: "Here's what I'll create: [description]. Sound good?"

### HARD STOP: Do NOT generate until you know platform, style, and message content.

---

## ENGINE SELECTION FOR SOCIAL GRAPHICS

**Social media graphics use GPT Image 1.5 as primary engine** (set `engine: "gpt"`).

GPT excels at:
- Composed designs with text + imagery
- Bold, attention-grabbing compositions
- Dramatic facial expressions (thumbnails)
- Product + text layouts (ad creatives)
- High-contrast, scroll-stopping visuals

**Fall back to Gemini only for:**
- Wide cinematic banners where text isn't the focus
- Natural/editorial lifestyle backgrounds
- When GPT produces text rendering issues

---

## PLATFORM DIMENSION REFERENCE

Every graphic MUST be the correct size. Wrong dimensions look amateur.

| Platform | Format | Size Param | Target W×H | Engine |
|----------|--------|-----------|------------|--------|
| Instagram | Feed post | 1024x1024 | 1080×1080 | gpt |
| Instagram | Story / Reel | 1024x1536 | 1080×1920 | gpt |
| Instagram | Carousel slide | 1024x1024 | 1080×1080 | gpt |
| YouTube | Thumbnail | 1536x1024 | 1280×720 | gpt |
| YouTube | Channel banner | 1536x1024 | 2560×1440 | gpt |
| LinkedIn | Post image | 1536x1024 | 1200×627 | gpt |
| LinkedIn | Banner/cover | 1536x1024 | 1584×396 | gpt |
| Facebook | Post image | 1536x1024 | 1200×630 | gpt |
| Facebook | Cover photo | 1536x1024 | 820×312 | gpt |
| Twitter/X | Post image | 1536x1024 | 1600×900 | gpt |
| Twitter/X | Header | 1536x1024 | 1500×500 | gpt |
| Pinterest | Pin | 1024x1536 | 1000×1500 | gpt |
| Email | Header banner | 1536x1024 | 600×200 | gpt |
| Ad Creative | FB/IG ad | 1024x1024 | 1080×1080 | gpt |
| Ad Creative | Google Display | 1536x1024 | 1200×628 | gpt |
| General | Quote card | 1024x1024 | 1080×1080 | gpt |
| General | Blog featured | 1536x1024 | 1200×630 | gemini |

---

## PLATFORM-SPECIFIC DESIGN RULES

### YouTube Thumbnails
The #1 driver of click-through rate. Must be **BOLD, EMOTIONAL, INSTANTLY READABLE**.

**The winning formula:**
1. **Face with strong emotion** — surprise, excitement, curiosity, shock. Close-up, eyes visible, dramatic expression.
2. **3-5 words MAX** — Large, bold, high-contrast text. Often ALL CAPS.
3. **Bright, saturated colors** — Yellow, red, orange dominate top performers.
4. **Visual contrast** — Dark subject on bright background or vice versa.
5. **Before/after or comparison** — Split layouts get high CTR.

**Prompt approach for thumbnails:**
```
Close-up portrait of [person description] with an expression of [shock/excitement/curiosity],
mouth slightly open, eyes wide, looking directly at camera. [Describe wardrobe/context].
Bright [yellow/red/teal] gradient background creating strong contrast against the subject.
Bold dramatic lighting — strong key light from camera-left creating defined shadows on the
right side of the face, subtle rim light from behind for separation from background.
Shot on Canon R5 with 50mm f/1.8, shallow depth of field. High-contrast, saturated colors,
scroll-stopping YouTube thumbnail style. Include the text "[3-5 WORDS]" in massive bold
white Impact-style letters with a thick black outline, positioned [top/bottom/right side].
Professional, eye-catching, designed to get clicks.
```

**Text rules for thumbnails:**
- 5 words maximum. If you need more, it's too many.
- Massive bold sans-serif (Impact, Montserrat Black)
- ALWAYS add dark stroke/shadow so text reads on any background
- Never cover the face with text
- Keep text in upper or lower third

### Instagram Feed Posts (1080×1080)
- **Brand-consistent** — use brand kit colors as primary palette
- **Minimal text on image** — Instagram penalizes text-heavy images. Put details in caption.
- **Hook in first 3 seconds** — bold visual or intriguing composition
- **Carousel strategy**: Slide 1 = hook/title, Slides 2-7 = one point each, Final slide = CTA

**Prompt approach for Instagram:**
```
[Describe the main visual — product, person, scene] in a square composition optimized
for Instagram feed. [Brand colors] accent palette. Clean, [professional/lifestyle/editorial]
photography style. [Lighting description — warm natural light or studio]. Shot on [camera]
with [lens]. Modern, scroll-stopping, brand-aligned aesthetic. Minimal text — include only
"[SHORT HEADLINE]" in [font style] at [position].
```

### LinkedIn Graphics (1200×627)
- **Professional tone** — no flashy or overly casual designs
- **Data visualizations and infographics** perform well
- **Quote cards with thought leadership** get high engagement
- **Company branding dominant** — LinkedIn audiences expect consistency
- Clean, minimal, authoritative

### Quote Cards (1080×1080)
- **Large quote text** centered with generous margins
- **Attribution** below quote (smaller, lighter weight)
- **Background**: solid brand color, subtle gradient, or blurred photo
- Keep to 2-3 sentences max

### Ad Creatives (1080×1080 or 1200×628)
- **One message, one CTA** — ads that try to say everything say nothing
- **Product image dominant** if selling a product
- **Social proof** — include a stat, testimonial, or trust badge
- **Always create 2-3 variations** with different hooks for A/B testing

---

## TWO-STEP METHOD FOR TEXT-HEAVY GRAPHICS

When a graphic needs more than 5 words of text, use the two-step approach:

**Step 1: Generate the visual base**
- Call `image_generate` for the background/hero image WITHOUT text (or with just the headline)
- Focus on composition that leaves clear space for text overlay

**Step 2: Composite with HTML text overlay**
- Create an HTML artifact with the image as background
- Overlay styled text using CSS (Google Fonts, absolute positioning, proper shadows)

**HTML template for text overlays:**
```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .graphic {
    width: [WIDTH]px; height: [HEIGHT]px;
    position: relative; overflow: hidden;
  }
  .graphic img { width: 100%; height: 100%; object-fit: cover; }
  .overlay {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    padding: 40px;
    background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%);
  }
  .headline {
    font-family: 'Montserrat', sans-serif; font-weight: 900;
    color: #fff; text-align: center;
    text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
    font-size: [48-96]px;
  }
  .subtext {
    font-family: 'Montserrat', sans-serif; font-weight: 700;
    color: rgba(255,255,255,0.9); text-align: center;
    margin-top: 12px; font-size: [24-48]px;
  }
</style>
</head>
<body>
<div class="graphic">
  <img src="[IMAGE_URL]" alt="[DESCRIPTION]">
  <div class="overlay">
    <div class="headline">[HEADLINE]</div>
    <div class="subtext">[SUBTEXT]</div>
  </div>
</div>
</body>
</html>
```

**Text sizing by platform:**
- YouTube thumbnail: headline 72-96px, subtext 36-48px
- Instagram post: headline 48-64px, subtext 24-32px
- LinkedIn post: headline 40-56px, subtext 20-28px
- Email header: headline 32-40px, subtext 16-20px
- Quote card: quote 36-48px, attribution 18-24px

---

## BRAND KIT APPLICATION

**If brand kit is loaded:**
- Primary color → background accents, text highlights, CTA buttons
- Secondary color → supporting elements, borders, secondary text
- Accent color → emphasis, badges, icons
- Heading font → headline text
- Body font → subtext, descriptions

**If NO brand kit:**
- Ask in Q4, or pick a mood-appropriate palette:
  - Urgent/sale → red, orange, yellow, white
  - Professional/authority → navy, charcoal, gold, white
  - Fun/creative → bright multi-color, coral, teal
  - Luxury/premium → black, gold, cream
  - Health/wellness → sage green, earth tones, white space

---

## QUALITY CHECKLIST

Before delivering any graphic:
- [ ] Correct dimensions for the target platform (target_width × target_height set)
- [ ] Engine set to `gpt` for social graphics (or `gemini` for editorial/blog)
- [ ] Photorealistic by default (not cartoonish or overly stylized)
- [ ] Prompt follows the 7-element framework from image-generation skill
- [ ] Text is readable at thumbnail size (especially YouTube)
- [ ] Brand colors applied (or intentional departure explained)
- [ ] No garbled AI-rendered text — used HTML overlay for anything > 5 words
- [ ] One clear message — not trying to say everything
- [ ] Visual hierarchy: headline > subtext > supporting elements
- [ ] CTA present if promoting something
