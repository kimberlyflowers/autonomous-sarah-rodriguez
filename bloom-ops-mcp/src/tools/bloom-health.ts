import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const BLOOM_APP_URL =
  process.env.BLOOM_APP_URL || "https://autonomous-sarah-rodriguez-production.up.railway.app";

export function registerBloomHealthTools(server: McpServer): void {
  // ── bloom_get_health ──────────────────────────────────────────────────────
  server.registerTool(
    "bloom_get_health",
    {
      title: "BLOOM: Health Check",
      description:
        "Check the health of the BLOOM Heartbeat Engine. Returns service status, uptime, and version info.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const res = await fetch(`${BLOOM_APP_URL}/health`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          return {
            content: [
              { type: "text", text: `BLOOM health check FAILED — HTTP ${res.status}: ${await res.text()}` },
            ],
          };
        }
        const data = await res.json();
        return { content: [{ type: "text", text: `BLOOM Health: OK\n${JSON.stringify(data, null, 2)}` }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `BLOOM health check FAILED — could not reach ${BLOOM_APP_URL}/health: ${(err as Error).message}`,
            },
          ],
        };
      }
    }
  );

  // ── bloom_get_agent_status ────────────────────────────────────────────────
  server.registerTool(
    "bloom_get_agent_status",
    {
      title: "BLOOM: Get Agent Status",
      description:
        "Get the current status of a BLOOM agent including active sessions, autonomy level, and last heartbeat.",
      inputSchema: {
        agentId: z.string().optional().describe("Agent UUID (defaults to primary agent from env)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ agentId }) => {
      const id = agentId || process.env.BLOOM_AGENT_ID || "default";
      try {
        const res = await fetch(`${BLOOM_APP_URL}/api/agent/status?agentId=${id}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Agent status check failed — HTTP ${res.status}: ${await res.text()}` }],
          };
        }
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Agent status check failed: ${(err as Error).message}` },
          ],
        };
      }
    }
  );

  // ── bloom_tail_logs ───────────────────────────────────────────────────────
  server.registerTool(
    "bloom_tail_logs",
    {
      title: "BLOOM: Tail Application Logs",
      description:
        "Fetch recent application logs from the BLOOM Heartbeat Engine. Useful for debugging issues and monitoring activity.",
      inputSchema: {
        lines: z.number().default(50).describe("Number of recent log lines to return (default 50)"),
        filter: z.string().optional().describe("Optional text filter to match log lines"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ lines, filter }) => {
      try {
        const url = new URL(`${BLOOM_APP_URL}/api/dashboard/logs`);
        url.searchParams.set("limit", String(lines));
        if (filter) url.searchParams.set("filter", filter);

        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Log fetch failed — HTTP ${res.status}: ${await res.text()}` }],
          };
        }
        const data = await res.json();
        const logText = Array.isArray(data)
          ? data.map((l: { timestamp?: string; message?: string; level?: string }) =>
              `[${l.level || "info"}] ${l.timestamp || ""} ${l.message || JSON.stringify(l)}`
            ).join("\n")
          : JSON.stringify(data, null, 2);

        return { content: [{ type: "text", text: logText || "No logs found." }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Log fetch failed: ${(err as Error).message}` }],
        };
      }
    }
  );
}
