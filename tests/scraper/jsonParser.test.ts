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
