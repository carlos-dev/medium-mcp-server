import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { searchArticles, getTrendingAIArticles, extractArticle, filterArticlesByTags } from "../scraper/medium.js";

let singleton: McpServer | null = null;

export function getMcpServer(): McpServer {
  if (singleton) return singleton;

  const server = new McpServer({
    name: "mcp-medium",
    version: "1.0.0",
  });

  // Tool: search_medium_articles
  server.registerTool(
    "search_medium_articles",
    {
      title: "Search Medium Articles",
      description:
        "Search for Medium articles by keywords. Useful for MCP, RAG, embeddings, AI agents, etc.",
      inputSchema: {
        query: z.string().describe('Search query (e.g. "MCP agents", "RAG embeddings")'),
        limit: z.number().int().min(1).max(50).optional().default(10),
      },
      outputSchema: {
        query: z.string(),
        total: z.number().int(),
        articles: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            author: z.string(),
            authorUrl: z.string().optional(),
            publishedDate: z.string().optional(),
            readingTime: z.string().optional(),
            tags: z.array(z.string()),
            preview: z.string(),
            claps: z.number().optional(),
          })
        ),
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

  // Tool: filter_medium_articles_by_tags
  server.registerTool(
    "filter_medium_articles_by_tags",
    {
      title: "Filter Medium Articles By Tags",
      description:
        "Search for Medium articles and filter the results by tags (e.g. MCP, RAG, embeddings).",
      inputSchema: {
        tags: z.array(z.string()).min(1).describe('Tags to filter by (e.g. ["mcp","rag"])'),
        query: z.string().optional().describe('Optional query to seed the search'),
        limit: z.number().int().min(1).max(50).optional().default(10),
      },
      outputSchema: {
        tags: z.array(z.string()),
        total: z.number().int(),
        articles: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            author: z.string(),
            authorUrl: z.string().optional(),
            publishedDate: z.string().optional(),
            readingTime: z.string().optional(),
            tags: z.array(z.string()),
            preview: z.string(),
            claps: z.number().optional(),
          })
        ),
      },
    },
    async ({ tags, query, limit }) => {
      const seedQuery = query ?? "AI artificial intelligence";
      const fetched = await searchArticles(seedQuery, Math.min((limit ?? 10) * 2, 50));
      const filtered = await filterArticlesByTags(fetched, tags);
      const articles = filtered.slice(0, limit ?? 10);
      const output = { tags, total: articles.length, articles };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: get_trending_ai_articles
  server.registerTool(
    "get_trending_ai_articles",
    {
      title: "Get Trending AI Articles",
      description: "Get trending/popular Medium articles about AI.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().default(10),
      },
      outputSchema: {
        total: z.number().int(),
        articles: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            author: z.string(),
            authorUrl: z.string().optional(),
            publishedDate: z.string().optional(),
            readingTime: z.string().optional(),
            tags: z.array(z.string()),
            preview: z.string(),
            claps: z.number().optional(),
          })
        ),
      },
    },
    async ({ limit }) => {
      const articles = await getTrendingAIArticles(limit ?? 10);
      const output = { total: articles.length, articles };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: extract_medium_article
  server.registerTool(
    "extract_medium_article",
    {
      title: "Extract Medium Article",
      description: "Extract full article content (best-effort) from a Medium URL.",
      inputSchema: {
        url: z.string().url().describe("Medium article URL"),
      },
      outputSchema: {
        title: z.string(),
        url: z.string(),
        author: z.string(),
        authorUrl: z.string().optional(),
        publishedDate: z.string().optional(),
        readingTime: z.string().optional(),
        tags: z.array(z.string()),
        preview: z.string(),
        claps: z.number().optional(),
        content: z.string().optional(),
      },
    },
    async ({ url }) => {
      if (!url.includes("medium.com")) {
        throw new Error("URL must be from medium.com");
      }
      const article = await extractArticle(url);
      const output = article;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: summarize_medium_article
  server.registerTool(
    "summarize_medium_article",
    {
      title: "Summarize Medium Article",
      description:
        "Extract and summarize a Medium article. If url is provided, extracts first. Otherwise summarizes provided content.",
      inputSchema: {
        url: z.string().url().optional(),
        content: z.string().optional(),
        maxLength: z.number().int().min(50).max(5000).optional().default(500),
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
        if (!url.includes("medium.com")) {
          throw new Error("URL must be from medium.com");
        }
        const article = await extractArticle(url);
        text = article.content || article.preview;
      }
      if (!text) {
        throw new Error("Either url or content must be provided");
      }

      // Simple summarization (baseline). You can swap for an LLM later.
      const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

      let summary = "";
      if (paragraphs[0] && paragraphs[0].length <= (maxLength ?? 500)) {
        summary = paragraphs[0].trim();
      } else {
        for (const s of sentences) {
          const candidate = summary ? `${summary}. ${s.trim()}` : s.trim();
          if (candidate.length <= (maxLength ?? 500)) summary = candidate;
          else break;
        }
        if (!summary && sentences[0]) {
          summary = sentences[0].trim().slice(0, (maxLength ?? 500));
        }
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

  singleton = server;
  return server;
}


