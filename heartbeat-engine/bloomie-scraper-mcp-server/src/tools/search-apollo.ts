/**
 * Apollo.io contact/company search.
 * PAID tier — Lead Booster ($29/month).
 * Apollo API: Free tier has limits, then per-credit pricing.
 */
import { fetchJson, friendlyError } from "../services/http-client.js";
import type { SearchApolloInput } from "../schemas/inputs.js";
import type { ApolloContact, ScrapeResponse } from "../types.js";

const APOLLO_API = "https://api.apollo.io/api/v1";

export async function searchApollo(
  params: SearchApolloInput
): Promise<ScrapeResponse<ApolloContact>> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const results: ApolloContact[] = [];

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    errors.push(
      "Apollo.io API key not configured. " +
        "Set the APOLLO_API_KEY environment variable. " +
        "Get a free API key at https://app.apollo.io (includes free credits)."
    );
    return makeResponse(params, results, errors, warnings);
  }

  try {
    // Apollo uses POST for search
    const body: ApolloSearchBody = {
      q_keywords: params.query,
      page: Math.floor(params.offset / params.limit) + 1,
      per_page: params.limit,
    };

    if (params.location) {
      body.person_locations = [params.location];
    }
    if (params.job_title) {
      body.person_titles = [params.job_title];
    }
    if (params.industry) {
      body.organization_industry_tag_ids = [params.industry];
    }
    if (params.company_size) {
      body.organization_num_employees_ranges = [params.company_size];
    }

    const data = await fetchJson<ApolloSearchResponse>(
      `${APOLLO_API}/mixed_people/search`,
      {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
        },
        data: body,
      }
    );

    const people = data?.people ?? [];

    for (const person of people) {
      results.push({
        name: [person.first_name, person.last_name]
          .filter(Boolean)
          .join(" ") || "Unknown",
        title: person.title || null,
        company: person.organization?.name || null,
        email: person.email || null,
        phone:
          person.phone_numbers?.[0]?.sanitized_number ||
          person.organization?.phone || null,
        linkedin: person.linkedin_url || null,
        location:
          [person.city, person.state, person.country]
            .filter(Boolean)
            .join(", ") || null,
        industry: person.organization?.industry || null,
        companySize:
          person.organization?.estimated_num_employees != null
            ? String(person.organization.estimated_num_employees)
            : null,
        source: "apollo",
      });
    }

    if (results.length === 0) {
      errors.push(
        `Apollo returned no results for "${params.query}"` +
          (params.location ? ` in "${params.location}"` : "") +
          ". Try broader search terms or remove filters."
      );
    }

    // Credit usage warning
    if (data?.pagination?.total_entries) {
      warnings.push(
        `Apollo found ${data.pagination.total_entries} total matches. ` +
          `Showing ${results.length}. Each email reveal uses 1 credit.`
      );
    }
  } catch (err) {
    errors.push(`Apollo.io: ${friendlyError(err)}`);
  }

  return makeResponse(params, results, errors, warnings);
}

function makeResponse(
  params: SearchApolloInput,
  results: ApolloContact[],
  errors: string[],
  warnings: string[]
): ScrapeResponse<ApolloContact> {
  return {
    query: params.query,
    location: params.location || "any",
    source: "apollo",
    total: results.length,
    count: results.length,
    offset: params.offset,
    has_more: false, // Apollo handles pagination via page numbers
    results,
    errors,
    warnings,
  };
}

/** Apollo search request body (partial) */
interface ApolloSearchBody {
  q_keywords: string;
  page: number;
  per_page: number;
  person_locations?: string[];
  person_titles?: string[];
  organization_industry_tag_ids?: string[];
  organization_num_employees_ranges?: string[];
}

/** Apollo search response (partial) */
interface ApolloSearchResponse {
  people?: ApolloPersonResult[];
  pagination?: {
    total_entries?: number;
    page?: number;
    per_page?: number;
  };
}

interface ApolloPersonResult {
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  phone_numbers?: Array<{ sanitized_number?: string }>;
  organization?: {
    name?: string;
    phone?: string;
    industry?: string;
    estimated_num_employees?: number;
  };
}
