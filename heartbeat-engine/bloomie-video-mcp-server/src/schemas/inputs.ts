import { z } from "zod";

const PlanTierEnum = z.enum(["free", "video_creator", "video_pro"]);
const ResponseFormatEnum = z.enum(["markdown", "json"]).default("markdown");

/** video_check_access */
export const CheckAccessSchema = z.object({
  org_id: z.string().describe("Organization ID"),
  plan_tier: PlanTierEnum.describe('Current plan tier — "free", "video_creator", or "video_pro"'),
}).shape;

/** video_list_avatars */
export const ListAvatarsSchema = z.object({
  org_id: z.string().describe("Organization ID"),
  plan_tier: PlanTierEnum.describe("Current plan tier"),
  response_format: ResponseFormatEnum.describe('"markdown" or "json"'),
}).shape;

/** video_generate */
export const GenerateVideoSchema = z.object({
  org_id: z.string().describe("Organization ID"),
  plan_tier: PlanTierEnum.describe("Current plan tier"),
  avatar_id: z.string().describe('Avatar ID to use, e.g. "sarah"'),
  script: z.string().min(1).max(5000).describe("The text/script for the avatar to speak (max 5000 chars)"),
  voice_style: z.string().optional().describe('Voice style hint, e.g. "warm", "professional", "energetic". Default: natural'),
  response_format: ResponseFormatEnum.describe('"markdown" or "json"'),
}).shape;

/** video_job_status */
export const JobStatusSchema = z.object({
  org_id: z.string().describe("Organization ID"),
  plan_tier: PlanTierEnum.describe("Current plan tier"),
  job_id: z.string().describe("RunPod job ID returned by video_generate"),
  response_format: ResponseFormatEnum.describe('"markdown" or "json"'),
}).shape;
