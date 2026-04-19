# ByteDance Seedance 2.0 — Official Specification

> Reference document for AI agents constructing Seedance prompts via the WaveSpeed API.

---

## Overview

Seedance 2.0 is ByteDance's state-of-the-art video generation model. It supports **text-to-video** and **image-to-video** (including multi-image reference). It understands physics, human motion, complex compositions, and cinematic language natively.

---

## Models Available via WaveSpeed

| Model ID | Quality | Speed | Best For |
|---|---|---|---|
| `bytedance/seedance-1-lite` | Good | Fast | Drafts, prototypes |
| `bytedance/seedance-1-pro` | Excellent | Moderate | Production |
| `bytedance/seedance-2.0-fast` | High | Fast | Efficient production |
| `bytedance/seedance-2.0` | Highest | Standard | Maximum quality |

---

## Prompt Formula

```
[Shot type], [Subject], [Action/State], [Environment], [Lighting], [Style/Mood]
```

### Shot Types
- `Close-up` / `Extreme close-up` — face, product detail, texture
- `Medium shot` — waist-up, conversational, UGC talking heads
- `Wide shot` / `Establishing shot` — scene context, environment
- `Low angle` — power, confidence, hero product shots
- `Bird's eye` / `Overhead` — flat lay, unboxing, food
- `POV shot` — immersive first-person, lifestyle
- `Tracking shot` — follows subject movement
- `Dolly zoom` — psychological tension or awe
- `Handheld` — authentic, raw, UGC feel

### Subject Description
Be specific and physical: age, appearance, clothing, expression, body position. Do NOT use names. Describe what you see, not who the person is.

**Good:** `A 28-year-old woman with natural makeup, wearing a white linen shirt, holding a skincare product, looking directly at camera with a relaxed smile`

**Bad:** `A beautiful woman`

### Action / State
Describe motion precisely. Include speed, direction, energy level.
- `slowly raises the bottle to eye level`
- `walks toward camera with confident stride`
- `applies product to cheek with gentle circular motion`
- `reacts with surprise and delight, eyebrows raising`

### Environment
- `minimalist white studio with soft diffused light`
- `sunlit bathroom with steam and natural greenery`
- `urban rooftop at golden hour`
- `cozy coffee shop, bokeh background`
- `clean kitchen counter, modern aesthetic`

### Lighting
- `soft natural window light from the left`
- `golden hour sunlight, warm tones`
- `ring light setup, even and flattering`
- `dramatic side lighting with deep shadows`
- `overcast outdoor, diffused and even`
- `neon accents with moody contrast`

### Style / Mood
- `UGC aesthetic, authentic and raw`
- `cinematic 4K, shallow depth of field`
- `TikTok vertical format, high energy`
- `ASMR slow and intimate`
- `product commercial, clean and polished`
- `lifestyle vlog, warm and aspirational`

---

## @ Syntax for Multimodal Reference (Image-to-Video)

When using image references, use the `@` syntax to anchor subjects and products:

```
@image1 [description of what image1 is and how it should behave]
@image2 [description of what image2 is and how it should behave]
```

### Rules
- `@image1` — typically the **subject/person** reference image
- `@image2` — typically the **product** reference image (used as `last_image` in WaveSpeed)
- The model will maintain visual consistency with the reference images throughout the video
- Do NOT instruct the model to "use the image" — just describe the subject/product as they appear naturally in the prompt, and the @ reference anchors them

### Example with References
```
@image1 A young woman in athletic wear performs a morning skincare routine, 
medium shot, soft bathroom lighting, applying @image2 serum to her face with 
two fingers, looking into mirror, natural confident expression, UGC aesthetic, 
vertical format, warm tones
```

---

## API Parameters (WaveSpeed)

### Image-to-Video (`/bytedance/seedance-2.0-fast/image-to-video`)

```json
{
  "prompt": "string — your full Seedance-native prompt",
  "image": "string — URL of subject/first reference image",
  "last_image": "string — URL of product/second reference image (optional)",
  "reference_audios": ["string — URL of audio file for vocal reference (optional)"],
  "duration": 5,
  "resolution": "720p",
  "seed": -1,
  "motion_scale": 0.7
}
```

### Text-to-Video (`/bytedance/seedance-2.0/text-to-video`)

```json
{
  "prompt": "string — your full prompt",
  "duration": 5,
  "resolution": "720p",
  "seed": -1,
  "motion_scale": 0.7,
  "aspect_ratio": "9:16"
}
```

### Parameters Reference

| Parameter | Options | Notes |
|---|---|---|
| `duration` | `5`, `10` | Seconds. 5s ≈ 1 scene, 10s ≈ 2 scenes |
| `resolution` | `"480p"`, `"720p"`, `"1080p"` | 1080p highest quality |
| `aspect_ratio` | `"9:16"`, `"16:9"`, `"1:1"` | 9:16 for TikTok/Reels/Shorts |
| `motion_scale` | `0.0` – `1.0` | 0.5 = natural, 0.9 = dynamic, 0.3 = subtle |
| `seed` | `-1` or integer | `-1` = random, set integer for reproducibility |

---

## Pricing (WaveSpeed)

| Resolution | Per Second |
|---|---|
| 480p | ~$0.10 |
| 720p | ~$0.20 |
| 1080p | ~$0.30 |

5-second clip at 720p ≈ **$1.00**. 10-second clip at 1080p ≈ **$3.00**.

---

## Prompt Best Practices

### DO
- Use specific physical descriptions for people, products, environments
- Specify motion with verbs: `slowly pans`, `rapidly cuts to`, `glides forward`
- Include platform-native language: `UGC aesthetic`, `vertical format`, `talking-head style`
- Combine shot type + subject + action in one fluid sentence
- Use lighting descriptors that match the mood: `warm golden hour`, `clinical white light`
- Reference emotions through behavior, not labels: `eyes widen with surprise` not `surprised`

### DON'T
- Use celebrity or brand names
- Over-describe — Seedance understands cinematic shorthand
- Stack conflicting styles (`cinematic noir + bright cheerful UGC`)
- Use first-person voice in prompts
- Forget the `@image1`/`@image2` anchoring when using reference images

---

## Proven Prompt Patterns for UGC Ads

### 1. Talking Head / Direct Response
```
Medium shot, [subject description], looking directly at camera, speaking with 
natural hand gestures, [environment], [lighting], UGC aesthetic, authentic and 
unscripted feel, vertical 9:16 format
```

### 2. Product Reveal
```
Close-up of hands holding [product description], slow rotation revealing all 
sides, [environment], [lighting], product commercial aesthetic, crisp and clean
```

### 3. Lifestyle Demonstration
```
[Shot type], [subject] using [product] in [environment], natural motion, 
[lighting], lifestyle vlog aesthetic, warm and aspirational
```

### 4. Before/After Transition
```
Split scene: first half shows [problem state], second half shows [solution state 
with product], smooth transition, [lighting], aspirational tone
```

### 5. Reaction / Testimonial
```
Medium close-up, [subject] reacting positively to [product experience], genuine 
surprise and delight expression, natural gesture toward product, [environment], 
ring light, UGC testimonial format
```

---

## Motion Scale Guide

| Value | Feel | Use Case |
|---|---|---|
| `0.2` – `0.4` | Subtle, calm | ASMR, skincare, luxury |
| `0.5` – `0.6` | Natural | Lifestyle, talking head |
| `0.7` – `0.8` | Dynamic | Fitness, energy drinks |
| `0.9` – `1.0` | High-energy | Action, gaming, fast cuts |

---

*Source: ByteDance Seedance 2.0 technical documentation + WaveSpeed API spec*
*Last updated: April 2026*
