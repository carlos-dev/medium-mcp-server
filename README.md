# Medium MCP Server

Um servidor MCP (Model Context Protocol) que permite buscar, filtrar e extrair artigos do Medium sobre IA, usando web scraping com Playwright.

## Funcionalidades

- **Buscar artigos**: Busca artigos por palavras-chave
- **Filtrar por tags**: Filtra artigos por tags específicas (MCP, RAG, embeddings, etc.)
- **Artigos em alta**: Lista artigos populares sobre IA
- **Extrair conteúdo**: Extrai o conteúdo completo de um artigo
- **Resumir artigos**: Gera resumos de artigos

## Instalação

```bash
npm install
npx playwright install chromium
```

**Nota**: Os erros de TypeScript que podem aparecer antes da instalação são normais e serão resolvidos após executar `npm install`.

## Uso Local

### Desenvolvimento

```bash
npm run dev
```

### Build

```bash
npm run build
npm start
```

## Deploy na Vercel

1. Instale a Vercel CLI:
```bash
npm i -g vercel
```

2. Faça login:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. Para produção:
```bash
vercel --prod
```

## Configuração MCP

### Uso Local (stdio)

Adicione ao seu arquivo de configuração MCP:

```json
{
  "mcpServers": {
    "medium": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

### Uso Remoto (Vercel)

Adicione ao seu arquivo de configuração MCP:

```json
{
  "mcpServers": {
    "medium": {
      "url": "https://seu-projeto.vercel.app/api"
    }
  }
}
```

## Tools Disponíveis

### search_medium_articles
Busca artigos por palavras-chave.

**Parâmetros:**
- `query` (string, obrigatório): Query de busca
- `limit` (number, opcional): Número máximo de artigos (padrão: 10)

### filter_medium_articles_by_tags
Filtra artigos por tags específicas.

**Parâmetros:**
- `tags` (array de strings, obrigatório): Tags para filtrar
- `query` (string, opcional): Query de busca adicional
- `limit` (number, opcional): Número máximo de artigos (padrão: 10)

### get_trending_ai_articles
Lista artigos em alta sobre IA.

**Parâmetros:**
- `limit` (number, opcional): Número máximo de artigos (padrão: 10)

### extract_medium_article
Extrai o conteúdo completo de um artigo.

**Parâmetros:**
- `url` (string, obrigatório): URL do artigo

### summarize_medium_article
Gera um resumo de um artigo.

**Parâmetros:**
- `url` (string, opcional): URL do artigo
- `content` (string, opcional): Conteúdo direto para resumir
- `maxLength` (number, opcional): Tamanho máximo do resumo (padrão: 500)

## Cache

O sistema usa cache simples em arquivo JSON (`.cache/cache.json`) com TTL de 1 hora para otimizar requisições repetidas.

## Notas

- O Playwright requer instalação dos browsers. Execute `npx playwright install` após `npm install` se necessário.
- Para produção na Vercel, os browsers do Playwright são instalados automaticamente.
- Rate limiting: O código inclui delays para evitar bloqueios, mas use com moderação.

## Licença

MIT

