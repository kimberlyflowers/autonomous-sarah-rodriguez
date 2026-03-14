/**
 * LinkedIn profile search via PhantomBuster API.
 * PAID tier — Lead Pro ($99/month).
 * PhantomBuster: $56/month min, API-based cloud automation.
 */
import { fetchJson, friendlyError } from "../services/http-client.js";
import type { SearchLinkedInInput } from "../schemas/inputs.js";
import type { LinkedInProfile, ScrapeResponse } from "../types.js";

const PHANTOM_API = "https://api.phantombuster.com/api/v2";

export async function searchLinkedIn(
  params: SearchLinkedInInput
): Promise<ScrapeResponse<LinkedInProfile>> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const results: LinkedInProfile[] = [];

  const apiKey = process.env.PHANTOMBUSTER_API_KEY;
  const agentId = process.env.PHANTOMBUSTER_LINKEDIN_AGENT_ID;

  if (!apiKey) {
    errors.push(
      "PhantomBuster API key not configured. " +
        "Set the PHANTOMBUSTER_API_KEY environment variable. " +
        "Get a key at https://phantombuster.com."
    );
    return makeResponse(params, results, errors, warnings);
  }

  if (!agentId) {
    errors.push(
      "PhantomBuster LinkedIn agent not configured. " +
        "Set the PHANTOMBUSTER_LINKEDIN_AGENT_ID environment variable. " +
        "Create a LinkedIn Profile Scraper Phantom at phantombuster.com first."
    );
    return makeResponse(params, results, errors, warnings);
  }

  try {
    // Build a LinkedIn search URL from the params
    const searchParts = [params.query];
    if (params.location) searchParts.push(params.location);
    if (params.job_title) searchParts.push(`title:${params.job_title}`);
    if (params.company) searchParts.push(`company:${params.company}`);

    const linkedinSearchUrl =
      `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchParts.join(" "))}`;

    // Launch the PhantomBuster agent with the search URL
    const launchResponse = await fetchJson<PhantomLaunchResponse>(
      `${PHANTOM_API}/agents/launch`,
      {
        method: "POST",
        headers: {
          "X-Phantombuster-Key": apiKey,
        },
        data: {
          id: agentId,
          argument: {
            searchUrl: linkedinSearchUrl,
            numberOfResultsPerLaunch: params.limit,
          },
        },
      }
    );

    if (!launchResponse.containerId) {
      errors.push(
        "PhantomBuster agent launch failed. " +
          "The LinkedIn agent may be busy or misconfigured."
      );
      return makeResponse(params, results, errors, warnings);
    }

    // Poll for results (PhantomBuster runs async)
    warnings.push(
      "LinkedIn search launched via PhantomBuster. " +
        `Container ID: ${launchResponse.containerId}. ` +
        "Results typically take 30-60 seconds. " +
        "Use scraper_check_linkedin_results to fetch completed data."
    );

    // Try to get cached/recent results from the agent's output
    try {
      const outputResponse = await fetchJson<PhantomOutputResponse>(
        `${PHANTOM_API}/agents/fetch-output`,
        {
          method: "POST",
          headers: {
            "X-Phantombuster-Key": apiKey,
          },
          data: {
            id: agentId,
            mode: "most-recent",
          },
        }
      );

      if (outputResponse?.output) {
        // Parse PhantomBuster CSV-like output
        const lines =
          typeof outputResponse.output === "string"
            ? JSON.parse(outputResponse.output)
            : outputResponse.output;

        if (Array.isArray(lines)) {
          for (const line of lines.slice(0, params.limit)) {
            results.push({
              name:
                [line.firstName, line.lastName].filter(Boolean).join(" ") ||
                line.name ||
                "Unknown",
              headline: line.headline || line.description || null,
              company: line.companyName || line.company || null,
              title: line.jobTitle || line.title || null,
              location: line.location || null,
              profileUrl: line.profileUrl || line.linkedinProfileUrl || null,
              email: line.email || null,
              connections: line.connectionDegree
                ? parseInt(line.connectionDegree, 10)
                : null,
              source: "linkedin",
            });
          }
        }
      }
    } catch {
      // No cached results yet — that's fine, the agent was just launched
      warnings.push(
        "No cached results available yet. The search is running. " +
          "Check back in ~60 seconds."
      );
    }
  } catch (err) {
    errors.push(`LinkedIn (PhantomBuster): ${friendlyError(err)}`);
  }

  return makeResponse(params, results, errors, warnings);
}

function makeResponse(
  params: SearchLinkedInInput,
  results: LinkedInProfile[],
  errors: string[],
  warnings: string[]
): ScrapeResponse<LinkedInProfile> {
  return {
    query: params.query,
    location: params.location || "any",
    source: "linkedin",
    total: results.length,
    count: results.length,
    offset: params.offset,
    has_more: false,
    results,
    errors,
    warnings,
  };
}

interface PhantomLaunchResponse {
  containerId?: string;
  status?: string;
}

interface PhantomOutputResponse {
  output?: string | unknown[];
  status?: string;
}
