import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("./deribit", () => ({
  getAccountSummaries: vi.fn(),
  getAccountSummary: vi.fn(),
  getAllPositions: vi.fn(() => []),
  getAllUserTrades: vi.fn(() => []),
  getUserTradesByCurrency: vi.fn(() => []),
  getIndexPrice: vi.fn(() => 80000),
  deribitWs: {
    isConnected: () => false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock("./db", () => ({
  upsertTrades: vi.fn(),
  getTradesFromDb: vi.fn(),
  upsertPnlSnapshot: vi.fn(),
  getPnlSnapshots: vi.fn(),
  getCombinedPnlSnapshots: vi.fn(),
  getPnlAttributionSnapshots: vi.fn(),
  getEarliestPnlSnapshots: vi.fn(() => ({ btc: null, usdc: null })),
  incrementPageViews: vi.fn(),
  getPageViews: vi.fn(),
}));

vi.mock("./scheduler", () => ({
  getSchedulerState: vi.fn(() => ({ running: false, lastRun: null })),
  startScheduler: vi.fn(),
}));

import { getCombinedPnlSnapshots, getTradesFromDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── P&L History time range tests ────────────────────────────────────────────
describe("pnlHistory – time range semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCombinedPnlSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("MAX range always uses 2026-03-09 as startDate", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.pnlHistory({ denomination: "USDC" }); // no startDate = MAX

    expect(getCombinedPnlSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2026-03-09" })
    );
  });

  it("explicit startDate overrides default for non-MAX ranges", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.pnlHistory({
      denomination: "USDC",
      startDate: "2026-03-10",
    });

    expect(getCombinedPnlSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2026-03-10" })
    );
  });

  it("uses generous limit (1000) by default", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.pnlHistory({ denomination: "USDC" });

    expect(getCombinedPnlSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1000 })
    );
  });

  it("passes denomination correctly", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.pnlHistory({ denomination: "BTC" });

    expect(getCombinedPnlSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({ denomination: "BTC" })
    );
  });
});

// ─── Trade History DB-backed tests ───────────────────────────────────────────
describe("tradeHistory – reads from DB", () => {
  const mockDbTrades = [
    {
      tradeId: "T001",
      orderId: "O001",
      instrument: "BTC-PERPETUAL",
      currency: "BTC",
      direction: "buy" as const,
      amount: "0.1",
      price: "70000",
      fee: "0.0001",
      feeCurrency: "BTC",
      indexPrice: "70001",
      markPrice: "70002",
      profit: "5.5",
      tradeSeq: 1,
      state: "filled",
      label: null,
      tradeTimestamp: 1773300000000,
    },
    {
      tradeId: "T002",
      orderId: "O002",
      instrument: "BTC-13MAR26-67500-P",
      currency: "BTC",
      direction: "sell" as const,
      amount: "1",
      price: "500",
      fee: "0.0002",
      feeCurrency: "BTC",
      indexPrice: "70001",
      markPrice: "498",
      profit: "-10",
      tradeSeq: 2,
      state: "filled",
      label: "hedge",
      tradeTimestamp: 1773200000000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (getTradesFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      trades: mockDbTrades,
      total: mockDbTrades.length,
    });
  });

  it("calls getTradesFromDb (not Deribit API) for trade history", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.tradeHistory({
      currency: "ALL",
      page: 0,
      pageSize: 20,
    });

    expect(getTradesFromDb).toHaveBeenCalled();
    expect(result.trades).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("maps DB fields to expected response shape", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.tradeHistory({
      currency: "ALL",
      page: 0,
      pageSize: 20,
    });

    const first = result.trades[0];
    expect(first.tradeId).toBe("T001");
    expect(first.instrument).toBe("BTC-PERPETUAL");
    expect(first.direction).toBe("buy");
    expect(first.amount).toBe(0.1);
    expect(first.price).toBe(70000);
    expect(first.profitLoss).toBe(5.5);
    expect(first.timestamp).toBe(1773300000000);
  });

  it("passes currency filter to DB query (ALL → undefined)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.tradeHistory({
      currency: "ALL",
      page: 0,
      pageSize: 20,
    });

    expect(getTradesFromDb).toHaveBeenCalledWith(
      expect.objectContaining({ currency: undefined })
    );
  });

  it("passes specific currency filter to DB query", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.tradeHistory({
      currency: "BTC",
      page: 0,
      pageSize: 20,
    });

    expect(getTradesFromDb).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "BTC" })
    );
  });

  it("converts date range to timestamps correctly", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.tradeHistory({
      currency: "ALL",
      startDate: "2026-03-09",
      endDate: "2026-03-13",
      page: 0,
      pageSize: 20,
    });

    const callArgs = (getTradesFromDb as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(callArgs.startTimestamp).toBe(
      new Date("2026-03-09T00:00:00Z").getTime()
    );
    expect(callArgs.endTimestamp).toBe(
      new Date("2026-03-13T23:59:59Z").getTime()
    );
  });

  it("uses pageSize as limit and computes offset from page", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.tradeHistory({
      currency: "ALL",
      page: 3,
      pageSize: 20,
    });

    expect(getTradesFromDb).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 60 })
    );
  });

  it("returns page and pageSize in response", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.tradeHistory({
      currency: "ALL",
      page: 2,
      pageSize: 10,
    });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });
});
