import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock axios to avoid real API calls in tests
vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

import axios from "axios";
const mockedAxios = vi.mocked(axios);

describe("Deribit API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAccessToken returns token on successful auth", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        result: {
          access_token: "test_token_123",
          refresh_token: "refresh_123",
          expires_in: 900,
          token_type: "bearer",
          scope: "account:read",
        },
      },
    });

    // Dynamic import to get fresh module state
    const { getAccessToken } = await import("./deribit");
    const token = await getAccessToken();
    expect(token).toBe("test_token_123");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("public/auth"),
      expect.objectContaining({
        params: expect.objectContaining({
          grant_type: "client_credentials",
        }),
      })
    );
  });

  it("callPrivate throws on API error response", async () => {
    // The cached token from previous test is still valid, so only mock the API call
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        error: { code: 10001, message: "not_found" },
      },
    });

    const { getPositions } = await import("./deribit");
    await expect(getPositions("INVALID_CURRENCY")).rejects.toThrow();
  });
});

describe("Deribit tRPC Router", () => {
  it("deribit router exports expected procedures", async () => {
    const { deribitRouter } = await import("./routers/deribit");
    expect(deribitRouter).toBeDefined();
    // Check router has expected procedures
    const procedures = Object.keys(deribitRouter._def.procedures);
    expect(procedures).toContain("accountSummaries");
    expect(procedures).toContain("positions");
    expect(procedures).toContain("recentTrades");
    expect(procedures).toContain("historicalTrades");
    expect(procedures).toContain("pnlHistory");
    expect(procedures).toContain("snapshotPnl");
    expect(procedures).toContain("wsStatus");
    expect(procedures).toContain("volatilityIndices");
    expect(procedures).toContain("stockPrices");
    expect(procedures).toContain("accountOverview");
  });
});

describe("Database helpers", () => {
  it("upsertTrades handles empty list gracefully", async () => {
    const { upsertTrades } = await import("./db");
    // Should not throw on empty list
    await expect(upsertTrades([])).resolves.toBeUndefined();
  });
});
