export type NamecheapTenant = {
  id: string;
  apiUser: string;
  apiKey: string;
  username: string;
  clientIp: string;
  sandbox?: boolean;
};

type TenantMap = Record<string, Omit<NamecheapTenant, "id">>;

function parseTenantMap(): TenantMap {
  const raw = process.env.NAMECHEAP_TENANTS_JSON;
  if (!raw) return {};

  try {
    return JSON.parse(raw) as TenantMap;
  } catch (error) {
    throw new Error(`NAMECHEAP_TENANTS_JSON is not valid JSON: ${(error as Error).message}`);
  }
}

function defaultTenant(): NamecheapTenant | null {
  const apiUser = process.env.NAMECHEAP_API_USER;
  const apiKey = process.env.NAMECHEAP_API_KEY;
  const username = process.env.NAMECHEAP_USERNAME;
  const clientIp = process.env.NAMECHEAP_CLIENT_IP;

  if (!apiUser || !apiKey || !username || !clientIp) return null;

  return {
    id: process.env.NAMECHEAP_DEFAULT_TENANT_ID || "default",
    apiUser,
    apiKey,
    username,
    clientIp,
    sandbox: process.env.NAMECHEAP_ENV === "sandbox" || process.env.NAMECHEAP_SANDBOX === "true",
  };
}

export function getTenant(tenantId?: string): NamecheapTenant {
  const tenants = parseTenantMap();
  const id = tenantId || process.env.NAMECHEAP_DEFAULT_TENANT_ID || "default";
  const tenant = tenants[id];

  if (tenant) {
    return {
      id,
      ...tenant,
      sandbox: Boolean(tenant.sandbox),
    };
  }

  const fallback = defaultTenant();
  if (fallback && fallback.id === id) return fallback;
  if (!tenantId && fallback) return fallback;

  throw new Error(
    `Namecheap tenant "${id}" is not configured. Add it to NAMECHEAP_TENANTS_JSON or set the default NAMECHEAP_* env vars.`
  );
}

export function listConfiguredTenants(): string[] {
  const tenants = Object.keys(parseTenantMap());
  const fallback = defaultTenant();
  if (fallback && !tenants.includes(fallback.id)) tenants.push(fallback.id);
  return tenants.sort();
}
