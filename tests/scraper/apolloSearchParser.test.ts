import { describe, expect, it } from "vitest";
import { parseApolloSearchResults } from "../../src/scraper/apolloSearchParser.js";

function makeHtml(state: Record<string, unknown>): string {
  return `<html><body><script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};</script></body></html>`;
}

describe("parseApolloSearchResults", () => {
  it("returns null when there's no Apollo state in the HTML", () => {
    expect(parseApolloSearchResults("<html>no apollo</html>", 5)).toBeNull();
  });

  it("returns null when no Post entries are present", () => {
    const html = makeHtml({ ROOT_QUERY: { foo: "bar" } });
    expect(parseApolloSearchResults(html, 5)).toBeNull();
  });

  it("extracts posts and dereferences creator and tags", () => {
    const html = makeHtml({
      "Post:abc": {
        __typename: "Post",
        id: "abc",
        title: "Title One",
        mediumUrl: "https://medium.com/@author/title-one-abc",
        creator: { __ref: "User:u1" },
        tags: [{ __ref: "Tag:ai" }, { __ref: "Tag:llm" }],
        extendedPreviewContent: { subtitle: "subtitle one" },
      },
      "User:u1": { __typename: "User", name: "Author One", username: "a1" },
      "Tag:ai": { __typename: "Tag", id: "ai", displayTitle: "AI" },
      "Tag:llm": { __typename: "Tag", id: "llm", displayTitle: "LLM" },
    });

    const arts = parseApolloSearchResults(html, 5);
    expect(arts).toHaveLength(1);
    expect(arts![0]).toEqual({
      title: "Title One",
      url: "https://medium.com/@author/title-one-abc",
      author: "Author One",
      preview: "subtitle one",
      tags: ["AI", "LLM"],
    });
  });

  it("honors the limit", () => {
    const state: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) {
      state[`Post:p${i}`] = {
        __typename: "Post",
        id: `p${i}`,
        title: `Post ${i}`,
        mediumUrl: `https://medium.com/p/p${i}`,
      };
    }
    expect(parseApolloSearchResults(makeHtml(state), 2)).toHaveLength(2);
  });

  it("falls back to /p/<id> when mediumUrl is missing", () => {
    const html = makeHtml({
      "Post:xyz": { __typename: "Post", id: "xyz", title: "No URL" },
    });
    const arts = parseApolloSearchResults(html, 5);
    expect(arts![0].url).toBe("https://medium.com/p/xyz");
  });

  it("returns null on malformed JSON inside Apollo state", () => {
    const html = `<script>window.__APOLLO_STATE__ = { broken json `;
    expect(parseApolloSearchResults(html, 5)).toBeNull();
  });
});
