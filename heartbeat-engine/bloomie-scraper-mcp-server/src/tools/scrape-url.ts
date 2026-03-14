/**
 * Universal URL Scraper — works like Thunderbit.
 * Give it any URL and column names, and it extracts structured data.
 * FREE tier — no API cost.
 */
import * as cheerio from "cheerio";
import { fetchPage, friendlyError } from "../services/http-client.js";
import { CHARACTER_LIMIT, ResponseFormat } from "../constants.js";
import type { ScrapeUrlInput } from "../schemas/inputs.js";
import type { CustomUrlRow, ScrapeResponse } from "../types.js";

export async function scrapeUrl(
  params: ScrapeUrlInput
): Promise<ScrapeResponse<CustomUrlRow>> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const results: CustomUrlRow[] = [];

  try {
    const html = await fetchPage(params.url);
    const $ = cheerio.load(html);

    // Remove script/style/nav/footer noise
    $("script, style, nav, footer, header, noscript, iframe").remove();

    // Strategy 1: Look for tables — richest structured data
    const tables = $("table");
    if (tables.length > 0) {
      tables.each((_i, table) => {
        const headerCells = $(table).find("thead th, thead td, tr:first-child th, tr:first-child td");
        const headers: string[] = [];
        headerCells.each((_j, cell) => {
          headers.push($(cell).text().trim());
        });

        const rows = $(table).find("tbody tr, tr").slice(headers.length > 0 ? 1 : 0);
        rows.each((_j, row) => {
          const cells = $(row).find("td, th");
          if (cells.length === 0) return;
          const rowData: CustomUrlRow = {};
          cells.each((k, cell) => {
            const key =
              headers[k] ||
              params.columns[k] ||
              `column_${k + 1}`;
            rowData[key] = $(cell).text().trim();
          });
          if (Object.values(rowData).some((v) => v.length > 0)) {
            results.push(rowData);
          }
        });
      });
    }

    // Strategy 2: Look for repeated list-like structures (cards, listings)
    if (results.length === 0) {
      // Find the most common repeating container
      const candidates = [
        "article",
        "[class*='card']",
        "[class*='listing']",
        "[class*='result']",
        "[class*='item']",
        "li",
        "[class*='row']",
      ];

      for (const selector of candidates) {
        const elements = $(selector);
        if (elements.length >= 3) {
          // Enough repetition to be a list
          elements.each((_i, el) => {
            const rowData: CustomUrlRow = {};
            const text = $(el).text().replace(/\s+/g, " ").trim();
            if (text.length < 5) return;

            // Try to extract requested columns by proximity matching
            for (const col of params.columns) {
              const colLower = col.toLowerCase();
              // Look for labeled data (e.g., "Phone: 555-1234")
              const labelRegex = new RegExp(
                `${colLower}[:\\s]*([^\\n,|]+)`,
                "i"
              );
              const match = text.match(labelRegex);
              if (match) {
                rowData[col] = match[1].trim();
                continue;
              }

              // Look for links if column sounds like URL/website/email
              if (
                colLower.includes("url") ||
                colLower.includes("website") ||
                colLower.includes("link")
              ) {
                const href = $(el).find("a").first().attr("href");
                if (href) rowData[col] = href;
              } else if (colLower.includes("email")) {
                const mailto = $(el)
                  .find('a[href^="mailto:"]')
                  .first()
                  .attr("href");
                if (mailto) rowData[col] = mailto.replace("mailto:", "");
              } else if (
                colLower.includes("phone") ||
                colLower.includes("tel")
              ) {
                const tel = $(el)
                  .find('a[href^="tel:"]')
                  .first()
                  .attr("href");
                if (tel) rowData[col] = tel.replace("tel:", "");
                else {
                  // Regex for phone numbers
                  const phoneMatch = text.match(
                    /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/
                  );
                  if (phoneMatch) rowData[col] = phoneMatch[0];
                }
              } else if (
                colLower.includes("name") ||
                colLower.includes("title")
              ) {
                // First heading or bold text
                const heading = $(el)
                  .find("h1, h2, h3, h4, h5, h6, strong, b, [class*='name'], [class*='title']")
                  .first()
                  .text()
                  .trim();
                if (heading) rowData[col] = heading;
              } else if (colLower.includes("image") || colLower.includes("photo")) {
                const img = $(el).find("img").first().attr("src");
                if (img) rowData[col] = img;
              }
            }

            // If we got at least one column, include the row
            if (Object.keys(rowData).length > 0) {
              rowData["_raw_text"] = text.substring(0, 300);
              results.push(rowData);
            }
          });

          if (results.length > 0) break; // Found a working selector
        }
      }
    }

    // Strategy 3: Fallback — extract all text blocks
    if (results.length === 0) {
      warnings.push(
        "Could not detect a structured layout. Extracted raw text blocks instead. " +
          "Try providing a more specific URL (e.g., a search results page rather than a homepage)."
      );
      const blocks = $("p, div > span, li")
        .map((_i, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 20);

      for (const block of blocks.slice(0, params.limit)) {
        results.push({ raw_text: block.substring(0, 500) });
      }
    }

    if (results.length === 0) {
      errors.push(
        "No extractable data found on this page. The page might be JavaScript-rendered " +
          "(which requires a browser), empty, or protected. Try a different URL."
      );
    }
  } catch (err) {
    errors.push(friendlyError(err));
  }

  const sliced = results.slice(params.offset, params.offset + params.limit);
  return {
    query: params.columns.join(", "),
    location: params.url,
    source: "custom_url",
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
