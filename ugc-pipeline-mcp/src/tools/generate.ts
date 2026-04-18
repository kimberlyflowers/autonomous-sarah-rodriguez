import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callPipeline } from "../services/api-client.js";

const FORMAT_OPTIONS = [
  "ugc",
  "podcast",
  "lifestyle",
  "tiktok-greenscreen",
  "news-anchor",
  "cinematic",
  "asmr",
  "unboxing",
] as const;

export function registerGenerateTools(server: McpServer): void {
  server.registerTool(
    "ugc_estimate_cost",
    {
      title: "UGC: Estimate Generation Cost",
      description: "Get a cost estimate for generating videos at a given duration / resolution / model. No charge — useful for previewing budget before submitting.",
      inputSchema: {
        variants: z.number().default(1).describe("Number of videos"),
        duration: z.number().default(15).describe("Seconds per video (4-15)"),
        resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
        model: z.enum(["seedance2-fast", "seedance2-standard"]).default("seedance2-fast"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const data = await callPipeline("/api/generate/estimate", { method: "POST", body: input });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_preview_variants",
    {
      title: "UGC: Preview A/B Test Variants (No API Charge)",
      description: "Generate prompt variants for a brand using the built-in Sirio Berati UGC framework. Returns full payloads for review BEFORE any video API charge. Best practice: preview first, then submit only the variants you approve.",
      inputSchema: {
        brandSlug: z.string().describe("Brand slug — must exist via ugc_create_brand first"),
        formats: z.array(z.enum(FORMAT_OPTIONS)).optional().describe("Ad formats to generate (default: ugc, podcast, lifestyle, tiktok-greenscreen)"),
        subjectSlug: z.string().optional().describe("Subject (face) asset slug"),
        audioSlug: z.string().optional().describe("Audio reference slug"),
        duration: z.number().default(15),
        resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
        model: z.enum(["seedance2-fast", "seedance2-standard"]).default("seedance2-fast"),
        aspectRatio: z.enum(["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"]).default("9:16"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const data = await callPipeline("/api/generate/ab-test", { method: "POST", body: input });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_submit_batch",
    {
      title: "UGC: Submit Approved Variants to Seedance API",
      description: "Submit a batch of approved variants (typically from ugc_preview_variants) to the WaveSpeed/Seedance API for video generation. THIS COSTS MONEY — confirm cost with the user first via ugc_estimate_cost. Returns request IDs for polling.",
      inputSchema: {
        batchId: z.string().optional().describe("Batch ID from preview (optional)"),
        variants: z.array(z.object({
          variantNum: z.number().optional(),
          format: z.string().optional(),
          prompt: z.string(),
          payload: z.record(z.string(), z.any()),
          estimatedCost: z.number().optional(),
          brandSlug: z.string().optional(),
        })).describe("Array of variants to submit"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const data = await callPipeline("/api/generate/submit", { method: "POST", body: input });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_generate_custom",
    {
      title: "UGC: Generate Custom Video (Agent-Crafted Prompt)",
      description: "Submit a single video with a fully custom prompt. Use this when you've crafted a Seedance-optimized prompt yourself (after reading docs via ugc_get_seedance_docs). THIS COSTS MONEY.",
      inputSchema: {
        prompt: z.string().describe("Full Seedance prompt — should follow [Shot type], [Subject], [Action], [Environment], [Lighting], [Style] formula"),
        imageUrl: z.string().optional().describe("Start frame URL (for image-to-video)"),
        audioUrl: z.string().optional().describe("Audio reference URL"),
        duration: z.number().default(5),
        resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
        model: z.enum(["seedance2-fast", "seedance2-standard"]).default("seedance2-fast"),
        aspectRatio: z.enum(["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"]).default("9:16"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const data = await callPipeline("/api/generate/single", { method: "POST", body: input });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );
}
