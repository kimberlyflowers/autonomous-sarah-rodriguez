import { AVATARS, ResponseFormat } from "../constants.js";
import { RunPodClient } from "../services/runpod-client.js";
import type { GenerateVideoInput } from "../types.js";

const client = new RunPodClient();

/**
 * Submit a video generation job to RunPod Serverless.
 * Returns immediately with a job ID — use video_job_status to poll.
 */
export async function generateVideo(params: GenerateVideoInput): Promise<unknown> {
  // Validate avatar exists
  const avatar = AVATARS.find((a) => a.id === params.avatar_id);
  if (!avatar) {
    const validIds = AVATARS.map((a) => a.id).join(", ");
    return {
      error: `Unknown avatar_id "${params.avatar_id}". Valid avatars: ${validIds}`,
    };
  }

  // Check RunPod client is configured
  if (!client.isConfigured()) {
    return {
      error: "Video generation service is not configured. RUNPOD_API_KEY and RUNPOD_VIDEO_ENDPOINT_ID must be set.",
    };
  }

  // Validate script length
  if (params.script.length > 5000) {
    return {
      error: `Script too long (${params.script.length} chars). Maximum is 5000 characters.`,
    };
  }

  try {
    const result = await client.submitJob({
      avatar_id: params.avatar_id,
      script: params.script,
      voice_style: params.voice_style,
      org_id: params.org_id,
    });

    if (params.response_format === ResponseFormat.JSON) {
      return {
        job_id: result.id,
        status: result.status,
        avatar: avatar.name,
        script_length: params.script.length,
        estimated_time_seconds: Math.max(60, Math.ceil(params.script.length / 50) * 10),
        message: "Video generation job submitted. Use video_job_status to check progress.",
      };
    }

    // Markdown format
    const estimatedTime = Math.max(60, Math.ceil(params.script.length / 50) * 10);
    return [
      `## Video Generation Started`,
      "",
      `**Job ID:** \`${result.id}\``,
      `**Status:** ${result.status}`,
      `**Avatar:** ${avatar.name}`,
      `**Script:** ${params.script.length} characters`,
      `**Estimated Time:** ~${estimatedTime} seconds`,
      "",
      `Your video is being generated. Use \`video_job_status\` with job_id \`${result.id}\` to check progress.`,
      "",
      `> Tip: Videos typically take 1-2 minutes. I'll check the status for you.`,
    ].join("\n");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: `Failed to submit video generation job: ${message}`,
    };
  }
}
