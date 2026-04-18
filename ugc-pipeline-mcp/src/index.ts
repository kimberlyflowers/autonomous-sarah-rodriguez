import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { registerBrandTools } from "./tools/brands.js";
import { registerAssetTools } from "./tools/assets.js";
import { registerGenerateTools } from "./tools/generate.js";
import { registerVideoTools } from "./tools/videos.js";
import { registerDocsTools } from "./tools/docs.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ugc-pipeline-mcp-server",
    version: "1.0.0",
    pipeline: process.env.UGC_PIPELINE_URL || "unset",
  });
});

// MCP endpoint — fresh server instance per request (matches bloom-ops-mcp pattern)
app.all("/mcp", async (req, res) => {
  const server = new McpServer({
    name: "ugc-pipeline-mcp-server",
    version: "1.0.0",
  });

  registerBrandTools(server);
  registerAssetTools(server);
  registerGenerateTools(server);
  registerVideoTools(server);
  registerDocsTools(server);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = parseInt(process.env.PORT || "3200", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🎬 ugc-pipeline-mcp-server listening on port ${PORT}`);
  console.log(`   MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`   Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`   Pipeline:     ${process.env.UGC_PIPELINE_URL || "unset"}`);
});
