#!/usr/bin/env node
/**
 * Bloomie Scraper MCP Server
 *
 * Provides lead scraping tools for Bloomie AI employees.
 * Tier-gated: Free tools (URL scraper, Yellowpages/Yelp, Facebook Groups)
 * and paid tools (Google Maps, Apollo.io, LinkedIn) with upsell messaging.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { checkAccess, getPlanSummary } from "./services/access-gate.js";
import { formatResponse } from "./services/formatter.js";
// Schemas
import { CheckAccessSchema, ScrapeUrlSchema, SearchBusinessesSchema, SearchFacebookGroupsSchema, SearchGoogleMapsSchema, SearchApolloSchema, SearchLinkedInSchema, } from "./schemas/inputs.js";
// Tool implementations
import { scrapeUrl } from "./tools/scrape-url.js";
import { searchBusinesses } from "./tools/search-businesses.js";
import { searchFacebookGroups } from "./tools/search-facebook-groups.js";
import { searchGoogleMaps } from "./tools/search-google-maps.js";
import { searchApollo } from "./tools/search-apollo.js";
import { searchLinkedIn } from "./tools/search-linkedin.js";
// ─── Create server ───
const server = new McpServer({
    name: "bloomie-scraper-mcp-server",
    version: "1.0.0",
});
// ─── Helper: gate a tool behind a plan tier ───
function gatedResponse(toolName, planTier) {
    const access = checkAccess(planTier, toolName);
    if (!access.allowed) {
        return {
            content: [{ type: "text", text: access.upsellMessage }],
        };
    }
    return null; // Access granted — caller should continue
}
// ═══════════════════════════════════════════════════
// TOOL 1: scraper_check_access (FREE)
// ═══════════════════════════════════════════════════
server.registerTool("scraper_check_access", {
    title: "Check Scraper Access",
    description: `Check what scraping tools the owner's plan includes and what upgrades are available.

Call this FIRST before attempting any scraping to understand what sources you can use.
Returns a summary of the current plan tier and what each tier includes.

Args:
  - org_id (string): Organization ID
  - plan_tier (string): Current plan tier — "free", "lead_booster", or "lead_pro"

Returns:
  Markdown summary of plan access and available upgrades.`,
    inputSchema: CheckAccessSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async (params) => {
    const summary = getPlanSummary(params.plan_tier);
    return {
        content: [{ type: "text", text: summary }],
    };
});
// ═══════════════════════════════════════════════════
// TOOL 2: scraper_scrape_url (FREE)
// ═══════════════════════════════════════════════════
server.registerTool("scraper_scrape_url", {
    title: "Scrape Any URL",
    description: `Universal web scraper — extract structured data from ANY webpage.
Works like Thunderbit: give it a URL and tell it what columns you want.
The AI detects tables, listings, cards, and repeated structures automatically.

Best for: directory pages, search results, product listings, review pages, any structured content.
Limitations: Won't work on JavaScript-rendered pages (use browser tools for those).

Args:
  - url (string): The webpage URL to scrape
  - columns (string[]): Column names describing what to extract, e.g. ["Business Name", "Phone", "Address"]
  - org_id (string): Organization ID
  - plan_tier (string): Current plan tier
  - limit (number): Max results (default 30)
  - offset (number): Pagination offset (default 0)
  - response_format (string): "markdown" or "json"

Returns:
  Structured data extracted from the page, organized by the requested columns.
  Includes warnings if the page couldn't be parsed well.`,
    inputSchema: ScrapeUrlSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
}, async (params) => {
    const gate = gatedResponse("scraper_scrape_url", params.plan_tier);
    if (gate)
        return gate;
    const result = await scrapeUrl(params);
    const text = formatResponse(result, params.response_format);
    return { content: [{ type: "text", text }] };
});
// ═══════════════════════════════════════════════════
// TOOL 3: scraper_search_businesses (FREE)
// ═══════════════════════════════════════════════════
server.registerTool("scraper_search_businesses", {
    title: "Search Business Directories",
    description: `Search Yellowpages and/or Yelp for local businesses.
Returns business names, phone numbers, addresses, categories, ratings.
FREE — no API keys required.

Best for: B2B prospecting, finding local businesses by category and location.
Pair with Apollo.io (Lead Booster plan) to get verified emails for these businesses.

Args:
  - query (string): Business type, e.g. "restaurants", "plumbers", "hair salons"
  - location (string): City/state/zip, e.g. "78228" or "San Antonio, TX"
  - source (string): "yellowpages", "yelp", or "both" (default: both)
  - org_id, plan_tier, limit, offset, response_format: standard fields

Returns:
  List of businesses with name, phone, address, category, rating, and source.`,
    inputSchema: SearchBusinessesSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
}, async (params) => {
    const gate = gatedResponse("scraper_search_businesses", params.plan_tier);
    if (gate)
        return gate;
    const result = await searchBusinesses(params);
    const text = formatResponse(result, params.response_format);
    return { content: [{ type: "text", text }] };
});
// ═══════════════════════════════════════════════════
// TOOL 4: scraper_search_facebook_groups (FREE)
// ═══════════════════════════════════════════════════
server.registerTool("scraper_search_facebook_groups", {
    title: "Search Facebook Groups",
    description: `Find and extract members from Facebook groups.
Groups with 10K-300K+ local members are gold mines for B2C leads.
Returns member names, workplaces, locations, and profile links.

IMPORTANT: Facebook requires the user to be logged in. If scraping fails,
ask the user to log into Facebook first, then use the browser tool.

Args:
  - query (string): Group search term, e.g. "San Antonio restaurants"
  - group_url (string, optional): Direct URL of a Facebook group
  - org_id, plan_tier, limit, offset, response_format: standard fields

Returns:
  Group information and member data (when accessible).
  Guidance on browser-based extraction when server-side scraping is blocked.`,
    inputSchema: SearchFacebookGroupsSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
    },
}, async (params) => {
    const gate = gatedResponse("scraper_search_facebook_groups", params.plan_tier);
    if (gate)
        return gate;
    const result = await searchFacebookGroups(params);
    const text = formatResponse(result, params.response_format);
    return { content: [{ type: "text", text }] };
});
// ═══════════════════════════════════════════════════
// TOOL 5: scraper_search_google_maps (PAID — Lead Booster)
// ═══════════════════════════════════════════════════
server.registerTool("scraper_search_google_maps", {
    title: "Search Google Maps",
    description: `Search Google Maps for businesses via Outscraper API.
Returns verified business data: name, phone, address, website, rating, reviews, hours.
Google Maps has the most comprehensive local business database.

🔒 Requires Lead Booster plan ($29/month). Free users will see upgrade info.

Args:
  - query (string): Business type to search
  - location (string): City/state/zip code
  - org_id, plan_tier, limit, offset, response_format: standard fields

Returns:
  Verified business listings from Google Maps with full contact details.`,
    inputSchema: SearchGoogleMapsSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
}, async (params) => {
    const gate = gatedResponse("scraper_search_google_maps", params.plan_tier);
    if (gate)
        return gate;
    const result = await searchGoogleMaps(params);
    const text = formatResponse(result, params.response_format);
    return { content: [{ type: "text", text }] };
});
// ═══════════════════════════════════════════════════
// TOOL 6: scraper_search_apollo (PAID — Lead Booster)
// ═══════════════════════════════════════════════════
server.registerTool("scraper_search_apollo", {
    title: "Search Apollo.io Contacts",
    description: `Search Apollo.io's database of 210M+ contacts and 30M+ companies.
Returns verified emails, phone numbers, job titles, company info.
The gold standard for B2B contact data.

🔒 Requires Lead Booster plan ($29/month). Free users will see upgrade info.

Args:
  - query (string): Person name, job title, or company to search
  - location (string, optional): City/state filter
  - job_title (string, optional): Filter by title, e.g. "CEO", "Marketing Manager"
  - industry (string, optional): Industry filter
  - company_size (string, optional): Employee count range
  - org_id, plan_tier, limit, offset, response_format: standard fields

Returns:
  Contact list with name, title, company, verified email, phone, LinkedIn URL.`,
    inputSchema: SearchApolloSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
}, async (params) => {
    const gate = gatedResponse("scraper_search_apollo", params.plan_tier);
    if (gate)
        return gate;
    const result = await searchApollo(params);
    const text = formatResponse(result, params.response_format);
    return { content: [{ type: "text", text }] };
});
// ═══════════════════════════════════════════════════
// TOOL 7: scraper_search_linkedin (PAID — Lead Pro)
// ═══════════════════════════════════════════════════
server.registerTool("scraper_search_linkedin", {
    title: "Search LinkedIn Profiles",
    description: `Search LinkedIn for professional profiles via PhantomBuster.
Returns up to 75 data points per person: name, headline, company, title,
location, experience, education, email, and profile URL.

🔒 Requires Lead Pro plan ($99/month). Free/Booster users will see upgrade info.

Note: LinkedIn searches run asynchronously and may take 30-60 seconds.
Results from the most recent search are returned if available.

Args:
  - query (string): Person name, company, or keyword
  - location (string, optional): Location filter
  - job_title (string, optional): Job title filter
  - company (string, optional): Company name filter
  - org_id, plan_tier, limit, offset, response_format: standard fields

Returns:
  LinkedIn profiles with professional details and contact info.`,
    inputSchema: SearchLinkedInSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
    },
}, async (params) => {
    const gate = gatedResponse("scraper_search_linkedin", params.plan_tier);
    if (gate)
        return gate;
    const result = await searchLinkedIn(params);
    const text = formatResponse(result, params.response_format);
    return { content: [{ type: "text", text }] };
});
// ─── Start server ───
async function runStdio() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Bloomie Scraper MCP server running via stdio");
}
async function runHTTP() {
    const app = express();
    app.use(express.json());
    app.post("/mcp", async (req, res) => {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        res.on("close", () => transport.close());
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    });
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", server: "bloomie-scraper-mcp-server", version: "1.0.0" });
    });
    const port = parseInt(process.env.PORT || "3100", 10);
    app.listen(port, () => {
        console.error(`Bloomie Scraper MCP server running on http://localhost:${port}/mcp`);
    });
}
// Choose transport
const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
    runHTTP().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
else {
    runStdio().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map