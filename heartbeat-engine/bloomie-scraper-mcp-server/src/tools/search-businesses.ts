/**
 * Business directory search — Yellowpages + Yelp.
 * FREE tier. No API keys needed.
 */
import * as cheerio from "cheerio";
import { fetchPage, friendlyError } from "../services/http-client.js";
import type { SearchBusinessesInput } from "../schemas/inputs.js";
import type { BusinessListing, ScrapeResponse } from "../types.js";

/** Scrape Yellowpages search results */
async function scrapeYellowpages(
  query: string,
  location: string,
  limit: number
): Promise<{ results: BusinessListing[]; errors: string[] }> {
  const errors: string[] = [];
  const results: BusinessListing[] = [];

  try {
    const url = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    $(".result").each((_i, el) => {
      if (results.length >= limit) return false;
      const name =
        $(el).find(".business-name span").text().trim() ||
        $(el).find(".business-name").text().trim();
      if (!name) return;

      results.push({
        name,
        phone: $(el).find(".phones").text().trim() || null,
        address: $(el).find(".street-address").text().trim() || null,
        city: $(el).find(".locality").text().trim() || null,
        state: null,
        category:
          $(el).find(".categories a").first().text().trim() || null,
        website: $(el).find('a.track-visit-website').attr("href") || null,
        rating: $(el).find(".ratings .count").text().trim() || null,
        reviewCount: null,
        source: "yellowpages",
      });
    });

    if (results.length === 0) {
      errors.push(
        `Yellowpages returned no results for "${query}" in "${location}". ` +
          "Try a broader category or different location."
      );
    }
  } catch (err) {
    errors.push(`Yellowpages: ${friendlyError(err)}`);
  }

  return { results, errors };
}

/** Scrape Yelp search results */
async function scrapeYelp(
  query: string,
  location: string,
  limit: number
): Promise<{ results: BusinessListing[]; errors: string[] }> {
  const errors: string[] = [];
  const results: BusinessListing[] = [];

  try {
    const url = `https://www.yelp.com/search?find_desc=${encodeURIComponent(query)}&find_loc=${encodeURIComponent(location)}`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Yelp's structure uses data attributes and various class patterns
    $('[data-testid="serp-ia-card"]').each((_i, el) => {
      if (results.length >= limit) return false;
      const name =
        $(el).find("a[class*='css'] span").first().text().trim() ||
        $(el).find("h3").text().trim() ||
        $(el).find("a").first().text().trim();
      if (!name || name.length < 2) return;

      const ratingText = $(el).find('[aria-label*="star"]').attr("aria-label") || "";
      const ratingMatch = ratingText.match(/([\d.]+)\s*star/i);

      const reviewText = $(el).text();
      const reviewMatch = reviewText.match(/(\d+)\s*review/i);

      results.push({
        name,
        phone: $(el).find('[class*="phone"]').text().trim() || null,
        address: null,
        city: location,
        state: null,
        category: $(el).find('[class*="category"]').text().trim() || null,
        website: null,
        rating: ratingMatch ? ratingMatch[1] : null,
        reviewCount: reviewMatch ? parseInt(reviewMatch[1], 10) : null,
        source: "yelp",
      });
    });

    // Fallback selector for different Yelp layout
    if (results.length === 0) {
      $("li h3, li h4").each((_i, el) => {
        if (results.length >= limit) return false;
        const name = $(el).text().trim();
        if (!name || name.length < 2 || /^\d+$/.test(name)) return;

        results.push({
          name,
          phone: null,
          address: null,
          city: location,
          state: null,
          category: null,
          website: null,
          rating: null,
          reviewCount: null,
          source: "yelp",
        });
      });
    }

    if (results.length === 0) {
      errors.push(
        `Yelp returned no results for "${query}" in "${location}". ` +
          "Yelp may be blocking automated requests, or try a different search term."
      );
    }
  } catch (err) {
    errors.push(`Yelp: ${friendlyError(err)}`);
  }

  return { results, errors };
}

/** Combined business search */
export async function searchBusinesses(
  params: SearchBusinessesInput
): Promise<ScrapeResponse<BusinessListing>> {
  const allResults: BusinessListing[] = [];
  const allErrors: string[] = [];
  const warnings: string[] = [];

  const halfLimit = Math.ceil(params.limit / 2);

  if (params.source === "yellowpages" || params.source === "both") {
    const yp = await scrapeYellowpages(
      params.query,
      params.location,
      params.source === "both" ? halfLimit : params.limit
    );
    allResults.push(...yp.results);
    allErrors.push(...yp.errors);
  }

  if (params.source === "yelp" || params.source === "both") {
    const yelp = await scrapeYelp(
      params.query,
      params.location,
      params.source === "both" ? halfLimit : params.limit
    );
    allResults.push(...yelp.results);
    allErrors.push(...yelp.errors);
  }

  // Deduplicate by name similarity
  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    const key = r.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length < allResults.length) {
    warnings.push(
      `Removed ${allResults.length - deduped.length} duplicate listings.`
    );
  }

  // Add upsell hint if results are limited
  if (deduped.length > 0) {
    warnings.push(
      "💡 Want verified emails and phone numbers for these businesses? " +
        "The Lead Booster add-on includes Apollo.io contact enrichment and Google Maps data."
    );
  }

  const sliced = deduped.slice(params.offset, params.offset + params.limit);
  return {
    query: params.query,
    location: params.location,
    source: params.source,
    total: deduped.length,
    count: sliced.length,
    offset: params.offset,
    has_more: deduped.length > params.offset + params.limit,
    ...(deduped.length > params.offset + params.limit
      ? { next_offset: params.offset + params.limit }
      : {}),
    results: sliced,
    errors: allErrors,
    warnings,
  };
}
