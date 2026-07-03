import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { listConfiguredTenants } from "./services/tenant-config.js";
import { registerNamecheapTools } from "./tools/namecheap.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "namecheap-mcp-server",
    version: "1.0.0",
    tenants: listConfiguredTenants(),
  });
});

app.all("/mcp", async (req, res) => {
  const server = new McpServer({
    name: "namecheap-mcp-server",
    version: "1.0.0",
  });

  registerNamecheapTools(server);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = parseInt(process.env.PORT || "3300", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`namecheap-mcp-server listening on port ${PORT}`);
  console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});
