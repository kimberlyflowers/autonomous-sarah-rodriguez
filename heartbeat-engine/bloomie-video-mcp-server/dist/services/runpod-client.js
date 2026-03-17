import axios from "axios";
import { RUNPOD_API_BASE } from "../constants.js";
/**
 * RunPod Serverless API client.
 * Wraps the /run and /status endpoints for the video generation endpoint.
 */
export class RunPodClient {
    apiKey;
    endpointId;
    constructor() {
        this.apiKey = process.env.RUNPOD_API_KEY || "";
        this.endpointId = process.env.RUNPOD_VIDEO_ENDPOINT_ID || "";
        if (!this.apiKey) {
            console.error("WARNING: RUNPOD_API_KEY not set");
        }
        if (!this.endpointId) {
            console.error("WARNING: RUNPOD_VIDEO_ENDPOINT_ID not set");
        }
    }
    /**
     * Submit a video generation job to RunPod Serverless.
     * Returns the job ID for polling.
     */
    async submitJob(input) {
        const url = `${RUNPOD_API_BASE}/${this.endpointId}/run`;
        const response = await axios.post(url, {
            input: {
                action: "generate_video",
                avatar_id: input.avatar_id,
                script: input.script,
                voice_style: input.voice_style || "natural",
                org_id: input.org_id,
            },
        }, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
            timeout: 30000,
        });
        return response.data;
    }
    /**
     * Check the status of a video generation job.
     */
    async getJobStatus(jobId) {
        const url = `${RUNPOD_API_BASE}/${this.endpointId}/status/${jobId}`;
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
            },
            timeout: 15000,
        });
        return response.data;
    }
    /**
     * Cancel a running video generation job.
     */
    async cancelJob(jobId) {
        const url = `${RUNPOD_API_BASE}/${this.endpointId}/cancel/${jobId}`;
        await axios.post(url, {}, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
            },
            timeout: 15000,
        });
    }
    /** Check if the client is properly configured */
    isConfigured() {
        return !!(this.apiKey && this.endpointId);
    }
}
//# sourceMappingURL=runpod-client.js.map