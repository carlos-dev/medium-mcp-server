import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMedium } from "../../src/scraper/fetch.js";

describe("fetchMedium", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.MEDIUM_COOKIE;

  beforeEach(() => {
    process.env.MEDIUM_COOKIE = "sid=test-sid; uid=test-uid";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.MEDIUM_COOKIE = originalEnv;
  });

  it("sends the MEDIUM_COOKIE value as a Cookie header", async () => {
    const spy = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = spy;

    await fetchMedium("https://medium.com/p/abc");

    expect(spy).toHaveBeenCalledTimes(1);
    const init = spy.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBe("sid=test-sid; uid=test-uid");
    expect(headers.get("user-agent")).toContain("Mozilla");
  });

  it("does not send a Cookie header when MEDIUM_COOKIE is empty", async () => {
    process.env.MEDIUM_COOKIE = "";
    const spy = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = spy;

    await fetchMedium("https://medium.com/p/abc");

    const init = spy.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBeNull();
  });

  it("throws on non-2xx responses with status code", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 403 })) as unknown as typeof fetch;

    await expect(fetchMedium("https://medium.com/p/abc")).rejects.toThrow(/403/);
  });
});
