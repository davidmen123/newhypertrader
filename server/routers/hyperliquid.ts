import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc.js";
import {
  getHyperliquidAccountOverview,
  getHyperliquidBtcPrice,
  getHyperliquidCandles,
  getHyperliquidConfigStatus,
  getHyperliquidMarketPrices,
  getHyperliquidOpenOrders,
  getActiveHyperliquidPerpStates,
  getHyperliquidPerpStates,
  getHyperliquidPositions,
  getHyperliquidOfficialBalanceUsdc,
  getHyperliquidPortfolioSnapshots,
  getHyperliquidSpotEquityUsdc,
  getHyperliquidSpotState,
  getHyperliquidTradeHistory,
} from "../hyperliquid.js";
import { getPnlSnapshots, upsertPnlSnapshot } from "../db.js";

export const hyperliquidRouter = router({
  configStatus: publicProcedure.query(() => getHyperliquidConfigStatus()),

  marketTicker: publicProcedure.query(async () => {
    const yahooUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const readYahooMeta = (payload: unknown) => {
      const meta = (payload as any)?.chart?.result?.[0]?.meta ?? {};
      return {
        current: meta.regularMarketPrice ?? null,
        prevClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
      };
    };

    async function fetchYahooQuote(symbol: string, baseMode: "prevClose" | "24hAgo" = "prevClose") {
      const symbolPath = symbol.includes("%") ? symbol : encodeURIComponent(symbol);
      const urls = [
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbolPath}?interval=1m&range=1d`,
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbolPath}?interval=1h&range=5d`,
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbolPath}?interval=5m&range=5d`,
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbolPath}?interval=1d&range=5d`,
      ];

      for (const url of urls) {
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": yahooUserAgent,
              Accept: "application/json",
              Referer: "https://finance.yahoo.com/",
            },
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);
          const payload = await response.json();
          const quote = readYahooMeta(payload);
          if (baseMode === "24hAgo") {
            const result = (payload as any)?.chart?.result?.[0];
            const timestamps: number[] = result?.timestamp ?? [];
            const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
            const targetSeconds = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
            let best: { distance: number; close: number } | null = null;
            timestamps.forEach((timestamp, index) => {
              const close = Number(closes[index]);
              if (!Number.isFinite(timestamp) || !Number.isFinite(close) || close <= 0) return;
              const distance = Math.abs(timestamp - targetSeconds);
              if (!best || distance < best.distance) best = { distance, close };
            });
            if (best) quote.prevClose = best.close;
          }
          if (quote.current != null) return quote;
        } catch (error) {
          try {
            const { execFile } = await import("child_process");
            const { promisify } = await import("util");
            const execFileAsync = promisify(execFile);
            const { stdout } = await execFileAsync("curl", [
              "-sS",
              "-L",
              "--max-time", "10",
              "-A", yahooUserAgent,
              "-H", "Accept: application/json",
              "-H", "Referer: https://finance.yahoo.com/",
              url,
            ], { timeout: 12000 });
            const payload = JSON.parse(stdout);
            const quote = readYahooMeta(payload);
            if (baseMode === "24hAgo") {
              const result = payload?.chart?.result?.[0];
              const timestamps: number[] = result?.timestamp ?? [];
              const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
              const targetSeconds = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
              let best: { distance: number; close: number } | null = null;
              timestamps.forEach((timestamp, index) => {
                const close = Number(closes[index]);
                if (!Number.isFinite(timestamp) || !Number.isFinite(close) || close <= 0) return;
                const distance = Math.abs(timestamp - targetSeconds);
                if (!best || distance < best.distance) best = { distance, close };
              });
              if (best) quote.prevClose = best.close;
            }
            if (quote.current != null) return quote;
          } catch (fallbackError) {
            console.warn(`[MarketTicker] Yahoo quote failed for ${symbol}:`, error, fallbackError);
          }
        }
      }

      return { current: null, prevClose: null };
    }

    async function fetchHyperliquidPrice24hAgo(coin: string) {
      const now = Date.now();
      const target = now - 24 * 60 * 60 * 1000;
      const candles = await getHyperliquidCandles({
        coin,
        interval: "1h",
        startTime: now - 30 * 60 * 60 * 1000,
        endTime: now,
      });
      let best: { time: number; close: number } | null = null;
      for (const candle of candles) {
        const time = candle.t ?? candle.T ?? 0;
        const close = Number(candle.c);
        if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) continue;
        if (!best || Math.abs(time - target) < Math.abs(best.time - target)) {
          best = { time, close };
        }
      }
      return best?.close ?? null;
    }

    const [hyperliquidRes, btcYahooRes, goldYahooRes, vixRes, nas100FuturesRes, nas100Prev24hRes, shanghaiRes] = await Promise.allSettled([
      getHyperliquidMarketPrices(),
      fetchYahooQuote("BTC-USD"),
      fetchYahooQuote("GC=F"),
      fetchYahooQuote("%5EVIX"),
      fetchYahooQuote("NQ=F", "24hAgo"),
      fetchHyperliquidPrice24hAgo("NAS100"),
      fetchYahooQuote("000001.SS"),
    ]);

    const hyperliquid = hyperliquidRes.status === "fulfilled"
      ? hyperliquidRes.value
      : { btc: null, gold: null, nas100: null, sp500: null };
    const btcYahoo = btcYahooRes.status === "fulfilled" ? btcYahooRes.value : { current: null, prevClose: null };
    const goldYahoo = goldYahooRes.status === "fulfilled" ? goldYahooRes.value : { current: null, prevClose: null };
    const vix = vixRes.status === "fulfilled" ? vixRes.value : { current: null, prevClose: null };
    const nas100Futures = nas100FuturesRes.status === "fulfilled" ? nas100FuturesRes.value : { current: null, prevClose: null };
    const nas100Prev24h = nas100Prev24hRes.status === "fulfilled" ? nas100Prev24hRes.value : null;
    const shanghai = shanghaiRes.status === "fulfilled" ? shanghaiRes.value : { current: null, prevClose: null };

    return {
      btc: hyperliquid.btc ?? btcYahoo.current,
      btcPrevClose: btcYahoo.prevClose,
      gold: hyperliquid.gold ?? goldYahoo.current,
      goldPrevClose: goldYahoo.prevClose,
      nas100: hyperliquid.nas100 ?? nas100Futures.current,
      nas100PrevClose: nas100Prev24h ?? nas100Futures.prevClose,
      shanghai: shanghai.current,
      shanghaiPrevClose: shanghai.prevClose,
      vix: vix.current,
      vixPrevClose: vix.prevClose,
    };
  }),

  accountOverview: publicProcedure.query(async () => {
    return getHyperliquidAccountOverview();
  }),

  tradeMetrics: publicProcedure.query(async () => {
    const account = await getHyperliquidAccountOverview();
    return account.metrics;
  }),

  positions: publicProcedure.query(async () => {
    return getHyperliquidPositions();
  }),

  openOrders: publicProcedure.query(async () => {
    return getHyperliquidOpenOrders();
  }),

  tradeHistory: publicProcedure
    .input(
      z.object({
        category: z.string().default("ALL"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(async ({ input }) => {
      const startTime = input.startDate
        ? new Date(`${input.startDate}T00:00:00`).getTime()
        : Date.now() - 30 * 24 * 60 * 60 * 1000;
      const endTime = input.endDate
        ? new Date(`${input.endDate}T23:59:59`).getTime()
        : Date.now();
      return getHyperliquidTradeHistory({ startTime, endTime, limit: input.limit });
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
      try {
        const portfolioRows = await getHyperliquidPortfolioSnapshots({
          startDate: input.startDate,
          endDate: input.endDate,
          limit: input.limit,
        });
        if (portfolioRows.length > 0) return portfolioRows;
      } catch (error) {
        console.warn("[Hyperliquid] Failed to read portfolio history, falling back to local snapshots:", error);
      }

      const rows = await getPnlSnapshots({
        currency: "USDC",
        startDate: input.startDate ?? "2026-03-09",
        endDate: input.endDate,
        limit: input.limit,
      });
      return rows.reverse();
    }),

  snapshotPnl: publicProcedure.mutation(async () => {
    const now = Date.now();
    const date = new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [perpStates, spotState, btcPrice, officialBalanceUsdc] = await Promise.all([
      getHyperliquidPerpStates(),
      getHyperliquidSpotState().catch(() => ({ balances: [] })),
      getHyperliquidBtcPrice().catch(() => null),
      getHyperliquidOfficialBalanceUsdc().catch(() => null),
    ]);
    const activePerpStates = getActiveHyperliquidPerpStates(perpStates);
    const summaries = activePerpStates.map(({ state }) => state.marginSummary ?? state.crossMarginSummary ?? {});
    const perpEquity = summaries.reduce((sum, summary) => sum + Number(summary.accountValue ?? 0), 0);
    const spotEquity = getHyperliquidSpotEquityUsdc(spotState);
    const fallbackEquity = officialBalanceUsdc && officialBalanceUsdc > 0 ? officialBalanceUsdc : perpEquity;
    const equity = String(spotEquity > 0 ? spotEquity : fallbackEquity);
    const unrealizedPnl = String(
      activePerpStates.flatMap(({ state }) => state.assetPositions ?? []).reduce(
        (sum, item) => sum + Number(item.position.unrealizedPnl ?? 0),
        0
      )
    );

    await upsertPnlSnapshot({
      currency: "USDC",
      date,
      equity,
      balance: equity,
      unrealizedPnl,
      sessionPnl: unrealizedPnl,
      totalPnl: unrealizedPnl,
      btcPrice: btcPrice != null ? String(btcPrice) : null,
      deltaTotal: "0",
      optionsTheta: "0",
      optionsVega: "0",
      optionsGamma: "0",
      snapshotAt: now,
    });

    return {
      success: true,
      accountMode: "hyperliquid-read-only",
      equity,
      unrealizedPnl,
      btcPrice,
      snapshotAt: now,
    };
  }),
});
