import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callPipeline } from "../services/api-client.js";

export function registerBrandTools(server: McpServer): void {
  server.registerTool(
    "ugc_list_brands",
    {
      title: "UGC: List Brand Profiles",
      description: "List all brand profiles configured in the UGC pipeline. Returns names, slugs, selling points, and discount codes for each brand.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const data = await callPipeline("/api/brands");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_get_brand",
    {
      title: "UGC: Get Brand Profile",
      description: "Fetch the full brand profile for a given brand slug. Use this to load context (selling points, audience, tone, discount codes) before constructing ad prompts.",
      inputSchema: {
        slug: z.string().describe("Brand slug (e.g. 'ag1', 'nike')"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ slug }) => {
      try {
        const data = await callPipeline(`/api/brands/${slug}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_create_brand",
    {
      title: "UGC: Create / Update Brand Profile",
      description: "Create a new brand profile or update an existing one. The brand profile drives ad generation — selling points, audience, tone, and discount codes are referenced in every prompt.",
      inputSchema: {
        name: z.string().describe("Product/brand name (required)"),
        category: z.string().optional().describe("e.g. wellness, fitness, tech, fashion"),
        description: z.string().optional().describe("What the product does"),
        pricePoint: z.string().optional().describe("e.g. '$99'"),
        sellingPoints: z.array(z.string()).optional().describe("Key benefits, one per item"),
        targetAudience: z.string().optional().describe("Who this is for"),
        platforms: z.array(z.string()).optional().describe("Distribution platforms (tiktok, instagram, youtube)"),
        tone: z.string().optional().describe("energetic, casual, professional, humorous, cinematic"),
        discountCode: z.string().optional().describe("Promo code"),
        cta: z.string().optional().describe("Call to action (e.g. 'Link in bio')"),
        customNotes: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const data = await callPipeline("/api/brands", { method: "POST", body: input });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_update_brand",
    {
      title: "UGC: Patch Brand Profile",
      description: "Update specific fields on an existing brand profile without resetting the whole record.",
      inputSchema: {
        slug: z.string().describe("Brand slug to update"),
        updates: z.record(z.string(), z.any()).describe("Object of fields to update"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ slug, updates }) => {
      try {
        const data = await callPipeline(`/api/brands/${slug}`, { method: "PATCH", body: updates });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_delete_brand",
    {
      title: "UGC: Delete Brand Profile",
      description: "Permanently delete a brand profile. Does not delete uploaded assets.",
      inputSchema: {
        slug: z.string().describe("Brand slug to delete"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ slug }) => {
      try {
        const data = await callPipeline(`/api/brands/${slug}`, { method: "DELETE" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );
}
