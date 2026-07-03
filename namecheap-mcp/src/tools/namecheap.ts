import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  getHosts,
  mergeRecords,
  namecheapCall,
  resolveDns,
  setHosts,
  splitDomain,
  type NamecheapRecord,
} from "../services/namecheap-client.js";
import { listConfiguredTenants } from "../services/tenant-config.js";

const tenantId = z.string().optional().describe("Configured Namecheap tenant ID. Omit to use default tenant.");
const domain = z.string().describe("Domain name, e.g. example.com");
const recordSchema = z.object({
  type: z.string().describe("DNS record type, e.g. A, CNAME, TXT, MX, URL"),
  host: z.string().describe("Host/name, e.g. @, www, mail, _dmarc"),
  value: z.string().describe("Record value/address"),
  ttl: z.union([z.string(), z.number()]).optional().describe("TTL, default 1800"),
  mxPref: z.union([z.string(), z.number()]).optional().describe("MX priority when type is MX"),
});

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function ok(text: string, data?: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: data === undefined ? text : `${text}\n\n${JSON.stringify(data, null, 2)}`,
      },
    ],
  };
}

function requireConfirmation(actual: string | undefined, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Confirmation required. Set confirm to exactly: ${expected}`);
  }
}

export function registerNamecheapTools(server: McpServer): void {
  server.registerTool(
    "namecheap_list_tenants",
    {
      title: "Namecheap: List Configured Tenants",
      description: "List tenant IDs configured for this Namecheap MCP. Does not expose secrets.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => json({ tenants: listConfiguredTenants() })
  );

  server.registerTool(
    "namecheap_domain_check",
    {
      title: "Namecheap: Check Domain Availability",
      description: "Check whether one or more domains are available to register.",
      inputSchema: {
        tenantId,
        domains: z.array(domain).min(1).max(50).describe("Domains to check"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, domains }) => {
      const response = await namecheapCall("namecheap.domains.check", { DomainList: domains.join(",") }, tenantId);
      return json(response);
    }
  );

  server.registerTool(
    "namecheap_domains_list",
    {
      title: "Namecheap: List Domains",
      description: "List domains in a tenant's Namecheap account.",
      inputSchema: {
        tenantId,
        page: z.number().default(1),
        pageSize: z.number().default(100),
        searchTerm: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, page, pageSize, searchTerm }) => {
      const response = await namecheapCall(
        "namecheap.domains.getList",
        { Page: page, PageSize: pageSize, SearchTerm: searchTerm },
        tenantId
      );
      return json(response);
    }
  );

  server.registerTool(
    "namecheap_domain_info",
    {
      title: "Namecheap: Get Domain Info",
      description: "Get details for a domain in the Namecheap account.",
      inputSchema: { tenantId, domain },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, domain }) => json(await namecheapCall("namecheap.domains.getInfo", { DomainName: domain }, tenantId))
  );

  server.registerTool(
    "namecheap_dns_get_hosts",
    {
      title: "Namecheap DNS: Get Host Records",
      description: "Read all host records for a domain.",
      inputSchema: { tenantId, domain },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, domain }) => json({ domain: splitDomain(domain).domain, records: await getHosts(domain, tenantId) })
  );

  server.registerTool(
    "namecheap_dns_set_hosts",
    {
      title: "Namecheap DNS: Replace Host Records",
      description:
        "Replace all host records for a domain. Dangerous because Namecheap setHosts overwrites existing host records. Use namecheap_dns_upsert_hosts when possible.",
      inputSchema: {
        tenantId,
        domain,
        records: z.array(recordSchema).min(1).describe("Complete desired host record set"),
        confirm: z.string().optional().describe("Required exact phrase: REPLACE DNS <domain>"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ tenantId, domain, records, confirm }) => {
      const normalized = splitDomain(domain).domain;
      requireConfirmation(confirm, `REPLACE DNS ${normalized}`);
      const response = await setHosts(normalized, records as NamecheapRecord[], tenantId);
      return ok(`Replaced DNS host records for ${normalized}.`, response);
    }
  );

  server.registerTool(
    "namecheap_dns_upsert_hosts",
    {
      title: "Namecheap DNS: Upsert Host Records",
      description:
        "Read existing records, replace matching host+type entries, and save the merged record set. Useful for GHL funnel records, GHL email sending records, Vercel records, SPF, DKIM, DMARC, CNAME, TXT, and A records.",
      inputSchema: {
        tenantId,
        domain,
        records: z.array(recordSchema).min(1).describe("Records to add/update by host+type"),
        confirm: z.string().optional().describe("Required exact phrase: UPDATE DNS <domain>"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, domain, records, confirm }) => {
      const normalized = splitDomain(domain).domain;
      requireConfirmation(confirm, `UPDATE DNS ${normalized}`);
      const existing = await getHosts(normalized, tenantId);
      const merged = mergeRecords(existing, records as NamecheapRecord[]);
      const response = await setHosts(normalized, merged, tenantId);
      return ok(`Updated DNS host records for ${normalized}.`, { response, records: merged });
    }
  );

  server.registerTool(
    "namecheap_dns_apply_ghl_records",
    {
      title: "Namecheap DNS: Apply GHL Domain Records",
      description:
        "Apply DNS records copied from GoHighLevel for funnel domains or email sending authentication. Requires confirmation and preserves unrelated records.",
      inputSchema: {
        tenantId,
        domain,
        purpose: z.enum(["funnel", "email_sending", "other"]).default("funnel"),
        records: z.array(recordSchema).min(1).describe("GHL-provided DNS records"),
        confirm: z.string().optional().describe("Required exact phrase: APPLY GHL DNS <domain>"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, domain, purpose, records, confirm }) => {
      const normalized = splitDomain(domain).domain;
      requireConfirmation(confirm, `APPLY GHL DNS ${normalized}`);
      const existing = await getHosts(normalized, tenantId);
      const merged = mergeRecords(existing, records as NamecheapRecord[]);
      const response = await setHosts(normalized, merged, tenantId);
      return ok(`Applied GHL ${purpose} records for ${normalized}.`, { response, records: merged });
    }
  );

  server.registerTool(
    "namecheap_dns_check_propagation",
    {
      title: "Namecheap DNS: Check Propagation",
      description: "Resolve one or more hostnames and return current public A records.",
      inputSchema: {
        hostnames: z.array(z.string()).min(1).max(20),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ hostnames }) => {
      const results = await Promise.all(hostnames.map(async (hostname) => ({ hostname, a: await resolveDns(hostname) })));
      return json(results);
    }
  );

  server.registerTool(
    "namecheap_dns_set_custom_nameservers",
    {
      title: "Namecheap DNS: Set Custom Nameservers",
      description: "Set custom nameservers for a domain. Requires confirmation.",
      inputSchema: {
        tenantId,
        domain,
        nameservers: z.array(z.string()).min(2).max(12),
        confirm: z.string().optional().describe("Required exact phrase: SET NAMESERVERS <domain>"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ tenantId, domain, nameservers, confirm }) => {
      const normalized = splitDomain(domain).domain;
      requireConfirmation(confirm, `SET NAMESERVERS ${normalized}`);
      const response = await namecheapCall(
        "namecheap.domains.dns.setCustom",
        { SLD: splitDomain(normalized).sld, TLD: splitDomain(normalized).tld, Nameservers: nameservers.join(",") },
        tenantId
      );
      return ok(`Set custom nameservers for ${normalized}.`, response);
    }
  );

  server.registerTool(
    "namecheap_domain_create",
    {
      title: "Namecheap: Register Domain",
      description:
        "Register a domain using the tenant's Namecheap account balance. Requires explicit confirmation. Contact fields are passed through to Namecheap.",
      inputSchema: {
        tenantId,
        domain,
        years: z.number().int().min(1).max(10).default(1),
        contactParams: z.record(z.union([z.string(), z.number()])).describe(
          "Namecheap create parameters for registrant/admin/tech/aux billing contacts, e.g. RegistrantFirstName, RegistrantAddress1, AdminEmailAddress."
        ),
        addFreeWhoisguard: z.boolean().default(true),
        confirm: z.string().optional().describe("Required exact phrase: REGISTER <domain>"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, domain, years, contactParams, addFreeWhoisguard, confirm }) => {
      const normalized = splitDomain(domain).domain;
      requireConfirmation(confirm, `REGISTER ${normalized}`);
      const { sld, tld } = splitDomain(normalized);
      const response = await namecheapCall(
        "namecheap.domains.create",
        {
          DomainName: normalized,
          Years: years,
          AddFreeWhoisguard: addFreeWhoisguard ? "yes" : "no",
          WGEnabled: addFreeWhoisguard ? "yes" : "no",
          SLD: sld,
          TLD: tld,
          ...contactParams,
        },
        tenantId
      );
      return ok(`Registered ${normalized}.`, response);
    }
  );

  server.registerTool(
    "namecheap_domain_renew",
    {
      title: "Namecheap: Renew Domain",
      description: "Renew a domain using the tenant's Namecheap account balance. Requires confirmation.",
      inputSchema: {
        tenantId,
        domain,
        years: z.number().int().min(1).max(10).default(1),
        confirm: z.string().optional().describe("Required exact phrase: RENEW <domain>"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, domain, years, confirm }) => {
      const normalized = splitDomain(domain).domain;
      requireConfirmation(confirm, `RENEW ${normalized}`);
      const response = await namecheapCall("namecheap.domains.renew", { DomainName: normalized, Years: years }, tenantId);
      return ok(`Renewed ${normalized}.`, response);
    }
  );

  server.registerTool(
    "namecheap_users_get_balances",
    {
      title: "Namecheap: Get Account Balances",
      description: "Get Namecheap account balance information. Purchases through the API use account balance.",
      inputSchema: { tenantId },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId }) => json(await namecheapCall("namecheap.users.getBalances", {}, tenantId))
  );

  server.registerTool(
    "namecheap_ssl_list",
    {
      title: "Namecheap SSL: List Certificates",
      description: "List SSL certificates in the account.",
      inputSchema: { tenantId, page: z.number().default(1), pageSize: z.number().default(50) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, page, pageSize }) => json(await namecheapCall("namecheap.ssl.getList", { Page: page, PageSize: pageSize }, tenantId))
  );

  server.registerTool(
    "namecheap_ssl_info",
    {
      title: "Namecheap SSL: Get Certificate Info",
      description: "Get information for an SSL certificate by certificate ID.",
      inputSchema: { tenantId, certificateId: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ tenantId, certificateId }) => json(await namecheapCall("namecheap.ssl.getInfo", { CertificateID: certificateId }, tenantId))
  );

  server.registerTool(
    "namecheap_raw_api_call",
    {
      title: "Namecheap: Raw API Call",
      description:
        "Escape hatch for Namecheap API commands not yet wrapped. Read-only commands can run directly; write commands require confirm exactly matching the command name.",
      inputSchema: {
        tenantId,
        command: z.string().describe("Namecheap command, e.g. namecheap.domains.dns.getHosts"),
        params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
        readOnly: z.boolean().default(true),
        confirm: z.string().optional().describe("For write calls, required exact phrase: <command>"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ tenantId, command, params, readOnly, confirm }) => {
      if (!readOnly) requireConfirmation(confirm, command);
      return json(await namecheapCall(command, params, tenantId));
    }
  );
}
