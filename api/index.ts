import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as cheerio from "cheerio";
import { z } from "zod";

// ============ SCRAPER ============

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

interface MediumArticle {
  title: string;
  url: string;
  author: string;
  preview: string;
  tags: string[];
  content?: string;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

async function searchArticles(query: string, limit = 10): Promise<MediumArticle[]> {
  const html = await fetchHtml(`https://medium.com/search?q=${encodeURIComponent(query)}`);
  return parseSearchResults(html, limit);
}

async function getTrendingArticles(limit = 10): Promise<MediumArticle[]> {
  const html = await fetchHtml(`https://medium.com/search?q=artificial+intelligence`);
  return parseSearchResults(html, limit);
}

async function extractArticle(url: string): Promise<MediumArticle> {
  const html = await fetchHtml(url);
  return parseArticleContent(html, url);
}

function filterArticlesByTags(articles: MediumArticle[], tags: string[]): MediumArticle[] {
  const lowerTags = tags.map((t) => t.toLowerCase());
  return articles.filter((a) => {
    const articleTags = a.tags.map((t) => t.toLowerCase());
    const titleLower = a.title.toLowerCase();
    const previewLower = a.preview.toLowerCase();
    return lowerTags.some(
      (tag) =>
        articleTags.some((at) => at.includes(tag) || tag.includes(at)) ||
        titleLower.includes(tag) ||
        previewLower.includes(tag)
    );
  });
}

function parseSearchResults(html: string, limit: number): MediumArticle[] {
  const $ = cheerio.load(html);
  const articles: MediumArticle[] = [];

  const selectors = ["article", '[data-testid="post-preview"]', 'div[class*="postArticle"]'];
  let found = $("body").find("nothing");
  for (const sel of selectors) {
    found = $(sel);
    if (found.length > 0) break;
  }

  found.slice(0, limit).each((_, el) => {
    const $el = $(el);
    let title = "";
    let url = "";

    const titleEl = $el.find('h2, h3, [class*="title"]').first();
    if (titleEl.length) {
      title = titleEl.text().trim();
      const link = titleEl.closest("a").attr("href") || titleEl.find("a").attr("href") || "";
      url = link.startsWith("http") ? link : `https://medium.com${link}`;
    }

    if (!title) {
      const linkEl = $el.find("a").first();
      title = linkEl.text().trim();
      const href = linkEl.attr("href") || "";
      url = href.startsWith("http") ? href : `https://medium.com${href}`;
    }

    let author = "Unknown";
    const authorEl = $el.find('[rel="author"], [class*="author"]').first();
    if (authorEl.length) author = authorEl.text().trim() || "Unknown";

    let preview = "";
    const previewEl = $el.find("p").first();
    if (previewEl.length) preview = previewEl.text().trim();

    const tags: string[] = [];
    $el.find('a[href*="/tag/"]').each((_, tagEl) => {
      const tag = $(tagEl).text().trim();
      if (tag) tags.push(tag);
    });

    if (title && url) articles.push({ title, url, author, preview, tags });
  });

  return articles;
}

function parseArticleContent(html: string, url: string): MediumArticle {
  const $ = cheerio.load(html);

  const title =
    $('h1[data-testid="storyTitle"]').text().trim() ||
    $("h1").first().text().trim() ||
    "Untitled";

  const author =
    $('[data-testid="authorName"]').text().trim() ||
    $('a[rel="author"]').text().trim() ||
    "Unknown";

  const contentEl = $("article").first();
  contentEl.find("script, style, nav, footer, aside").remove();

  const paragraphs: string[] = [];
  contentEl.find("p, h2, h3, h4, li").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10) paragraphs.push(text);
  });

  const content = paragraphs.join("\n\n");

  const tags: string[] = [];
  $('a[href*="/tag/"]').each((_, tagEl) => {
    const tag = $(tagEl).text().trim();
    if (tag) tags.push(tag);
  });

  return { title, url, author, preview: paragraphs[0] || "", tags, content };
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

  server.registerTool(
    "search_medium_articles",
    {
      title: "Search Medium Articles",
      description: "Search for Medium articles by keywords (MCP, RAG, AI agents, etc.)",
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
      title: "Filter Medium Articles By Tags",
      description: "Filter Medium articles by tags",
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
      const fetched = await searchArticles(query ?? "AI", (limit ?? 10) * 2);
      const filtered = filterArticlesByTags(fetched, tags).slice(0, limit ?? 10);
      const output = { tags, total: filtered.length, articles: filtered };
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
      title: "Extract Medium Article",
      description: "Extract full content from a Medium article URL",
      inputSchema: {
        url: z.string().url(),
      },
      outputSchema: articleSchema,
    },
    async ({ url }) => {
      if (!url.includes("medium.com")) throw new Error("URL must be from medium.com");
      const article = await extractArticle(url);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(article, null, 2) }],
        structuredContent: article as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
    "summarize_medium_article",
    {
      title: "Summarize Medium Article",
      description: "Summarize a Medium article",
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
        if (!url.includes("medium.com")) throw new Error("URL must be from medium.com");
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

      const output = { summary, originalLength: text.length, summaryLength: summary.length };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
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
    return res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  }

  // Root info
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
