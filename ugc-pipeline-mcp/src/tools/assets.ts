import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callPipeline } from "../services/api-client.js";

export function registerAssetTools(server: McpServer): void {
  server.registerTool(
    "ugc_list_assets",
    {
      title: "UGC: List All Assets",
      description: "List all uploaded assets across products, subjects (faces), and audio clips. Returns slug, file paths, and AI context if available.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const data = await callPipeline("/api/assets");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_get_temp_asset_url",
    {
      title: "UGC: Get Temp-Hosted Asset URL",
      description: "Generate a temporary public URL for an asset (10-minute expiry). Required for passing assets to the WaveSpeed/Seedance API.",
      inputSchema: {
        type: z.enum(["products", "subjects", "audio"]).describe("Asset type"),
        slug: z.string().describe("Asset slug"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ type, slug }) => {
      try {
        const data = await callPipeline(`/api/assets/host/${type}/${slug}`, { method: "POST" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_analyze_assets",
    {
      title: "UGC: Run AI Analysis on All Assets",
      description: "Analyze all uploaded assets and save AI-generated context (description, visual elements, ad notes) to each asset's metadata.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const data = await callPipeline("/api/analyze/assets", { method: "POST" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_delete_asset",
    {
      title: "UGC: Delete Asset",
      description: "Permanently delete an asset folder.",
      inputSchema: {
        type: z.enum(["products", "subjects", "audio"]),
        slug: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ type, slug }) => {
      try {
        const data = await callPipeline(`/api/assets/${type}/${slug}`, { method: "DELETE" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );
}
