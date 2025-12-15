import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface MediumArticle {
  title: string;
  url: string;
  author: string;
  preview: string;
  tags: string[];
  content?: string;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

export async function searchArticles(
  query: string,
  limit: number = 10
): Promise<MediumArticle[]> {
  const searchUrl = `https://medium.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  return parseSearchResults(html, limit);
}

export async function getTrendingArticles(
  limit: number = 10
): Promise<MediumArticle[]> {
  const searchUrl = `https://medium.com/search?q=artificial+intelligence`;
  const html = await fetchHtml(searchUrl);
  return parseSearchResults(html, limit);
}

export async function extractArticle(url: string): Promise<MediumArticle> {
  const html = await fetchHtml(url);
  return parseArticleContent(html, url);
}

export async function filterArticlesByTags(
  articles: MediumArticle[],
  tags: string[]
): Promise<MediumArticle[]> {
  const lowerTags = tags.map((tag) => tag.toLowerCase());

  return articles.filter((article) => {
    const articleTags = article.tags.map((tag) => tag.toLowerCase());
    const titleLower = article.title.toLowerCase();
    const previewLower = article.preview.toLowerCase();

    return lowerTags.some(
      (tag) =>
        articleTags.some((at) => at.includes(tag) || tag.includes(at)) ||
        titleLower.includes(tag) ||
        previewLower.includes(tag)
    );
  });
}

function parseSearchResults(html: string, limit: number): MediumArticle[] {
  const $ = cheerio.load(html);
  const articles: MediumArticle[] = [];

  const articleSelectors = [
    "article",
    '[data-testid="post-preview"]',
    'div[class*="postArticle"]',
  ];

  let foundArticles = $("body").find("nothing");
  for (const selector of articleSelectors) {
    foundArticles = $(selector);
    if (foundArticles.length > 0) break;
  }

  foundArticles.slice(0, limit).each((_: number, element: unknown) => {
    const $el = $(element as cheerio.Element);

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
    if (authorEl.length) {
      author = authorEl.text().trim() || "Unknown";
    }

    let preview = "";
    const previewEl = $el.find("p").first();
    if (previewEl.length) {
      preview = previewEl.text().trim();
    }

    const tags: string[] = [];
    $el.find('a[href*="/tag/"]').each((_: number, tagEl: unknown) => {
      const tag = $(tagEl as cheerio.Element)
        .text()
        .trim();
      if (tag) tags.push(tag);
    });

    if (title && url) {
      articles.push({ title, url, author, preview, tags });
    }
  });

  return articles;
}

function parseArticleContent(html: string, url: string): MediumArticle {
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
  contentEl.find("p, h2, h3, h4, li").each((_: number, el: unknown) => {
    const text = $(el as cheerio.Element)
      .text()
      .trim();
    if (text && text.length > 10) {
      paragraphs.push(text);
    }
  });

  const content = paragraphs.join("\n\n");

  const tags: string[] = [];
  $('a[href*="/tag/"]').each((_: number, tagEl: unknown) => {
    const tag = $(tagEl as cheerio.Element)
      .text()
      .trim();
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
