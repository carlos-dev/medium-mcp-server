import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { searchTool, handleSearch } from "./tools/search.js";
import { filterTool, handleFilter } from "./tools/filter.js";
import { trendingTool, handleTrending } from "./tools/trending.js";
import { extractTool, handleExtract } from "./tools/extract.js";
import { summarizeTool, handleSummarize } from "./tools/summarize.js";
import { closeBrowser } from "./scraper/playwright.js";

const server = new Server(
  {
    name: "mcp-medium",
    version: "1.0.0",
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
      case "search_medium_articles":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleSearch(args as { query: string; limit?: number }),
                null,
                2
              ),
            },
          ],
        };

      case "filter_medium_articles_by_tags":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleFilter(
                  args as { tags: string[]; query?: string; limit?: number }
                ),
                null,
                2
              ),
            },
          ],
        };

      case "get_trending_ai_articles":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleTrending(args as { limit?: number }),
                null,
                2
              ),
            },
          ],
        };

      case "extract_medium_article":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleExtract(args as { url: string }),
                null,
                2
              ),
            },
          ],
        };

      case "summarize_medium_article":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleSummarize(
                  args as { url?: string; content?: string; maxLength?: number }
                ),
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
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Cleanup on exit
process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("Medium MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
