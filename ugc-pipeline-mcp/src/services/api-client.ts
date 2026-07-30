// HTTP client for the UGC Pipeline REST API
const PIPELINE_URL = process.env.UGC_PIPELINE_URL || "https://ugc-pipeline-production.up.railway.app";
const API_KEY = process.env.UGC_PIPELINE_API_KEY || "";
const WORKSPACE = process.env.UGC_WORKSPACE || process.env.UGC_TENANT || "";
const ACCESS_KEY = process.env.UGC_ACCESS_KEY || "";
const BEARER_TOKEN = process.env.UGC_PIPELINE_BEARER_TOKEN || "";

let cachedTenantToken = "";
let cachedTenantTokenExp = 0;

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeout?: number;
  tenantSlug?: string;
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
  if (API_KEY && opts.tenantSlug) {
    headers["X-API-Key"] = API_KEY;
    headers["X-Tenant-Slug"] = opts.tenantSlug;
  } else {
    const token = await getTenantToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

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

export async function callPipelineForm<T = unknown>(
  path: string,
  fields: Record<string, string | number | boolean | Array<string | number | boolean> | undefined | null>,
  opts: RequestOptions = {}
): Promise<T> {
  const url = new URL(`${PIPELINE_URL}${path}`);
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) body.append(key, String(item));
    } else {
      body.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  if (API_KEY && opts.tenantSlug) {
    headers["X-API-Key"] = API_KEY;
    headers["X-Tenant-Slug"] = opts.tenantSlug;
  } else {
    const token = await getTenantToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method: opts.method || "POST",
    headers,
    body,
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

async function getTenantToken(): Promise<string> {
  if (BEARER_TOKEN) return BEARER_TOKEN;
  if (!WORKSPACE || !ACCESS_KEY) return "";
  if (cachedTenantToken && cachedTenantTokenExp > Date.now() + 60_000) return cachedTenantToken;

  const res = await fetch(`${PIPELINE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace: WORKSPACE, accessKey: ACCESS_KEY }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pipeline tenant login failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { token?: string };
  if (!data.token) throw new Error("Pipeline tenant login did not return a token");
  cachedTenantToken = data.token;
  cachedTenantTokenExp = extractTokenExp(data.token);
  return cachedTenantToken;
}

function extractTokenExp(token: string): number {
  const parts = token.split(".");
  const exp = Number(parts[1]);
  return Number.isFinite(exp) ? exp : Date.now() + 60 * 60 * 1000;
}
