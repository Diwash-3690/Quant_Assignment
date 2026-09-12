import { describe, expect, it, vi } from "vitest";
import { buildLoginUrl, KiteSessionManager } from "#broker/kite/session.js";

describe("buildLoginUrl", () => {
  it("builds the Kite Connect login URL with the api key and v3", () => {
    expect(buildLoginUrl("my-api-key")).toBe(
      "https://kite.zerodha.com/connect/login?api_key=my-api-key&v=3",
    );
  });

  it("url-encodes the api key", () => {
    expect(buildLoginUrl("key with space")).toBe(
      "https://kite.zerodha.com/connect/login?api_key=key%20with%20space&v=3",
    );
  });
});

describe("KiteSessionManager", () => {
  it("exchanges a request token for an access token", async () => {
    const kite = {
      generateSession: vi.fn(async () => ({
        access_token: "access-token-123",
        user_id: "AB1234",
        login_time: "2026-09-11 09:00:00",
      })),
    };
    const manager = new KiteSessionManager({ kite });

    const session = await manager.generateSession("request-token-abc", "api-secret");

    expect(kite.generateSession).toHaveBeenCalledWith("request-token-abc", "api-secret");
    expect(session).toEqual({
      accessToken: "access-token-123",
      userId: "AB1234",
      loginTime: "2026-09-11 09:00:00",
    });
  });

  it("throws if the broker response has no access token", async () => {
    const kite = { generateSession: vi.fn(async () => ({})) };
    const manager = new KiteSessionManager({ kite });

    await expect(manager.generateSession("request-token-abc", "api-secret")).rejects.toThrow(
      "did not include an access token",
    );
  });
});
