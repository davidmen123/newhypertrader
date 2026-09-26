import { describe, expect, it } from "vitest";

import {
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
      { name: "HYPE", index: 150 },
    ],
    universe: [
      { name: "@107", index: 107, tokens: [150, 0] },
    ],
  };

  it("turns non-cash spot balances into marked holdings", () => {
    const positions = buildHyperliquidSpotPositions(
      {
        balances: [
          { coin: "USDC", token: 0, total: "250", hold: "10", entryNtl: "0" },
          { coin: "HYPE", token: 150, total: "10", hold: "2", entryNtl: "300" },
        ],
      },
      meta,
      [{ coin: "@107", markPx: "35", midPx: "34.9" }],
      1234,
    );

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      category: "SPOT",
      symbol: "HYPE/USDC",
      posSide: "spot",
      total: "10",
      available: "8",
      positionValue: "350",
      avgPrice: "30",
      markPrice: "35",
      unrealisedPnl: "50",
      profitRate: String(50 / 300),
      updatedTime: "1234",
    });
  });

  it("uses entry notional as a conservative value when no USDC market is available", () => {
    const positions = buildHyperliquidSpotPositions(
      { balances: [{ coin: "ALT", token: 999, total: "4", entryNtl: "20" }] },
      meta,
      [{ coin: "@107", markPx: "35" }],
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
