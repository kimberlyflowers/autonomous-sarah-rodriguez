/** Fetch a page's raw HTML with browser-like headers. */
export declare function fetchPage(url: string): Promise<string>;
/** Call a JSON API endpoint. */
export declare function fetchJson<T>(url: string, options?: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    data?: unknown;
    params?: Record<string, string | number>;
}): Promise<T>;
/** Human-readable error from an axios or generic error */
export declare function friendlyError(error: unknown): string;
//# sourceMappingURL=http-client.d.ts.map