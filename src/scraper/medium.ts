import {
  searchMediumLight,
  getArticleContentLight,
  getTrendingArticlesLight,
} from "./fetch-scraper.js";
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

  const articles = await searchMediumLight(query, limit);

  await set(cacheKey, articles, CACHE_TTL);
  return articles;
}

export async function extractArticle(url: string): Promise<MediumArticle> {
  const cacheKey = `article:${url}`;

  const cached = await get<MediumArticle>(cacheKey);
  if (cached && cached.content) {
    return cached;
  }

  const article = await getArticleContentLight(url);

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

  const articles = await getTrendingArticlesLight(limit);

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
