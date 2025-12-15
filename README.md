# MCP Medium

MCP server para buscar e extrair artigos do Medium sobre IA.

## Tools

- **search_medium_articles** - Busca artigos por palavras-chave
- **filter_medium_articles_by_tags** - Filtra artigos por tags
- **get_trending_ai_articles** - Artigos em alta sobre IA
- **extract_medium_article** - Extrai conteúdo completo de um artigo
- **summarize_medium_article** - Resume um artigo

## Instalação

```bash
npm install
```

## Desenvolvimento Local

```bash
npm run dev
```

Acesse: http://localhost:3000/mcp

## Deploy Vercel

```bash
vercel
```

## Configuração MCP (Cursor/Copilot)

```json
{
  "mcpServers": {
    "medium": {
      "url": "https://seu-projeto.vercel.app/mcp"
    }
  }
}
```
