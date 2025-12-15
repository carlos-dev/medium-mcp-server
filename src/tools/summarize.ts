import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { extractArticle } from '../scraper/medium.js';
import type { MediumArticle } from '../utils/types.js';

export const summarizeTool: Tool = {
  name: 'summarize_medium_article',
  description: 'Extract and summarize a Medium article. If URL is provided, extracts the article first. If content is provided, summarizes it directly.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL of the Medium article to summarize',
      },
      content: {
        type: 'string',
        description: 'Direct content to summarize (alternative to URL)',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum length of the summary in characters (default: 500)',
        default: 500,
      },
    },
  },
};

export async function handleSummarize(args: {
  url?: string;
  content?: string;
  maxLength?: number;
}): Promise<{
  summary: string;
  article?: MediumArticle;
  originalLength: number;
  summaryLength: number;
}> {
  const maxLength = args.maxLength || 500;
  let article: MediumArticle | undefined;
  let content = args.content;
  
  if (args.url) {
    if (!args.url.includes('medium.com')) {
      throw new Error('URL must be from medium.com');
    }
    article = await extractArticle(args.url);
    content = article.content || article.preview;
  }
  
  if (!content) {
    throw new Error('Either URL or content must be provided');
  }
  
  // Simple summarization: take first few sentences or paragraphs
  // In a production environment, you might want to use an LLM API here
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  
  let summary = '';
  let summaryLength = 0;
  
  // Try to get first paragraph if it's substantial
  if (paragraphs.length > 0 && paragraphs[0].length <= maxLength) {
    summary = paragraphs[0].trim();
    summaryLength = summary.length;
  } else {
    // Otherwise, take first sentences until we reach maxLength
    for (const sentence of sentences) {
      const candidate = summary ? `${summary}. ${sentence.trim()}` : sentence.trim();
      if (candidate.length <= maxLength) {
        summary = candidate;
        summaryLength = candidate.length;
      } else {
        break;
      }
    }
    
    // If still empty, take first sentence truncated
    if (!summary && sentences.length > 0) {
      summary = sentences[0].trim().substring(0, maxLength);
      if (summary.length < sentences[0].trim().length) {
        summary += '...';
      }
      summaryLength = summary.length;
    }
  }
  
  return {
    summary,
    article,
    originalLength: content.length,
    summaryLength,
  };
}

