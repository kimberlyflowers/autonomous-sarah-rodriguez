import { ResponseFormat } from "../constants.js";
import { RunPodClient } from "../services/runpod-client.js";
import type { JobStatusInput } from "../types.js";

const client = new RunPodClient();

/**
 * Check the status of a video generation job on RunPod.
 */
export async function getJobStatus(params: JobStatusInput): Promise<unknown> {
  if (!client.isConfigured()) {
    return {
      error: "Video generation service is not configured. RUNPOD_API_KEY and RUNPOD_VIDEO_ENDPOINT_ID must be set.",
    };
  }

  try {
    const result = await client.getJobStatus(params.job_id);

    if (params.response_format === ResponseFormat.JSON) {
      return result;
    }

    // Markdown format
    const lines: string[] = [
      `## Video Job Status`,
      "",
      `**Job ID:** \`${result.id}\``,
      `**Status:** ${formatStatus(result.status)}`,
    ];

    if (result.status === "COMPLETED" && result.output) {
      lines.push("");
      lines.push("### Video Ready!");
      if (result.output.video_url) {
        lines.push(`**Download URL:** ${result.output.video_url}`);
      }
      if (result.output.duration_seconds) {
        lines.push(`**Duration:** ${result.output.duration_seconds}s`);
      }
      if (result.output.resolution) {
        lines.push(`**Resolution:** ${result.output.resolution}`);
      }
      if (result.output.file_size_mb) {
        lines.push(`**File Size:** ${result.output.file_size_mb.toFixed(1)} MB`);
      }
    } else if (result.status === "FAILED") {
      lines.push("");
      lines.push(`**Error:** ${result.output?.error || result.error || "Unknown error"}`);
    } else if (result.status === "IN_QUEUE" || result.status === "IN_PROGRESS") {
      lines.push("");
      lines.push("> Video is still being generated. Check again in 15-30 seconds.");
    }

    return lines.join("\n");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: `Failed to check job status: ${message}`,
    };
  }
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    IN_QUEUE: "⏳ In Queue",
    IN_PROGRESS: "🔄 Generating...",
    COMPLETED: "✅ Completed",
    FAILED: "❌ Failed",
    CANCELLED: "🚫 Cancelled",
    TIMED_OUT: "⏰ Timed Out",
  };
  return statusMap[status] || status;
}
