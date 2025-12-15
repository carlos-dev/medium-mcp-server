import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { searchArticles, filterArticlesByTags } from '../scraper/medium.js';
import type { MediumArticle } from '../utils/types.js';

export const filterTool: Tool = {
  name: 'filter_medium_articles_by_tags',
  description: 'Filter Medium articles by specific tags. Useful for finding articles tagged with MCP, RAG, embeddings, AI agents, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of tags to filter by (e.g., ["MCP", "RAG", "embeddings", "AI agents"])',
      },
      query: {
        type: 'string',
        description: 'Optional search query to combine with tag filtering (e.g., "AI programming")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of articles to return (default: 10)',
        default: 10,
      },
    },
    required: ['tags'],
  },
};

export async function handleFilter(args: {
  tags: string[];
  query?: string;
  limit?: number;
}): Promise<{
  articles: MediumArticle[];
  total: number;
  tags: string[];
}> {
  const limit = args.limit || 10;
  
  // If query is provided, search first, then filter
  // Otherwise, search for AI-related articles and filter by tags
  const searchQuery = args.query || 'AI artificial intelligence';
  const articles = await searchArticles(searchQuery, limit * 2); // Get more to filter
  
  const filtered = await filterArticlesByTags(articles, args.tags);
  const limited = filtered.slice(0, limit);
  
  return {
    articles: limited,
    total: limited.length,
    tags: args.tags,
  };
}

