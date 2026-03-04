# Skill: Image Generation

## When to use
User asks you to create, design, generate, or make any visual content — flyers, social posts, banners, logos, thumbnails, etc.

## Tool: image_generate

### Size Guide
- `1024x1024` — Square: Instagram posts, profile pics, thumbnails
- `1024x1536` — Portrait/tall: Flyers, event posters, book covers, Pinterest
- `1536x1024` — Landscape/wide: Facebook covers, banners, YouTube thumbnails

### Quality
- `high` — Default for client deliverables
- `medium` — Quick drafts
- `low` — Rapid iterations

### Engine
- `auto` — Let the system pick (usually GPT Image)
- `gpt` — GPT Image 1.5: best for design, layout, photorealism
- `gemini` — Nano Banana / Imagen: use when text rendering needs to be perfect

## Prompt Engineering Rules
1. **Be EXTREMELY specific** — don't say "a nice flyer", say exactly what you want
2. **Include exact text** — spell out every word that should appear on the image
3. **Specify colors** — use hex codes or specific color names from the client's brand
4. **Describe layout** — top/bottom/left/right, what goes where
5. **Set the mood** — professional, playful, elegant, bold, minimal
6. **Reference style** — "modern minimalist", "bold geometric", "watercolor", "corporate clean"

## Prompt Template
```
[Content type] for [client/brand]. 
Background: [color/gradient/image description]. 
Top section: [what goes here]. 
Center: [main focal point]. 
Bottom: [CTA, contact info, etc]. 
Text on image: "[exact text]". 
Style: [aesthetic description]. 
Colors: [specific palette]. 
Mood: [feeling/energy].
```

## Common Mistakes to Avoid
- Don't put too much text on one image (3-5 lines max)
- Don't use dark text on dark backgrounds
- Don't forget the client's logo/branding
- Don't create images that are too busy — whitespace is good
- If text comes out wrong, switch engine to 'gemini' and retry

## Output
After generating, ALWAYS show the image to the user in chat.
If they approve, save to files. If they want edits, use image_edit.
