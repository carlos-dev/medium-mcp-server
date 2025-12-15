export interface MediumArticle {
  title: string;
  url: string;
  author: string;
  authorUrl?: string;
  publishedDate?: string;
  readingTime?: string;
  tags: string[];
  preview: string;
  claps?: number;
  content?: string;
}

export interface SearchResult {
  articles: MediumArticle[];
  total: number;
  query?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

