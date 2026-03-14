import { z } from "zod";
import { PlanTier, ResponseFormat } from "../constants.js";
/** Shared pagination + format fields */
const paginationFields = {
    limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(30)
        .describe("Maximum results to return (1-100, default 30)"),
    offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Number of results to skip for pagination"),
    response_format: z
        .nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for display or 'json' for structured data"),
};
/** Auth context — passed by the Bloomie runtime */
const authFields = {
    org_id: z.string().describe("Organization ID of the Bloomie owner"),
    plan_tier: z
        .nativeEnum(PlanTier)
        .default(PlanTier.FREE)
        .describe("Owner's current plan tier"),
};
// ─── check_access ───
export const CheckAccessSchema = z
    .object({
    ...authFields,
})
    .strict();
// ─── scrape_url (universal) ───
export const ScrapeUrlSchema = z
    .object({
    ...authFields,
    url: z
        .string()
        .url("Must be a valid URL")
        .describe("The webpage URL to scrape"),
    columns: z
        .array(z.string())
        .min(1, "Provide at least one column name")
        .max(20, "Maximum 20 columns")
        .describe("Column names describing what data to extract, e.g. ['Business Name', 'Phone', 'Address', 'Email']"),
    ...paginationFields,
})
    .strict();
// ─── search_businesses (Yellowpages + Yelp) ───
export const SearchBusinessesSchema = z
    .object({
    ...authFields,
    query: z
        .string()
        .min(2, "Search query must be at least 2 characters")
        .max(200)
        .describe("Business type or category, e.g. 'restaurants', 'plumbers', 'hair salons'"),
    location: z
        .string()
        .min(2)
        .max(100)
        .describe("City, state, or zip code, e.g. '78228' or 'San Antonio, TX'"),
    source: z
        .enum(["yellowpages", "yelp", "both"])
        .default("both")
        .describe("Which directory to search: yellowpages, yelp, or both"),
    ...paginationFields,
})
    .strict();
// ─── search_facebook_groups ───
export const SearchFacebookGroupsSchema = z
    .object({
    ...authFields,
    query: z
        .string()
        .min(2)
        .max(200)
        .describe("Group search term, e.g. 'San Antonio restaurants' or 'Austin real estate'"),
    group_url: z
        .string()
        .url()
        .optional()
        .describe("Direct URL of a specific Facebook group to scrape members from"),
    ...paginationFields,
})
    .strict();
// ─── search_google_maps (PAID — Lead Booster) ───
export const SearchGoogleMapsSchema = z
    .object({
    ...authFields,
    query: z
        .string()
        .min(2)
        .max(200)
        .describe("Business type or category to search"),
    location: z
        .string()
        .min(2)
        .max(100)
        .describe("City, state, or zip code"),
    ...paginationFields,
})
    .strict();
// ─── search_apollo (PAID — Lead Booster) ───
export const SearchApolloSchema = z
    .object({
    ...authFields,
    query: z
        .string()
        .min(2)
        .max(200)
        .describe("Person name, job title, or company to search for"),
    location: z
        .string()
        .max(100)
        .optional()
        .describe("City/state to filter results"),
    job_title: z
        .string()
        .max(100)
        .optional()
        .describe("Job title filter, e.g. 'Marketing Manager', 'Owner', 'CEO'"),
    industry: z
        .string()
        .max(100)
        .optional()
        .describe("Industry filter, e.g. 'Food & Beverages', 'Real Estate'"),
    company_size: z
        .enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1001+"])
        .optional()
        .describe("Filter by number of employees"),
    ...paginationFields,
})
    .strict();
// ─── search_linkedin (PAID — Lead Pro) ───
export const SearchLinkedInSchema = z
    .object({
    ...authFields,
    query: z
        .string()
        .min(2)
        .max(200)
        .describe("Person name, company, or keyword to search on LinkedIn"),
    location: z
        .string()
        .max(100)
        .optional()
        .describe("Location filter"),
    job_title: z
        .string()
        .max(100)
        .optional()
        .describe("Job title filter"),
    company: z
        .string()
        .max(100)
        .optional()
        .describe("Company name filter"),
    ...paginationFields,
})
    .strict();
//# sourceMappingURL=inputs.js.map