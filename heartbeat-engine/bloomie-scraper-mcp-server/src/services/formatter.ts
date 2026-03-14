import { CHARACTER_LIMIT, ResponseFormat } from "../constants.js";
import type { BusinessListing, ApolloContact, LinkedInProfile, ScrapeResponse, CustomUrlRow, GroupMember } from "../types.js";

/** Format a ScrapeResponse into text or JSON */
export function formatResponse<T>(
  response: ScrapeResponse<T>,
  format: ResponseFormat
): string {
  if (format === ResponseFormat.JSON) {
    return truncate(JSON.stringify(response, null, 2));
  }

  const lines: string[] = [];

  // Header
  lines.push(`## Scrape Results: "${response.query}" (${response.source})`);
  lines.push(`**Location:** ${response.location} | **Found:** ${response.total} results`);
  if (response.has_more) {
    lines.push(`_Showing ${response.count} of ${response.total}. Use offset=${response.next_offset} for more._`);
  }
  lines.push("");

  // Errors
  if (response.errors.length > 0) {
    lines.push("### Issues");
    for (const err of response.errors) {
      lines.push(`⚠️ ${err}`);
    }
    lines.push("");
  }

  // Results
  if (response.results.length > 0) {
    for (let i = 0; i < response.results.length; i++) {
      const item = response.results[i] as Record<string, unknown>;
      lines.push(`### ${i + 1}. ${getDisplayName(item)}`);
      for (const [key, value] of Object.entries(item)) {
        if (key === "source" || key === "_raw_text" || !value) continue;
        if (key === "name") continue; // already in the heading
        lines.push(`• **${formatKey(key)}:** ${value}`);
      }
      lines.push("");
    }
  }

  // Warnings (includes upsell hints)
  if (response.warnings.length > 0) {
    lines.push("---");
    for (const warn of response.warnings) {
      lines.push(warn);
    }
  }

  return truncate(lines.join("\n"));
}

function getDisplayName(item: Record<string, unknown>): string {
  return (
    (item.name as string) ||
    (item.Business_Name as string) ||
    (item.title as string) ||
    "Result"
  );
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.substring(0, CHARACTER_LIMIT - 100) +
    "\n\n_[Response truncated. Use `offset` parameter or add filters to see more results.]_"
  );
}
