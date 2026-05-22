import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

    expect(calls[0]).toContain("format=json");
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
