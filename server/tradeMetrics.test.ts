import { describe, expect, it } from "vitest";
import { calculateRoundTripTradeMetrics, type HyperliquidFill } from "./hyperliquid";

// Builds a two-fill round trip (open long 1 unit, close it) whose closing fill
// carries the given realized pnl. Times are spaced so trades close in order.
function roundTrip(coin: string, pnl: number, index: number): HyperliquidFill[] {
  const base = 1_700_000_000_000 + index * 10_000_000;
  return [
    {
      coin,
      px: "100",
      sz: "1",
      side: "B",
      time: base,
      startPosition: "0",
      closedPnl: "0",
    },
    {
      coin,
      px: "100",
      sz: "1",
      side: "A",
      time: base + 3_600_000,
      startPosition: "1",
      closedPnl: String(pnl),
    },
  ];
}

function metricsFor(pnls: number[]) {
  const fills = pnls.flatMap((pnl, i) => roundTrip("BTC", pnl, i));
  return calculateRoundTripTradeMetrics(fills);
}

describe("calculateRoundTripTradeMetrics – profitFactor", () => {
  it("computes gross win / gross loss", () => {
    // grossWin = 300, grossLoss = 100 → PF = 3
    const result = metricsFor([100, 200, -60, -40]);
    expect(result.profitFactor).toBeCloseTo(3, 5);
  });

  it("returns Infinity when there are wins but no losses", () => {
    const result = metricsFor([50, 70]);
    expect(result.profitFactor).toBe(Infinity);
  });

  it("returns null when there are no completed trades", () => {
    const result = calculateRoundTripTradeMetrics([]);
    expect(result.profitFactor).toBeNull();
  });

  it("returns 0 when there are only losses", () => {
    const result = metricsFor([-50, -70]);
    expect(result.profitFactor).toBe(0);
  });
});

describe("calculateRoundTripTradeMetrics – max consecutive losses", () => {
  it("finds the longest losing streak and its cumulative loss", () => {
    // Streaks: [-10] then [-20, -30, -40] → longest = 3, cumulative = -90
    const result = metricsFor([-10, 100, -20, -30, -40, 50]);
    expect(result.maxConsecutiveLosses).toBe(3);
    expect(result.maxConsecutiveLossUsdc).toBeCloseTo(-90, 5);
  });

  it("breaks streak-length ties by larger cumulative loss", () => {
    // Two streaks of length 2: [-10, -20] (-30) and [-50, -60] (-110)
    const result = metricsFor([-10, -20, 100, -50, -60]);
    expect(result.maxConsecutiveLosses).toBe(2);
    expect(result.maxConsecutiveLossUsdc).toBeCloseTo(-110, 5);
  });

  it("returns 0 when all trades win", () => {
    const result = metricsFor([50, 70]);
    expect(result.maxConsecutiveLosses).toBe(0);
    expect(result.maxConsecutiveLossUsdc).toBe(0);
  });

  it("returns null when there are no completed trades", () => {
    const result = calculateRoundTripTradeMetrics([]);
    expect(result.maxConsecutiveLosses).toBeNull();
    expect(result.maxConsecutiveLossUsdc).toBeNull();
  });
});

describe("calculateRoundTripTradeMetrics – fill ordering", () => {
  // One round trip closed by two partial fills sharing a timestamp. `userFills`
  // hands these back newest-first, and a stable sort would keep that inverted
  // order, breaking the startPosition chain.
  const ascending: HyperliquidFill[] = [
    { coin: "BTC", px: "100", sz: "2", side: "B", time: 1_700_000_000_000, startPosition: "0", closedPnl: "0" },
    { coin: "BTC", px: "150", sz: "1", side: "A", time: 1_700_003_600_000, startPosition: "2", closedPnl: "50" },
    { coin: "BTC", px: "150", sz: "1", side: "A", time: 1_700_003_600_000, startPosition: "1", closedPnl: "50" },
  ];

  it("groups partial closes into a single round trip", () => {
    const result = calculateRoundTripTradeMetrics(ascending);
    expect(result.totalTrades).toBe(1);
    expect(result.expectancyUsdc).toBe(100);
  });

  it("yields identical metrics for a newest-first batch", () => {
    const forward = calculateRoundTripTradeMetrics(ascending);
    const reversed = calculateRoundTripTradeMetrics(ascending.slice().reverse());
    expect(reversed).toEqual(forward);
  });
});
