import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getMcpServer } from "../src/mcp/server.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Optional GET: info
  if (req.method === "GET") {
    return res.status(200).json({
      name: "mcp-medium",
      version: "1.0.0",
      protocol: "mcp",
      message: "Use POST to this endpoint with MCP protocol requests",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Stateless transport per request (recommended for serverless)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Let transport write directly to the underlying response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawReq = req as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRes = res as any;

  // Some runtimes expose Node req/res as req/res; Vercel's types wrap them.
  const nodeReq = rawReq?.raw ?? rawReq;
  const nodeRes = rawRes?.raw ?? rawRes;

  try {
    const mcpServer = getMcpServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(nodeReq, nodeRes, req.body as unknown);
  } finally {
    await transport.close();
  }
}
