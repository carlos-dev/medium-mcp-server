import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { searchArticles } from '../scraper/medium.js';
import type { MediumArticle } from '../utils/types.js';

export const searchTool: Tool = {
  name: 'search_medium_articles',
  description: 'Search for Medium articles by keywords. Useful for finding articles about specific topics like MCP, RAG, embeddings, AI agents, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (e.g., "MCP agents", "RAG embeddings", "AI programming")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of articles to return (default: 10)',
        default: 10,
      },
    },
    required: ['query'],
  },
};

export async function handleSearch(args: { query: string; limit?: number }): Promise<{
  articles: MediumArticle[];
  total: number;
  query: string;
}> {
  const limit = args.limit || 10;
  const articles = await searchArticles(args.query, limit);
  
  return {
    articles,
    total: articles.length,
    query: args.query,
  };
}

