import type { VercelRequest, VercelResponse } from "@vercel/node";

import { searchTool, handleSearch } from "../src/tools/search.js";
import { filterTool, handleFilter } from "../src/tools/filter.js";
import { trendingTool, handleTrending } from "../src/tools/trending.js";
import { extractTool, handleExtract } from "../src/tools/extract.js";
import { summarizeTool, handleSummarize } from "../src/tools/summarize.js";

// HTTP handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const mcpRequest = req.body;

    // Handle list tools request
    if (mcpRequest.method === "tools/list") {
      return res.status(200).json({
        tools: [
          searchTool,
          filterTool,
          trendingTool,
          extractTool,
          summarizeTool,
        ],
      });
    }

    // Handle call tool request
    if (mcpRequest.method === "tools/call") {
      const { name, arguments: args } = mcpRequest.params;

      let result;
      switch (name) {
        case "search_medium_articles":
          result = await handleSearch(
            args as { query: string; limit?: number }
          );
          break;

        case "filter_medium_articles_by_tags":
          result = await handleFilter(
            args as { tags: string[]; query?: string; limit?: number }
          );
          break;

        case "get_trending_ai_articles":
          result = await handleTrending(args as { limit?: number });
          break;

        case "extract_medium_article":
          result = await handleExtract(args as { url: string });
          break;

        case "summarize_medium_article":
          result = await handleSummarize(
            args as { url?: string; content?: string; maxLength?: number }
          );
          break;

        default:
          return res.status(400).json({ error: `Unknown tool: ${name}` });
      }

      return res.status(200).json({
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      });
    }

    return res.status(400).json({ error: "Unknown MCP method" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      error: errorMessage,
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    });
  }
}
