import { XMLParser } from "fast-xml-parser";
import { resolve4 } from "node:dns/promises";

import { getTenant, type NamecheapTenant } from "./tenant-config.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: true,
  trimValues: true,
});

export type NamecheapRecord = {
  type: string;
  host: string;
  value: string;
  ttl?: number | string;
  mxPref?: number | string;
};

type NamecheapResponse = {
  ApiResponse: {
    Status: "OK" | "ERROR";
    Errors?: { Error?: unknown };
    CommandResponse?: Record<string, unknown>;
  };
};

function serviceUrl(tenant: NamecheapTenant): string {
  return tenant.sandbox
    ? "https://api.sandbox.namecheap.com/xml.response"
    : "https://api.namecheap.com/xml.response";
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function errorText(error: unknown): string {
  if (!error) return "Unknown Namecheap API error";
  if (Array.isArray(error)) return error.map(errorText).join("; ");
  if (typeof error === "object") {
    const err = error as { "#text"?: string; Number?: string | number };
    return err.Number ? `${err.Number}: ${err["#text"] || ""}` : JSON.stringify(error);
  }
  return String(error);
}

export async function namecheapCall(
  command: string,
  params: Record<string, string | number | boolean | undefined> = {},
  tenantId?: string
): Promise<Record<string, unknown>> {
  const tenant = getTenant(tenantId);
  const url = new URL(serviceUrl(tenant));
  const baseParams: Record<string, string> = {
    ApiUser: tenant.apiUser,
    ApiKey: tenant.apiKey,
    UserName: tenant.username,
    ClientIp: tenant.clientIp,
    Command: command,
  };

  for (const [key, value] of Object.entries(baseParams)) {
    url.searchParams.set(key, value);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const xml = await res.text();
  if (!res.ok) throw new Error(`Namecheap HTTP error ${res.status}: ${xml}`);

  const parsed = parser.parse(xml) as NamecheapResponse;
  const api = parsed.ApiResponse;
  if (!api) throw new Error(`Unexpected Namecheap response: ${xml}`);
  if (api.Status !== "OK") throw new Error(errorText(api.Errors?.Error));

  return api.CommandResponse || {};
}

export function splitDomain(domain: string): { sld: string; tld: string; domain: string } {
  const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const parts = normalized.split(".");
  if (parts.length < 2) throw new Error(`Invalid domain: ${domain}`);
  const tld = parts.pop() as string;
  return { sld: parts.join("."), tld, domain: `${parts.join(".")}.${tld}` };
}

export async function getHosts(domain: string, tenantId?: string): Promise<NamecheapRecord[]> {
  const { sld, tld } = splitDomain(domain);
  const response = await namecheapCall("namecheap.domains.dns.getHosts", { SLD: sld, TLD: tld }, tenantId);
  const result = response.DomainDNSGetHostsResult as { host?: unknown } | undefined;
  const hosts = toArray(result?.host as Record<string, unknown> | Record<string, unknown>[] | undefined);

  return hosts.map((host) => ({
    type: String(host.Type || ""),
    host: String(host.Name || ""),
    value: String(host.Address || ""),
    ttl: host.TTL as string | number | undefined,
    mxPref: host.MXPref as string | number | undefined,
  }));
}

export async function setHosts(domain: string, records: NamecheapRecord[], tenantId?: string): Promise<Record<string, unknown>> {
  const { sld, tld } = splitDomain(domain);
  const params: Record<string, string | number | undefined> = { SLD: sld, TLD: tld };

  records.forEach((record, index) => {
    const n = index + 1;
    params[`HostName${n}`] = record.host;
    params[`RecordType${n}`] = record.type;
    params[`Address${n}`] = record.value;
    params[`TTL${n}`] = record.ttl || 1800;
    if (record.mxPref !== undefined) params[`MXPref${n}`] = record.mxPref;
  });

  return namecheapCall("namecheap.domains.dns.setHosts", params, tenantId);
}

export function mergeRecords(existing: NamecheapRecord[], updates: NamecheapRecord[]): NamecheapRecord[] {
  const merged = existing.filter((record) => {
    return !updates.some((update) => {
      return (
        update.host.toLowerCase() === record.host.toLowerCase() &&
        update.type.toUpperCase() === record.type.toUpperCase()
      );
    });
  });

  return [...merged, ...updates].map((record) => ({
    ...record,
    type: record.type.toUpperCase().replace(" RECORD", ""),
    ttl: record.ttl || 1800,
  }));
}

export async function resolveDns(hostname: string): Promise<string[]> {
  try {
    return await resolve4(hostname);
  } catch {
    return [];
  }
}
