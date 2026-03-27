// Image Generation Tools for BLOOM Bloomie Agents
// Primary: GPT Image 1.5 (OpenAI) — best for flyers, book covers, social assets
// Fallback: Nano Banana / Imagen 4 (Google Gemini) — great text consistency
// Model-agnostic tool interface — works with any LLM brain
//
// PROMPT UPSAMPLING: Every prompt is enriched by a fast LLM before hitting the
// image API — just like ChatGPT does. This guarantees professional-quality output
// even when the agent writes a lazy prompt.

import { createLogger } from '../logging/logger.js';
import { callModel } from '../llm/unified-client.js';
import fs from 'fs';
import path from 'path';

const logger = createLogger('image-tools');

// Read API keys fresh each call — not at module load time
// Railway injects env vars before process starts, but dynamic reading is safer
function getOpenAIKey() { return (process.env.OPENAI_API_KEY || "").trim(); }
function getGeminiKey() { return (process.env.GEMINI_API_KEY || "").trim(); }

// ── PROMPT UPSAMPLING ─────────────────────────────────────────────────────
// Like ChatGPT's internal prompt rewriter — transforms short/vague prompts
// into rich, detailed scene descriptions that produce professional images.
// Uses a cheap, fast model (Gemini Flash) to keep costs near zero.
//
// RULES:
// 1. Only upsample if the prompt is "thin" (< 200 chars or missing key details)
// 2. Preserve ALL user-specified text verbatim (headlines, dates, names, phone numbers)
// 3. Add: lighting, camera/lens, composition, color palette, mood, style
// 4. Default to photorealistic commercial photography (not cartoon/illustrated)
// 5. Never change the user's intent — only enrich the description

const UPSAMPLE_SYSTEM = `You are a professional image prompt engineer. Your ONLY job is to rewrite image generation prompts to produce stunning, photorealistic, commercial-quality images.

RULES:
1. PRESERVE all user-specified text, names, dates, numbers, and specific details EXACTLY as given
2. DEFAULT to photorealistic commercial photography unless the user explicitly asked for illustration/cartoon/stylized
3. ADD these elements if missing:
   - Specific lighting (direction, quality, color temperature)
   - Camera and lens (e.g., "Shot on Canon R5 with 85mm f/1.4")
   - Composition and framing (rule of thirds, leading lines, depth layers)
   - Color palette and mood
   - Material textures and fine details
   - Quality anchors ("Professional editorial photography", "Commercial product shot", etc.)
4. Write as ONE flowing descriptive paragraph — NOT a keyword list, NOT bullet points
5. Keep it under 350 words — image models perform worse with extremely long prompts
6. If the prompt already has 5+ of these elements, return it UNCHANGED (prefix with SKIP:)
7. For flyers/posters: describe the visual composition AND specify text placement, font style, size
8. For people: add specific physical details, wardrobe, expression, posture
9. For products: add surface texture, lighting reflections, staging/props, background
10. NEVER add elements that contradict the user's description
11. NEVER use "imagine" or meta-language — write the scene description directly

OUTPUT: Return ONLY the rewritten prompt. No explanations, no "Here's the enhanced prompt:", just the prompt text itself.
If the original prompt is already detailed enough, return it prefixed with "SKIP:" to indicate no changes needed.`;

const UPSAMPLE_MODEL = process.env.UPSAMPLE_MODEL || 'gemini-2.5-flash';
const UPSAMPLE_ENABLED = process.env.IMAGE_UPSAMPLE !== 'false'; // opt-out via env

async function upsamplePrompt(prompt, contentType = null) {
  // Skip upsampling if disabled or prompt is already rich
  if (!UPSAMPLE_ENABLED) return prompt;

  // Quick heuristic: if the prompt is already detailed (200+ chars AND has lighting/camera language), skip
  const hasLighting = /\b(lighting|light|backlit|rim light|softbox|golden hour|natural light|studio light|shadow|highlight)\b/i.test(prompt);
  const hasCamera = /\b(shot on|lens|f\/\d|camera|bokeh|depth of field|focal|aperture|canon|sony|nikon|hasselblad)\b/i.test(prompt);
  const hasMood = /\b(professional|editorial|commercial|cinematic|magazine|high-end|premium|polished)\b/i.test(prompt);

  if (prompt.length > 250 && hasLighting && hasCamera) {
    logger.info('Prompt already detailed, skipping upsample', { length: prompt.length });
    return prompt;
  }

  // Additional context based on content type
  const contextHint = contentType
    ? `\n\nThis image is for: ${contentType}. Optimize the prompt accordingly (e.g., flyers need bold text placement, social posts need scroll-stopping composition, website heroes need wide cinematic framing).`
    : '';

  try {
    // Race the upsample call against a 8-second timeout — never block image generation
    const upsampleCall = callModel(UPSAMPLE_MODEL, {
      system: UPSAMPLE_SYSTEM + contextHint,
      messages: [{ role: 'user', content: `Rewrite this image prompt to produce a stunning professional result:\n\n${prompt}` }],
      maxTokens: 600,
      temperature: 0.7,
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Upsample timed out after 8s')), 8000)
    );
    const result = await Promise.race([upsampleCall, timeoutPromise]);

    const upsampled = (result.text || '').trim();

    // If model returned SKIP: prefix, use original
    if (upsampled.startsWith('SKIP:')) {
      logger.info('Upsample model says prompt is already good');
      return prompt;
    }

    // Sanity check: upsampled should be longer and non-empty
    if (upsampled.length > 50 && upsampled.length > prompt.length * 0.5) {
      logger.info('Prompt upsampled', {
        originalLength: prompt.length,
        upsampledLength: upsampled.length,
        contentType
      });
      return upsampled;
    }

    // Bad result — use original
    logger.warn('Upsample produced bad result, using original', { upsampledLength: upsampled.length });
    return prompt;

  } catch (err) {
    // Upsampling is a nice-to-have, never block image generation
    logger.warn('Prompt upsample failed, using original prompt', { error: err.message });
    return prompt;
  }
}

// ── TOOL DEFINITIONS ─────────────────────────────────────────────────────

export const imageToolDefinitions = {
  image_generate: {
    name: "image_generate",
    description: "Generate an image from a text description. Perfect for creating flyers, social media posts, banners, book covers, logos, product mockups, brand assets, and any visual content. Be very specific and detailed in your prompt for the best results. Include exact text you want in the image, colors, layout details, and style preferences. For character consistency (same person across multiple images), set engine to gemini and pass reference_image_url or reference_image_base64 — Nano Banana will lock the character's identity from the reference photo. IMPORTANT: When creating platform-specific images (Facebook covers, Instagram posts, Eventbrite headers, etc.), ALWAYS set target_width and target_height to the exact pixel dimensions required by that platform. The AI generates at fixed base sizes, then the image is automatically resized/cropped to your target dimensions. Common sizes: Facebook cover 820x312, Instagram post 1080x1080, Instagram story 1080x1920, Eventbrite header 2160x1080, Twitter header 1500x500, LinkedIn banner 1128x191.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed description of the image to generate. Be specific about text content, colors, layout, style, and mood. Example: 'A modern flyer for a summer youth camp. Bold title SUMMER CAMP 2026 in blue. Photos of kids playing. Details: June 15-Aug 20, Ages 8-16, $299/week. Contact: 555-0123. Clean white background with orange accents.'"
        },
        size: {
          type: "string",
          enum: ["1024x1024", "1024x1536", "1536x1024"],
          description: "Base generation size (closest aspect ratio to your target). 1024x1024 for square. 1024x1536 for portrait/tall. 1536x1024 for landscape/wide. The image will be resized to target_width x target_height after generation.",
          default: "1024x1024"
        },
        target_width: {
          type: "integer",
          description: "REQUIRED for platform-specific images. Exact output width in pixels (e.g. 820 for Facebook cover, 1080 for Instagram post). The generated image will be resized and cropped to exactly this width."
        },
        target_height: {
          type: "integer",
          description: "REQUIRED for platform-specific images. Exact output height in pixels (e.g. 312 for Facebook cover, 1080 for Instagram post). The generated image will be resized and cropped to exactly this height."
        },
        quality: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Image quality. 'high' for final assets and client-facing work. 'medium' for drafts and iterations. 'low' for quick concepts.",
          default: "high"
        },
        background: {
          type: "string",
          enum: ["opaque", "transparent"],
          description: "Background type. 'transparent' for logos and assets that need to overlay other content. 'opaque' for everything else.",
          default: "opaque"
        },
        engine: {
          type: "string",
          enum: ["auto", "gpt", "gemini"],
          description: "Which image engine to use. 'auto' picks the best one (default). 'gpt' forces GPT Image 1.5. 'gemini' forces Nano Banana / Imagen for text-heavy work.",
          default: "auto"
        },
        reference_image_url: {
          type: "string",
          description: "URL of a reference image for character consistency. Nano Banana will match the character's face, hair, clothing, and style from this image while applying your prompt. Use when the user uploads a character photo or wants to match a previous generated image."
        },
        reference_image_base64: {
          type: "string",
          description: "Base64-encoded reference image for character consistency (alternative to reference_image_url)."
        }
      },
      required: ["prompt"]
    },
    category: "image",
    operation: "write"
  },

  image_edit: {
    name: "image_edit",
    description: "Edit an existing image with text instructions. Change text, swap backgrounds, adjust colors, add or remove elements, change styles, fix text rendering issues. Upload or reference an existing image and describe what changes you want.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Description of the edits to make. Be specific: 'Change the phone number to 555-9876' or 'Make the background dark blue instead of white' or 'Add a logo in the top-right corner'"
        },
        image_url: {
          type: "string",
          description: "URL of the image to edit. Can be a URL from a previously generated image."
        },
        image_base64: {
          type: "string",
          description: "Base64-encoded image data to edit (alternative to image_url)"
        },
        size: {
          type: "string",
          enum: ["1024x1024", "1024x1536", "1536x1024"],
          description: "Output size for the edited image",
          default: "1024x1024"
        },
        quality: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Output quality",
          default: "high"
        }
      },
      required: ["prompt"]
    },
    category: "image",
    operation: "write"
  },

  image_resize: {
    name: "image_resize",
    description: "Resize/crop an existing image to exact pixel dimensions WITHOUT any AI regeneration. The output is the SAME image, just at different dimensions. Use this when the user uploads an image and wants: size variations for different platforms, the same design at different dimensions, a crop/resize of their existing image. This does NOT generate new content — it preserves the original image exactly. For platform-specific sizes: Facebook cover 820x312, Instagram post 1080x1080, Instagram story 1080x1920, Eventbrite header 2160x1080, Twitter header 1500x500, LinkedIn banner 1128x191, YouTube thumbnail 1280x720.",
    parameters: {
      type: "object",
      properties: {
        image_url: {
          type: "string",
          description: "URL of the image to resize (from uploads or previously generated images)"
        },
        image_base64: {
          type: "string",
          description: "Base64-encoded image data to resize (alternative to image_url)"
        },
        target_width: {
          type: "integer",
          description: "Exact output width in pixels (e.g. 820 for Facebook cover)"
        },
        target_height: {
          type: "integer",
          description: "Exact output height in pixels (e.g. 312 for Facebook cover)"
        },
        mode: {
          type: "string",
          enum: ["cover", "contain", "stretch"],
          description: "Resize mode. 'cover' (default) fills the target dimensions with center-crop — best for platform images. 'contain' fits the entire image within the dimensions with letterboxing. 'stretch' distorts to fill exactly.",
          default: "cover"
        },
        background_color: {
          type: "string",
          description: "Background color for 'contain' mode letterboxing (hex like '#ffffff' or '#000000'). Default: '#000000'",
          default: "#000000"
        }
      },
      required: ["target_width", "target_height"]
    },
    category: "image",
    operation: "write"
  }
};

// ── TOOL EXECUTORS ───────────────────────────────────────────────────────

// Cache for admin image engine config (refreshes every 60s)
let _engineConfigCache = null;
let _engineConfigCacheTime = 0;
const ENGINE_CONFIG_TTL = 60000; // 60 seconds

async function getImageEngineConfig() {
  if (_engineConfigCache && (Date.now() - _engineConfigCacheTime < ENGINE_CONFIG_TTL)) {
    return _engineConfigCache;
  }
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data } = await sb.from('bloom_admin_settings').select('image_engine_config').not('id', 'is', null).single();
    _engineConfigCache = data?.image_engine_config || {};
    _engineConfigCacheTime = Date.now();
    return _engineConfigCache;
  } catch(e) {
    logger.warn('Failed to load image engine config:', e.message);
    return {};
  }
}

export const imageToolExecutors = {
  image_generate: async (params) => {
    const engine = params.engine || 'auto';
    const contentType = params._contentType || params._context || null;
    // PROMPT UPSAMPLING: Enrich the prompt before it hits the image API
    const rawPrompt = params.prompt;
    const prompt = await upsamplePrompt(rawPrompt, contentType);
    if (prompt !== rawPrompt) {
      logger.info('Using upsampled prompt', { original: rawPrompt.slice(0, 80), upsampled: prompt.slice(0, 80) });
    }
    const size = params.size || '1024x1024';
    const quality = params.quality || 'high';
    const background = params.background || 'opaque';

    // Engine selection logic
    const hasReferenceImage = !!(params.reference_image_url || params.reference_image_base64);
    let useEngine = engine;
    if (engine === 'auto') {
      // Check admin image engine config for content-type-specific preferences
      const engineConfig = await getImageEngineConfig();
      const contentType = params._contentType || params._context || null;  // e.g., 'blog', 'flyer', 'website', 'social', 'email'
      const configuredEngine = (contentType && engineConfig[contentType]) || engineConfig.default || null;

      if (configuredEngine && configuredEngine !== 'auto') {
        // Admin has configured a specific engine for this content type
        const keyAvailable = configuredEngine === 'gpt' ? getOpenAIKey() : getGeminiKey();
        if (keyAvailable) {
          useEngine = configuredEngine;
          logger.info(`Auto-routing to ${configuredEngine} per admin config`, { contentType, configuredEngine });
        } else {
          logger.warn(`Admin config says ${configuredEngine} for ${contentType} but no API key — falling back`);
        }
      }

      // If still auto, apply default logic
      if (useEngine === 'auto') {
        if (hasReferenceImage && getGeminiKey()) {
          useEngine = 'gemini';
          logger.info('Auto-routing to Gemini for character consistency (reference image provided)');
        } else if (getOpenAIKey()) {
          useEngine = 'gpt';
        } else if (getGeminiKey()) {
          useEngine = 'gemini';
        } else {
          return { success: false, error: 'No image generation API key configured. Set OPENAI_API_KEY or GEMINI_API_KEY.' };
        }
      }
    }

    if (useEngine === 'gpt') {
      try {
        // If reference image provided with GPT, use edit endpoint (generation doesn't support references)
        if (hasReferenceImage) {
          logger.info('GPT engine with reference image → using edit endpoint for character consistency');
          const refUrl = params.reference_image_url;
          const refB64 = params.reference_image_base64;
          const editPrompt = `Generate a new image based on this reference person. ${prompt}. Keep the person's face, hair, skin tone, ethnicity, and distinguishing features exactly the same.`;
          const result = await editWithGPTImage(editPrompt, refUrl, refB64, size, quality);
          if (result.success) return result;
          // GPT edit failed with reference — fall back to Gemini which handles this natively
          logger.warn('GPT edit with reference failed, trying Gemini', { error: result.error });
          if (getGeminiKey()) return await generateWithGemini(prompt, size, params.reference_image_url, params.reference_image_base64, params.reference_image_mime);
          return result;
        }
        const result = await generateWithGPTImage(prompt, size, quality, background);
        if (result.success) return result;
        // OpenAI failed — try Gemini if available
        logger.warn('OpenAI image failed, trying Gemini fallback', { error: result.error });
        if (getGeminiKey()) return await generateWithGemini(prompt, size, params.reference_image_url, params.reference_image_base64, params.reference_image_mime);
        return result;
      } catch(e) {
        logger.error('OpenAI image threw error', { error: e.message });
        if (getGeminiKey()) return await generateWithGemini(prompt, size, params.reference_image_url, params.reference_image_base64, params.reference_image_mime);
        throw e;
      }
    } else if (useEngine === 'gemini') {
      return await generateWithGemini(prompt, size, params.reference_image_url, params.reference_image_base64, params.reference_image_mime);
    }

    return { success: false, error: `Unknown engine: ${useEngine}` };
  },

  image_edit: async (params) => {
    const prompt = params.prompt;
    const size = params.size || '1024x1024';
    const quality = params.quality || 'high';

    if (getOpenAIKey()) {
      const result = await editWithGPTImage(prompt, params.image_url, params.image_base64, size, quality);
      if (result.success) return result;
      // GPT edit failed — fall through to Gemini if available
      logger.warn('GPT Image edit failed, trying Gemini fallback', { error: result.error });
      if (getGeminiKey()) {
        return await editWithGemini(prompt, params.image_url, params.image_base64);
      }
      return result;
    } else if (getGeminiKey()) {
      // Gemini edit: re-generate with edit instructions + original context
      return await editWithGemini(prompt, params.image_url, params.image_base64);
    }

    return { success: false, error: 'No image API key configured' };
  },

  image_resize: async (params) => {
    const tw = parseInt(params.target_width);
    const th = parseInt(params.target_height);
    const mode = params.mode || 'cover';

    if (!tw || !th || tw <= 0 || th <= 0) {
      return { success: false, error: 'target_width and target_height are required and must be positive integers' };
    }
    if (tw > 8192 || th > 8192) {
      return { success: false, error: 'Maximum dimension is 8192px' };
    }

    let imgBuffer = null;

    // Get the image from base64 or URL
    if (params.image_base64) {
      imgBuffer = Buffer.from(params.image_base64, 'base64');
    } else if (params.image_url) {
      try {
        const resp = await fetch(params.image_url);
        if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
        imgBuffer = Buffer.from(await resp.arrayBuffer());
      } catch (e) {
        return { success: false, error: `Could not fetch image: ${e.message}` };
      }
    } else {
      return { success: false, error: 'Provide image_url or image_base64 to resize' };
    }

    try {
      const Jimp = (await import('jimp')).default;
      const image = await Jimp.read(imgBuffer);

      if (mode === 'contain') {
        // Fit entire image within dimensions, letterbox with background color
        const bgColor = params.background_color || '#000000';
        const bg = await new Jimp(tw, th, bgColor);
        image.contain(tw, th);
        bg.composite(image, 0, 0);
        const resizedBuffer = await bg.getBufferAsync(Jimp.MIME_PNG);
        return {
          success: true,
          engine: 'resize-contain',
          image_base64: resizedBuffer.toString('base64'),
          filepath: `/tmp/bloom-resize-${Date.now()}.png`,
          filename: `bloom-resize-${Date.now()}.png`,
          target_width: tw,
          target_height: th,
          message: `Image resized to ${tw}x${th} (contain mode)`,
        };
      } else if (mode === 'stretch') {
        image.resize(tw, th);
      } else {
        // cover mode (default) — resize + center-crop to fill exact dimensions
        image.cover(tw, th);
      }

      const resizedBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
      const filename = `bloom-resize-${Date.now()}.png`;
      const filepath = `/tmp/${filename}`;
      fs.writeFileSync(filepath, resizedBuffer);

      return {
        success: true,
        engine: 'resize',
        image_base64: resizedBuffer.toString('base64'),
        filepath,
        filename,
        target_width: tw,
        target_height: th,
        message: `Image resized to exact ${tw}x${th} dimensions (${mode} mode)`,
      };
    } catch (e) {
      return { success: false, error: `Resize failed: ${e.message}` };
    }
  }
};

// ── GPT IMAGE 1.5 (OpenAI) ──────────────────────────────────────────────

async function generateWithGPTImage(prompt, size, quality, background) {
  try {
    logger.info('Generating image with GPT Image 1.5', { size, quality });

    // Map our sizes to OpenAI supported sizes
    // gpt-image-1.5 supports: 1024x1024, 1536x1024, 1024x1536, auto
    const validSize = ['1024x1024','1536x1024','1024x1536'].includes(size) ? size : '1024x1024';

    const apiKey = getOpenAIKey().trim();
    if (!apiKey) {
      logger.error('OpenAI API key is empty after trim');
      return { success: false, error: 'OPENAI_API_KEY is empty or not set', engine: 'gpt-image-1.5' };
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1.5',
        prompt,
        n: 1,
        size: validSize,
        quality: quality === 'high' ? 'high' : quality === 'low' ? 'low' : 'medium',
        output_format: 'png',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('GPT Image API error', { status: response.status, err, keyPrefix: apiKey.substring(0, 8) });

      // If 1.5 fails, try gpt-image-1
      if (response.status === 404 || response.status === 400) {
        logger.info('Falling back to gpt-image-1');
        return await generateWithGPTImageFallback(prompt, size, quality, background);
      }

      throw new Error(`OpenAI Image API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const imageData = data.data?.[0];

    if (!imageData) {
      throw new Error('No image data returned');
    }

    // Save to file system for dashboard access
    const filename = `bloom-image-${Date.now()}.png`;
    const filepath = `/tmp/${filename}`;

    if (imageData.b64_json) {
      fs.writeFileSync(filepath, Buffer.from(imageData.b64_json, 'base64'));
    }

    const result = {
      success: true,
      engine: 'gpt-image-1.5',
      image_base64: imageData.b64_json || null,
      image_url: imageData.url || null,
      filepath,
      filename,
      size,
      quality,
      revised_prompt: imageData.revised_prompt || null,
      usage: data.usage || null,
      message: `Image generated with GPT Image 1.5 (${size}, ${quality} quality)`,
    };

    logger.info('GPT Image generated', { filename, size });
    return result;

  } catch (error) {
    logger.error('GPT Image generation failed:', error.message);
    
    // Try Gemini as fallback if available
    if (getGeminiKey()) {
      logger.info('Falling back to Gemini/Nano Banana');
      return await generateWithGemini(prompt, size);
    }

    return { success: false, error: error.message, engine: 'gpt-image-1.5' };
  }
}

async function generateWithGPTImageFallback(prompt, size, quality, background) {
  const validSize = ['1024x1024','1536x1024','1024x1536'].includes(size) ? size : '1024x1024';
  const apiKey = getOpenAIKey().trim();
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: validSize,
      quality: quality === 'high' ? 'high' : quality === 'low' ? 'low' : 'medium',
      output_format: 'png',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Image API fallback error: ${err}`);
  }

  const data = await response.json();
  const imageData = data.data?.[0];
  const filename = `bloom-image-${Date.now()}.png`;
  const filepath = `/tmp/${filename}`;

  if (imageData?.b64_json) {
    fs.writeFileSync(filepath, Buffer.from(imageData.b64_json, 'base64'));
  }

  return {
    success: true,
    engine: 'gpt-image-1',
    image_base64: imageData?.b64_json || null,
    image_url: imageData?.url || null,
    filepath,
    filename,
    size,
    quality,
    message: `Image generated with GPT Image 1 (fallback)`,
  };
}

async function editWithGPTImage(prompt, imageUrl, imageBase64, size, quality) {
  try {
    logger.info('Editing image with GPT Image 1.5');

    // Build form data for image edit
    const formData = new FormData();
    formData.append('model', 'gpt-image-1.5');
    formData.append('prompt', prompt);
    formData.append('size', size);
    formData.append('quality', quality);

    // Attach image — OpenAI expects 'image[]' (array format) for GPT Image models
    if (imageBase64) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const blob = new Blob([buffer], { type: 'image/png' });
      formData.append('image[]', blob, 'input.png');
    } else if (imageUrl) {
      // Fetch the image first
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error(`Failed to fetch image for edit: ${imgResponse.status}`);
      const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
      const blob = new Blob([imgBuffer], { type: 'image/png' });
      formData.append('image[]', blob, 'input.png');
    }

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getOpenAIKey().trim()}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI Image Edit error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const imageData = data.data?.[0];
    const filename = `bloom-edit-${Date.now()}.png`;
    const filepath = `/tmp/${filename}`;

    if (imageData?.b64_json) {
      fs.writeFileSync(filepath, Buffer.from(imageData.b64_json, 'base64'));
    }

    return {
      success: true,
      engine: 'gpt-image-1.5-edit',
      image_base64: imageData?.b64_json || null,
      image_url: imageData?.url || null,
      filepath,
      filename,
      size,
      quality,
      message: `Image edited successfully with GPT Image 1.5`,
    };

  } catch (error) {
    logger.error('GPT Image edit failed:', error.message);
    return { success: false, error: error.message, engine: 'gpt-image-1.5-edit' };
  }
}

// ── NANO BANANA / IMAGEN (Google Gemini) ─────────────────────────────────

async function generateWithGemini(prompt, size, referenceImageUrl, referenceImageBase64, referenceImageMime) {
  try {
    logger.info('Generating image with Gemini');

    // Try Nano Banana FIRST (includes Nano Banana 2 with fallback to original)
    try {
      logger.info('Trying Nano Banana');
      const result = await generateWithNanoBanana(prompt, size, referenceImageUrl, referenceImageBase64, referenceImageMime);
      if (result.success) return result;
    } catch(e) {
      logger.warn('Nano Banana failed, trying Imagen 4', { error: e.message });
    }

    // Fallback: Imagen 4 (may require paid tier)
    logger.info('Trying Imagen 4');
    let aspectRatio = '1:1';
    if (size === '1024x1536') aspectRatio = '2:3';
    if (size === '1536x1024') aspectRatio = '3:2';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${getGeminiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio,
          },
        }),
      }
    );

    if (!response.ok) {
      // Try Nano Banana (Gemini flash image model) as alternative
      logger.info('Imagen 4 failed, trying Nano Banana 2 (Gemini 3.1 Flash Image)');
      return await generateWithNanoBanana(prompt, size, referenceImageUrl, referenceImageBase64);
    }

    const data = await response.json();
    const prediction = data.predictions?.[0];

    if (!prediction?.bytesBase64Encoded) {
      throw new Error('No image data in Gemini response');
    }

    const filename = `bloom-gemini-${Date.now()}.png`;
    const filepath = `/tmp/${filename}`;
    fs.writeFileSync(filepath, Buffer.from(prediction.bytesBase64Encoded, 'base64'));

    return {
      success: true,
      engine: 'imagen-4',
      image_base64: prediction.bytesBase64Encoded,
      filepath,
      filename,
      size,
      message: `Image generated with Imagen 4 / Nano Banana (${size})`,
    };

  } catch (error) {
    logger.error('Gemini image generation failed:', { error: error.message, stack: error.stack, hasKey: !!getGeminiKey() });
    return { success: false, error: error.message, engine: 'gemini' };
  }
}

async function generateWithNanoBanana(prompt, size, referenceImageUrl, referenceImageBase64, referenceImageMime) {
  try {
    // Try Nano Banana 2 (gemini-3.1-flash-image-preview) first — faster, 14 reference images,
    // 4K resolution, thinking mode. Falls back to gemini-2.5-flash-image if 3.1 fails.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45 second timeout (thinking mode needs more time)

    // Map size to aspect ratio — Nano Banana 2 supports many more:
    // 1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9
    let aspectRatio = '1:1'; // default square
    if (size === '1024x1536') aspectRatio = '2:3'; // portrait
    if (size === '1536x1024') aspectRatio = '3:2'; // landscape

    const hasReference = !!(referenceImageBase64 || referenceImageUrl);
    const parts = [];

    // ── REFERENCE IMAGE GOES FIRST (Google's recommended order for editing/reference) ──
    // Google docs: "When using a single image with text, place the text prompt after the image part"
    if (referenceImageBase64) {
      // Detect mime type from base64 header or use provided mime type
      let mimeType = referenceImageMime || 'image/jpeg';
      // Check base64 magic bytes if no mime provided
      if (!referenceImageMime && referenceImageBase64.startsWith('/9j/')) mimeType = 'image/jpeg';
      else if (!referenceImageMime && referenceImageBase64.startsWith('iVBOR')) mimeType = 'image/png';
      else if (!referenceImageMime && referenceImageBase64.startsWith('UklGR')) mimeType = 'image/webp';

      parts.push({ inlineData: { mimeType, data: referenceImageBase64 } });
      logger.info('Nano Banana: reference image added (base64)', { mimeType, dataLength: referenceImageBase64.length });
    } else if (referenceImageUrl) {
      try {
        const refResp = await fetch(referenceImageUrl);
        const refBuf = await refResp.arrayBuffer();
        const refB64 = Buffer.from(refBuf).toString('base64');
        const refMime = refResp.headers.get('content-type') || 'image/jpeg';
        parts.push({ inlineData: { mimeType: refMime, data: refB64 } });
        logger.info('Nano Banana: reference image fetched and added (url)', { mimeType: refMime });
      } catch(refErr) {
        logger.warn('Nano Banana: failed to fetch reference image, proceeding without it', { error: refErr.message });
      }
    }

    // ── TEXT PROMPT GOES AFTER THE IMAGE ──
    // DO NOT wrap with hardcoded "person" language — the LLM's prompt already describes
    // what it wants. The model understands the role of the reference image from the prompt.
    // Wrapping with "Generate a new image of the person..." broke non-person references
    // (flyers, logos, products) and even confused person references.
    parts.push({ text: prompt });

    // Try Nano Banana 2 first, fall back to original if it fails
    const models = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'];
    let lastError = null;

    for (const modelId of models) {
      try {
        logger.info(`Nano Banana: trying ${modelId}${hasReference ? ' with reference image' : ''}`);

        const modelController = new AbortController();
        const modelTimeout = setTimeout(() => modelController.abort(), modelId.includes('3.1') ? 45000 : 30000);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${getGeminiKey()}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                // TEXT+IMAGE required when sending reference images (IMAGE-only ignores input images)
                responseModalities: hasReference ? ["TEXT", "IMAGE"] : ["IMAGE"],
                imageConfig: {
                  aspectRatio: aspectRatio,
                  // Nano Banana 2 supports image_size for higher res
                  ...(modelId.includes('3.1') ? { imageSize: '1K' } : {})
                }
              },
            }),
            signal: modelController.signal
          }
        );

        clearTimeout(modelTimeout);

        if (!response.ok) {
          const err = await response.text();
          logger.warn(`${modelId} API error`, { status: response.status, error: err });
          lastError = new Error(`${modelId} API error ${response.status}: ${err}`);
          continue; // Try next model
        }

        const data = await response.json();

        // Find image part in response (skip thought images)
        const responseParts = data.candidates?.[0]?.content?.parts || [];
        const imagePart = responseParts.find(p => p.inlineData?.mimeType?.startsWith('image/') && !p.thought);
        // If no non-thought image, take any image
        const finalImage = imagePart || responseParts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

        if (!finalImage) {
          lastError = new Error(`No image in ${modelId} response`);
          continue; // Try next model
        }

        const filename = `bloom-nanob-${Date.now()}.png`;
        const filepath = `/tmp/${filename}`;
        fs.writeFileSync(filepath, Buffer.from(finalImage.inlineData.data, 'base64'));

        // Get any text description
        const textPart = responseParts.find(p => p.text && !p.thought);

        clearTimeout(timeout);
        return {
          success: true,
          engine: modelId.includes('3.1') ? 'nano-banana-2' : 'nano-banana',
          image_base64: finalImage.inlineData.data,
          filepath,
          filename,
          size,
          description: textPart?.text || null,
          message: `Image generated with ${modelId.includes('3.1') ? 'Nano Banana 2' : 'Nano Banana'}`,
        };
      } catch (modelErr) {
        if (modelErr.name === 'AbortError') {
          logger.warn(`${modelId} timed out, trying next model`);
          lastError = new Error(`${modelId} timed out`);
        } else {
          logger.warn(`${modelId} failed`, { error: modelErr.message });
          lastError = modelErr;
        }
        continue;
      }
    }

    clearTimeout(timeout);
    throw lastError || new Error('All Nano Banana models failed');

  } catch (error) {
    logger.error('Nano Banana generation failed:', { error: error.message, stack: error.stack, prompt: prompt.substring(0, 100) });
    return { success: false, error: error.message, engine: 'nano-banana' };
  }
}

async function editWithGemini(prompt, imageUrl, imageBase64) {
  try {
    logger.info('Editing image with Nano Banana');

    let base64Data = imageBase64;
    if (!base64Data && imageUrl) {
      const imgResponse = await fetch(imageUrl);
      const buffer = Buffer.from(await imgResponse.arrayBuffer());
      base64Data = buffer.toString('base64');
    }

    if (!base64Data) {
      return { success: false, error: 'No image provided to edit' };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${getGeminiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/png', data: base64Data } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Nano Banana edit error: ${err}`);
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart) {
      throw new Error('No edited image in response');
    }

    const filename = `bloom-edit-nanob-${Date.now()}.png`;
    const filepath = `/tmp/${filename}`;
    fs.writeFileSync(filepath, Buffer.from(imagePart.inlineData.data, 'base64'));

    return {
      success: true,
      engine: 'nano-banana-edit',
      image_base64: imagePart.inlineData.data,
      filepath,
      filename,
      message: `Image edited with Nano Banana`,
    };

  } catch (error) {
    logger.error('Nano Banana edit failed:', error.message);
    return { success: false, error: error.message, engine: 'nano-banana-edit' };
  }
}

// ── EXECUTOR ─────────────────────────────────────────────────────────────

export async function executeImageTool(toolName, parameters) {
  const startTime = Date.now();
  logger.info(`Executing image tool: ${toolName}`, { prompt: parameters.prompt?.slice(0, 100) });

  if (!imageToolExecutors[toolName]) {
    throw new Error(`Unknown image tool: ${toolName}`);
  }

  try {
    const result = await imageToolExecutors[toolName](parameters);
    const duration = Date.now() - startTime;
    logger.info(`Image tool completed: ${toolName} (${duration}ms)`, { engine: result.engine });

    // ── POST-PROCESS RESIZE: Crop/resize to exact platform dimensions ──
    // AI generators output fixed sizes (1024x1024, 1536x1024, etc.)
    // This step resizes to the exact target_width x target_height the user needs
    if (result.success && result.image_base64 && parameters.target_width && parameters.target_height) {
      try {
        const tw = parseInt(parameters.target_width);
        const th = parseInt(parameters.target_height);
        if (tw > 0 && th > 0 && tw <= 4096 && th <= 4096) {
          logger.info(`Resizing image to exact platform dimensions: ${tw}x${th}`);
          const imgBuffer = Buffer.from(result.image_base64, 'base64');
          const Jimp = (await import('jimp')).default;
          const image = await Jimp.read(imgBuffer);

          // Use cover (resize + center-crop) to fill exact dimensions without distortion
          image.cover(tw, th);

          const resizedBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
          result.image_base64 = resizedBuffer.toString('base64');

          // Update the file on disk too
          if (result.filepath) {
            fs.writeFileSync(result.filepath, resizedBuffer);
          }

          result.target_width = tw;
          result.target_height = th;
          result.message = `Image generated and resized to exact ${tw}x${th} dimensions. ${result.message || ''}`;
          logger.info(`Image resized to ${tw}x${th} successfully`);
        }
      } catch (resizeErr) {
        logger.error('Image resize failed (using original size):', resizeErr.message);
        // Non-fatal — keep the original-sized image
      }
    }

    // Upload to Supabase Storage for permanent CDN-backed URL
    // Falls back to local /api/files/preview/ if Supabase not configured
    if (result.success && result.image_base64) {
      try {
        const { uploadImage, isConfigured } = await import('../storage/supabase-storage.js');
        if (isConfigured()) {
          const fname = `bloom-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`;
          const upload = await uploadImage(result.image_base64, fname, 'image/png');
          if (upload.success && upload.url) {
            result.image_url = upload.url;
            result.message = `Image generated! Use this URL in HTML: ${upload.url}`;
            logger.info('Image uploaded to Supabase CDN', { url: upload.url });
          }
        }

        // ALWAYS save to Supabase artifacts table so it shows in Files tab
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
          );

          const { data: artifact, error: artifactErr } = await supabase
            .from('artifacts')
            .insert({
              organization_id: process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001',
              created_by_user_id: process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce',
              agent_id: parameters.agentId || process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003',
              session_id: parameters.sessionId || null,
              name: `bloom-img-${Date.now()}.png`,
              description: `Generated: ${(parameters.prompt || '').slice(0, 100)}`,
              file_type: 'image',
              mime_type: 'image/png',
              file_size: result.image_base64 ? Buffer.from(result.image_base64, 'base64').length : null,
              storage_path: result.image_url || null,
              content: null // images stored in Storage, not content column
            })
            .select('id')
            .single();

          if (!artifactErr && artifact) {
            // Use Supabase artifact ID as file reference
            if (!result.image_url) {
              result.image_url = `/api/files/preview/${artifact.id}`;
            }
            result.fileId = artifact.id;
            result.message = result.message || `Image saved! URL: ${result.image_url}`;
            logger.info('Image saved to Supabase artifacts', { id: artifact.id, url: result.image_url });
          } else if (artifactErr) {
            logger.error('Supabase artifact insert failed', { error: artifactErr.message });
          }
        } catch (dbErr) {
          logger.error('Supabase artifact save failed', { error: dbErr.message });
        }
        
        // Ensure we always have a message, even if storage failed
        if (!result.message) {
          result.message = 'Image generated but storage failed. The image was created but could not be saved to Files. Please try again or contact support.';
        }
      } catch (e) {
        logger.error('Image storage failed:', { error: e.message, stack: e.stack });
      }
    }

    return { ...result, executionTime: duration, tool: toolName };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Image tool failed: ${toolName} (${duration}ms)`, error.message);
    return { success: false, error: error.message, executionTime: duration, tool: toolName };
  }
}
