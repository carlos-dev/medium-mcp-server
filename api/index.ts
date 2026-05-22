import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import {
  searchArticles,
  getTrendingArticles,
  extractArticle,
  filterArticlesByTags,
  type MediumArticle,
} from "../src/scraper/medium.js";
import { verifyAuthHeader } from "../src/auth/token.js";

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "mcp-medium", version: "1.0.0" });

  const articleSchema = z.object({
    title: z.string(),
    url: z.string(),
    author: z.string(),
    preview: z.string(),
    tags: z.array(z.string()),
    content: z.string().optional(),
  });

  server.registerTool(
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
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
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
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
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
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "extract_medium_article",
    {
      title: "Extract Article",
      description: "Extract full content from a Medium article URL.",
      inputSchema: { url: z.string().url() },
      outputSchema: articleSchema,
    },
    async ({ url }) => {
      if (!url.includes("medium.com")) throw new Error("URL must be from medium.com");
      const article: MediumArticle = await extractArticle(url);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(article, null, 2) }],
        structuredContent: article as unknown as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
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
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  return server;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, mcp-session-id, Authorization"
  );

  if (req.method === "OPTIONS") return res.status(200).end();

  const path = req.url?.split("?")[0] || "/";

  if (path === "/health" || path === "/api/health") {
    return res.status(200).json({ status: "ok", time: new Date().toISOString() });
  }

  if (path === "/" || path === "/api" || path === "/api/") {
    return res.status(200).json({
      name: "mcp-medium",
      version: "1.0.0",
      mcp: "/mcp",
    });
  }

  if (path === "/mcp" || path === "/api/mcp") {
    if (req.method === "GET") {
      return res.status(200).json({
        name: "mcp-medium",
        version: "1.0.0",
        protocol: "mcp",
        message: "POST with Authorization: Bearer <token>",
      });
    }

    if (req.method === "POST") {
      const authHeader = (req.headers["authorization"] ?? "") as string;
      const verdict = verifyAuthHeader(authHeader);
      if (!verdict.ok) {
        return res.status(verdict.reason === "misconfigured" ? 500 : 401).json({
          error: verdict.reason === "misconfigured" ? "Server misconfigured" : "Unauthorized",
        });
      }

      try {
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } catch (error) {
        console.error("MCP Error:", error);
        return res.status(500).json({
          error: "MCP Error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  return res.status(404).json({ error: "Not Found" });
}
