// Image Generation Tools for BLOOM Bloomie Agents
// Primary: GPT Image 1.5 (OpenAI) — best for flyers, book covers, social assets
// Fallback: Nano Banana / Imagen 4 (Google Gemini) — great text consistency
// Model-agnostic tool interface — works with any LLM brain

import { createLogger } from '../logging/logger.js';
import fs from 'fs';
import path from 'path';

const logger = createLogger('image-tools');

// Read API keys fresh each call — not at module load time
// Railway injects env vars before process starts, but dynamic reading is safer
function getOpenAIKey() { return process.env.OPENAI_API_KEY || ""; }
function getGeminiKey() { return process.env.GEMINI_API_KEY || ""; }

// ── TOOL DEFINITIONS ─────────────────────────────────────────────────────

export const imageToolDefinitions = {
  image_generate: {
    name: "image_generate",
    description: "Generate an image from a text description. Perfect for creating flyers, social media posts, banners, book covers, logos, product mockups, brand assets, and any visual content. Be very specific and detailed in your prompt for the best results. Include exact text you want in the image, colors, layout details, and style preferences.",
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
          description: "Image dimensions. 1024x1024 for square (social posts, logos). 1024x1536 for portrait/tall (flyers, book covers, stories). 1536x1024 for landscape/wide (banners, headers, presentations).",
          default: "1024x1024"
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
  }
};

// ── TOOL EXECUTORS ───────────────────────────────────────────────────────

export const imageToolExecutors = {
  image_generate: async (params) => {
    const engine = params.engine || 'auto';
    const prompt = params.prompt;
    const size = params.size || '1024x1024';
    const quality = params.quality || 'high';
    const background = params.background || 'opaque';

    // Engine selection logic
    let useEngine = engine;
    if (engine === 'auto') {
      if (getOpenAIKey()) {
        useEngine = 'gpt';
      } else if (getGeminiKey()) {
        useEngine = 'gemini';
      } else {
        return { success: false, error: 'No image generation API key configured. Set OPENAI_API_KEY or GEMINI_API_KEY.' };
      }
    }

    if (useEngine === 'gpt') {
      try {
        const result = await generateWithGPTImage(prompt, size, quality, background);
        if (result.success) return result;
        // OpenAI failed — try Gemini if available
        logger.warn('OpenAI image failed, trying Gemini fallback', { error: result.error });
        if (getGeminiKey()) return await generateWithGemini(prompt, size);
        return result;
      } catch(e) {
        logger.error('OpenAI image threw error', { error: e.message });
        if (getGeminiKey()) return await generateWithGemini(prompt, size);
        throw e;
      }
    } else if (useEngine === 'gemini') {
      return await generateWithGemini(prompt, size);
    }

    return { success: false, error: `Unknown engine: ${useEngine}` };
  },

  image_edit: async (params) => {
    const prompt = params.prompt;
    const size = params.size || '1024x1024';
    const quality = params.quality || 'high';

    if (getOpenAIKey()) {
      return await editWithGPTImage(prompt, params.image_url, params.image_base64, size, quality);
    } else if (getGeminiKey()) {
      // Gemini edit: re-generate with edit instructions + original context
      return await editWithGemini(prompt, params.image_url, params.image_base64);
    }

    return { success: false, error: 'No image API key configured' };
  }
};

// ── GPT IMAGE 1.5 (OpenAI) ──────────────────────────────────────────────

async function generateWithGPTImage(prompt, size, quality, background) {
  try {
    logger.info('Generating image with GPT Image 1.5', { size, quality });

    // Map our sizes to OpenAI supported sizes
    // gpt-image-1.5 supports: 1024x1024, 1536x1024, 1024x1536, auto
    const validSize = ['1024x1024','1536x1024','1024x1536'].includes(size) ? size : '1024x1024';

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getOpenAIKey()}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1.5',
        prompt,
        n: 1,
        size: validSize,
        quality: quality === 'high' ? 'high' : quality === 'low' ? 'low' : 'medium',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('GPT Image API error', { status: response.status, err });

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
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: validSize,
      quality: quality === 'high' ? 'high' : quality === 'low' ? 'low' : 'medium',
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

    // Attach image
    if (imageBase64) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const blob = new Blob([buffer], { type: 'image/png' });
      formData.append('image', blob, 'input.png');
    } else if (imageUrl) {
      // Fetch the image first
      const imgResponse = await fetch(imageUrl);
      const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
      const blob = new Blob([imgBuffer], { type: 'image/png' });
      formData.append('image', blob, 'input.png');
    }

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getOpenAIKey()}`,
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

async function generateWithGemini(prompt, size) {
  try {
    logger.info('Generating image with Gemini');

    // Try Nano Banana FIRST (free tier — gemini-3.1-flash-image-preview native image gen)
    try {
      logger.info('Trying Nano Banana (free tier)');
      const result = await generateWithNanoBanana(prompt, size);
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
      return await generateWithNanoBanana(prompt, size);
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

async function generateWithNanoBanana(prompt, size) {
  try {
    // Use Gemini 2.5 Flash Image (stable) instead of 3.1 preview (currently broken/hanging)
    // See: https://discuss.ai.google.dev/t/gemini-3-pro-image-preview-persistent-timeout-issues
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${getGeminiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
        signal: controller.signal
      }
    );
    
    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      logger.error('Nano Banana API error', { status: response.status, error: err, hasKey: !!getGeminiKey() });
      throw new Error(`Nano Banana API error ${response.status}: ${err}`);
    }

    const data = await response.json();

    // Find image part in response
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart) {
      throw new Error('No image in Nano Banana response');
    }

    const filename = `bloom-nanob-${Date.now()}.png`;
    const filepath = `/tmp/${filename}`;
    fs.writeFileSync(filepath, Buffer.from(imagePart.inlineData.data, 'base64'));

    // Get any text description
    const textPart = parts.find(p => p.text);

    return {
      success: true,
      engine: 'nano-banana',
      image_base64: imagePart.inlineData.data,
      filepath,
      filename,
      size,
      description: textPart?.text || null,
      message: `Image generated with Nano Banana (Gemini Flash Image)`,
    };

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

        // ALWAYS save to artifacts table (even if Supabase worked) so it shows in Files tab
        try {
          const crypto = await import('crypto');
          const { getSharedPool } = await import('../database/pool.js');
          const pool = getSharedPool();
          
          const fileId = `art_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
          const fname = `bloom-img-${Date.now()}.png`;
          
          // Save directly to artifacts table
          const artifact = await pool.query(`
            INSERT INTO artifacts (file_id, name, description, status, file_type, mime_type, thumbnail_base64, file_size, session_id, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            RETURNING *
          `, [
            fileId,
            fname,
            `Generated: ${(parameters.prompt || '').slice(0, 100)}`,
            'approved',
            'image',
            'image/png',
            result.image_base64.length > 50000 ? result.image_base64.substring(0, 66666) : result.image_base64,
            Buffer.from(result.image_base64, 'base64').length,
            parameters.sessionId || null,  // Include session ID if available
            JSON.stringify({ supabase_url: result.image_url || null })
          ]);
          
          if (artifact.rows[0]) {
            // If we don't have a Supabase URL, use the database URL
            if (!result.image_url) {
              result.image_url = `/api/files/preview/${fileId}`;
            }
            result.fileId = fileId;
            result.message = result.message || `Image saved! View it in your Files tab or use this URL: ${result.image_url}`;
            logger.info('Image saved as artifact', { fileId, hasSupabase: !!upload?.url });
          }
        } catch (dbErr) {
          logger.error('Direct DB save failed', { error: dbErr.message, stack: dbErr.stack });
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
