import { timingSafeEqual } from "node:crypto";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "bad-scheme" | "invalid" | "misconfigured" };

export function verifyAuthHeader(header: string | undefined | null): VerifyResult {
  const expected = process.env.MCP_AUTH_TOKEN ?? "";
  if (!expected) return { ok: false, reason: "misconfigured" };
  if (!header) return { ok: false, reason: "missing" };

  const [scheme, presented] = header.split(" ");
  if (scheme !== "Bearer" || !presented) {
    return { ok: false, reason: "bad-scheme" };
  }

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "invalid" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "invalid" };
}
