/**
 * Facebook Groups search + member extraction.
 * FREE tier. Requires the user to be logged into Facebook in their browser.
 * Note: Server-side scraping of Facebook is heavily restricted.
 * This tool searches for groups and provides guidance on extraction.
 */
import * as cheerio from "cheerio";
import { fetchPage, friendlyError } from "../services/http-client.js";
export async function searchFacebookGroups(params) {
    const errors = [];
    const warnings = [];
    const results = [];
    // Facebook heavily blocks server-side scraping.
    // This tool provides structured guidance instead of raw scraping.
    // The Bloomie can use Chrome-based tools for actual extraction.
    if (params.group_url) {
        // User provided a direct group URL — attempt to get public info
        try {
            const html = await fetchPage(params.group_url);
            const $ = cheerio.load(html);
            const title = $('meta[property="og:title"]').attr("content") ||
                $("title").text().trim();
            const description = $('meta[property="og:description"]').attr("content") || "";
            const memberMatch = description.match(/([\d,.]+[KMkm]?)\s*member/i);
            warnings.push(`Found group: **${title}**` +
                (memberMatch ? ` (${memberMatch[1]} members)` : "") +
                ".\n\n" +
                "⚠️ Facebook requires login to see member lists. " +
                "To extract members, I need to use the browser tool while you're logged into Facebook. " +
                "Want me to do that?");
        }
        catch (err) {
            errors.push(`Could not access the Facebook group. ${friendlyError(err)}. ` +
                "Facebook blocks most automated access. " +
                "I'll need to use the browser tool while you're logged in.");
        }
    }
    else {
        // Search for groups matching the query
        // Facebook search doesn't work well server-side, so provide guidance
        const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(params.query)}`;
        warnings.push(`To find Facebook groups for "${params.query}", I need browser access while you're logged into Facebook.\n\n` +
            `Here's what I'll do:\n` +
            `1. Navigate to Facebook group search: ${searchUrl}\n` +
            `2. Find the largest, most active groups in your area\n` +
            `3. Open the members list and extract names, workplaces, and locations\n\n` +
            `**Popular group search tips for "${params.query}":**\n` +
            `• Search for: "${params.query}" + your city name\n` +
            `• Look for groups with 10K+ members — they're more active\n` +
            `• Check "Buy & Sell" and "Community" groups for local consumers\n` +
            `• Business networking groups are gold for B2B leads\n\n` +
            `Want me to open the browser and start searching?`);
    }
    return {
        query: params.query,
        location: params.group_url || "facebook",
        source: "facebook_groups",
        total: results.length,
        count: results.length,
        offset: 0,
        has_more: false,
        results,
        errors,
        warnings,
    };
}
//# sourceMappingURL=search-facebook-groups.js.map