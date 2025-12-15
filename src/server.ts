import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Fastify from "fastify";
import { z } from "zod";

import {
  searchArticles,
  getTrendingArticles,
  extractArticle,
  filterArticlesByTags,
} from "./scraper/medium.js";

// Criar servidor Fastify
const app = Fastify({
  logger: { level: "info" },
});

// CORS
app.addHook("onRequest", async (_request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
});

// Health check
app.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));

// Root
app.get("/", async () => ({
  name: "mcp-medium",
  version: "1.0.0",
  endpoints: { health: "/health", mcp: "/mcp" },
}));

// MCP Server
const mcpServer = new McpServer({
  name: "mcp-medium",
  version: "1.0.0",
});

const articleSchema = z.object({
  title: z.string(),
  url: z.string(),
  author: z.string(),
  preview: z.string(),
  tags: z.array(z.string()),
  content: z.string().optional(),
});

// Tools
mcpServer.registerTool(
  "search_medium_articles",
  {
    title: "Search Medium Articles",
    description: "Search for Medium articles by keywords.",
    inputSchema: {
      query: z.string().describe("Search query"),
      limit: z.number().int().min(1).max(20).optional().default(10),
    },
    outputSchema: {
      query: z.string(),
      total: z.number().int(),
      articles: z.array(articleSchema),
    },
  },
  async ({ query, limit }) => {
    const articles = await searchArticles(query, limit ?? 10);
    const output = { query, total: articles.length, articles };
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(output, null, 2) },
      ],
      structuredContent: output,
    };
  }
);

mcpServer.registerTool(
  "filter_medium_articles_by_tags",
  {
    title: "Filter Articles By Tags",
    description: "Filter Medium articles by tags.",
    inputSchema: {
      tags: z.array(z.string()).min(1),
      query: z.string().optional(),
      limit: z.number().int().min(1).max(20).optional().default(10),
    },
    outputSchema: {
      tags: z.array(z.string()),
      total: z.number().int(),
      articles: z.array(articleSchema),
    },
  },
  async ({ tags, query, limit }) => {
    const seedQuery = query ?? "AI";
    const fetched = await searchArticles(
      seedQuery,
      Math.min((limit ?? 10) * 2, 40)
    );
    const filtered = await filterArticlesByTags(fetched, tags);
    const articles = filtered.slice(0, limit ?? 10);
    const output = { tags, total: articles.length, articles };
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(output, null, 2) },
      ],
      structuredContent: output,
    };
  }
);

mcpServer.registerTool(
  "get_trending_ai_articles",
  {
    title: "Get Trending AI Articles",
    description: "Get trending AI articles from Medium.",
    inputSchema: {
      limit: z.number().int().min(1).max(20).optional().default(10),
    },
    outputSchema: {
      total: z.number().int(),
      articles: z.array(articleSchema),
    },
  },
  async ({ limit }) => {
    const articles = await getTrendingArticles(limit ?? 10);
    const output = { total: articles.length, articles };
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(output, null, 2) },
      ],
      structuredContent: output,
    };
  }
);

mcpServer.registerTool(
  "extract_medium_article",
  {
    title: "Extract Article",
    description: "Extract full content from a Medium article URL.",
    inputSchema: {
      url: z.string().url(),
    },
    outputSchema: articleSchema,
  },
  async ({ url }) => {
    if (!url.includes("medium.com"))
      throw new Error("URL must be from medium.com");
    const article = await extractArticle(url);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(article, null, 2) },
      ],
      structuredContent: article as Record<string, unknown>,
    };
  }
);

mcpServer.registerTool(
  "summarize_medium_article",
  {
    title: "Summarize Article",
    description: "Summarize a Medium article.",
    inputSchema: {
      url: z.string().url().optional(),
      content: z.string().optional(),
      maxLength: z.number().int().min(50).max(2000).optional().default(500),
    },
    outputSchema: {
      summary: z.string(),
      originalLength: z.number().int(),
      summaryLength: z.number().int(),
    },
  },
  async ({ url, content, maxLength }) => {
    let text = content;
    if (url) {
      if (!url.includes("medium.com"))
        throw new Error("URL must be from medium.com");
      const article = await extractArticle(url);
      text = article.content || article.preview;
    }
    if (!text) throw new Error("Either url or content required");

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    let summary = "";
    for (const s of sentences) {
      const candidate = summary ? `${summary}. ${s.trim()}` : s.trim();
      if (candidate.length <= (maxLength ?? 500)) summary = candidate;
      else break;
    }

    const output = {
      summary,
      originalLength: text.length,
      summaryLength: summary.length,
    };
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(output, null, 2) },
      ],
      structuredContent: output,
    };
  }
);

// MCP GET
app.get("/mcp", async () => ({
  name: "mcp-medium",
  version: "1.0.0",
  protocol: "mcp",
  message: "Use POST to this endpoint with MCP protocol requests",
}));

// MCP POST
app.post("/mcp", async (request, reply) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  void reply.hijack();
  reply.raw.on("close", () => void transport.close());

  await mcpServer.connect(transport);
  await transport.handleRequest(
    request.raw,
    reply.raw,
    request.body as unknown
  );
});

// Start
const start = async () => {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
    console.log(`✅ MCP Medium Server: http://${host}:${port}`);
    console.log(`📋 Health: http://${host}:${port}/health`);
    console.log(`🔧 MCP: http://${host}:${port}/mcp`);
    console.log(`\n🎯 Tools: search, filter, trending, extract, summarize`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

start().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});
