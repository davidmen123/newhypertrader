import { describe, expect, it } from "vitest";
import { calculateLongTermMetrics, calculatePkscreenerConsolidation } from "./marketScanner";

describe("calculatePkscreenerConsolidation", () => {
  it("matches PKScreener's five-percent example", () => {
    expect(calculatePkscreenerConsolidation([100, 95], 10)).toEqual({
      qualified: true,
      rangePct: 5,
      highClose: 100,
      lowClose: 95,
    });
  });

  it("rejects a range wider than the configured percentage", () => {
    expect(calculatePkscreenerConsolidation([100, 80], 10)?.qualified).toBe(false);
  });

  it("rejects a perfectly flat series exactly like PKScreener", () => {
    expect(calculatePkscreenerConsolidation([100, 100], 10)).toMatchObject({ qualified: false, rangePct: 0 });
  });

  it("uses the rounded one-decimal range returned by PKScreener for filtering", () => {
    expect(calculatePkscreenerConsolidation([100, 89.96], 10)).toMatchObject({ qualified: true, rangePct: 10 });
  });

  it("ignores invalid source values before calculating the range", () => {
    expect(calculatePkscreenerConsolidation([100, Number.NaN, 95], 10)?.rangePct).toBe(5);
  });

  it("calculates bottom-mode drawdown from the newest close against the long-term high", () => {
    expect(calculateLongTermMetrics([40, 45, 100, 60])).toEqual({ drawdownPct: 60, positionPct: 0 });
  });
});
