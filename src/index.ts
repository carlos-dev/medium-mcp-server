import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Fastify, {
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { z } from "zod";

import {
  searchArticles,
  getTrendingAIArticles,
  extractArticle,
  filterArticlesByTags,
} from "./scraper/medium.js";

// Criar servidor Fastify
const app = Fastify({
  logger: {
    level: "info",
  },
});

// Configurar CORS
app.addHook("onRequest", async (_request: FastifyRequest, reply: FastifyReply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
});

// Health check
app.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));

// Root endpoint
app.get("/", async () => ({
  name: "mcp-medium",
  version: "1.0.0",
  endpoints: {
    health: "/health",
    mcp: "/mcp",
  },
}));

// Criar servidor MCP
const mcpServer = new McpServer({
  name: "mcp-medium",
  version: "1.0.0",
});

// Schema para artigo
const articleSchema = z.object({
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
});

// Tool: search_medium_articles
mcpServer.registerTool(
  "search_medium_articles",
  {
    title: "Search Medium Articles",
    description:
      "Search for Medium articles by keywords. Useful for MCP, RAG, embeddings, AI agents, etc.",
    inputSchema: {
      query: z
        .string()
        .describe('Search query (e.g. "MCP agents", "RAG embeddings")'),
      limit: z.number().int().min(1).max(50).optional().default(10),
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

// Tool: filter_medium_articles_by_tags
mcpServer.registerTool(
  "filter_medium_articles_by_tags",
  {
    title: "Filter Medium Articles By Tags",
    description:
      "Search for Medium articles and filter the results by tags (e.g. MCP, RAG, embeddings).",
    inputSchema: {
      tags: z
        .array(z.string())
        .min(1)
        .describe('Tags to filter by (e.g. ["mcp","rag"])'),
      query: z
        .string()
        .optional()
        .describe("Optional query to seed the search"),
      limit: z.number().int().min(1).max(50).optional().default(10),
    },
    outputSchema: {
      tags: z.array(z.string()),
      total: z.number().int(),
      articles: z.array(articleSchema),
    },
  },
  async ({ tags, query, limit }) => {
    const seedQuery = query ?? "AI artificial intelligence";
    const fetched = await searchArticles(
      seedQuery,
      Math.min((limit ?? 10) * 2, 50)
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

// Tool: get_trending_ai_articles
mcpServer.registerTool(
  "get_trending_ai_articles",
  {
    title: "Get Trending AI Articles",
    description: "Get trending/popular Medium articles about AI.",
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().default(10),
    },
    outputSchema: {
      total: z.number().int(),
      articles: z.array(articleSchema),
    },
  },
  async ({ limit }) => {
    const articles = await getTrendingAIArticles(limit ?? 10);
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
mcpServer.registerTool(
  "extract_medium_article",
  {
    title: "Extract Medium Article",
    description:
      "Extract full article content (best-effort) from a Medium URL.",
    inputSchema: {
      url: z.string().url().describe("Medium article URL"),
    },
    outputSchema: articleSchema,
  },
  async ({ url }) => {
    if (!url.includes("medium.com")) {
      throw new Error("URL must be from medium.com");
    }
    const article = await extractArticle(url);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(article, null, 2) },
      ],
      structuredContent: { ...article },
    };
  }
);

// Tool: summarize_medium_article
mcpServer.registerTool(
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
        summary = sentences[0].trim().slice(0, maxLength ?? 500);
      }
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

// Endpoint MCP - GET para info
app.get("/mcp", async () => ({
  name: "mcp-medium",
  version: "1.0.0",
  protocol: "mcp",
  message: "Use POST to this endpoint with MCP protocol requests",
}));

// Endpoint MCP - POST para requests
app.post("/mcp", async (request: FastifyRequest, reply: FastifyReply) => {
  // Criar um novo transport para esta requisição (stateless)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
    enableJsonResponse: true,
  });

  // Hijack reply para o transport controlar a resposta
  void reply.hijack();

  // Cleanup quando a conexão fechar
  reply.raw.on("close", () => {
    void transport.close();
  });

  // Conectar o servidor MCP ao transport
  await mcpServer.connect(transport);

  // Processar a requisição
  await transport.handleRequest(
    request.raw,
    reply.raw,
    request.body as unknown
  );
});

// Iniciar servidor
const start = async () => {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
    console.log(`✅ Medium MCP Server rodando em http://${host}:${port}`);
    console.log(`📋 Health check: http://${host}:${port}/health`);
    console.log(`🔧 MCP endpoint: http://${host}:${port}/mcp`);
    console.log(`\n🎯 Tools disponíveis:`);
    console.log(`   - search_medium_articles: Busca artigos por palavras-chave`);
    console.log(`   - filter_medium_articles_by_tags: Filtra artigos por tags`);
    console.log(`   - get_trending_ai_articles: Artigos em alta sobre IA`);
    console.log(`   - extract_medium_article: Extrai conteúdo de um artigo`);
    console.log(`   - summarize_medium_article: Resume um artigo`);
  } catch (error) {
    console.error("❌ Erro ao iniciar servidor:", error);
    process.exit(1);
  }
};

start().catch((error) => {
  console.error("❌ Erro fatal:", error);
  process.exit(1);
});
