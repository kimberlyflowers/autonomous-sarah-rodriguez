// HTTP client for the UGC Pipeline REST API
const PIPELINE_URL = process.env.UGC_PIPELINE_URL || "https://ugc-pipeline-production.up.railway.app";
const API_KEY = process.env.UGC_PIPELINE_API_KEY || "";

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeout?: number;
}

export async function callPipeline<T = unknown>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const url = new URL(`${PIPELINE_URL}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) headers["X-API-Key"] = API_KEY;

  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeout || 30000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pipeline API ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

export function pipelineUrl(): string {
  return PIPELINE_URL;
}
