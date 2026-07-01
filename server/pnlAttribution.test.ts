import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module so tests don't need a real database connection
vi.mock("./db", () => ({
  getPnlAttributionSnapshots: vi.fn(),
}));

import { getPnlAttributionSnapshots } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// Sample attribution data
const sampleAttribution = [
  {
    date: "2026-03-10",
    totalPnl: 12.5,
    thetaPnl: 8.2,
    deltaPnl: 3.1,
    vegaPnl: -0.5,
    residual: 1.7,
    deltaTotal: 0.05,
    optionsTheta: -7.52,
    optionsVega: 31.6,
    optionsGamma: 0.00007,
    btcPrice: 70000,
  },
  {
    date: "2026-03-09",
    totalPnl: -5.3,
    thetaPnl: 7.8,
    deltaPnl: -12.1,
    vegaPnl: -1.2,
    residual: 0.2,
    deltaTotal: 0.04,
    optionsTheta: -7.1,
    optionsVega: 30.2,
    optionsGamma: 0.00006,
    btcPrice: 68000,
  },
];

describe("deribit.pnlAttribution router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns attribution data with default params", async () => {
    (getPnlAttributionSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(sampleAttribution);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.deribit.pnlAttribution({});

    expect(getPnlAttributionSnapshots).toHaveBeenCalledOnce();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      date: "2026-03-10",
      totalPnl: 12.5,
      thetaPnl: 8.2,
      deltaPnl: 3.1,
      vegaPnl: -0.5,
      residual: 1.7,
    });
  });

  it("passes startDate and limit to getPnlAttributionSnapshots", async () => {
    (getPnlAttributionSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await caller.deribit.pnlAttribution({ startDate: "2026-03-01", limit: 30 });

    expect(getPnlAttributionSnapshots).toHaveBeenCalledWith({
      startDate: "2026-03-01",
      endDate: undefined,
      limit: 30,
    });
  });

  it("returns empty array when no snapshots available", async () => {
    (getPnlAttributionSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.deribit.pnlAttribution({});

    expect(result).toEqual([]);
  });

  it("attribution components sum to totalPnl (within floating point tolerance)", () => {
    // Verify the mathematical invariant: theta + delta + vega + residual = totalPnl
    for (const row of sampleAttribution) {
      const computed = row.thetaPnl + row.deltaPnl + row.vegaPnl + row.residual;
      expect(Math.abs(computed - row.totalPnl)).toBeLessThan(0.001);
    }
  });

  it("handles attribution data with all-zero Greeks gracefully", async () => {
    const zeroGreeks = [{
      date: "2026-03-11",
      totalPnl: 0,
      thetaPnl: 0,
      deltaPnl: 0,
      vegaPnl: 0,
      residual: 0,
      deltaTotal: 0,
      optionsTheta: 0,
      optionsVega: 0,
      optionsGamma: 0,
      btcPrice: 0,
    }];
    (getPnlAttributionSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(zeroGreeks);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.deribit.pnlAttribution({});

    expect(result).toHaveLength(1);
    expect(result[0].totalPnl).toBe(0);
  });
});
