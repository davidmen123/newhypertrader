import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("./deribit", () => ({
  getAccountSummaries: vi.fn(),
  getIndexPrice: vi.fn(),
  deribitWs: { isConnected: () => false, connect: vi.fn(), disconnect: vi.fn() },
}));

vi.mock("./db", () => ({
  getEarliestPnlSnapshots: vi.fn(),
  // Provide stubs for other db functions used by the router
  upsertTrades: vi.fn(),
  getTradesFromDb: vi.fn(),
  upsertPnlSnapshot: vi.fn(),
  getPnlSnapshots: vi.fn(),
  getCombinedPnlSnapshots: vi.fn(),
  getPnlAttributionSnapshots: vi.fn(),
  incrementPageViews: vi.fn(),
  getPageViews: vi.fn(),
}));

vi.mock("./scheduler", () => ({
  getSchedulerState: vi.fn(() => ({ running: false, lastRun: null })),
  startScheduler: vi.fn(),
}));

import { getAccountSummaries, getIndexPrice } from "./deribit";
import { getEarliestPnlSnapshots, getCombinedPnlSnapshots } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const mockSummaries = [
  {
    currency: "BTC",
    equity: 0.01,
    balance: 0.005,
    initial_margin: 0,
    maintenance_margin: 0,
    available_funds: 0.005,
    session_upl: 0.0001,
    options_pl: 0,
    futures_pl: 0.0003,
    delta_total: 0.01,
    options_vega: 0,
    options_theta: 0,
    options_gamma: 0,
  },
  {
    currency: "USDC",
    equity: 100,
    balance: 50,
    initial_margin: 0,
    maintenance_margin: 0,
    available_funds: 50,
    session_upl: 2,
    options_pl: 5,
    futures_pl: 0,
    delta_total: 0,
    options_vega: 30,
    options_theta: -7,
    options_gamma: 0.00007,
  },
];

describe("accountOverview – totalPnl computation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAccountSummaries as ReturnType<typeof vi.fn>).mockResolvedValue(mockSummaries);
    (getIndexPrice as ReturnType<typeof vi.fn>).mockResolvedValue(80000);
    // Default: no snapshots for max drawdown
    (getCombinedPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("returns null totalPnlUsdc when no snapshots exist", async () => {
    (getEarliestPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue({ btc: null, usdc: null });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.accountOverview();

    expect(result.totalPnlUsdc).toBeNull();
    expect(result.totalPnlPct).toBeNull();
    expect(result.costBasisUsdc).toBeNull();
  });

  it("computes totalPnlUsdc correctly when earliest snapshot exists", async () => {
    // Earliest snapshot: BTC equity = 0.008, USDC equity = 90
    // At current price 80000: earliestTotal = 0.008 * 80000 + 90 = 640 + 90 = 730
    // Current equity: BTC = 0.01 * 80000 + 100 = 800 + 100 = 900
    // totalPnl = 900 - 730 = 170
    // totalPnlPct = 170 / 730 * 100 ≈ 23.29%
    (getEarliestPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue({
      btc: { balance: "0.005", equity: "0.008", snapshotAt: Date.now() - 86400000 },
      usdc: { balance: "40", equity: "90", snapshotAt: Date.now() - 86400000 },
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.accountOverview();

    expect(result.totalPnlUsdc).not.toBeNull();
    expect(result.totalPnlPct).not.toBeNull();
    expect(result.costBasisUsdc).toBeCloseTo(730, 1);
    expect(result.totalPnlUsdc!).toBeCloseTo(170, 1);
    expect(result.totalPnlPct!).toBeCloseTo(23.29, 1);
  });

  it("handles negative totalPnl correctly", async () => {
    // Earliest snapshot: BTC equity = 0.015, USDC equity = 150
    // earliestTotal = 0.015 * 80000 + 150 = 1200 + 150 = 1350
    // Current: 0.01 * 80000 + 100 = 900 → pnl = 900 - 1350 = -450
    (getEarliestPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue({
      btc: { balance: "0.01", equity: "0.015", snapshotAt: Date.now() - 86400000 },
      usdc: { balance: "100", equity: "150", snapshotAt: Date.now() - 86400000 },
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.accountOverview();

    expect(result.totalPnlUsdc!).toBeCloseTo(-450, 1);
    expect(result.totalPnlPct!).toBeLessThan(0);
  });

  it("handles USDC-only earliest snapshot (no BTC history)", async () => {
    // Only USDC earliest snapshot
    (getEarliestPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue({
      btc: null,
      usdc: { balance: "40", equity: "80", snapshotAt: Date.now() - 86400000 },
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.accountOverview();

    // earliestTotal = 0 * 80000 + 80 = 80
    // current = 0.01 * 80000 + 100 = 900
    expect(result.costBasisUsdc).toBeCloseTo(80, 1);
    expect(result.totalPnlUsdc!).toBeCloseTo(820, 1);
  });

  it("includes all required fields in response", async () => {
    (getEarliestPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue({ btc: null, usdc: null });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.accountOverview();

    expect(result).toHaveProperty("totalEquityUsdc");
    expect(result).toHaveProperty("totalEquityBtc");
    expect(result).toHaveProperty("totalPnlUsdc");
    expect(result).toHaveProperty("totalPnlPct");
    expect(result).toHaveProperty("costBasisUsdc");
    expect(result).toHaveProperty("sessionUplUsdc");
    expect(result).toHaveProperty("deltaTotal");
    expect(result).toHaveProperty("maxDrawdownUsdc");
    expect(result).toHaveProperty("maxDrawdownPct");
  });

  it("computes maxDrawdown correctly from snapshot history", async () => {
    (getEarliestPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue({ btc: null, usdc: null });
    // Simulate: equity goes 1000 -> 1200 (peak) -> 900 (trough) -> 1100
    // maxDD = 1200 - 900 = 300, maxDDPct = 300/1200 * 100 = 25%
    (getCombinedPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
      { date: "2026-03-09", equity: "1000", balance: "1000", btcBalance: "0", usdcBalance: "1000", totalPnl: "0", unrealizedPnl: "0", btcPrice: "80000", snapshotAt: 1 },
      { date: "2026-03-10", equity: "1200", balance: "1200", btcBalance: "0", usdcBalance: "1200", totalPnl: "200", unrealizedPnl: "0", btcPrice: "80000", snapshotAt: 2 },
      { date: "2026-03-11", equity: "900",  balance: "900",  btcBalance: "0", usdcBalance: "900",  totalPnl: "-100", unrealizedPnl: "0", btcPrice: "80000", snapshotAt: 3 },
      { date: "2026-03-12", equity: "1100", balance: "1100", btcBalance: "0", usdcBalance: "1100", totalPnl: "100", unrealizedPnl: "0", btcPrice: "80000", snapshotAt: 4 },
    ]);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.accountOverview();

    expect(result.maxDrawdownUsdc).toBeCloseTo(-300, 1);
    expect(result.maxDrawdownPct).toBeCloseTo(-25, 1);
  });

  it("returns zero maxDrawdown when equity only goes up", async () => {
    (getEarliestPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue({ btc: null, usdc: null });
    (getCombinedPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([
      { date: "2026-03-09", equity: "1000", balance: "1000", btcBalance: "0", usdcBalance: "1000", totalPnl: "0", unrealizedPnl: "0", btcPrice: "80000", snapshotAt: 1 },
      { date: "2026-03-10", equity: "1100", balance: "1100", btcBalance: "0", usdcBalance: "1100", totalPnl: "100", unrealizedPnl: "0", btcPrice: "80000", snapshotAt: 2 },
    ]);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.accountOverview();

    expect(result.maxDrawdownUsdc).toBe(0);
    expect(result.maxDrawdownPct).toBe(0);
  });

  it("returns null maxDrawdown when fewer than 2 snapshots", async () => {
    (getEarliestPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue({ btc: null, usdc: null });
    (getCombinedPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.accountOverview();

    expect(result.maxDrawdownUsdc).toBeNull();
    expect(result.maxDrawdownPct).toBeNull();
  });
});
