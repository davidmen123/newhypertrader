import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("./deribit", () => ({
  getAccountSummaries: vi.fn(),
  getAccountSummary: vi.fn(),
  getAllPositions: vi.fn(() => []),
  getAllUserTrades: vi.fn(() => []),
  getUserTradesByCurrency: vi.fn(),
  getIndexPrice: vi.fn(() => 80000),
  deribitWs: { isConnected: () => false, connect: vi.fn(), disconnect: vi.fn() },
}));

vi.mock("./db", () => ({
  upsertTrades: vi.fn(),
  getTradesFromDb: vi.fn(),
  upsertPnlSnapshot: vi.fn(),
  getPnlSnapshots: vi.fn(),
  getCombinedPnlSnapshots: vi.fn(() => []),
  getPnlAttributionSnapshots: vi.fn(() => []),
  getEarliestPnlSnapshots: vi.fn(() => ({ btc: null, usdc: null })),
  incrementPageViews: vi.fn(),
  getPageViews: vi.fn(),
}));

vi.mock("./scheduler", () => ({
  getSchedulerState: vi.fn(() => ({ running: false, lastRun: null })),
  startScheduler: vi.fn(),
}));

import { getUserTradesByCurrency } from "./deribit";
import { upsertTrades, getTradesFromDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const mockApiTrade = (id: string, currency = "BTC") => ({
  trade_id: id,
  order_id: `O${id}`,
  instrument_name: `${currency}-PERPETUAL`,
  direction: "buy" as const,
  amount: 0.1,
  price: 70000,
  fee: 0.0001,
  fee_currency: currency,
  index_price: 70001,
  mark_price: 70002,
  profit_loss: 5.5,
  trade_seq: 1,
  state: "filled",
  label: "",
  timestamp: 1773300000000,
});

// ─── backfillHistory tests ────────────────────────────────────────────────────
describe("backfillHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserTradesByCurrency as ReturnType<typeof vi.fn>).mockResolvedValue([
      mockApiTrade("T001"),
      mockApiTrade("T002"),
    ]);
    (upsertTrades as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("calls getUserTradesByCurrency for BTC and USDC", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.backfillHistory({ count: 500 });

    const calls = (getUserTradesByCurrency as ReturnType<typeof vi.fn>).mock.calls;
    const currencies = calls.map((c: unknown[]) => c[0]);
    expect(currencies).toContain("BTC");
    expect(currencies).toContain("USDC");
  });

  it("uses 2026-03-09 as startTimestamp", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.backfillHistory({ count: 500 });

    const expectedStart = new Date("2026-03-09T00:00:00Z").getTime();
    const calls = (getUserTradesByCurrency as ReturnType<typeof vi.fn>).mock.calls;
    for (const call of calls) {
      expect(call[2]).toBe(expectedStart); // 3rd arg = startTimestamp
    }
  });

  it("calls upsertTrades for each currency", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.backfillHistory({ count: 500 });

    // Called twice: once for BTC, once for USDC
    expect(upsertTrades).toHaveBeenCalledTimes(2);
  });

  it("returns total synced count", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.backfillHistory({ count: 500 });

    // 2 trades per currency × 2 currencies = 4
    expect(result.synced).toBe(4);
  });

  it("continues if one currency fails", async () => {
    (getUserTradesByCurrency as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("BTC API error"))
      .mockResolvedValueOnce([mockApiTrade("T003", "USDC")]);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.backfillHistory({ count: 500 });

    // Only USDC succeeded
    expect(result.synced).toBe(1);
  });
});

// ─── tradeHistory server-side pagination tests ───────────────────────────────
describe("tradeHistory – server-side pagination", () => {
  const makeDbTrades = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      tradeId: `T${i}`,
      orderId: `O${i}`,
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
      tradeSeq: i,
      state: "filled",
      label: null,
      tradeTimestamp: 1773300000000 - i * 1000,
    }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns trades with total count", async () => {
    (getTradesFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      trades: makeDbTrades(20),
      total: 87,
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.tradeHistory({ currency: "ALL", page: 0, pageSize: 20 });

    expect(result.total).toBe(87);
    expect(result.trades).toHaveLength(20);
    expect(result.page).toBe(0);
    expect(result.pageSize).toBe(20);
  });

  it("passes correct offset for page 2", async () => {
    (getTradesFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      trades: makeDbTrades(20),
      total: 87,
    });

    const caller = appRouter.createCaller(createPublicContext());
    await caller.deribit.tradeHistory({ currency: "ALL", page: 2, pageSize: 20 });

    expect(getTradesFromDb).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 40 })
    );
  });

  it("returns correct page metadata", async () => {
    (getTradesFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      trades: makeDbTrades(5),
      total: 5,
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.deribit.tradeHistory({ currency: "ALL", page: 0, pageSize: 20 });

    expect(result.total).toBe(5);
    expect(result.page).toBe(0);
  });
});
