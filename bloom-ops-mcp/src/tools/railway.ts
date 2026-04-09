import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { railwayQuery } from "../services/railway-client.js";

export function registerRailwayTools(server: McpServer): void {
  // ── railway_get_services ──────────────────────────────────────────────────
  server.registerTool(
    "railway_get_services",
    {
      title: "Railway: List Services",
      description:
        "List all services in a Railway project. Returns service IDs, names, and status.",
      inputSchema: { projectId: z.string().describe("Railway project UUID") },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ projectId }) => {
      const data = (await railwayQuery(
        `query ($projectId: String!) {
          project(id: $projectId) {
            services { edges { node { id name updatedAt } } }
          }
        }`,
        { projectId }
      )) as { project: { services: { edges: Array<{ node: unknown }> } } };
      const services = data.project.services.edges.map((e) => e.node);
      return { content: [{ type: "text", text: JSON.stringify(services, null, 2) }] };
    }
  );

  // ── railway_get_deployments ───────────────────────────────────────────────
  server.registerTool(
    "railway_get_deployments",
    {
      title: "Railway: List Deployments",
      description:
        "List recent deployments for a Railway service. Returns deployment IDs, status, and timestamps.",
      inputSchema: {
        serviceId: z.string().describe("Railway service UUID"),
        environmentId: z.string().describe("Railway environment UUID"),
        limit: z.number().default(5).describe("Max deployments to return (default 5)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ serviceId, environmentId, limit }) => {
      const data = (await railwayQuery(
        `query ($serviceId: String!, $environmentId: String!, $limit: Int!) {
          deployments(
            first: $limit
            input: { serviceId: $serviceId, environmentId: $environmentId }
          ) {
            edges { node { id status createdAt updatedAt staticUrl } }
          }
        }`,
        { serviceId, environmentId, limit }
      )) as { deployments: { edges: Array<{ node: unknown }> } };
      const deployments = data.deployments.edges.map((e) => e.node);
      return { content: [{ type: "text", text: JSON.stringify(deployments, null, 2) }] };
    }
  );

  // ── railway_get_logs ──────────────────────────────────────────────────────
  server.registerTool(
    "railway_get_logs",
    {
      title: "Railway: Get Service Logs",
      description:
        "Fetch recent deploy logs for a Railway deployment. Returns log lines with timestamps.",
      inputSchema: {
        deploymentId: z.string().describe("Railway deployment UUID"),
        limit: z.number().default(100).describe("Max log lines (default 100)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ deploymentId, limit }) => {
      const data = (await railwayQuery(
        `query ($deploymentId: String!, $limit: Int!) {
          deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
            timestamp message severity
          }
        }`,
        { deploymentId, limit }
      )) as { deploymentLogs: Array<{ timestamp: string; message: string; severity: string }> };
      const lines = data.deploymentLogs
        .map((l) => `[${l.severity}] ${l.timestamp} ${l.message}`)
        .join("\n");
      return { content: [{ type: "text", text: lines || "No logs found." }] };
    }
  );

  // ── railway_restart_service ───────────────────────────────────────────────
  server.registerTool(
    "railway_restart_service",
    {
      title: "Railway: Restart Service",
      description:
        "Redeploy the latest deployment of a Railway service. Triggers a new deployment using the same image/config.",
      inputSchema: {
        serviceId: z.string().describe("Railway service UUID"),
        environmentId: z.string().describe("Railway environment UUID"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ serviceId, environmentId }) => {
      const data = (await railwayQuery(
        `mutation ($serviceId: String!, $environmentId: String!) {
          serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
        }`,
        { serviceId, environmentId }
      )) as { serviceInstanceRedeploy: boolean };
      return {
        content: [
          {
            type: "text",
            text: data.serviceInstanceRedeploy
              ? "Service redeployment triggered successfully."
              : "Redeploy request returned false — check service status.",
          },
        ],
      };
    }
  );

  // ── railway_get_domains ───────────────────────────────────────────────────
  server.registerTool(
    "railway_get_domains",
    {
      title: "Railway: List Domains",
      description: "List all custom domains attached to a Railway service in an environment.",
      inputSchema: {
        serviceId: z.string().describe("Railway service UUID"),
        environmentId: z.string().describe("Railway environment UUID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ serviceId, environmentId }) => {
      const data = (await railwayQuery(
        `query ($serviceId: String!, $environmentId: String!) {
          customDomains(serviceId: $serviceId, environmentId: $environmentId) {
            id domain status { dnsRecords { hostlabel type requiredValue } certificateStatus }
          }
        }`,
        { serviceId, environmentId }
      )) as { customDomains: unknown[] };
      return { content: [{ type: "text", text: JSON.stringify(data.customDomains, null, 2) }] };
    }
  );

  // ── railway_add_domain ────────────────────────────────────────────────────
  server.registerTool(
    "railway_add_domain",
    {
      title: "Railway: Add Custom Domain",
      description: "Add a custom domain to a Railway service. You'll still need to configure DNS records.",
      inputSchema: {
        serviceId: z.string().describe("Railway service UUID"),
        environmentId: z.string().describe("Railway environment UUID"),
        domain: z.string().describe("The custom domain to add (e.g. app.example.com)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ serviceId, environmentId, domain }) => {
      const data = (await railwayQuery(
        `mutation ($serviceId: String!, $environmentId: String!, $domain: String!) {
          customDomainCreate(input: { serviceId: $serviceId, environmentId: $environmentId, domain: $domain }) {
            id domain
          }
        }`,
        { serviceId, environmentId, domain }
      )) as { customDomainCreate: { id: string; domain: string } };
      return {
        content: [
          { type: "text", text: `Domain added: ${data.customDomainCreate.domain} (ID: ${data.customDomainCreate.id}). Configure DNS records to complete setup.` },
        ],
      };
    }
  );

  // ── railway_remove_domain ─────────────────────────────────────────────────
  server.registerTool(
    "railway_remove_domain",
    {
      title: "Railway: Remove Custom Domain",
      description: "Remove a custom domain from a Railway service.",
      inputSchema: {
        domainId: z.string().describe("Railway custom domain UUID to remove"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ domainId }) => {
      await railwayQuery(
        `mutation ($domainId: String!) {
          customDomainDelete(id: $domainId)
        }`,
        { domainId }
      );
      return { content: [{ type: "text", text: `Domain ${domainId} removed.` }] };
    }
  );

  // ── railway_get_env_vars ──────────────────────────────────────────────────
  server.registerTool(
    "railway_get_env_vars",
    {
      title: "Railway: Get Environment Variables",
      description:
        "List all environment variables for a Railway service. Returns variable names and values.",
      inputSchema: {
        serviceId: z.string().describe("Railway service UUID"),
        environmentId: z.string().describe("Railway environment UUID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ serviceId, environmentId }) => {
      const data = (await railwayQuery(
        `query ($serviceId: String!, $environmentId: String!) {
          variables(serviceId: $serviceId, environmentId: $environmentId)
        }`,
        { serviceId, environmentId }
      )) as { variables: Record<string, string> };
      // Redact sensitive values
      const vars = Object.entries(data.variables).map(([key, val]) => {
        const isSensitive = /key|token|secret|password/i.test(key);
        return { name: key, value: isSensitive ? val.substring(0, 4) + "****" : val };
      });
      return { content: [{ type: "text", text: JSON.stringify(vars, null, 2) }] };
    }
  );

  // ── railway_set_env_var ───────────────────────────────────────────────────
  server.registerTool(
    "railway_set_env_var",
    {
      title: "Railway: Set Environment Variable",
      description:
        "Create or update an environment variable on a Railway service. Triggers a redeploy.",
      inputSchema: {
        serviceId: z.string().describe("Railway service UUID"),
        environmentId: z.string().describe("Railway environment UUID"),
        name: z.string().describe("Variable name"),
        value: z.string().describe("Variable value"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ serviceId, environmentId, name, value }) => {
      await railwayQuery(
        `mutation ($input: VariableUpsertInput!) {
          variableUpsert(input: $input)
        }`,
        {
          input: {
            serviceId,
            environmentId,
            name,
            value,
          },
        }
      );
      return { content: [{ type: "text", text: `Environment variable ${name} set successfully.` }] };
    }
  );
}
