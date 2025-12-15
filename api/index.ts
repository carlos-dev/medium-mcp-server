import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { searchTool, handleSearch } from '../src/tools/search.js';
import { filterTool, handleFilter } from '../src/tools/filter.js';
import { trendingTool, handleTrending } from '../src/tools/trending.js';
import { extractTool, handleExtract } from '../src/tools/extract.js';
import { summarizeTool, handleSummarize } from '../src/tools/summarize.js';

// Create a server instance for handling MCP requests
const server = new Server(
  {
    name: 'mcp-medium',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List all available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [searchTool, filterTool, trendingTool, extractTool, summarizeTool],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_medium_articles':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleSearch(args as { query: string; limit?: number }), null, 2),
            },
          ],
        };

      case 'filter_medium_articles_by_tags':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await handleFilter(args as { tags: string[]; query?: string; limit?: number }),
                null,
                2
              ),
            },
          ],
        };

      case 'get_trending_ai_articles':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleTrending(args as { limit?: number }), null, 2),
            },
          ],
        };

      case 'extract_medium_article':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleExtract(args as { url: string }), null, 2),
            },
          ],
        };

      case 'summarize_medium_article':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await handleSummarize(args as { url?: string; content?: string; maxLength?: number }),
                null,
                2
              ),
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// HTTP handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mcpRequest = req.body;

    // Handle list tools request
    if (mcpRequest.method === 'tools/list') {
      const response = await server.request(ListToolsRequestSchema, {});
      return res.status(200).json(response);
    }

    // Handle call tool request
    if (mcpRequest.method === 'tools/call') {
      const response = await server.request(CallToolRequestSchema, {
        name: mcpRequest.params.name,
        arguments: mcpRequest.params.arguments,
      });
      return res.status(200).json(response);
    }

    return res.status(400).json({ error: 'Unknown MCP method' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: errorMessage });
  }
}

