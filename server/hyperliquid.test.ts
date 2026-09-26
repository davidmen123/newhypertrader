import { describe, expect, it } from "vitest";

import {
  buildHyperliquidSpotPairMap,
  buildHyperliquidSpotPositions,
  getHyperliquidSpotAvailableUsdc,
  type HyperliquidSpotClearinghouseState,
} from "./hyperliquid";

describe("getHyperliquidSpotAvailableUsdc", () => {
  it("subtracts unified-account holds from the USDC balance", () => {
    const state: HyperliquidSpotClearinghouseState = {
      balances: [
        {
          coin: "USDC",
          total: "5127.542311",
          hold: "188.626",
        },
      ],
    };

    expect(getHyperliquidSpotAvailableUsdc(state)).toBeCloseTo(4938.916311, 6);
  });

  it("includes USDC.E and ignores unrelated spot assets", () => {
    const state: HyperliquidSpotClearinghouseState = {
      balances: [
        { coin: "USDC", total: "100", hold: "10" },
        { coin: "USDC.E", total: "25", hold: "5" },
        { coin: "HYPE", total: "50", hold: "2" },
      ],
    };

    expect(getHyperliquidSpotAvailableUsdc(state)).toBe(110);
  });

  it("never returns a negative available balance", () => {
    const state: HyperliquidSpotClearinghouseState = {
      balances: [{ coin: "USDC", total: "5", hold: "8" }],
    };

    expect(getHyperliquidSpotAvailableUsdc(state)).toBe(0);
  });
});

describe("buildHyperliquidSpotPositions", () => {
  const meta = {
    tokens: [
      { name: "USDC", index: 0 },
      { name: "UXPL", index: 343, isCanonical: false, fullName: "Unit Plasma" },
    ],
    universe: [
      { name: "@210", index: 210, tokens: [343, 0] },
    ],
  };

  it("turns non-cash spot balances into marked holdings", () => {
    const positions = buildHyperliquidSpotPositions(
      {
        balances: [
          { coin: "USDC", token: 0, total: "250", hold: "10", entryNtl: "0" },
          { coin: "UXPL", token: 343, total: "130.012573", hold: "2", entryNtl: "14.988821" },
        ],
      },
      meta,
      [
        { coin: "@200", markPx: "1.715" },
        { coin: "@210", markPx: "0.11499", midPx: "0.114955" },
      ],
      1234,
    );

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      category: "SPOT",
      symbol: "XPL/USDC",
      posSide: "spot",
      total: "130.012573",
      available: "128.012573",
      positionValue: String(130.012573 * 0.11499),
      avgPrice: String(14.988821 / 130.012573),
      markPrice: "0.11499",
      unrealisedPnl: String(130.012573 * 0.11499 - 14.988821),
      profitRate: String((130.012573 * 0.11499 - 14.988821) / 14.988821),
      updatedTime: "1234",
    });
  });

  it("uses entry notional as a conservative value when no USDC market is available", () => {
    const positions = buildHyperliquidSpotPositions(
      { balances: [{ coin: "ALT", token: 999, total: "4", entryNtl: "20" }] },
      meta,
      [{ coin: "@210", markPx: "0.11499" }],
    );

    expect(positions[0]).toMatchObject({
      symbol: "ALT/USDC",
      positionValue: "20",
      avgPrice: "5",
      markPrice: "0",
      unrealisedPnl: "0",
    });
  });
});

describe("buildHyperliquidSpotPairMap", () => {
  it("uses the same Unit-token display name as open spot positions", () => {
    const pairs = buildHyperliquidSpotPairMap({
      tokens: [
        { name: "USDC", index: 0, isCanonical: true },
        { name: "UXPL", index: 343, isCanonical: false, fullName: "Unit Plasma" },
      ],
      universe: [{ name: "@210", index: 210, tokens: [343, 0] }],
    });

    expect(pairs.get("@210")).toBe("XPL/USDC");
  });

  it("normalizes a named pair through its token metadata", () => {
    const pairs = buildHyperliquidSpotPairMap({
      tokens: [
        { name: "USDC", index: 0, isCanonical: true },
        { name: "UXPL", index: 343, isCanonical: false, fullName: "Unit Plasma" },
      ],
      universe: [{ name: "UXPL/USDC", index: 210, tokens: [343, 0] }],
    });

    expect(pairs.get("UXPL/USDC")).toBe("XPL/USDC");
  });
});
