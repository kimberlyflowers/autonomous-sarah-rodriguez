/** Common fields for all video tool inputs */
export interface BaseVideoInput {
    org_id: string;
    plan_tier: string;
}
/** video_check_access input */
export interface CheckAccessInput extends BaseVideoInput {
}
/** video_list_avatars input */
export interface ListAvatarsInput extends BaseVideoInput {
    response_format?: string;
}
/** video_generate input */
export interface GenerateVideoInput extends BaseVideoInput {
    avatar_id: string;
    script: string;
    voice_style?: string;
    response_format?: string;
}
/** video_job_status input */
export interface JobStatusInput extends BaseVideoInput {
    job_id: string;
    response_format?: string;
}
/** RunPod job submission response */
export interface RunPodRunResponse {
    id: string;
    status: string;
}
/** RunPod job status response */
export interface RunPodStatusResponse {
    id: string;
    status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
    output?: {
        video_url?: string;
        duration_seconds?: number;
        resolution?: string;
        file_size_mb?: number;
        error?: string;
    };
    error?: string;
}
//# sourceMappingURL=types.d.ts.map