import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getTrendingAIArticles } from '../scraper/medium.js';
import type { MediumArticle } from '../utils/types.js';

export const trendingTool: Tool = {
  name: 'get_trending_ai_articles',
  description: 'Get trending/popular Medium articles about AI, machine learning, and related topics.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of articles to return (default: 10)',
        default: 10,
      },
    },
  },
};

export async function handleTrending(args: { limit?: number }): Promise<{
  articles: MediumArticle[];
  total: number;
}> {
  const limit = args.limit || 10;
  const articles = await getTrendingAIArticles(limit);
  
  return {
    articles,
    total: articles.length,
  };
}

