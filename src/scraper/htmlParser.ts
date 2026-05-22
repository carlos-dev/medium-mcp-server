import * as cheerio from "cheerio";
import type { MediumArticle } from "./medium.js";

export function parseSearchResults(html: string, limit: number): MediumArticle[] {
  const $ = cheerio.load(html);
  const articles: MediumArticle[] = [];

  const articleSelectors = [
    "article",
    '[data-testid="post-preview"]',
    'div[class*="postArticle"]',
  ];

  let foundArticles = $(articleSelectors[0]);
  for (const selector of articleSelectors) {
    foundArticles = $(selector);
    if (foundArticles.length > 0) break;
  }

  foundArticles.slice(0, limit).each((_, element) => {
    const $el = $(element);

    let title = "";
    let url = "";

    const titleEl = $el.find('h2, h3, [class*="title"]').first();
    if (titleEl.length) {
      title = titleEl.text().trim();
      const link =
        titleEl.closest("a").attr("href") ||
        titleEl.find("a").attr("href") ||
        "";
      if (link) {
        url = link.startsWith("http") ? link : `https://medium.com${link}`;
      }
    }

    if (!title) {
      const linkEl = $el.find("a").first();
      title = linkEl.text().trim();
      url = linkEl.attr("href") || "";
      if (url && !url.startsWith("http")) {
        url = `https://medium.com${url}`;
      }
    }

    let author = "Unknown";
    const authorEl = $el.find('[rel="author"], [class*="author"]').first();
    if (authorEl.length) author = authorEl.text().trim() || "Unknown";

    let preview = "";
    const previewEl = $el.find("p").first();
    if (previewEl.length) preview = previewEl.text().trim();

    const tags: string[] = [];
    $el.find('a[href*="/tag/"]').each((_, tagEl) => {
      const tag = $(tagEl).text().trim();
      if (tag) tags.push(tag);
    });

    if (title && url) articles.push({ title, url, author, preview, tags });
  });

  return articles;
}

export function parseArticleHtml(html: string, url: string): MediumArticle {
  const $ = cheerio.load(html);

  const title =
    $('h1[data-testid="storyTitle"]').text().trim() ||
    $("h1").first().text().trim() ||
    "Untitled";

  const author =
    $('[data-testid="authorName"]').text().trim() ||
    $('a[rel="author"]').text().trim() ||
    "Unknown";

  const contentEl = $("article").first();
  contentEl.find("script, style, nav, footer, aside").remove();

  const paragraphs: string[] = [];
  contentEl.find("p, h2, h3, h4, li").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10) paragraphs.push(text);
  });

  const content = paragraphs.join("\n\n");

  const tags: string[] = [];
  $('a[href*="/tag/"]').each((_, tagEl) => {
    const tag = $(tagEl).text().trim();
    if (tag) tags.push(tag);
  });

  return {
    title,
    url,
    author,
    preview: paragraphs[0] || "",
    tags,
    content,
  };
}
