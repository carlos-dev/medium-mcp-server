import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { extractArticle } from "../scraper/medium.js";
import type { MediumArticle } from "../utils/types.js";

export const extractTool: Tool = {
  name: "extract_medium_article",
  description:
    "Extract the full content of a Medium article from its URL. Returns title, author, content, tags, and metadata.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL of the Medium article to extract",
      },
    },
    required: ["url"],
  },
};

export async function handleExtract(args: {
  url: string;
}): Promise<MediumArticle> {
  if (!args.url.includes("medium.com")) {
    throw new Error("URL must be from medium.com");
  }

  const article = await extractArticle(args.url);
  return article;
}
