import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callPipeline, callPipelineForm } from "../services/api-client.js";

export function registerStudioTools(server: McpServer): void {
  server.registerTool(
    "ugc_list_studio_characters",
    {
      title: "UGC: List Bloom Studio Characters",
      description: "List Bloom Studio characters and their saved looks so an agent can choose the same source image available in the manual Studio.",
      inputSchema: {
        tenantSlug: z.string().min(1).describe("Authenticated Bloomie organization id"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenantSlug }) => {
      try {
        const data = await callPipeline("/api/characters", { timeout: 30000, tenantSlug });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_list_studio_assets",
    {
      title: "UGC: List Bloom Studio Tenant Assets",
      description: "List the authenticated tenant's characters, product references, audio, generated images, and generated videos.",
      inputSchema: {
        tenantSlug: z.string().min(1).describe("Authenticated Bloomie organization id"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenantSlug }) => {
      try {
        const data = await callPipeline("/api/assets", { timeout: 30000, tenantSlug });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_generate_studio_image",
    {
      title: "UGC: Generate Bloom Studio Image",
      description: "Generate a production image with the same OpenRouter Nano Banana image path used by Bloom Studio Create Image. Supports character, product, and additional reference URLs.",
      inputSchema: {
        prompt: z.string().min(3),
        aspectRatio: z.enum(["1:1", "4:5", "9:16", "16:9"]).default("16:9"),
        size: z.enum(["1k", "2k", "4k"]).default("1k"),
        characterUrl: z.string().url().optional(),
        productUrl: z.string().url().optional(),
        referenceUrls: z.array(z.string().url()).max(5).optional(),
        model: z.string().default("google/gemini-3.1-flash-image-preview"),
        tenantSlug: z.string().min(1).describe("Authenticated Bloomie organization id"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const data = await callPipelineForm("/api/product-placement/generate", {
          prompt: input.prompt,
          aspectRatio: input.aspectRatio,
          size: input.size,
          characterUrl: input.characterUrl,
          productUrl: input.productUrl,
          referenceUrls: input.referenceUrls,
          imageProvider: `openrouter:${input.model}`,
        }, { timeout: 180000, tenantSlug: input.tenantSlug });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_generate_seedance_video",
    {
      title: "UGC: Generate Seedance Video",
      description: "Submit a Bloom Studio Seedance image-to-video or reference-video request. This is a paid generation tool.",
      inputSchema: {
        prompt: z.string().min(3),
        imageUrl: z.string().url().optional(),
        referenceImageUrls: z.array(z.string().url()).max(9).optional(),
        referenceVideoUrls: z.array(z.string().url()).max(3).optional(),
        audioUrl: z.string().url().optional(),
        duration: z.number().min(3).max(15).default(5),
        resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
        model: z.enum(["seedance2-fast", "seedance2-standard"]).default("seedance2-fast"),
        aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
        tenantSlug: z.string().min(1).describe("Authenticated Bloomie organization id"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const data = await callPipeline("/api/generate/single", {
          method: "POST",
          timeout: 60000,
          tenantSlug: input.tenantSlug,
          body: {
            prompt: input.prompt,
            imageUrl: input.imageUrl,
            referenceImageUrls: input.referenceImageUrls,
            referenceVideoUrls: input.referenceVideoUrls,
            audioUrl: input.audioUrl,
            duration: input.duration,
            resolution: input.resolution,
            model: input.model,
            aspectRatio: input.aspectRatio,
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_list_studio_voices",
    {
      title: "UGC: List Bloom Studio Voices",
      description: "List ElevenLabs voices connected to the authenticated Bloom Studio tenant.",
      inputSchema: {
        tenantSlug: z.string().min(1).describe("Authenticated Bloomie organization id"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantSlug }) => {
      try {
        const data = await callPipeline("/api/tts/elevenlabs/voices", { timeout: 30000, tenantSlug });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_generate_studio_voice",
    {
      title: "UGC: Generate Bloom Studio Voice",
      description: "Generate and save ElevenLabs speech in the authenticated Bloom Studio tenant for a later lip-sync request.",
      inputSchema: {
        script: z.string().min(3),
        voiceId: z.string().min(1),
        name: z.string().optional(),
        tenantSlug: z.string().min(1).describe("Authenticated Bloomie organization id"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const data = await callPipeline("/api/tts/elevenlabs", {
          method: "POST",
          timeout: 120000,
          tenantSlug: input.tenantSlug,
          body: { script: input.script, voiceId: input.voiceId, name: input.name },
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_generate_lipsync_video",
    {
      title: "UGC: Generate Lip-Sync Video",
      description: "Submit a Meigen/InfiniteTalk lip-sync video job to Bloom Studio using public image/audio URLs. This is a paid UGC generation tool.",
      inputSchema: {
        imageUrl: z.string().url().describe("Public image URL for the avatar/character"),
        audioUrl: z.string().url().describe("Public audio URL for the voiceover"),
        prompt: z.string().optional().describe("Optional scene prompt"),
        quality: z.enum(["480p", "720p"]).default("480p"),
        aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
        requestId: z.string().optional().describe("Optional client request/job id"),
        tenantSlug: z.string().min(1).describe("Authenticated Bloomie organization id"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const data = await callPipelineForm("/api/studio/generate", {
          clientJobId: input.requestId,
          mode: "i2v",
          videoEngine: "meigen",
          audioProvider: "upload",
          imageUrl: input.imageUrl,
          audioUrl: input.audioUrl,
          prompt: input.prompt || "Natural talking-head lip sync video",
          meigenSize: input.quality,
          aspectRatio: input.aspectRatio,
        }, { timeout: 60000, tenantSlug: input.tenantSlug });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_check_studio_job",
    {
      title: "UGC: Check Studio Job",
      description: "Check a Bloom Studio generation job by request id. Poll this until the status is completed or failed.",
      inputSchema: {
        requestId: z.string().describe("Request id returned by ugc_generate_lipsync_video"),
        tenantSlug: z.string().min(1).describe("Authenticated Bloomie organization id"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ requestId, tenantSlug }) => {
      try {
        const data = await callPipeline(`/api/studio/jobs/${requestId}`, { timeout: 60000, tenantSlug });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_list_studio_jobs",
    {
      title: "UGC: List Studio Jobs",
      description: "List recent Bloom Studio generation jobs for the configured UGC workspace.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const data = await callPipeline("/api/studio/jobs", { timeout: 30000 });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );
}
