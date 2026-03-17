import type { RunPodRunResponse, RunPodStatusResponse } from "../types.js";
/**
 * RunPod Serverless API client.
 * Wraps the /run and /status endpoints for the video generation endpoint.
 */
export declare class RunPodClient {
    private apiKey;
    private endpointId;
    constructor();
    /**
     * Submit a video generation job to RunPod Serverless.
     * Returns the job ID for polling.
     */
    submitJob(input: {
        avatar_id: string;
        script: string;
        voice_style?: string;
        org_id: string;
    }): Promise<RunPodRunResponse>;
    /**
     * Check the status of a video generation job.
     */
    getJobStatus(jobId: string): Promise<RunPodStatusResponse>;
    /**
     * Cancel a running video generation job.
     */
    cancelJob(jobId: string): Promise<void>;
    /** Check if the client is properly configured */
    isConfigured(): boolean;
}
//# sourceMappingURL=runpod-client.d.ts.map