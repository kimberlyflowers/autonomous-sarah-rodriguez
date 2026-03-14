import axios, { AxiosError } from "axios";
import { USER_AGENT, REQUEST_TIMEOUT } from "../constants.js";

/** Fetch a page's raw HTML with browser-like headers. */
export async function fetchPage(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: REQUEST_TIMEOUT,
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    maxRedirects: 5,
    validateStatus: (status: number) => status < 400,
  });
  return response.data;
}

/** Call a JSON API endpoint. */
export async function fetchJson<T>(
  url: string,
  options: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    data?: unknown;
    params?: Record<string, string | number>;
  } = {}
): Promise<T> {
  const response = await axios({
    method: options.method ?? "GET",
    url,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
    data: options.data,
    params: options.params,
    timeout: REQUEST_TIMEOUT,
  });
  return response.data as T;
}

/** Human-readable error from an axios or generic error */
export function friendlyError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      switch (error.response.status) {
        case 403:
          return "Access blocked (403 Forbidden). The site is rejecting automated requests. Try a different source.";
        case 404:
          return "Page not found (404). The URL may be wrong or the page no longer exists.";
        case 429:
          return "Rate-limited (429). Too many requests — wait a minute and try again.";
        case 503:
          return "Service unavailable (503). The site may be down temporarily.";
        default:
          return `HTTP ${error.response.status} error from the site. Try a different source.`;
      }
    } else if (error.code === "ECONNABORTED") {
      return "Request timed out. The site took too long to respond. Try again or use a different source.";
    } else if (error.code === "ENOTFOUND") {
      return "Could not reach the site. Check the URL or your network connection.";
    }
  }
  return `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}
