#!/usr/bin/env node
/**
 * Bloomie Video MCP Server
 *
 * Provides AI video generation tools for Bloomie AI employees.
 * Wraps the Sarah Pipeline running on RunPod Serverless.
 *
 * Tools:
 *   1. video_check_access  — Check plan tier and available video features (FREE)
 *   2. video_list_avatars   — Browse available AI avatars (FREE)
 *   3. video_generate       — Submit a video generation job (PAID — Video Creator)
 *   4. video_job_status     — Check video job progress/download (PAID — Video Creator)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { PlanTier, ResponseFormat } from "./constants.js";
import { checkAccess, getPlanSummary } from "./services/access-gate.js";
import { formatResponse } from "./services/formatter.js";

// Schemas
import {
  CheckAccessSchema,
  ListAvatarsSchema,
  GenerateVideoSchema,
  JobStatusSchema,
} from "./schemas/inputs.js";
import type {
  CheckAccessInput,
  ListAvatarsInput,
  GenerateVideoInput,
  JobStatusInput,
} from "./types.js";

// Tool implementations
import { listAvatars } from "./tools/list-avatars.js";
import { generateVideo } from "./tools/generate-video.js";
import { getJobStatus } from "./tools/job-status.js";

// ─── Create server ───
const server = new McpServer({
  name: "bloomie-video-mcp-server",
  version: "1.0.0",
});

// ─── Helper: gate a tool behind a plan tier ───
function gatedResponse(toolName: string, planTier: PlanTier | string) {
  const access = checkAccess(planTier, toolName);
  if (!access.allowed) {
    return {
      content: [{ type: "text" as const, text: access.upsellMessage! }],
    };
  }
  return null; // Access granted — caller should continue
}

// ═══════════════════════════════════════════════════
// TOOL 1: video_check_access (FREE)
// ═══════════════════════════════════════════════════
server.registerTool(
  "video_check_access",
  {
    title: "Check Video Access",
    description: `Check what video generation tools the owner's plan includes and what upgrades are available.

Call this FIRST before attempting any video generation to understand what features you can use.
Returns a summary of the current plan tier and what each tier includes.

Args:
  - org_id (string): Organization ID
  - plan_tier (string): Current plan tier — "free", "video_creator", or "video_pro"

Returns:
  Markdown summary of plan access and available upgrades.`,
    inputSchema: CheckAccessSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: CheckAccessInput) => {
    const summary = getPlanSummary(params.plan_tier);
    return {
      content: [{ type: "text" as const, text: summary }],
    };
  }
);

// ═══════════════════════════════════════════════════
// TOOL 2: video_list_avatars (FREE)
// ═══════════════════════════════════════════════════
server.registerTool(
  "video_list_avatars",
  {
    title: "List AI Avatars",
    description: `Browse available AI avatars for video generation.
Each avatar has a unique look, voice, and personality.
Currently features Sarah Rodriguez — a professional Latina business woman.

FREE — no plan upgrade required to browse avatars.

Args:
  - org_id (string): Organization ID
  - plan_tier (string): Current plan tier
  - response_format (string): "markdown" or "json"

Returns:
  List of available avatars with IDs, names, and descriptions.`,
    inputSchema: ListAvatarsSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: ListAvatarsInput) => {
    const gate = gatedResponse("video_list_avatars", params.plan_tier);
    if (gate) return gate;

    const result = await listAvatars(params);
    const text = formatResponse(result, params.response_format);
    return { content: [{ type: "text" as const, text }] };
  }
);

// ═══════════════════════════════════════════════════
// TOOL 3: video_generate (PAID — Video Creator)
// ═══════════════════════════════════════════════════
server.registerTool(
  "video_generate",
  {
    title: "Generate AI Video",
    description: `Generate a lip-synced AI video with a chosen avatar speaking your script.
The video is rendered at 1080p with natural lip sync, facial expressions, and voice.
Videos typically take 1-2 minutes to generate.

🔒 Requires Video Creator plan ($49/month). Free users will see upgrade info.

Pipeline: Text → TTS → LatentSync lip sync → CodeFormer face restoration → Alpha blend → FFmpeg mux
Cost: ~$0.03 per video (150x cheaper than HeyGen at $4.50/video)

Args:
  - avatar_id (string): Avatar to use — e.g. "sarah"
  - script (string): The text for the avatar to speak (max 5000 characters)
  - voice_style (string, optional): Hint for voice style — "warm", "professional", "energetic"
  - org_id, plan_tier, response_format: standard fields

Returns:
  Job ID and status. Use video_job_status to poll for completion and get the download URL.`,
    inputSchema: GenerateVideoSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: GenerateVideoInput) => {
    const gate = gatedResponse("video_generate", params.plan_tier);
    if (gate) return gate;

    const result = await generateVideo(params);
    const text = formatResponse(result, params.response_format);
    return { content: [{ type: "text" as const, text }] };
  }
);

// ═══════════════════════════════════════════════════
// TOOL 4: video_job_status (PAID — Video Creator)
// ═══════════════════════════════════════════════════
server.registerTool(
  "video_job_status",
  {
    title: "Check Video Job Status",
    description: `Check the status of a video generation job.
Returns the current status and, when complete, the download URL for the finished video.

🔒 Requires Video Creator plan ($49/month).

Possible statuses: IN_QUEUE, IN_PROGRESS, COMPLETED, FAILED, CANCELLED, TIMED_OUT

Args:
  - job_id (string): The job ID returned by video_generate
  - org_id, plan_tier, response_format: standard fields

Returns:
  Job status, and when COMPLETED: video download URL, duration, resolution, file size.`,
    inputSchema: JobStatusSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params: JobStatusInput) => {
    const gate = gatedResponse("video_job_status", params.plan_tier);
    if (gate) return gate;

    const result = await getJobStatus(params);
    const text = formatResponse(result, params.response_format);
    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── Start server ───
async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bloomie Video MCP server running via stdio");
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "bloomie-video-mcp-server", version: "1.0.0" });
  });

  const port = parseInt(process.env.VIDEO_MCP_PORT || "3101", 10);
  app.listen(port, () => {
    console.error(`Bloomie Video MCP server running on http://localhost:${port}/mcp`);
  });
}

// Choose transport
const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
