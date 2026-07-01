import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  getAllCurrentPositions,
  getBitgetAccountOverview,
  getBitgetConfigStatus,
  getFillHistory,
  getFuturesAccounts,
  getSpotAssets,
  getUnifiedAccountAssets,
} from "../bitget";
import { getIndexPrice } from "../deribit";
import { getPnlSnapshots, upsertPnlSnapshot } from "../db";

export const bitgetRouter = router({
  configStatus: publicProcedure.query(() => getBitgetConfigStatus()),

  unifiedAccountAssets: publicProcedure.query(async () => {
    return getUnifiedAccountAssets();
  }),

  spotAssets: publicProcedure.query(async () => {
    return getSpotAssets();
  }),

  futuresAccounts: publicProcedure.query(async () => {
    return getFuturesAccounts("USDT-FUTURES");
  }),

  accountOverview: publicProcedure.query(async () => {
    return getBitgetAccountOverview();
  }),

  pnlHistory: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().default(1000),
      })
    )
    .query(async ({ input }) => {
      const rows = await getPnlSnapshots({
        currency: "USDT",
        startDate: input.startDate ?? "2026-03-09",
        endDate: input.endDate,
        limit: input.limit,
      });
      return rows.reverse();
    }),

  snapshotPnl: publicProcedure.mutation(async () => {
    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const account = await getUnifiedAccountAssets();
    const toStr = (value: string | number | null | undefined) => {
      const n = Number(value ?? 0);
      return Number.isFinite(n) ? String(n) : "0";
    };

    let btcSpotPrice: number | null = null;
    try {
      btcSpotPrice = await getIndexPrice("btc_usdc");
    } catch {
      btcSpotPrice = null;
    }

    await upsertPnlSnapshot({
      currency: "USDT",
      date,
      equity: toStr(account.usdtEquity || account.accountEquity),
      balance: toStr(account.effEquity || account.usdtEquity || account.accountEquity),
      unrealizedPnl: toStr(account.usdtUnrealisedPnl || account.unrealisedPnl),
      sessionPnl: toStr(account.usdtUnrealisedPnl || account.unrealisedPnl),
      totalPnl: toStr(account.usdtUnrealisedPnl || account.unrealisedPnl),
      btcPrice: btcSpotPrice != null ? toStr(btcSpotPrice) : null,
      deltaTotal: "0",
      optionsTheta: "0",
      optionsVega: "0",
      optionsGamma: "0",
      snapshotAt: now,
    });

    return {
      success: true,
      accountMode: "unified",
      equity: toStr(account.usdtEquity || account.accountEquity),
      unrealizedPnl: toStr(account.usdtUnrealisedPnl || account.unrealisedPnl),
      btcPrice: btcSpotPrice,
      snapshotAt: now,
    };
  }),

  positions: publicProcedure.query(async () => {
    return getAllCurrentPositions();
  }),

  tradeHistory: publicProcedure
    .input(
      z.object({
        category: z.enum(["ALL", "SPOT", "MARGIN", "USDT-FUTURES", "COIN-FUTURES", "USDC-FUTURES"]).default("ALL"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(100).default(100),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const now = Date.now();
      const startTime = input.startDate
        ? new Date(`${input.startDate}T00:00:00`).getTime()
        : now - 30 * 24 * 60 * 60 * 1000;
      const endTime = input.endDate
        ? new Date(`${input.endDate}T23:59:59`).getTime()
        : now;

      const categories =
        input.category === "ALL"
          ? ["SPOT", "USDT-FUTURES", "COIN-FUTURES", "USDC-FUTURES"]
          : [input.category];

      const results = await Promise.allSettled(
        categories.map((category) =>
          getFillHistory({
            category,
            startTime,
            endTime,
            limit: input.limit,
            cursor: input.cursor,
          })
        )
      );

      const fills = results
        .flatMap((result) => (result.status === "fulfilled" ? result.value.list : []))
        .sort((a, b) => Number(b.createdTime || 0) - Number(a.createdTime || 0));

      return {
        trades: fills,
        total: fills.length,
        cursor: results.find((result) => result.status === "fulfilled")?.value.cursor ?? null,
      };
    }),
});
