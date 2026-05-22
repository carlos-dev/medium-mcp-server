const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FetchOptions {
  accept?: string;
}

export async function fetchMedium(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const cookie = process.env.MEDIUM_COOKIE?.trim();
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept:
      options.accept ??
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  };
  if (cookie) headers["Cookie"] = cookie;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}
