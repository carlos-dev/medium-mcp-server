import type { MediumArticle } from "./medium.js";

interface MediumParagraph {
  type: number;
  text: string;
}

interface MediumPayloadValue {
  title?: string;
  creatorId?: string;
  content?: { bodyModel?: { paragraphs?: MediumParagraph[] } };
  virtuals?: { tags?: Array<{ name: string }> };
}

interface MediumPayload {
  success: boolean;
  payload?: {
    value?: MediumPayloadValue;
    references?: {
      User?: Record<string, { name?: string; username?: string }>;
    };
  };
}

const XSSI_PREFIX = "])}while(1);</x>";

export function parseMediumJson(raw: string, url: string): MediumArticle {
  let body = raw;
  if (body.startsWith(XSSI_PREFIX)) body = body.slice(XSSI_PREFIX.length);

  const data = JSON.parse(body) as MediumPayload;
  if (!data.success || !data.payload?.value) {
    throw new Error("Medium JSON response was not successful");
  }

  const value = data.payload.value;
  const title = value.title ?? "Untitled";

  const creatorId = value.creatorId;
  const user = creatorId
    ? data.payload.references?.User?.[creatorId]
    : undefined;
  const author = user?.name ?? user?.username ?? "Unknown";

  const tags = (value.virtuals?.tags ?? []).map((t) => t.name);

  const paragraphs = value.content?.bodyModel?.paragraphs ?? [];
  const lines: string[] = [];
  let preview = "";

  for (const p of paragraphs) {
    const text = p.text?.trim();
    if (!text) continue;
    switch (p.type) {
      case 13:
        lines.push(`## ${text}`);
        break;
      case 3:
        lines.push(`### ${text}`);
        break;
      case 4:
        lines.push(`#### ${text}`);
        break;
      case 6:
      case 7:
        lines.push(`> ${text}`);
        break;
      case 8:
        lines.push("```\n" + text + "\n```");
        break;
      case 9:
        lines.push(`- ${text}`);
        break;
      case 10:
        lines.push(`1. ${text}`);
        break;
      case 1:
      default:
        lines.push(text);
        if (!preview) preview = text;
        break;
    }
  }

  return {
    title,
    url,
    author,
    preview,
    tags,
    content: lines.join("\n\n"),
  };
}
