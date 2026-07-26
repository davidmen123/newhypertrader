import { describe, expect, it } from "vitest";

import {
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
