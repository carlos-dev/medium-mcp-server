import type { MediumArticle } from "./medium.js";

const APOLLO_PREFIX = "window.__APOLLO_STATE__";

interface Ref {
  __ref: string;
}

interface PostEntry {
  __typename: "Post";
  id: string;
  title?: string;
  mediumUrl?: string;
  creator?: Ref;
  tags?: Ref[];
  extendedPreviewContent?: { subtitle?: string };
}

interface UserEntry {
  __typename: "User";
  name?: string;
  username?: string;
}

interface TagEntry {
  __typename: "Tag";
  displayTitle?: string;
  id?: string;
}

type ApolloEntry = PostEntry | UserEntry | TagEntry | Record<string, unknown>;

export function parseApolloSearchResults(
  html: string,
  limit: number
): MediumArticle[] | null {
  const blob = extractApolloState(html);
  if (!blob) return null;

  let state: Record<string, ApolloEntry>;
  try {
    state = JSON.parse(blob) as Record<string, ApolloEntry>;
  } catch {
    return null;
  }

  const articles: MediumArticle[] = [];
  for (const [key, raw] of Object.entries(state)) {
    if (!key.startsWith("Post:")) continue;
    const post = raw as PostEntry;
    if (post.__typename !== "Post" || !post.title) continue;

    const url = post.mediumUrl ?? `https://medium.com/p/${post.id}`;

    let author = "Unknown";
    if (post.creator?.__ref) {
      const u = state[post.creator.__ref] as UserEntry | undefined;
      if (u) author = u.name ?? u.username ?? "Unknown";
    }

    const tags: string[] = [];
    for (const ref of post.tags ?? []) {
      const t = state[ref.__ref] as TagEntry | undefined;
      const label = t?.displayTitle ?? t?.id;
      if (label) tags.push(label);
    }

    articles.push({
      title: post.title,
      url,
      author,
      preview: post.extendedPreviewContent?.subtitle ?? "",
      tags,
    });
    if (articles.length >= limit) break;
  }

  return articles.length > 0 ? articles : null;
}

function extractApolloState(html: string): string | null {
  const idx = html.indexOf(APOLLO_PREFIX);
  if (idx < 0) return null;
  const start = html.indexOf("{", idx);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}
