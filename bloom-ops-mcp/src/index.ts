import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { registerRailwayTools } from "./tools/railway.js";
import { registerGithubTools } from "./tools/github.js";
import { registerBloomHealthTools } from "./tools/bloom-health.js";

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "bloom-ops-mcp-server", version: "1.0.0" });
});

// MCP endpoint
app.all("/mcp", async (req, res) => {
  const server = new McpServer({
    name: "bloom-ops-mcp-server",
    version: "1.0.0",
  });

  // Register all tool groups
  registerRailwayTools(server);
  registerGithubTools(server);
  registerBloomHealthTools(server);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = parseInt(process.env.PORT || "3100", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔧 bloom-ops-mcp-server listening on port ${PORT}`);
  console.log(`   MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`   Health check: http://0.0.0.0:${PORT}/health`);
});
