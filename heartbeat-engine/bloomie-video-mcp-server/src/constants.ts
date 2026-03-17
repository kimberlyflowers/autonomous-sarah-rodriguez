/** RunPod API base URL */
export const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

/** Poll interval for job status checks (milliseconds) */
export const POLL_INTERVAL_MS = 5000;

/** Max time to wait for a video job before timing out (milliseconds) — 10 minutes */
export const JOB_TIMEOUT_MS = 600000;

/** Max characters in any single tool response */
export const CHARACTER_LIMIT = 25000;

/**
 * Plan tiers — controls what video tools a Bloomie owner has access to.
 * Video generation requires at minimum the Video Creator add-on.
 */
export enum PlanTier {
  FREE = "free",
  VIDEO_CREATOR = "video_creator",
  VIDEO_PRO = "video_pro",
}

/** Which tools each tier unlocks */
export const TIER_ACCESS: Record<PlanTier, string[]> = {
  [PlanTier.FREE]: [
    "video_check_access",
    "video_list_avatars",
  ],
  [PlanTier.VIDEO_CREATOR]: [
    "video_check_access",
    "video_list_avatars",
    "video_generate",
    "video_job_status",
  ],
  [PlanTier.VIDEO_PRO]: [
    "video_check_access",
    "video_list_avatars",
    "video_generate",
    "video_job_status",
  ],
};

/** Upsell messages keyed by tool name */
export const UPSELL_MESSAGES: Record<string, string> = {
  video_generate: `🔒 **AI Video Generation** requires the **Video Creator** add-on ($49/month).

Here's what you'd get:
• Custom AI-generated videos with Sarah — your personal video spokesperson
• Lip-synced, full 1080p video from any script or text
• ~$0.03 per video vs $4.50 on HeyGen (150x cheaper!)
• Videos ready in under 2 minutes

Perfect for personalized outreach, welcome videos, social media content, and more.
Upgrade anytime at bloomiestaffing.com/upgrade.`,

  video_job_status: `🔒 **Video Job Status** requires the **Video Creator** add-on ($49/month).

You need Video Creator to generate and track video jobs.
Upgrade anytime at bloomiestaffing.com/upgrade.`,
};

/** Response format enum */
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

/** Sarah's DNA configuration — lipsync anchor coordinates */
export const SARAH_DNA = {
  dilation: 21,
  blur: 45,
  anchorX: 1040,
  anchorY: 395,
  faceScale: 2350,
  resolution: "1080p",
} as const;

/** Available avatar definitions */
export interface Avatar {
  id: string;
  name: string;
  description: string;
  faceImage: string;
  voiceSample: string;
  baseVideo: string;
}

export const AVATARS: Avatar[] = [
  {
    id: "sarah",
    name: "Sarah Rodriguez",
    description: "Professional Latina business woman. Warm, confident, trustworthy. Perfect for B2B outreach, welcome messages, and product demos.",
    faceImage: "/workspace/faces/sarah_heygen.png",
    voiceSample: "/workspace/sarah_voice_sample.mp3",
    baseVideo: "/workspace/sarah_base_model.mp4",
  },
];
