/**
 * Google Maps business search via Outscraper API.
 * PAID tier — Lead Booster ($29/month).
 * Outscraper: 500 free/month, then $3 per 1,000 records.
 */
import { fetchJson, friendlyError } from "../services/http-client.js";
import type { SearchGoogleMapsInput } from "../schemas/inputs.js";
import type { BusinessListing, ScrapeResponse } from "../types.js";

const OUTSCRAPER_API = "https://api.app.outscraper.com/maps/search-v3";

export async function searchGoogleMaps(
  params: SearchGoogleMapsInput
): Promise<ScrapeResponse<BusinessListing>> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const results: BusinessListing[] = [];

  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    errors.push(
      "Outscraper API key not configured. " +
        "Set the OUTSCRAPER_API_KEY environment variable. " +
        "Get a key at https://outscraper.com (500 free records/month)."
    );
    return makeResponse(params, results, errors, warnings);
  }

  try {
    const searchQuery = `${params.query} ${params.location}`;
    const data = await fetchJson<OutscraperResponse>(OUTSCRAPER_API, {
      params: {
        query: searchQuery,
        limit: String(params.limit),
        async: "false",
      },
      headers: {
        "X-API-KEY": apiKey,
      },
    });

    // Outscraper returns nested arrays — flatten to a single list
    const flatList: OutscraperPlace[] = [];
    const rawData = data?.data ?? [];
    for (const entry of rawData) {
      if (Array.isArray(entry)) {
        flatList.push(...entry);
      } else if (entry && typeof entry === "object") {
        flatList.push(entry);
      }
    }

    for (const place of flatList) {
      results.push({
        name: place.name || place.query || "Unknown",
        phone: place.phone || place.international_phone_number || null,
        address: place.full_address || place.address || null,
        city: place.city || null,
        state: place.state || null,
        category: place.type || place.category || null,
        website: place.site || place.website || null,
        rating: place.rating != null ? String(place.rating) : null,
        reviewCount: place.reviews != null ? Number(place.reviews) : null,
        source: "google_maps",
      });
    }

    if (results.length === 0) {
      errors.push(
        `No Google Maps results for "${params.query}" in "${params.location}". ` +
          "Try a broader category or different location."
      );
    }
  } catch (err) {
    errors.push(`Google Maps (Outscraper): ${friendlyError(err)}`);
  }

  return makeResponse(params, results, errors, warnings);
}

function makeResponse(
  params: SearchGoogleMapsInput,
  results: BusinessListing[],
  errors: string[],
  warnings: string[]
): ScrapeResponse<BusinessListing> {
  const sliced = results.slice(params.offset, params.offset + params.limit);
  return {
    query: params.query,
    location: params.location,
    source: "google_maps",
    total: results.length,
    count: sliced.length,
    offset: params.offset,
    has_more: results.length > params.offset + params.limit,
    ...(results.length > params.offset + params.limit
      ? { next_offset: params.offset + params.limit }
      : {}),
    results: sliced,
    errors,
    warnings,
  };
}

/** Outscraper response shape (partial) */
interface OutscraperResponse {
  data?: Array<OutscraperPlace[] | OutscraperPlace> | null;
}

interface OutscraperPlace {
  name?: string;
  query?: string;
  phone?: string;
  international_phone_number?: string;
  full_address?: string;
  address?: string;
  city?: string;
  state?: string;
  type?: string;
  category?: string;
  site?: string;
  website?: string;
  rating?: number;
  reviews?: number;
}
