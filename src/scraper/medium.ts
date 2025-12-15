import {
  searchMedium,
  getArticleContent,
  getTrendingArticles,
} from "./playwright.js";
import { parseSearchResults, parseArticleContent } from "./parser.js";
import type { MediumArticle } from "../utils/types.js";
import { get, set } from "../cache/simple.js";

const CACHE_TTL = 3600000; // 1 hour

export async function searchArticles(
  query: string,
  limit: number = 10
): Promise<MediumArticle[]> {
  const cacheKey = `search:${query}:${limit}`;

  const cached = await get<MediumArticle[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const html = await searchMedium(query, limit);
  const articles = parseSearchResults(html, limit);

  await set(cacheKey, articles, CACHE_TTL);
  return articles;
}

export async function extractArticle(url: string): Promise<MediumArticle> {
  const cacheKey = `article:${url}`;

  const cached = await get<MediumArticle>(cacheKey);
  if (cached && cached.content) {
    return cached;
  }

  const html = await getArticleContent(url);
  const articleData = parseArticleContent(html);

  const article: MediumArticle = {
    title: articleData.title || "Untitled",
    url,
    author: articleData.author || "Unknown",
    authorUrl: articleData.authorUrl,
    publishedDate: articleData.publishedDate,
    readingTime: articleData.readingTime,
    tags: articleData.tags || [],
    preview: articleData.preview || "",
    content: articleData.content || "",
    claps: articleData.claps,
  };

  await set(cacheKey, article, CACHE_TTL);
  return article;
}

export async function getTrendingAIArticles(
  limit: number = 10
): Promise<MediumArticle[]> {
  const cacheKey = `trending:ai:${limit}`;

  const cached = await get<MediumArticle[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const html = await getTrendingArticles("AI", limit);
  const articles = parseSearchResults(html, limit);

  await set(cacheKey, articles, CACHE_TTL);
  return articles;
}

export async function filterArticlesByTags(
  articles: MediumArticle[],
  tags: string[]
): Promise<MediumArticle[]> {
  const lowerTags = tags.map((tag) => tag.toLowerCase());

  return articles.filter((article) => {
    const articleTags = article.tags.map((tag) => tag.toLowerCase());
    return lowerTags.some((tag) =>
      articleTags.some(
        (articleTag) => articleTag.includes(tag) || tag.includes(articleTag)
      )
    );
  });
}
