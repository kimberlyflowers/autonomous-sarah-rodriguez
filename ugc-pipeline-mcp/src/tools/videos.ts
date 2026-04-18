import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callPipeline } from "../services/api-client.js";

export function registerVideoTools(server: McpServer): void {
  server.registerTool(
    "ugc_list_videos",
    {
      title: "UGC: List Generated Videos / Jobs",
      description: "List all video generation jobs with status, prompts, costs, and download URLs when complete. Filter by status or batch ID.",
      inputSchema: {
        status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
        batchId: z.string().optional().describe("Filter to a specific batch"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ status, batchId }) => {
      try {
        const data = await callPipeline("/api/videos", { query: { status, batchId } });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_check_status",
    {
      title: "UGC: Check Single Video Status",
      description: "Check the current status of a single video by its request ID. Auto-downloads when complete.",
      inputSchema: {
        requestId: z.string().describe("Request ID returned from ugc_submit_batch or ugc_generate_custom"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ requestId }) => {
      try {
        const data = await callPipeline(`/api/videos/${requestId}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_poll_pending",
    {
      title: "UGC: Poll All Pending Jobs",
      description: "Force-poll all pending jobs immediately instead of waiting for the 2-minute auto-poll cycle. Downloads completed videos.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      try {
        const data = await callPipeline("/api/videos/poll-all", { method: "POST" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );

  server.registerTool(
    "ugc_list_local_files",
    {
      title: "UGC: List Downloaded Video Files",
      description: "List all .mp4 files downloaded to the pipeline's local storage with their public URLs.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const data = await callPipeline("/api/videos/files/local");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
      }
    }
  );
}
