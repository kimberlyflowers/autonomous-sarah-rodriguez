---
name: image-generation
description: "CORE image prompting engine — the foundational skill for ALL image generation across the platform. Teaches how to write professional prompts that produce stunning, realistic images. This skill is referenced by marketing-graphics, flyer-generation, and website-creation. Use directly when the user wants a standalone AI-generated image that isn't tied to a specific platform (social, print, web). Triggers on: 'generate image', 'AI image', 'create image', 'create a photo', 'image prompt', 'generate a photo', 'headshot', 'product photo', 'hero image'."
---

# Image Generation — Core Prompting Engine

**MISSION:** Generate professional, photorealistic images that look like they were shot by a commercial photographer — not like generic AI art. This is a business platform. Every image should look like something a real brand would use.

---

## DEFAULT STYLE: PHOTOREALISTIC

**This is a business tool. The default output is ALWAYS photorealistic unless the user explicitly asks for something else.**

- NO cartoon filters
- NO watercolor effects
- NO "AI art" stylization
- NO overly saturated fantasy looks
- YES clean commercial photography
- YES editorial magazine quality
- YES professional lifestyle shots
- YES studio product photography

If the user says "create an image of a woman at a desk" — that means a real-looking photo of a real-looking woman at a real desk. Not an illustration. Not a 3D render. A photograph.

**The ONLY times to deviate from photorealistic:**
- User explicitly asks for "cartoon", "illustrated", "animated", "stylized", "watercolor", etc.
- YouTube thumbnails (bold, high-contrast, slightly stylized is acceptable)
- Infographics (clean vector/graphic design style)
- Logo concepts (graphic design, not photo)

---

## ENGINE SELECTION RULES

**The `image_generate` tool has an `engine` parameter. Use the RIGHT engine for the job:**

| Use Case | Primary Engine | Why |
|----------|---------------|-----|
| Social media graphics | `gpt` | GPT Image 1.5 excels at composed designs with text, faces, and bold visuals |
| YouTube thumbnails | `gpt` | Better at dramatic expressions, bold compositions, text areas |
| Ad creatives | `gpt` | Better product + text compositions |
| Instagram/Facebook posts | `gpt` | Better at designed graphics with overlays |
| Website hero images | `gemini` | Gemini produces cleaner, wider cinematic scenes |
| Blog featured images | `gemini` | Better at natural, editorial-style photography |
| Product photography | `gpt` | Better studio lighting and product detail |
| Headshots / portraits | `gpt` | More realistic faces and expressions |
| Landscapes / environments | `gemini` | Better at wide, atmospheric scenes |
| Flyers / posters | `gpt` | Better at composed layouts with text areas |

**Always set the engine explicitly. Never rely on "auto" for professional work.**

---

## MANDATORY PRE-BUILD GATE

**Skip this gate when called from a parent skill** (marketing-graphics, flyer-generation, website-creation already collected context).

### When called directly, collect via bloom_clarify:

**Question 1 — What is this image for?**
Options: "Website hero or banner", "Social media post", "Flyer or print material", "Presentation or document", "Profile or headshot", "Product photo", "Other (I'll describe)"

**Question 2 — What should be in the image?**
Options: "People (professional/lifestyle)", "A product or object", "A scene or environment", "Abstract or pattern", "Other (I'll describe)"

**Question 3 — Visual style:**
Options: "Photorealistic (default — real photo look)", "Clean and modern illustration", "Bold and colorful / vibrant", "Minimalist and elegant", "Match my brand kit style"

**Question 4 — Describe specifics (FREE TEXT):**
Ask: "Describe the image — colors, mood, setting, any must-have details. The more specific, the better the result."

### SKIP LOGIC:
- Called from another skill → skip entire gate
- User gave detailed description → skip to generation
- User said "realistic" or "photo" → skip Q3, style = photorealistic
- NEVER ask more than one bloom_clarify at a time

---

## THE PROMPT FRAMEWORK

Every professional image prompt follows this structure. **Write it as a narrative paragraph, NOT a keyword list.**

### The 7 Elements (write in this order):

**1. SHOT TYPE + SUBJECT (who/what)**
Start with the camera framing and describe the subject in specific detail.
- "Close-up portrait of a confident Black woman in her 30s with natural hair..."
- "Wide establishing shot of a modern co-working space..."
- "Overhead flat-lay of premium skincare products on white marble..."

**2. ACTION / EXPRESSION (what's happening)**
Give the subject life. Static images look like stock photos.
- "...smiling warmly while reviewing documents on her laptop..."
- "...with morning light streaming through floor-to-ceiling windows as people collaborate..."
- "...arranged in a diagonal composition with fresh eucalyptus sprigs..."

**3. WARDROBE / DETAILS (texture, material, specifics)**
Details sell realism. Generic descriptions produce generic images.
- "...wearing a tailored navy blazer over a cream silk blouse, small gold stud earrings..."
- "...mid-century modern furniture, exposed brick walls, large potted monstera plant..."
- "...frosted glass bottles with minimalist labels, droplets of serum catching the light..."

**4. ENVIRONMENT / SETTING (where)**
Place the subject in a believable space with depth.
- "...seated at a clean white desk in a bright, airy home office with floating shelves..."
- "...in a converted warehouse loft with polished concrete floors and industrial pendant lights..."
- "...on a pale blush linen cloth with subtle texture, soft shadows..."

**5. LIGHTING (the #1 differentiator between amateur and professional)**
This is the single most important element. Specify it precisely.
- "Soft diffused natural window light from the left, creating gentle shadows on the right side of her face"
- "Warm golden hour sunlight streaming through large windows, casting long directional shadows across the space"
- "Studio softbox lighting from 45 degrees above, clean highlights on glass surfaces, minimal harsh shadows"
- "Three-point lighting setup: key light at camera-left, fill light camera-right, hair light from behind"

**6. CAMERA + LENS (tells the AI what kind of photo this is)**
Photographic language produces photographic results.
- "Shot on Canon R5 with 85mm f/1.4 lens, shallow depth of field, background softly blurred"
- "Shot on Sony A7IV with 35mm lens, f/2.8, medium depth of field for environmental context"
- "Shot on Hasselblad medium format with 50mm lens, tack-sharp details, commercial product photography"
- "Shot on iPhone 15 Pro, natural casual feel" (for lifestyle/social content)

**7. QUALITY + MOOD KEYWORDS (the finishing polish)**
- "Professional editorial photography. Clean, modern, aspirational. Magazine-quality lighting and composition."
- "Commercial lifestyle photography. Warm, inviting, authentic. Real-life feeling, not staged."
- "High-end product photography. Luxurious, premium feel. Impeccable detail and lighting."

---

## EXAMPLE: BAD vs GOOD PROMPTS

### BAD (generic AI art):
```
A businesswoman at a desk with a laptop
```
**Result:** Flat lighting, generic stock photo, possibly stylized/cartoonish, no personality.

### GOOD (professional photograph):
```
Close-up portrait of a confident Black businesswoman in her early 30s with natural curly hair pulled back, smiling warmly while typing on a MacBook Pro. She's wearing a tailored charcoal blazer over a white crew-neck top, with small gold hoop earrings. Seated at a clean modern desk in a bright, airy office with large windows behind her, a small fiddle-leaf fig plant visible in the soft-focus background. Warm natural window light from the left side illuminates her face with soft, flattering shadows. Shot on Canon R5 with 85mm f/1.4 lens, shallow depth of field creating beautiful background bokeh. Professional editorial lifestyle photography, authentic and aspirational, magazine quality.
```
**Result:** Looks like it belongs in Forbes or a brand's About page.

### BAD (keyword list):
```
sunset, beach, yoga, woman, peaceful, orange sky
```

### GOOD (narrative scene):
```
Wide shot of a woman in her 40s practicing tree pose on an empty beach at golden hour. She's wearing fitted black yoga pants and a dusty rose tank top, barefoot on firm wet sand at the waterline. The sun is setting behind her at camera-right, casting a warm golden backlight that creates a subtle rim light around her silhouette. Gentle waves lap at the shore in the distance. The sky gradients from deep coral near the horizon through warm peach to soft lavender above. Shot on Sony A7III with 24mm wide-angle lens, f/5.6 for sharp foreground-to-background focus. Professional lifestyle photography, peaceful and meditative mood, warm natural color palette.
```

---

## TEXT IN IMAGES

**GPT Image 1.5 can render text reliably — but keep it short.**

Rules for text in images:
- **5 words or fewer** for headlines → high accuracy
- **Short phrases** (up to ~10 words) → usually accurate
- **Full sentences or paragraphs** → will likely garble, use HTML overlay instead
- **Always specify exact text in quotes** in your prompt: `with the text "SUMMER SALE" in bold white sans-serif letters`
- **Specify font style**: "bold Impact-style", "elegant serif", "clean sans-serif", "handwritten script"
- **Specify placement**: "centered at the top third", "bottom-right corner", "overlaid on a dark band across the lower third"
- **Specify treatment**: "with a dark drop shadow for readability", "white text on a semi-transparent black bar"

**For longer text** or **pixel-perfect text placement**, use the two-step method:
1. Generate the image WITHOUT text (or with just the headline)
2. Create an HTML artifact that composites the image + styled text overlay

---

## ASPECT RATIO + SIZE RULES

Always match size to use case:

| Use Case | Size Parameter | Target Dimensions |
|----------|---------------|-------------------|
| Instagram feed | 1024x1024 | 1080x1080 |
| Instagram story | 1024x1536 | 1080x1920 |
| YouTube thumbnail | 1536x1024 | 1280x720 |
| Facebook post | 1536x1024 | 1200x630 |
| Facebook cover | 1536x1024 | 820x312 |
| LinkedIn post | 1536x1024 | 1200x627 |
| Website hero | 1536x1024 | 1920x1080 or 1200x630 |
| Blog featured | 1536x1024 | 1200x630 |
| Flyer (portrait) | 1024x1536 | actual print size |
| Product photo | 1024x1024 | 1080x1080 |
| Profile/headshot | 1024x1024 | 800x800 |

**Always set `target_width` and `target_height`** for platform-specific images. The base `size` picks the closest aspect ratio for generation, then it gets resized to exact dimensions.

---

## STYLE MODIFIERS (when user requests non-photorealistic)

Only apply these when the user explicitly asks:

**Illustrated / Cartoon:**
Add: "Clean digital illustration style. Bold outlines, flat color fills, vibrant saturated palette. Modern vector illustration aesthetic, NOT 3D render."

**Minimalist / Abstract:**
Add: "Minimalist graphic design. Clean geometric shapes, limited color palette (2-3 colors maximum), generous negative space. Professional and refined."

**Vintage / Retro:**
Add: "Vintage film photography look. Warm color cast, slightly faded shadows, subtle grain texture. Kodak Portra 400 film aesthetic."

**Bold / Vibrant (YouTube thumbnails, attention-grabbing):**
Add: "High-contrast, saturated colors. Dramatic lighting with strong highlights and deep shadows. Eye-catching and scroll-stopping. Bold, punchy composition."

---

## COMMON MISTAKES THE AGENT MAKES

1. **Using "auto" engine** → Always specify `gpt` or `gemini` based on use case
2. **Forgetting lighting** → Lighting is 50% of image quality. ALWAYS specify it.
3. **Keyword lists instead of narrative** → Write full descriptive paragraphs
4. **Not specifying camera/lens** → Without this, the AI defaults to "digital art" look
5. **Not setting target dimensions** → Images come back at wrong size for the platform
6. **Defaulting to stylized/artistic** → This is a business tool. Default to PHOTOREALISTIC.
7. **Vague subjects** → "A woman" produces generic. "A Latina woman in her late 20s with shoulder-length dark hair and warm brown eyes" produces specific.
8. **No mood/quality anchors** → End every prompt with "Professional [type] photography. [Mood]. [Quality level]."
9. **Asking the image model to render long text** → Keep it to 5 words. Use HTML overlay for more.
10. **Not using reference images for consistency** → When generating multiple images for the same project, always pass `reference_image_url` from the first image.

---

## QUALITY CHECKLIST

Before calling `image_generate`:
- [ ] Engine explicitly set (gpt or gemini) based on use case
- [ ] Prompt is a narrative paragraph, not a keyword list
- [ ] Subject described with specific physical/visual details
- [ ] Lighting explicitly specified (type, direction, mood)
- [ ] Camera + lens specified for photorealistic shots
- [ ] Size and target dimensions set for the platform
- [ ] Style defaults to photorealistic unless user asked otherwise
- [ ] Text (if any) is 5 words or fewer with exact quotes, font, and placement
- [ ] Mood/quality anchor at the end of the prompt
