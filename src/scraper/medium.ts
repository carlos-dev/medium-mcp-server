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
