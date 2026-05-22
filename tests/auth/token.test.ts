import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyAuthHeader } from "../../src/auth/token.js";

describe("verifyAuthHeader", () => {
  const originalEnv = process.env.MCP_AUTH_TOKEN;
  beforeEach(() => {
    process.env.MCP_AUTH_TOKEN = "secret-token";
  });
  afterEach(() => {
    process.env.MCP_AUTH_TOKEN = originalEnv;
  });

  it("returns ok when the Bearer token matches", () => {
    expect(verifyAuthHeader("Bearer secret-token")).toEqual({ ok: true });
  });

  it("returns unauthorized when the token does not match", () => {
    const result = verifyAuthHeader("Bearer wrong-token");
    expect(result.ok).toBe(false);
  });

  it("returns unauthorized when the header is missing", () => {
    expect(verifyAuthHeader(undefined).ok).toBe(false);
    expect(verifyAuthHeader("").ok).toBe(false);
  });

  it("returns unauthorized when the scheme is not Bearer", () => {
    expect(verifyAuthHeader("Basic secret-token").ok).toBe(false);
  });

  it("returns misconfigured when MCP_AUTH_TOKEN is not set", () => {
    process.env.MCP_AUTH_TOKEN = "";
    const result = verifyAuthHeader("Bearer anything");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("misconfigured");
  });
});
