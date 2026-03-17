/** RunPod API base URL */
export declare const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
/** Poll interval for job status checks (milliseconds) */
export declare const POLL_INTERVAL_MS = 5000;
/** Max time to wait for a video job before timing out (milliseconds) — 10 minutes */
export declare const JOB_TIMEOUT_MS = 600000;
/** Max characters in any single tool response */
export declare const CHARACTER_LIMIT = 25000;
/**
 * Plan tiers — controls what video tools a Bloomie owner has access to.
 * Video generation requires at minimum the Video Creator add-on.
 */
export declare enum PlanTier {
    FREE = "free",
    VIDEO_CREATOR = "video_creator",
    VIDEO_PRO = "video_pro"
}
/** Which tools each tier unlocks */
export declare const TIER_ACCESS: Record<PlanTier, string[]>;
/** Upsell messages keyed by tool name */
export declare const UPSELL_MESSAGES: Record<string, string>;
/** Response format enum */
export declare enum ResponseFormat {
    MARKDOWN = "markdown",
    JSON = "json"
}
/** Sarah's DNA configuration — lipsync anchor coordinates */
export declare const SARAH_DNA: {
    readonly dilation: 21;
    readonly blur: 45;
    readonly anchorX: 1040;
    readonly anchorY: 395;
    readonly faceScale: 2350;
    readonly resolution: "1080p";
};
/** Available avatar definitions */
export interface Avatar {
    id: string;
    name: string;
    description: string;
    faceImage: string;
    voiceSample: string;
    baseVideo: string;
}
export declare const AVATARS: Avatar[];
//# sourceMappingURL=constants.d.ts.map