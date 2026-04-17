# Seedance 2.0 — UGC Ads Prompt Engineering Guide

Source: Sirio Berati's UGC AI Ads Guide. This is the prompting framework the pipeline uses to construct every Seedance 2.0 generation.

## Core Formula

```
[Image Reference @tag] → [Subject + Wardrobe + Product]
  → [Action + Movement + Camera]
  → [Tone + Style + Feeling]
  → [Dialogue / Spoken Line]
```

Every prompt should follow this order. Skipping a layer reduces output quality.

---

## Four Prompting Styles

### 1. Structural Descriptive
Single paragraph. Best for general UGC, fast iteration.

> "Using @image1 as the product reference, create a realistic creator style review video featuring a woman wearing the LED mask while it is turned on. She is dressed in a soft robe and holding the remote controller in one hand..."

### 2. Structural Breakdown
Separate components. Best for complex products needing precise control.

```
Reference: @image1 the LED product
Subject: female creator
Setting: cozy nighttime bedroom
Wardrobe: light fitted tank top, casual lounge shorts
Product: light therapy face mask with visible cable
Tone: casual, personal, skincare obsessed
```

### 3. Structural Timestamp
Beat-by-beat with `[HH:MM-HH:MM]` brackets. Best for scripted ads, dialogue pacing.

```
[00:00-00:01] She casually sips from a glass, opening like a real nighttime routine.
[00:01-00:05] She grabs the mask, holds it up, says: "My favorite thing, I am obsessed..."
[00:05-00:12] She turns it on, red light visible, puts it on her face.
[00:12-00:13] Wearing mask, casually scrolling phone.
```

### 4. Freestyle
Describe outcome, not steps. Best for ASMR, lifestyle, creative discovery.

> "An influencer trying an LED mask and talking about the different settings..."

---

## Format Templates

### UGC Talking Head
```
Using @image1 as reference, create a [iPhone style / realistic creator style] UGC video featuring [subject gender + descriptor] holding [product] and speaking directly to camera. She is dressed in [wardrobe], in a [setting]. She gestures with [natural movements] and says exactly: "[dialogue]". [Tone: authentic, casual, excited]. Natural lighting, phone camera quality, slight front camera imperfection, not overly polished, social media native aesthetic.
```

### Podcast Ad
```
Two-shot podcast setup with host and guest. Host holds [product from @image1] and casually mentions: "[dialogue line about product]". Natural conversational delivery, professional podcast lighting, microphone visible, mid-shot framing, 16:9 or 9:16 aspect.
```

### Lifestyle / Multi-Reference
```
Create a lifestyle commercial for the [product] in @Image1 using the mood and vibe of @Image2 [and @Image3]. It should feel cinematic, [retro / modern / aspirational], and lifestyle focused. [Time of day], [location], [color palette]. Subject [interacts with product naturally], camera [movement], music feel: [tempo].
```

### Greenscreen Ad
```
iPhone style UGC talking head cutout of [subject] speaking directly to camera against a bold [color] background, with [product packages from @image1] floating above her in a collage layout. She gestures with one finger as if recommending the product. Bright, punchy ad aesthetic, casual creator content feel. She is talking about [product] as [hook/positioning].
```

### ASMR Product Review
```
asmr product review of [product description]. Close handheld angle, hands in frame, satisfying tactile details: [specific sensory cues]. Slow deliberate movements, crisp ASMR sounds, natural lighting, realistic social media feel.
```

### Unboxing
```
ASMR unboxing video of [product] from @image1, shot from a close handheld overhead angle with both hands in frame, just like a real creator unboxing on a table or against a clean wall. Show [package opening details]. Focus on the satisfying tactile details: [specific cues]. Keep the composition tight and product focused, with authentic phone camera quality, natural lighting, crisp ASMR sounds, slow deliberate movements.
```

### News Anchor / Breaking News
```
Professional news anchor in studio setting reading a brief segment about [product]. Studio lighting, news desk, lower-third graphics visible. Anchor delivers: "Breaking in [category] - [product] is [positioning]. [Sales angle]." Authoritative tone, broadcast quality.
```

### Cinematic / Premium
```
Cinematic HBO-style commercial for [product]. [Time of day], [location], moody lighting, shallow depth of field, slow camera movement. Subject [action]. Voiceover: "[dialogue with poetic delivery]". Premium aesthetic, film grain, cinematic color grade.
```

---

## High-Performance Keywords

**Content type:** UGC, iPhone style, talking head, ASMR, unboxing, product review, greenscreen, lifestyle commercial, selfie, creator testimonial

**Subject direction:** speaking directly to camera, walking toward camera, holding product, natural hand gestures, adjusts naturally, casually sips, scrolling on phone, leaning forward, gestures with one finger

**Tone & feel:** authentic, genuine, casual, excited, personal, persuasive, cinematic, retro, punchy ad aesthetic, realistic

**Visual quality:** natural lighting, phone camera quality, natural skin texture, slight front camera imperfection, not overly polished, social media native, bright and readable

**Product handling:** holds up clearly, showcasing the screen, product clearly visible, keep visible throughout, angled toward camera, gripping the box, presenting like proof

---

## Critical Rules

1. **Always describe the gender** of the influencer (especially with lipsync mode — voice must match)
2. **Always reference the image tag** (`@image1`, `@image2`) when using image inputs
3. **Use exact dialogue in quotes** — do not paraphrase the spoken line
4. **Keep duration realistic**: 15s for full UGC, 8-15s for greenscreen, 5-10s for product showcase
5. **Match aspect ratio to platform**: 9:16 for TikTok/Reels, 1:1 for feed, 16:9 for YouTube/podcast
6. **Use freestyle for ASMR** — strange product interactions emerge from looser prompts
7. **Use timestamps for scripted dialogue** — beat-by-beat control prevents pacing issues

---

## Known Limitations

- Labels/text on products: ~80% consistent, can shift
- Freestyle prompts: more creative but more artifacts
- Lipsync mode: occasionally inserts unspoken words
- Max output: 720p (WaveSpeed supports 1080p but Seedance native is 720p)
