import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callPipeline, pipelineUrl } from "../services/api-client.js";

const DOCS = [
  { name: "seedance-official", path: "seedance-official.md", desc: "Official ByteDance Seedance 2.0 spec — parameters, @ syntax, prompt formula" },
  { name: "seedance-prompt-guide", path: "seedance-prompt-guide.md", desc: "Sirio Berati's UGC ads framework — 4 prompt styles, 8 ad format templates" },
  { name: "wavespeed-api", path: "wavespeed-api.md", desc: "WaveSpeed API spec — endpoints, auth, payload, polling, pricing" },
];

async function fetchDoc(filename: string): Promise<string> {
  const url = `${pipelineUrl()}/docs/${filename}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Doc fetch failed (${res.status}) — pipeline may not expose /docs/ statically`);
  return res.text();
}

export function registerDocsTools(server: McpServer): void {
  server.registerTool(
    "ugc_list_docs",
    {
      title: "UGC: List Reference Documentation",
      description: "List all reference docs available in the pipeline (Seedance spec, prompt guides, API docs). Use this to discover what reference material you can read before constructing prompts.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      return {
        content: [{ type: "text", text: JSON.stringify(DOCS, null, 2) }],
      };
    }
  );

  server.registerTool(
    "ugc_get_seedance_docs",
    {
      title: "UGC: Read Official Seedance 2.0 Documentation",
      description: "Read the official ByteDance Seedance 2.0 documentation. ALWAYS call this before constructing custom prompts — it teaches you the @ syntax, prompt formula ([Shot type], [Subject], [Action], [Environment], [Lighting], [Style]), multimodal reference rules, and model capabilities. Reference for crafting Seedance-native prompts.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const text = await fetchDoc("seedance-official.md");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed to fetch doc: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_get_prompt_guide",
    {
      title: "UGC: Read Sirio's UGC Ads Prompt Framework",
      description: "Read Sirio Berati's UGC ads prompting framework — 4 prompt styles (Structural Descriptive, Breakdown, Timestamp, Freestyle) and 8 format templates (UGC, podcast, lifestyle, greenscreen, ASMR, unboxing, news anchor, cinematic). Use when crafting ad-specific prompts that need viral/conversion-optimized structure.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const text = await fetchDoc("seedance-prompt-guide.md");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed to fetch doc: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_get_api_docs",
    {
      title: "UGC: Read WaveSpeed API Documentation",
      description: "Read the WaveSpeed API spec used by the pipeline (endpoints, auth, payload schema, polling, pricing). Useful when constructing custom payloads or debugging API errors.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const text = await fetchDoc("wavespeed-api.md");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed to fetch doc: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_pipeline_status",
    {
      title: "UGC: Pipeline Health & Stats",
      description: "Check the pipeline service health, API key status, and aggregate stats (brand count, video count, current pricing).",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const data = await callPipeline("/api/status");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );
}
