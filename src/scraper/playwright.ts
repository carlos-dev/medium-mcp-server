import { chromium, Browser, Page } from "playwright";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function createPage(): Promise<Page> {
  const browserInstance = await getBrowser();
  return await browserInstance.newPage();
}

export async function searchMedium(
  query: string,
  limit: number = 10
): Promise<string> {
  const page = await createPage();

  try {
    const searchUrl = `https://medium.com/search?q=${encodeURIComponent(
      query
    )}`;
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for search results to load
    await page.waitForSelector('article, [data-testid="post-preview"]', {
      timeout: 10000,
    });

    // Scroll to load more results if needed
    await page.evaluate(() => {
      if (typeof window !== "undefined" && typeof document !== "undefined") {
        window.scrollTo(0, document.body.scrollHeight);
      }
    });

    await page.waitForTimeout(1000);

    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}

export async function getArticleContent(url: string): Promise<string> {
  const page = await createPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for article content to load
    await page.waitForSelector('article, [data-testid="post-content"]', {
      timeout: 10000,
    });

    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}

export async function getTrendingArticles(
  topic: string = "AI",
  limit: number = 10
): Promise<string> {
  const page = await createPage();

  try {
    // Try to access trending page or search with sorting
    const searchUrl = `https://medium.com/search?q=${encodeURIComponent(
      topic
    )}&sort=popular`;
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30000 });

    await page.waitForSelector('article, [data-testid="post-preview"]', {
      timeout: 10000,
    });

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await page.waitForTimeout(1000);

    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}
