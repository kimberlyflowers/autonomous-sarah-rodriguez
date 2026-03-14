import { z } from "zod";
import { PlanTier, ResponseFormat } from "../constants.js";
export declare const CheckAccessSchema: z.ZodObject<{
    org_id: z.ZodString;
    plan_tier: z.ZodDefault<z.ZodNativeEnum<typeof PlanTier>>;
}, "strict", z.ZodTypeAny, {
    org_id: string;
    plan_tier: PlanTier;
}, {
    org_id: string;
    plan_tier?: PlanTier | undefined;
}>;
export type CheckAccessInput = z.infer<typeof CheckAccessSchema>;
export declare const ScrapeUrlSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
    url: z.ZodString;
    columns: z.ZodArray<z.ZodString, "many">;
    org_id: z.ZodString;
    plan_tier: z.ZodDefault<z.ZodNativeEnum<typeof PlanTier>>;
}, "strict", z.ZodTypeAny, {
    org_id: string;
    plan_tier: PlanTier;
    url: string;
    columns: string[];
    limit: number;
    offset: number;
    response_format: ResponseFormat;
}, {
    org_id: string;
    url: string;
    columns: string[];
    plan_tier?: PlanTier | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    response_format?: ResponseFormat | undefined;
}>;
export type ScrapeUrlInput = z.infer<typeof ScrapeUrlSchema>;
export declare const SearchBusinessesSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
    query: z.ZodString;
    location: z.ZodString;
    source: z.ZodDefault<z.ZodEnum<["yellowpages", "yelp", "both"]>>;
    org_id: z.ZodString;
    plan_tier: z.ZodDefault<z.ZodNativeEnum<typeof PlanTier>>;
}, "strict", z.ZodTypeAny, {
    source: "yellowpages" | "yelp" | "both";
    org_id: string;
    plan_tier: PlanTier;
    limit: number;
    offset: number;
    response_format: ResponseFormat;
    query: string;
    location: string;
}, {
    org_id: string;
    query: string;
    location: string;
    source?: "yellowpages" | "yelp" | "both" | undefined;
    plan_tier?: PlanTier | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    response_format?: ResponseFormat | undefined;
}>;
export type SearchBusinessesInput = z.infer<typeof SearchBusinessesSchema>;
export declare const SearchFacebookGroupsSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
    query: z.ZodString;
    group_url: z.ZodOptional<z.ZodString>;
    org_id: z.ZodString;
    plan_tier: z.ZodDefault<z.ZodNativeEnum<typeof PlanTier>>;
}, "strict", z.ZodTypeAny, {
    org_id: string;
    plan_tier: PlanTier;
    limit: number;
    offset: number;
    response_format: ResponseFormat;
    query: string;
    group_url?: string | undefined;
}, {
    org_id: string;
    query: string;
    plan_tier?: PlanTier | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    response_format?: ResponseFormat | undefined;
    group_url?: string | undefined;
}>;
export type SearchFacebookGroupsInput = z.infer<typeof SearchFacebookGroupsSchema>;
export declare const SearchGoogleMapsSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
    query: z.ZodString;
    location: z.ZodString;
    org_id: z.ZodString;
    plan_tier: z.ZodDefault<z.ZodNativeEnum<typeof PlanTier>>;
}, "strict", z.ZodTypeAny, {
    org_id: string;
    plan_tier: PlanTier;
    limit: number;
    offset: number;
    response_format: ResponseFormat;
    query: string;
    location: string;
}, {
    org_id: string;
    query: string;
    location: string;
    plan_tier?: PlanTier | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    response_format?: ResponseFormat | undefined;
}>;
export type SearchGoogleMapsInput = z.infer<typeof SearchGoogleMapsSchema>;
export declare const SearchApolloSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
    query: z.ZodString;
    location: z.ZodOptional<z.ZodString>;
    job_title: z.ZodOptional<z.ZodString>;
    industry: z.ZodOptional<z.ZodString>;
    company_size: z.ZodOptional<z.ZodEnum<["1-10", "11-50", "51-200", "201-500", "501-1000", "1001+"]>>;
    org_id: z.ZodString;
    plan_tier: z.ZodDefault<z.ZodNativeEnum<typeof PlanTier>>;
}, "strict", z.ZodTypeAny, {
    org_id: string;
    plan_tier: PlanTier;
    limit: number;
    offset: number;
    response_format: ResponseFormat;
    query: string;
    location?: string | undefined;
    job_title?: string | undefined;
    industry?: string | undefined;
    company_size?: "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1001+" | undefined;
}, {
    org_id: string;
    query: string;
    plan_tier?: PlanTier | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    response_format?: ResponseFormat | undefined;
    location?: string | undefined;
    job_title?: string | undefined;
    industry?: string | undefined;
    company_size?: "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1001+" | undefined;
}>;
export type SearchApolloInput = z.infer<typeof SearchApolloSchema>;
export declare const SearchLinkedInSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
    query: z.ZodString;
    location: z.ZodOptional<z.ZodString>;
    job_title: z.ZodOptional<z.ZodString>;
    company: z.ZodOptional<z.ZodString>;
    org_id: z.ZodString;
    plan_tier: z.ZodDefault<z.ZodNativeEnum<typeof PlanTier>>;
}, "strict", z.ZodTypeAny, {
    org_id: string;
    plan_tier: PlanTier;
    limit: number;
    offset: number;
    response_format: ResponseFormat;
    query: string;
    location?: string | undefined;
    job_title?: string | undefined;
    company?: string | undefined;
}, {
    org_id: string;
    query: string;
    plan_tier?: PlanTier | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    response_format?: ResponseFormat | undefined;
    location?: string | undefined;
    job_title?: string | undefined;
    company?: string | undefined;
}>;
export type SearchLinkedInInput = z.infer<typeof SearchLinkedInSchema>;
//# sourceMappingURL=inputs.d.ts.map