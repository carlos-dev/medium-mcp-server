# Medium Paid-Content Scraping + Token-Protected MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Medium MCP server fetch the *full* text of members-only articles using the user's paid-account cookie, and protect the public `/mcp` endpoint on Vercel with a bearer token so only the owner can consume the paid quota.

**Architecture:** Two changes glued together. (1) The scraper switches from anonymous HTML fetch to **authenticated fetch using the `Cookie` header** populated from a `MEDIUM_COOKIE` env var, and prefers Medium's undocumented `?format=json` endpoint which returns a structured JSON body (prefixed by `])}while(1);</x>` XSSI guard) — much more reliable than HTML scraping and includes paid content when the cookie has a valid `sid`. The HTML scraper is kept as a fallback. (2) The Vercel HTTP entry (`api/index.ts`) gains a small bearer-token gate (`MCP_AUTH_TOKEN`) so the deployed `/mcp` POST endpoint rejects anonymous calls. As a side effect, we DRY the project by deleting the duplicated scraper inside `api/index.ts` and importing the shared `src/scraper/medium.ts` instead.

**Tech Stack:** TypeScript (NodeNext modules), `@modelcontextprotocol/sdk`, `cheerio` (HTML fallback), `fastify` (local dev only), `@vercel/node` (deploy target), `vitest` (new — tests).

---

## File Structure

**Create:**
- `src/scraper/fetch.ts` — single authenticated fetch helper (reads `MEDIUM_COOKIE`)
- `src/scraper/jsonParser.ts` — parses `?format=json` Medium responses into `MediumArticle`
- `src/scraper/htmlParser.ts` — fallback HTML parser (existing logic moved here)
- `src/auth/token.ts` — verifies `Authorization: Bearer <MCP_AUTH_TOKEN>`
- `tests/scraper/jsonParser.test.ts`
- `tests/scraper/fetch.test.ts`
- `tests/auth/token.test.ts`
- `.env.example`
- `tests/fixtures/medium-article.json` — a small synthetic fixture matching Medium's `?format=json` shape

**Modify:**
- `src/scraper/medium.ts` — becomes a thin orchestrator: tries JSON, falls back to HTML; uses `fetch.ts`
- `src/server.ts` — applies the token gate to `/mcp` (optional bypass in local dev)
- `api/index.ts` — deletes its inline scraper, imports `../src/scraper/medium.js`, applies token gate
- `package.json` — adds `cheerio` (currently imported but undeclared), `vitest`, `test` and `test:watch` scripts
- `tsconfig.json` — includes `api/` and `tests/`
- `.gitignore` — ignores `.env*` except `.env.example`
- `README.md` — documents env vars, how to extract the `sid` cookie, how to connect from Claude clients

**Why this split:** `medium.ts` becomes the public API the MCP tools call; the parsing strategies live in their own files so each one stays small and testable. `fetch.ts` isolates the only place that touches the cookie, so credential handling is auditable in one file. `auth/token.ts` mirrors that pattern for the inbound token.

---

## Pre-flight: environment setup (one-time, no commit)

The engineer running this plan needs two secrets in `.env.local` (and later in Vercel project env):

```
# .env.local — DO NOT COMMIT
MEDIUM_COOKIE="sid=1:...; uid=...; xsrf=..."   # full cookie string copied from medium.com in DevTools
MCP_AUTH_TOKEN="<run: openssl rand -hex 32>"    # any opaque string, ~32+ bytes
```

The `MEDIUM_COOKIE` value comes from: DevTools → Application → Cookies → `https://medium.com` → copy the entire `name=value; name=value; ...` string. Only `sid` and `uid` are strictly required for reads, but pasting the whole thing is safer and avoids re-extraction if Medium adds new required cookies.

---

### Task 1: Project setup (deps, gitignore, tsconfig, .env.example)

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Add the missing `cheerio` dep and `vitest`**

In `package.json`, update `dependencies` and `devDependencies`, and add test scripts:

```json
{
  "name": "mcp-medium",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.21.1",
    "cheerio": "^1.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "@vercel/node": "^3.0.0",
    "fastify": "^4.27.0",
    "tsx": "^4.15.8",
    "typescript": "^5.4.5",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: lockfile updated, `node_modules/cheerio` and `node_modules/vitest` exist.

- [ ] **Step 3: Update `tsconfig.json` to include `api/` and `tests/`**

Replace the file content with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "strict": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "api/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist", ".vercel"]
}
```

- [ ] **Step 4: Update `.gitignore`**

Append:

```
.env
.env.local
.env.*.local
```

Final `.gitignore` should be:

```
node_modules
dist
.vercel
*.log
.env
.env.local
.env.*.local
```

- [ ] **Step 5: Create `.env.example`**

```
# Copy to .env.local and fill in real values. Never commit .env.local.

# Full cookie string from medium.com (DevTools -> Application -> Cookies).
# At minimum needs sid= and uid=. Paste the whole thing to be safe.
MEDIUM_COOKIE=

# Bearer token required on POST /mcp. Generate with: openssl rand -hex 32
MCP_AUTH_TOKEN=
```

- [ ] **Step 6: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0, no errors. (Existing code should still be type-clean since we only widened `include`.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example
git commit -m "chore: add cheerio + vitest, widen tsconfig, ignore .env files"
```

---

### Task 2: `src/scraper/fetch.ts` — authenticated fetch helper

**Files:**
- Create: `src/scraper/fetch.ts`
- Create: `tests/scraper/fetch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scraper/fetch.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMedium } from "../../src/scraper/fetch.js";

describe("fetchMedium", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.MEDIUM_COOKIE;

  beforeEach(() => {
    process.env.MEDIUM_COOKIE = "sid=test-sid; uid=test-uid";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.MEDIUM_COOKIE = originalEnv;
  });

  it("sends the MEDIUM_COOKIE value as a Cookie header", async () => {
    const spy = vi.fn(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    await fetchMedium("https://medium.com/p/abc");

    expect(spy).toHaveBeenCalledTimes(1);
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBe("sid=test-sid; uid=test-uid");
    expect(headers.get("user-agent")).toContain("Mozilla");
  });

  it("does not send a Cookie header when MEDIUM_COOKIE is empty", async () => {
    process.env.MEDIUM_COOKIE = "";
    const spy = vi.fn(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    await fetchMedium("https://medium.com/p/abc");

    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBeNull();
  });

  it("throws on non-2xx responses with status code", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 403 })) as unknown as typeof fetch;

    await expect(fetchMedium("https://medium.com/p/abc")).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scraper/fetch.test.ts`
Expected: FAIL — module `../../src/scraper/fetch.js` not found.

- [ ] **Step 3: Implement `src/scraper/fetch.ts`**

```ts
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FetchOptions {
  accept?: string;
}

export async function fetchMedium(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const cookie = process.env.MEDIUM_COOKIE?.trim();
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept:
      options.accept ??
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  };
  if (cookie) headers["Cookie"] = cookie;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scraper/fetch.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/fetch.ts tests/scraper/fetch.test.ts
git commit -m "feat(scraper): add authenticated fetch helper with Cookie header"
```

---

### Task 3: `src/scraper/jsonParser.ts` — parse Medium's `?format=json` response

**Files:**
- Create: `src/scraper/jsonParser.ts`
- Create: `tests/fixtures/medium-article.json`
- Create: `tests/scraper/jsonParser.test.ts`

Background: appending `?format=json` to a Medium article URL returns JSON prefixed by the XSSI guard `])}while(1);</x>`. After stripping that prefix, the payload looks like:

```json
{
  "success": true,
  "payload": {
    "value": {
      "id": "abc123",
      "title": "Post title",
      "creatorId": "user-id",
      "content": { "bodyModel": { "paragraphs": [
        { "type": 3, "text": "Subtitle text" },
        { "type": 1, "text": "First paragraph." }
      ]}},
      "virtuals": { "tags": [{ "name": "AI", "slug": "ai" }] }
    },
    "references": {
      "User": { "user-id": { "name": "Author Name", "username": "author" } }
    }
  }
}
```

Paragraph `type` codes (Medium's internal enum, may evolve — we map conservatively): `1`=P, `3`=H3, `4`=H4, `6`=BQ (blockquote), `7`=PQ (pull quote), `8`=PRE (code block), `9`=ULI (bullet item), `10`=OLI (numbered item), `13`=H2. Anything else → plain text.

- [ ] **Step 1: Create the fixture**

Create `tests/fixtures/medium-article.json` with content that exercises several paragraph types:

```json
{
  "success": true,
  "payload": {
    "value": {
      "id": "abc123",
      "title": "How to test Medium JSON",
      "creatorId": "user-id-1",
      "content": {
        "bodyModel": {
          "paragraphs": [
            { "type": 13, "text": "An H2 heading" },
            { "type": 1, "text": "Body paragraph one." },
            { "type": 3, "text": "An H3 heading" },
            { "type": 1, "text": "Body paragraph two." },
            { "type": 6, "text": "A blockquote." },
            { "type": 9, "text": "Bullet item one" },
            { "type": 9, "text": "Bullet item two" },
            { "type": 8, "text": "console.log('hi')" }
          ]
        }
      },
      "virtuals": {
        "tags": [
          { "name": "Testing", "slug": "testing" },
          { "name": "AI", "slug": "ai" }
        ]
      }
    },
    "references": {
      "User": {
        "user-id-1": { "name": "Ada Lovelace", "username": "ada" }
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/scraper/jsonParser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseMediumJson } from "../../src/scraper/jsonParser.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "..", "fixtures", "medium-article.json");
const fixtureRaw = readFileSync(fixturePath, "utf8");
const xssiPrefixed = `])}while(1);</x>${fixtureRaw}`;

describe("parseMediumJson", () => {
  it("strips the XSSI prefix and parses", () => {
    const article = parseMediumJson(
      xssiPrefixed,
      "https://medium.com/@ada/post-abc123"
    );
    expect(article.title).toBe("How to test Medium JSON");
    expect(article.author).toBe("Ada Lovelace");
    expect(article.tags).toEqual(["Testing", "AI"]);
  });

  it("converts paragraphs into markdown-flavored text", () => {
    const article = parseMediumJson(
      xssiPrefixed,
      "https://medium.com/@ada/post-abc123"
    );
    expect(article.content).toContain("## An H2 heading");
    expect(article.content).toContain("### An H3 heading");
    expect(article.content).toContain("Body paragraph one.");
    expect(article.content).toContain("> A blockquote.");
    expect(article.content).toContain("- Bullet item one");
    expect(article.content).toContain("- Bullet item two");
    expect(article.content).toContain("```\nconsole.log('hi')\n```");
  });

  it("sets preview to the first non-heading paragraph", () => {
    const article = parseMediumJson(
      xssiPrefixed,
      "https://medium.com/@ada/post-abc123"
    );
    expect(article.preview).toBe("Body paragraph one.");
  });

  it("throws if payload.success is false", () => {
    const bad = `])}while(1);</x>${JSON.stringify({ success: false })}`;
    expect(() =>
      parseMediumJson(bad, "https://medium.com/p/x")
    ).toThrow(/success/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/scraper/jsonParser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/scraper/jsonParser.ts`**

```ts
import type { MediumArticle } from "./medium.js";

interface MediumParagraph {
  type: number;
  text: string;
}

interface MediumPayloadValue {
  title?: string;
  creatorId?: string;
  content?: { bodyModel?: { paragraphs?: MediumParagraph[] } };
  virtuals?: { tags?: Array<{ name: string }> };
}

interface MediumPayload {
  success: boolean;
  payload?: {
    value?: MediumPayloadValue;
    references?: {
      User?: Record<string, { name?: string; username?: string }>;
    };
  };
}

const XSSI_PREFIX = "])}while(1);</x>";

export function parseMediumJson(raw: string, url: string): MediumArticle {
  let body = raw;
  if (body.startsWith(XSSI_PREFIX)) body = body.slice(XSSI_PREFIX.length);

  const data = JSON.parse(body) as MediumPayload;
  if (!data.success || !data.payload?.value) {
    throw new Error("Medium JSON response was not successful");
  }

  const value = data.payload.value;
  const title = value.title ?? "Untitled";

  const creatorId = value.creatorId;
  const user = creatorId
    ? data.payload.references?.User?.[creatorId]
    : undefined;
  const author = user?.name ?? user?.username ?? "Unknown";

  const tags = (value.virtuals?.tags ?? []).map((t) => t.name);

  const paragraphs = value.content?.bodyModel?.paragraphs ?? [];
  const lines: string[] = [];
  let preview = "";

  for (const p of paragraphs) {
    const text = p.text?.trim();
    if (!text) continue;
    switch (p.type) {
      case 13:
        lines.push(`## ${text}`);
        break;
      case 3:
        lines.push(`### ${text}`);
        break;
      case 4:
        lines.push(`#### ${text}`);
        break;
      case 6:
      case 7:
        lines.push(`> ${text}`);
        break;
      case 8:
        lines.push("```\n" + text + "\n```");
        break;
      case 9:
        lines.push(`- ${text}`);
        break;
      case 10:
        lines.push(`1. ${text}`);
        break;
      case 1:
      default:
        lines.push(text);
        if (!preview) preview = text;
        break;
    }
  }

  return {
    title,
    url,
    author,
    preview,
    tags,
    content: lines.join("\n\n"),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/scraper/jsonParser.test.ts`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/scraper/jsonParser.ts tests/scraper/jsonParser.test.ts tests/fixtures/medium-article.json
git commit -m "feat(scraper): parse Medium ?format=json into MediumArticle"
```

---

### Task 4: `src/scraper/htmlParser.ts` — move existing HTML parsers (no behavior change)

**Files:**
- Create: `src/scraper/htmlParser.ts`
- Modify: `src/scraper/medium.ts` (temporarily — Task 5 rewrites it fully)

- [ ] **Step 1: Create `src/scraper/htmlParser.ts`**

Move the existing `parseSearchResults` and `parseArticleContent` functions out of `src/scraper/medium.ts` into a new file. Re-export the `MediumArticle` type from the orchestrator later — for now, define the shape inline.

```ts
import * as cheerio from "cheerio";
import type { MediumArticle } from "./medium.js";

export function parseSearchResults(html: string, limit: number): MediumArticle[] {
  const $ = cheerio.load(html);
  const articles: MediumArticle[] = [];

  const articleSelectors = [
    "article",
    '[data-testid="post-preview"]',
    'div[class*="postArticle"]',
  ];

  let foundArticles = $("body").find("nothing");
  for (const selector of articleSelectors) {
    foundArticles = $(selector);
    if (foundArticles.length > 0) break;
  }

  foundArticles.slice(0, limit).each((_: number, element: unknown) => {
    const $el = $(element as cheerio.Element);

    let title = "";
    let url = "";

    const titleEl = $el.find('h2, h3, [class*="title"]').first();
    if (titleEl.length) {
      title = titleEl.text().trim();
      const link =
        titleEl.closest("a").attr("href") ||
        titleEl.find("a").attr("href") ||
        "";
      if (link) {
        url = link.startsWith("http") ? link : `https://medium.com${link}`;
      }
    }

    if (!title) {
      const linkEl = $el.find("a").first();
      title = linkEl.text().trim();
      url = linkEl.attr("href") || "";
      if (url && !url.startsWith("http")) {
        url = `https://medium.com${url}`;
      }
    }

    let author = "Unknown";
    const authorEl = $el.find('[rel="author"], [class*="author"]').first();
    if (authorEl.length) author = authorEl.text().trim() || "Unknown";

    let preview = "";
    const previewEl = $el.find("p").first();
    if (previewEl.length) preview = previewEl.text().trim();

    const tags: string[] = [];
    $el.find('a[href*="/tag/"]').each((_: number, tagEl: unknown) => {
      const tag = $(tagEl as cheerio.Element).text().trim();
      if (tag) tags.push(tag);
    });

    if (title && url) articles.push({ title, url, author, preview, tags });
  });

  return articles;
}

export function parseArticleHtml(html: string, url: string): MediumArticle {
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
  contentEl.find("p, h2, h3, h4, li").each((_: number, el: unknown) => {
    const text = $(el as cheerio.Element).text().trim();
    if (text && text.length > 10) paragraphs.push(text);
  });

  const content = paragraphs.join("\n\n");

  const tags: string[] = [];
  $('a[href*="/tag/"]').each((_: number, tagEl: unknown) => {
    const tag = $(tagEl as cheerio.Element).text().trim();
    if (tag) tags.push(tag);
  });

  return {
    title,
    url,
    author,
    preview: paragraphs[0] || "",
    tags,
    content,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0. (At this point `src/scraper/medium.ts` still has its old code and exports `MediumArticle`, so the circular type import resolves.)

- [ ] **Step 3: Commit**

```bash
git add src/scraper/htmlParser.ts
git commit -m "refactor(scraper): extract HTML parsers into htmlParser.ts"
```

---

### Task 5: Rewrite `src/scraper/medium.ts` as orchestrator (JSON-first, HTML fallback)

**Files:**
- Modify: `src/scraper/medium.ts`
- Create: `tests/scraper/medium.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scraper/medium.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractArticle } from "../../src/scraper/medium.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRaw = readFileSync(
  join(here, "..", "fixtures", "medium-article.json"),
  "utf8"
);
const XSSI = "])}while(1);</x>";

describe("extractArticle", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.MEDIUM_COOKIE = "sid=test";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses ?format=json when it succeeds", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      return new Response(XSSI + fixtureRaw, { status: 200 });
    }) as unknown as typeof fetch;

    const article = await extractArticle("https://medium.com/@ada/post-abc123");

    expect(calls[0]).toContain("?format=json");
    expect(article.title).toBe("How to test Medium JSON");
    expect(article.content).toContain("Body paragraph one.");
    expect(article.author).toBe("Ada Lovelace");
  });

  it("falls back to HTML scraping if JSON response is invalid", async () => {
    let firstCall = true;
    globalThis.fetch = (async () => {
      if (firstCall) {
        firstCall = false;
        return new Response("<html>not json</html>", { status: 200 });
      }
      return new Response(
        `<html><h1>HTML Title</h1><article><p>Hello world from HTML, this paragraph is long enough.</p></article></html>`,
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const article = await extractArticle("https://medium.com/@ada/post-xyz");
    expect(article.title).toBe("HTML Title");
    expect(article.content).toContain("Hello world from HTML");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scraper/medium.test.ts`
Expected: FAIL — `extractArticle` exists but its current implementation uses cheerio HTML only, won't see `?format=json` request.

- [ ] **Step 3: Rewrite `src/scraper/medium.ts`**

Replace the entire file content with:

```ts
import { fetchMedium } from "./fetch.js";
import { parseMediumJson } from "./jsonParser.js";
import { parseArticleHtml, parseSearchResults } from "./htmlParser.js";

export interface MediumArticle {
  title: string;
  url: string;
  author: string;
  preview: string;
  tags: string[];
  content?: string;
}

export async function searchArticles(
  query: string,
  limit: number = 10
): Promise<MediumArticle[]> {
  const html = await fetchMedium(
    `https://medium.com/search?q=${encodeURIComponent(query)}`
  );
  return parseSearchResults(html, limit);
}

export async function getTrendingArticles(
  limit: number = 10
): Promise<MediumArticle[]> {
  return searchArticles("artificial intelligence", limit);
}

export async function extractArticle(url: string): Promise<MediumArticle> {
  const jsonUrl = appendFormatJson(url);
  try {
    const raw = await fetchMedium(jsonUrl, { accept: "application/json" });
    return parseMediumJson(raw, url);
  } catch {
    // fall through to HTML
  }
  const html = await fetchMedium(url);
  return parseArticleHtml(html, url);
}

export async function filterArticlesByTags(
  articles: MediumArticle[],
  tags: string[]
): Promise<MediumArticle[]> {
  const lower = tags.map((t) => t.toLowerCase());
  return articles.filter((article) => {
    const at = article.tags.map((t) => t.toLowerCase());
    const title = article.title.toLowerCase();
    const preview = article.preview.toLowerCase();
    return lower.some(
      (tag) =>
        at.some((t) => t.includes(tag) || tag.includes(t)) ||
        title.includes(tag) ||
        preview.includes(tag)
    );
  });
}

function appendFormatJson(url: string): string {
  const u = new URL(url);
  u.searchParams.set("format", "json");
  return u.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scraper/medium.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass (fetch + jsonParser + medium).

- [ ] **Step 6: Commit**

```bash
git add src/scraper/medium.ts tests/scraper/medium.test.ts
git commit -m "feat(scraper): try ?format=json with auth cookie, fall back to HTML"
```

---

### Task 6: `src/auth/token.ts` — bearer token verifier

**Files:**
- Create: `src/auth/token.ts`
- Create: `tests/auth/token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/auth/token.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyAuthHeader } from "../../src/auth/token.js";

describe("verifyAuthHeader", () => {
  const originalEnv = process.env.MCP_AUTH_TOKEN;
  beforeEach(() => {
    process.env.MCP_AUTH_TOKEN = "secret-token";
  });
  afterEach(() => {
    process.env.MCP_AUTH_TOKEN = originalEnv;
  });

  it("returns ok when the Bearer token matches", () => {
    expect(verifyAuthHeader("Bearer secret-token")).toEqual({ ok: true });
  });

  it("returns unauthorized when the token does not match", () => {
    const result = verifyAuthHeader("Bearer wrong-token");
    expect(result.ok).toBe(false);
  });

  it("returns unauthorized when the header is missing", () => {
    expect(verifyAuthHeader(undefined).ok).toBe(false);
    expect(verifyAuthHeader("").ok).toBe(false);
  });

  it("returns unauthorized when the scheme is not Bearer", () => {
    expect(verifyAuthHeader("Basic secret-token").ok).toBe(false);
  });

  it("returns misconfigured when MCP_AUTH_TOKEN is not set", () => {
    process.env.MCP_AUTH_TOKEN = "";
    const result = verifyAuthHeader("Bearer anything");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("misconfigured");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/auth/token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/auth/token.ts`**

```ts
import { timingSafeEqual } from "node:crypto";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "bad-scheme" | "invalid" | "misconfigured" };

export function verifyAuthHeader(header: string | undefined | null): VerifyResult {
  const expected = process.env.MCP_AUTH_TOKEN ?? "";
  if (!expected) return { ok: false, reason: "misconfigured" };
  if (!header) return { ok: false, reason: "missing" };

  const [scheme, presented] = header.split(" ");
  if (scheme !== "Bearer" || !presented) {
    return { ok: false, reason: "bad-scheme" };
  }

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "invalid" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "invalid" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/auth/token.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth/token.ts tests/auth/token.test.ts
git commit -m "feat(auth): bearer token verifier with constant-time compare"
```

---

### Task 7: Refactor `api/index.ts` to use shared scraper and enforce token

**Files:**
- Modify: `api/index.ts`

- [ ] **Step 1: Replace `api/index.ts` content**

The current file duplicates a regex-based scraper inline. Replace the whole file with this — it imports from `../src/scraper/medium.js` and gates `/mcp` POSTs with the token.

```ts
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
        structuredContent: article as Record<string, unknown>,
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
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add api/index.ts
git commit -m "refactor(api): use shared scraper + require Bearer token on POST /mcp"
```

---

### Task 8: Align `src/server.ts` with shared scraper and token gate

**Files:**
- Modify: `src/server.ts`

The local Fastify server already imports from `./scraper/medium.js`, so the only change is adding the token gate. To keep local dev ergonomic, the gate is **only enforced when `MCP_AUTH_TOKEN` is set** — leaving it unset in `.env.local` lets you `curl` freely while developing.

- [ ] **Step 1: Add an import and a guard inside the POST `/mcp` handler**

In [src/server.ts](src/server.ts), at the top with the other imports add:

```ts
import { verifyAuthHeader } from "./auth/token.js";
```

Then replace the existing `app.post("/mcp", ...)` block with:

```ts
app.post("/mcp", async (request, reply) => {
  if (process.env.MCP_AUTH_TOKEN) {
    const verdict = verifyAuthHeader(request.headers.authorization);
    if (!verdict.ok) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
  }

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
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat(server): apply Bearer token gate when MCP_AUTH_TOKEN is set"
```

---

### Task 9: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read existing README**

Run: `cat README.md` — note whatever's already there to preserve.

- [ ] **Step 2: Append (or replace) with a setup + usage section**

Append the following section (or replace existing setup notes):

````markdown
## Setup

1. Install: `npm install`
2. Create `.env.local` from `.env.example` and fill in:
   - `MEDIUM_COOKIE`: open https://medium.com while logged in → DevTools → Application → Cookies → select `https://medium.com` → copy every cookie as one `name=value; name=value; ...` string. Required for full text of members-only articles.
   - `MCP_AUTH_TOKEN`: generate with `openssl rand -hex 32`. Required when deployed; optional locally.

## Local dev

```bash
npm run dev
# http://localhost:3000/mcp
```

If `MCP_AUTH_TOKEN` is unset, the local server accepts unauthenticated POSTs. When set, send `Authorization: Bearer <token>`.

## Deploy on Vercel

Set both env vars in the Vercel project settings (Production + Preview), then deploy. The `/mcp` POST endpoint will reject requests without `Authorization: Bearer $MCP_AUTH_TOKEN`.

## Connecting from an MCP client

Most MCP clients accept a custom HTTP header. Add:

```
Authorization: Bearer <your MCP_AUTH_TOKEN>
```

to the request headers when configuring the server URL `https://<your-vercel-app>.vercel.app/mcp`.

## Cookie rotation

The `sid` cookie expires periodically and Medium also invalidates it on "Sign out everywhere". When article extraction starts returning the paywalled preview again, refresh `MEDIUM_COOKIE` from your browser and redeploy.
````

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: setup, env vars, deploy, and cookie rotation"
```

---

### Task 10: Manual verification (no commit)

These steps cannot be unit-tested — they hit the live Medium service. Execute them after the code changes are in place.

- [ ] **Step 1: Local — unauthenticated extract (paywall sanity check)**

Temporarily empty `MEDIUM_COOKIE` in `.env.local`, run `npm run dev`, then in another terminal:

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"extract_medium_article","arguments":{"url":"<a known members-only article URL>"}}}' | tail -c 2000
```

Expected: `content` is short — paywall preview only. This confirms the baseline.

- [ ] **Step 2: Local — authenticated extract**

Restore `MEDIUM_COOKIE` in `.env.local`, restart `npm run dev`, repeat the same `curl`.
Expected: `content` is now the full article body in markdown-flavored text (headings, paragraphs, bullets). If it's still short, see "Troubleshooting" below.

- [ ] **Step 3: Local — token gate**

Set `MCP_AUTH_TOKEN=test123` in `.env.local`, restart, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: `401`.

Then with the header:

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test123" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: JSON list of tools.

- [ ] **Step 4: Deploy preview to Vercel**

Set `MEDIUM_COOKIE` and `MCP_AUTH_TOKEN` in the Vercel project settings, then push the branch / run `vercel`. Repeat Step 3's authenticated `curl` against the preview URL.
Expected: same behavior as local.

**Troubleshooting:**
- If `?format=json` returns HTML in production (Cloudflare challenge), the catch block falls through to HTML parsing and you'll still get *some* content. To force the JSON path to work behind Cloudflare, include `cf_clearance` in `MEDIUM_COOKIE`. That cookie has a short TTL — rotate as needed.
- If you see paywall content even when authenticated, your `sid` may be expired. Re-extract from a fresh browser session.
- If JSON parsing throws `Medium JSON response was not successful`, log `raw.slice(0, 200)` once to see what Medium actually returned — sometimes they redirect to `/m/signin` and you need to verify the `sid` is being sent.

---

## Self-Review Notes

- **Spec coverage:** Paid-article scraping (Tasks 2–5), Vercel token protection (Tasks 6–7), DRY across api/server (Tasks 5, 7, 8), docs (Task 9), verification (Task 10). Covered.
- **No placeholders:** Every code step includes full code; every `curl` includes the full command.
- **Type consistency:** `MediumArticle` is exported from `src/scraper/medium.ts` and imported by `jsonParser.ts`, `htmlParser.ts`, and `api/index.ts`. `verifyAuthHeader` returns `VerifyResult` consistently across `src/auth/token.ts` and both server entries.
- **Risks called out:** Cookie rotation (Task 9, Task 10 troubleshooting); paragraph type enum may drift (Task 3 background); Cloudflare may block JSON path (Task 10 troubleshooting).
