import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ============ TYPES ============

interface MediumArticle {
  title: string;
  url: string;
  author: string;
  preview: string;
  tags: string[];
  content?: string;
}

// ============ SCRAPER ============

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!response.ok) throw new Error(`Failed: ${response.status}`);
  return response.text();
}

function parseArticles(html: string, limit: number): MediumArticle[] {
  const articles: MediumArticle[] = [];
  const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let match;

  while (
    (match = articleRegex.exec(html)) !== null &&
    articles.length < limit
  ) {
    const content = match[1];
    const titleMatch = content.match(
      /<h2[^>]*>([\s\S]*?)<\/h2>|<h3[^>]*>([\s\S]*?)<\/h3>/i
    );
    const title = titleMatch
      ? (titleMatch[1] || titleMatch[2]).replace(/<[^>]+>/g, "").trim()
      : "";
    const linkMatch =
      content.match(/href="(https:\/\/[^"]*medium[^"]*)"/i) ||
      content.match(/href="(\/[^"]+)"/i);
    let url = linkMatch ? linkMatch[1] : "";
    if (url && !url.startsWith("http")) url = `https://medium.com${url}`;
    const authorMatch = content.match(/rel="author"[^>]*>([^<]+)</i);
    const author = authorMatch ? authorMatch[1].trim() : "Unknown";
    const previewMatch = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const preview = previewMatch
      ? previewMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";
    if (title && url) {
      articles.push({ title, url, author, preview, tags: [] });
    }
  }
  return articles;
}

async function searchArticles(
  query: string,
  limit = 10
): Promise<MediumArticle[]> {
  const html = await fetchHtml(
    `https://medium.com/search?q=${encodeURIComponent(query)}`
  );
  return parseArticles(html, limit);
}

async function extractArticle(url: string): Promise<MediumArticle> {
  const html = await fetchHtml(url);
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
    : "Untitled";
  const authorMatch = html.match(/rel="author"[^>]*>([^<]+)</i);
  const author = authorMatch ? authorMatch[1].trim() : "Unknown";
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(html)) !== null) {
    const text = pMatch[1].replace(/<[^>]+>/g, "").trim();
    if (text.length > 20) paragraphs.push(text);
  }
  return {
    title,
    url,
    author,
    preview: paragraphs[0] || "",
    tags: [],
    content: paragraphs.join("\n\n"),
  };
}

// ============ MCP SERVER ============

function createMcpServer(): McpServer {
  const server = new McpServer({
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

  // Tool: search_medium_articles
  server.registerTool(
    "search_medium_articles",
    {
      title: "Search Medium Articles",
      description:
        "Search for Medium articles by keywords (MCP, RAG, AI agents, embeddings, etc.)",
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

  // Tool: get_trending_ai_articles
  server.registerTool(
    "get_trending_ai_articles",
    {
      title: "Get Trending AI Articles",
      description: "Get trending AI articles from Medium",
      inputSchema: {
        limit: z.number().int().min(1).max(20).optional().default(10),
      },
      outputSchema: {
        total: z.number().int(),
        articles: z.array(articleSchema),
      },
    },
    async ({ limit }) => {
      const articles = await searchArticles(
        "artificial intelligence AI",
        limit ?? 10
      );
      const output = { total: articles.length, articles };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(output, null, 2) },
        ],
        structuredContent: output,
      };
    }
  );

  // Tool: extract_medium_article
  server.registerTool(
    "extract_medium_article",
    {
      title: "Extract Medium Article",
      description: "Extract full content from a Medium article URL",
      inputSchema: {
        url: z.string().url().describe("Medium article URL"),
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

  // Tool: summarize_medium_article
  server.registerTool(
    "summarize_medium_article",
    {
      title: "Summarize Medium Article",
      description: "Get a summary of a Medium article",
      inputSchema: {
        url: z.string().url().describe("Medium article URL"),
        maxLength: z.number().int().min(50).max(2000).optional().default(500),
      },
      outputSchema: {
        title: z.string(),
        summary: z.string(),
        originalLength: z.number().int(),
      },
    },
    async ({ url, maxLength }) => {
      if (!url.includes("medium.com"))
        throw new Error("URL must be from medium.com");
      const article = await extractArticle(url);
      const text = article.content || article.preview;
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      let summary = "";
      for (const s of sentences) {
        const candidate = summary ? `${summary}. ${s.trim()}` : s.trim();
        if (candidate.length <= (maxLength ?? 500)) summary = candidate;
        else break;
      }
      const output = {
        title: article.title,
        summary,
        originalLength: text.length,
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(output, null, 2) },
        ],
        structuredContent: output,
      };
    }
  );

  return server;
}

// ============ HANDLER ============

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");

  if (req.method === "OPTIONS") return res.status(200).end();

  const path = req.url?.split("?")[0] || "/";

  // Health
  if (path === "/health" || path === "/api/health") {
    return res
      .status(200)
      .json({ status: "ok", time: new Date().toISOString() });
  }

  // Root
  if (path === "/" || path === "/api" || path === "/api/") {
    return res.status(200).json({
      name: "mcp-medium",
      version: "1.0.0",
      mcp: "/mcp",
    });
  }

  // MCP endpoint
  if (path === "/mcp" || path === "/api/mcp") {
    if (req.method === "GET") {
      return res.status(200).json({
        name: "mcp-medium",
        version: "1.0.0",
        protocol: "mcp",
      });
    }

    if (req.method === "POST") {
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
