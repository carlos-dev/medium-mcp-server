import * as cheerio from "cheerio";
import type { MediumArticle } from "../utils/types.js";

export function parseSearchResults(
  html: string,
  limit: number = 10
): MediumArticle[] {
  const $ = cheerio.load(html);
  const articles: MediumArticle[] = [];

  // Medium uses various selectors for articles
  const articleSelectors = [
    "article[data-post-id]",
    '[data-testid="post-preview"]',
    'div[class*="postArticle"]',
    'a[data-action="open-post"]',
  ];

  let foundArticles = $();
  for (const selector of articleSelectors) {
    foundArticles = $(selector);
    if (foundArticles.length > 0) break;
  }

  foundArticles.slice(0, limit).each((_: number, element: any) => {
    const $el = $(element);

    // Try to find title
    const titleSelectors = [
      "h2",
      "h3",
      '[class*="title"]',
      'a[data-action="open-post"]',
    ];

    let title = "";
    let url = "";

    for (const selector of titleSelectors) {
      const titleEl = $el.find(selector).first();
      if (titleEl.length) {
        title = titleEl.text().trim();
        const link =
          titleEl.closest("a").attr("href") || titleEl.attr("href") || "";
        if (link) {
          url = link.startsWith("http") ? link : `https://medium.com${link}`;
        }
        break;
      }
    }

    // Try to find author
    const authorSelectors = [
      '[data-action="show-user-card"]',
      'a[rel="author"]',
      '[class*="author"]',
      '[class*="byline"]',
    ];

    let author = "";
    let authorUrl = "";

    for (const selector of authorSelectors) {
      const authorEl = $el.find(selector).first();
      if (authorEl.length) {
        author = authorEl.text().trim();
        authorUrl = authorEl.attr("href") || "";
        if (authorUrl && !authorUrl.startsWith("http")) {
          authorUrl = `https://medium.com${authorUrl}`;
        }
        break;
      }
    }

    // Try to find preview/description
    const previewSelectors = [
      "p",
      '[class*="preview"]',
      '[class*="snippet"]',
      '[class*="excerpt"]',
    ];

    let preview = "";
    for (const selector of previewSelectors) {
      const previewEl = $el.find(selector).first();
      if (previewEl.length) {
        preview = previewEl.text().trim();
        if (preview.length > 0) break;
      }
    }

    // Try to find tags
    const tags: string[] = [];
    $el.find('a[href*="/tag/"]').each((_: number, tagEl: any) => {
      const tag = $(tagEl).text().trim();
      if (tag) tags.push(tag);
    });

    // Try to find reading time
    let readingTime = "";
    const readingTimeEl = $el
      .find('[class*="readingTime"], [class*="readTime"]')
      .first();
    if (readingTimeEl.length) {
      readingTime = readingTimeEl.text().trim();
    }

    if (title && url) {
      articles.push({
        title,
        url,
        author: author || "Unknown",
        authorUrl: authorUrl || undefined,
        preview: preview || "",
        tags,
        readingTime: readingTime || undefined,
      });
    }
  });

  return articles;
}

export function parseArticleContent(html: string): Partial<MediumArticle> {
  const $ = cheerio.load(html);

  const article: Partial<MediumArticle> = {};

  // Extract title
  const titleSelectors = [
    'h1[data-testid="storyTitle"]',
    "h1",
    '[class*="title"]',
  ];

  for (const selector of titleSelectors) {
    const titleEl = $(selector).first();
    if (titleEl.length) {
      article.title = titleEl.text().trim();
      break;
    }
  }

  // Extract author
  const authorSelectors = [
    '[data-testid="authorName"]',
    'a[rel="author"]',
    '[class*="author"]',
  ];

  for (const selector of authorSelectors) {
    const authorEl = $(selector).first();
    if (authorEl.length) {
      article.author = authorEl.text().trim();
      const authorUrl =
        authorEl.attr("href") || authorEl.closest("a").attr("href");
      if (authorUrl) {
        article.authorUrl = authorUrl.startsWith("http")
          ? authorUrl
          : `https://medium.com${authorUrl}`;
      }
      break;
    }
  }

  // Extract content
  const contentSelectors = [
    'article[data-testid="post-content"]',
    "article",
    '[class*="postArticle"]',
    '[class*="articleBody"]',
  ];

  let contentEl = $();
  for (const selector of contentSelectors) {
    contentEl = $(selector).first();
    if (contentEl.length) break;
  }

  if (contentEl.length) {
    // Remove unwanted elements
    contentEl
      .find(
        'script, style, nav, footer, aside, [class*="ad"], [class*="promo"]'
      )
      .remove();

    // Extract text content
    const paragraphs: string[] = [];
    contentEl.find("p, h2, h3, h4, li").each((_: number, el: any) => {
      const text = $(el).text().trim();
      if (text && text.length > 10) {
        paragraphs.push(text);
      }
    });

    article.content = paragraphs.join("\n\n");
  }

  // Extract tags
  const tags: string[] = [];
  $('a[href*="/tag/"]').each((_: number, tagEl: any) => {
    const tag = $(tagEl).text().trim();
    if (tag) tags.push(tag);
  });
  article.tags = tags;

  // Extract reading time
  const readingTimeEl = $(
    '[class*="readingTime"], [class*="readTime"]'
  ).first();
  if (readingTimeEl.length) {
    article.readingTime = readingTimeEl.text().trim();
  }

  // Extract claps
  const clapsEl = $(
    '[data-testid="clap-button"], button[aria-label*="clap"], [class*="clap"]'
  ).first();
  if (clapsEl.length) {
    const clapsText = clapsEl.text().trim() || clapsEl.attr("aria-label") || "";
    const clapsMatch = clapsText.match(/(\d+)/);
    if (clapsMatch) {
      article.claps = parseInt(clapsMatch[1], 10);
    }
  }

  return article;
}
