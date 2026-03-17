import { z } from "zod";
/** video_check_access */
export declare const CheckAccessSchema: {
    org_id: z.ZodString;
    plan_tier: z.ZodEnum<["free", "video_creator", "video_pro"]>;
};
/** video_list_avatars */
export declare const ListAvatarsSchema: {
    org_id: z.ZodString;
    plan_tier: z.ZodEnum<["free", "video_creator", "video_pro"]>;
    response_format: z.ZodDefault<z.ZodEnum<["markdown", "json"]>>;
};
/** video_generate */
export declare const GenerateVideoSchema: {
    org_id: z.ZodString;
    plan_tier: z.ZodEnum<["free", "video_creator", "video_pro"]>;
    avatar_id: z.ZodString;
    script: z.ZodString;
    voice_style: z.ZodOptional<z.ZodString>;
    response_format: z.ZodDefault<z.ZodEnum<["markdown", "json"]>>;
};
/** video_job_status */
export declare const JobStatusSchema: {
    org_id: z.ZodString;
    plan_tier: z.ZodEnum<["free", "video_creator", "video_pro"]>;
    job_id: z.ZodString;
    response_format: z.ZodDefault<z.ZodEnum<["markdown", "json"]>>;
};
//# sourceMappingURL=inputs.d.ts.map