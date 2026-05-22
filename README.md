# MCP Medium

MCP server para buscar e extrair artigos do Medium, com suporte a artigos **members-only** via cookie da sua conta paga.

## Tools

- **search_medium_articles** — Busca artigos por palavras-chave
- **filter_medium_articles_by_tags** — Filtra artigos por tags
- **get_trending_ai_articles** — Artigos em alta sobre IA
- **extract_medium_article** — Extrai conteúdo completo de um artigo (full text para members-only quando autenticado)
- **summarize_medium_article** — Resume um artigo

## Setup

1. Instale dependências:

   ```bash
   npm install
   ```

2. Copie `.env.example` para `.env.local` e preencha:

   - **`MEDIUM_COOKIE`** — string completa de cookies de medium.com. Abra https://medium.com logado, vá em DevTools → Application → Cookies → selecione `https://medium.com` e copie todos os cookies como uma única string `nome=valor; nome=valor; ...`. Os essenciais são `sid` e `uid`; copiar tudo é mais seguro porque o Medium pode exigir cookies adicionais (como `cf_clearance` quando há challenge do Cloudflare).
   - **`MCP_AUTH_TOKEN`** — token Bearer exigido em `POST /mcp` quando deployado. Gere com:

     ```bash
     openssl rand -hex 32
     ```

     Em dev local, se a env não estiver setada, o gate fica desligado.

## Desenvolvimento local

```bash
npm run dev
```

Endpoint MCP: http://localhost:3000/mcp

Com `MCP_AUTH_TOKEN` setado, todo `POST /mcp` precisa do header:

```
Authorization: Bearer <seu token>
```

## Testes

```bash
npm test
```

## Deploy no Vercel

1. Adicione `MEDIUM_COOKIE` e `MCP_AUTH_TOKEN` em **Settings → Environment Variables** do projeto Vercel (Production + Preview).
2. Deploy:

   ```bash
   vercel
   ```

O endpoint `POST /mcp` da produção exige o Bearer token. `GET /mcp` e `/health` permanecem públicos.

## Conectar de um cliente MCP

Quase todos os clientes MCP aceitam headers customizados. Configure a URL `https://<seu-projeto>.vercel.app/mcp` com:

```
Authorization: Bearer <MCP_AUTH_TOKEN>
```

Exemplo (Cursor/Claude Desktop estilo):

```json
{
  "mcpServers": {
    "medium": {
      "url": "https://seu-projeto.vercel.app/mcp",
      "headers": {
        "Authorization": "Bearer SEU_TOKEN_AQUI"
      }
    }
  }
}
```

## Rotação do cookie

O cookie `sid` expira periodicamente e o Medium invalida tudo em "Sign out everywhere". Sinais de que precisa rotacionar:

- `extract_medium_article` voltou a devolver só o preview de paywall em posts members-only
- O fallback HTML está sendo acionado em URLs que antes funcionavam via JSON

Refresque pegando o cookie do browser de novo e atualizando a env var (local em `.env.local`, produção no Vercel Settings → Redeploy).

## Como funciona a extração

`extract_medium_article` tenta primeiro o endpoint não-documentado `?format=json` do Medium, que retorna uma estrutura JSON limpa (prefixada com `])}while(1);</x>` por proteção XSSI) contendo o `bodyModel.paragraphs` com o post inteiro. Esse caminho exige o cookie `sid` válido para acessar conteúdo members-only.

Se o endpoint JSON falhar (Cloudflare challenge, Substack hospedado em domínio Medium, formato divergente), cai num parser HTML em cima do `<article>` da página renderizada — mesmo comportamento da versão anterior do scraper.
