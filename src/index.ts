import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Fastify, { FastifyRequest, FastifyReply } from "fastify";

import { getMcpServer } from "./mcp/server.js";

// Criar servidor Fastify
const app = Fastify({
  logger: {
    level: "info",
  },
});

// Configurar CORS
app.addHook(
  "onRequest",
  async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
  }
);

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
  const mcpServer = getMcpServer();
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
    console.log(
      `   - search_medium_articles: Busca artigos por palavras-chave`
    );
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
