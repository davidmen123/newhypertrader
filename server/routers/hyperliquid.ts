import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ownerProcedure, publicProcedure, router } from "../_core/trpc.js";
import {
  getHyperliquidAccountOverview,
  getHyperliquidBtcPrice,
  getHyperliquidCandles,
  getHyperliquidConfigStatus,
  getHyperliquidMarketPrices,
  getHyperliquidOpenOrders,
  getHyperliquidOrderHistory,
  getHyperliquidPerpetualAssets,
  getActiveHyperliquidPerpStates,
  getHyperliquidPerpStates,
  getHyperliquidPositions,
  getHyperliquidOfficialBalanceUsdc,
  getHyperliquidPortfolioSnapshots,
  getHyperliquidSpotEquityUsdc,
  getHyperliquidSpotState,
  getHyperliquidTradeHistory,
} from "../hyperliquid.js";
import { getPnlSnapshots, getTradeReview, getTradeReviews, upsertPnlSnapshot, upsertTradeReview } from "../db.js";
import { seriesIndicators } from "../indicators.js";
import {
  DEFAULT_HYPERLIQUID_ACCOUNT_ID,
  isDefaultHyperliquidAccount,
  listHyperliquidAccounts,
  maskHyperliquidAddress,
  runWithHyperliquidAccount,
} from "../accounts.js";

// Every account-scoped procedure takes an optional accountId. Omitting it keeps
// the default account, so the public home page needs no changes; /analytics sends
// an id to switch. Only ids are accepted — addresses stay server-side.
const accountInput = z.object({ accountId: z.string().max(32).optional() });

function isDefaultAccountId(accountId: string | undefined) {
  return accountId == null || accountId.trim().toLowerCase() === DEFAULT_HYPERLIQUID_ACCOUNT_ID;
}

/**
 * Resolves the account for this call and runs the reads inside its scope.
 *
 * The default account is what the public site shows, so it stays open. Every
 * other configured account is back-office data and needs the owner key — the
 * check lives here because this wraps every account-scoped read.
 */
function withAccount<T>(
  ctx: { isAdmin: boolean },
  input: { accountId?: string } | undefined,
  fn: () => Promise<T>
) {
  if (!isDefaultAccountId(input?.accountId) && !ctx.isAdmin) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "需要管理口令" });
  }
  try {
    return runWithHyperliquidAccount(input?.accountId, fn);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Unknown Hyperliquid account",
    });
  }
}

const yahooUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function readYahooMeta(payload: unknown) {
  const meta = (payload as any)?.chart?.result?.[0]?.meta ?? {};
  return {
    current: meta.regularMarketPrice ?? null,
    prevClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
  };
}

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
            let bestDistance = Infinity;
            let bestClose: number | null = null;
            for (let i = 0; i < timestamps.length; i++) {
              const timestamp = timestamps[i];
              const close = Number(closes[i]);
              if (!Number.isFinite(timestamp) || !Number.isFinite(close) || close <= 0) continue;
              const distance = Math.abs(timestamp - targetSeconds);
              if (distance < bestDistance) {
                bestDistance = distance;
                bestClose = close;
              }
            }
            if (bestClose != null) quote.prevClose = bestClose;
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
              let bestDistance = Infinity;
              let bestClose: number | null = null;
              for (let i = 0; i < timestamps.length; i++) {
                const timestamp = timestamps[i];
                const close = Number(closes[i]);
                if (!Number.isFinite(timestamp) || !Number.isFinite(close) || close <= 0) continue;
                const distance = Math.abs(timestamp - targetSeconds);
                if (distance < bestDistance) {
                  bestDistance = distance;
                  bestClose = close;
                }
              }
              if (bestClose != null) quote.prevClose = bestClose;
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

// ─── Market indicators (EMA20 position + RSI14 per timeframe) ────────────────

async function fetchYahooCloses(symbol: string, interval: string, range: string): Promise<number[]> {
  const symbolPath = symbol.includes("%") ? symbol : encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolPath}?interval=${interval}&range=${range}`;
  const extract = (payload: unknown): number[] => {
    const closes = (payload as any)?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return (closes as Array<number | null>).map((c) => Number(c)).filter((c) => Number.isFinite(c) && c > 0);
  };
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": yahooUserAgent, Accept: "application/json", Referer: "https://finance.yahoo.com/" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);
    return extract(await response.json());
  } catch {
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("curl", [
        "-sS", "-L", "--max-time", "10",
        "-A", yahooUserAgent,
        "-H", "Accept: application/json",
        "-H", "Referer: https://finance.yahoo.com/",
        url,
      ], { timeout: 12000 });
      return extract(JSON.parse(stdout));
    } catch {
      return [];
    }
  }
}

async function fetchHyperliquidCloses(coin: string, interval: string, spanMs: number): Promise<number[]> {
  const now = Date.now();
  const raw = await getHyperliquidCandles({ coin, interval, startTime: now - spanMs, endTime: now }).catch(() => []);
  const candles = Array.isArray(raw) ? raw : [];
  return candles
    .slice()
    .sort((a, b) => (a.t ?? a.T ?? 0) - (b.t ?? b.T ?? 0))
    .map((candle) => Number(candle.c))
    .filter((c) => Number.isFinite(c) && c > 0);
}

// Down-sample an ascending series to every Nth point, anchored to the latest
// bar — used to build 4H closes from a 1H series when there's no native 4H.
function sampleEveryN(values: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = values.length - 1; i >= 0; i -= n) out.push(values[i]);
  return out.reverse();
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Which series to build per ticker. 4H comes from Hyperliquid's native 4h
// candles (BTC / NAS100) or, for gold, aggregated from Yahoo 1h bars.
// Session-based indices are 1D-only.
type IndicatorSource = "hl" | "yahoo";
const INDICATOR_CONFIG: Array<{
  key: string;
  source: IndicatorSource;
  symbol: string;
  has4h: boolean;
}> = [
  { key: "btc", source: "hl", symbol: "BTC", has4h: true },
  { key: "eth", source: "hl", symbol: "ETH", has4h: true },
  // NAS100 from Nasdaq futures (Yahoo), not the 24/7 Hyperliquid perp, so the
  // EMA/RSI reflect equity-market sessions. 4H is aggregated from 1h bars.
  { key: "nas100", source: "yahoo", symbol: "NQ=F", has4h: true },
  { key: "gold", source: "yahoo", symbol: "GC=F", has4h: true },
  { key: "vix", source: "yahoo", symbol: "%5EVIX", has4h: false },
  { key: "dxy", source: "yahoo", symbol: "DX-Y.NYB", has4h: false },
  { key: "shanghai", source: "yahoo", symbol: "000001.SS", has4h: false },
  { key: "hangSeng", source: "yahoo", symbol: "%5EHSI", has4h: false },
  { key: "nikkei", source: "yahoo", symbol: "%5EN225", has4h: false },
  { key: "kospi", source: "yahoo", symbol: "%5EKS11", has4h: false },
];

let indicatorCache: { at: number; data: Record<string, unknown> } | null = null;
const INDICATOR_TTL_MS = 10 * 60 * 1000;

async function getMarketIndicators() {
  if (indicatorCache && Date.now() - indicatorCache.at < INDICATOR_TTL_MS) {
    return indicatorCache.data;
  }

  const entries = await Promise.all(
    INDICATOR_CONFIG.map(async (cfg) => {
      const daily = cfg.source === "hl"
        ? await fetchHyperliquidCloses(cfg.symbol, "1d", 130 * DAY_MS)
        : await fetchYahooCloses(cfg.symbol, "1d", "6mo");

      let fourHour: number[] = [];
      if (cfg.has4h) {
        if (cfg.source === "hl") {
          fourHour = await fetchHyperliquidCloses(cfg.symbol, "4h", 40 * DAY_MS);
        } else {
          const hourly = await fetchYahooCloses(cfg.symbol, "60m", "1mo");
          fourHour = sampleEveryN(hourly, 4);
        }
      }

      return [cfg.key, { d1: seriesIndicators(daily), h4: seriesIndicators(fourHour) }] as const;
    })
  );

  const data = Object.fromEntries(entries);
  indicatorCache = { at: Date.now(), data };
  return data;
}

export const hyperliquidRouter = router({
  configStatus: publicProcedure
    .input(accountInput.optional())
    .query(({ ctx, input }) => withAccount(ctx, input, async () => getHyperliquidConfigStatus())),

  // The switchable accounts, default first. Labels and masked addresses only.
  // Without the owner key this lists just the default account, so the existence of
  // the others is not public either.
  accounts: publicProcedure.query(({ ctx }) =>
    listHyperliquidAccounts()
      .filter((account) => ctx.isAdmin || account.id === DEFAULT_HYPERLIQUID_ACCOUNT_ID)
      .map((account) => ({
        id: account.id,
        label: account.label,
        address: maskHyperliquidAddress(account.address),
      }))
  ),

  perpetualAssets: publicProcedure.query(() => getHyperliquidPerpetualAssets()),

  marketTicker: publicProcedure.query(async () => {
    const [hyperliquidRes, btcYahooRes, ethYahooRes, goldYahooRes, vixRes, nas100FuturesRes, nas100Prev24hRes, shanghaiRes, hangSengRes, nikkeiRes, kospiRes, dxyRes] = await Promise.allSettled([
      getHyperliquidMarketPrices(),
      fetchYahooQuote("BTC-USD"),
      fetchYahooQuote("ETH-USD"),
      fetchYahooQuote("GC=F"),
      fetchYahooQuote("%5EVIX"),
      fetchYahooQuote("NQ=F", "24hAgo"),
      fetchHyperliquidPrice24hAgo("NAS100"),
      fetchYahooQuote("000001.SS"),
      fetchYahooQuote("%5EHSI"),
      fetchYahooQuote("%5EN225"),
      fetchYahooQuote("%5EKS11"),
      fetchYahooQuote("DX-Y.NYB"),
    ]);

    const hyperliquid = hyperliquidRes.status === "fulfilled"
      ? hyperliquidRes.value
      : { btc: null, eth: null, gold: null, nas100: null, sp500: null };
    const btcYahoo = btcYahooRes.status === "fulfilled" ? btcYahooRes.value : { current: null, prevClose: null };
    const ethYahoo = ethYahooRes.status === "fulfilled" ? ethYahooRes.value : { current: null, prevClose: null };
    const goldYahoo = goldYahooRes.status === "fulfilled" ? goldYahooRes.value : { current: null, prevClose: null };
    const vix = vixRes.status === "fulfilled" ? vixRes.value : { current: null, prevClose: null };
    const nas100Futures = nas100FuturesRes.status === "fulfilled" ? nas100FuturesRes.value : { current: null, prevClose: null };
    const nas100Prev24h = nas100Prev24hRes.status === "fulfilled" ? nas100Prev24hRes.value : null;
    const shanghai = shanghaiRes.status === "fulfilled" ? shanghaiRes.value : { current: null, prevClose: null };
    const hangSeng = hangSengRes.status === "fulfilled" ? hangSengRes.value : { current: null, prevClose: null };
    const nikkei = nikkeiRes.status === "fulfilled" ? nikkeiRes.value : { current: null, prevClose: null };
    const kospi = kospiRes.status === "fulfilled" ? kospiRes.value : { current: null, prevClose: null };
    const dxy = dxyRes.status === "fulfilled" ? dxyRes.value : { current: null, prevClose: null };

    return {
      btc: hyperliquid.btc ?? btcYahoo.current,
      btcPrevClose: btcYahoo.prevClose,
      eth: hyperliquid.eth ?? ethYahoo.current,
      ethPrevClose: ethYahoo.prevClose,
      gold: hyperliquid.gold ?? goldYahoo.current,
      goldPrevClose: goldYahoo.prevClose,
      nas100: hyperliquid.nas100 ?? nas100Futures.current,
      nas100PrevClose: nas100Prev24h ?? nas100Futures.prevClose,
      shanghai: shanghai.current,
      shanghaiPrevClose: shanghai.prevClose,
      hangSeng: hangSeng.current,
      hangSengPrevClose: hangSeng.prevClose,
      nikkei: nikkei.current,
      nikkeiPrevClose: nikkei.prevClose,
      kospi: kospi.current,
      kospiPrevClose: kospi.prevClose,
      dxy: dxy.current,
      dxyPrevClose: dxy.prevClose,
      vix: vix.current,
      vixPrevClose: vix.prevClose,
    };
  }),

  marketIndicators: publicProcedure.query(async () => {
    return getMarketIndicators();
  }),

  accountOverview: publicProcedure
    .input(accountInput.optional())
    .query(async ({ ctx, input }) =>
      withAccount(ctx, input, async () => {
        const [overview, cnyQuote] = await Promise.all([
          getHyperliquidAccountOverview(),
          fetchYahooQuote("CNY=X"),
        ]);
        const usdCnyRate = cnyQuote.current;
        return {
          ...overview,
          usdCnyRate,
          totalEquityCny: usdCnyRate ? overview.totalEquityUsdc * usdCnyRate : null,
          totalPnlCny: usdCnyRate && overview.totalPnlUsdc != null ? overview.totalPnlUsdc * usdCnyRate : null,
        };
      })
    ),

  tradeMetrics: publicProcedure
    .input(accountInput.optional())
    .query(async ({ ctx, input }) =>
      withAccount(ctx, input, async () => {
        const account = await getHyperliquidAccountOverview();
        return account.metrics;
      })
    ),

  positions: publicProcedure
    .input(accountInput.optional())
    .query(async ({ ctx, input }) => withAccount(ctx, input, () => getHyperliquidPositions())),

  openOrders: publicProcedure
    .input(accountInput.optional())
    .query(async ({ ctx, input }) => withAccount(ctx, input, () => getHyperliquidOpenOrders())),

  orderHistory: publicProcedure
    .input(accountInput.optional())
    .query(async ({ ctx, input }) => withAccount(ctx, input, () => getHyperliquidOrderHistory())),

  tradeHistory: publicProcedure
    .input(
      z.object({
        category: z.enum(["ALL", "PERP", "SPOT"]).default("ALL"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(10000).default(10000),
        accountId: z.string().max(32).optional(),
      })
    )
    .query(async ({ ctx, input }) =>
      withAccount(ctx, input, () => {
        const startTime = input.startDate
          ? new Date(`${input.startDate}T00:00:00`).getTime()
          : 0;
        const endTime = input.endDate
          ? new Date(`${input.endDate}T23:59:59`).getTime()
          : Date.now();
        return getHyperliquidTradeHistory({ startTime, endTime, limit: input.limit, category: input.category });
      })
    ),

  candles: publicProcedure
    .input(
      z.object({
        coin: z.string().min(1).max(24),
        interval: z.string().default("4h"),
        startTime: z.number().optional(),
        endTime: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const endTime = input.endTime ?? Date.now();
      const startTime = input.startTime ?? endTime - 30 * 24 * 60 * 60 * 1000;
      const candles = await getHyperliquidCandles({
        coin: input.coin.replace(/-PERP$/i, ""),
        interval: input.interval,
        startTime,
        endTime,
      });
      return candles.map((candle) => ({
        time: candle.t ?? candle.T ?? 0,
        open: Number(candle.o),
        high: Number(candle.h),
        low: Number(candle.l),
        close: Number(candle.c),
      }));
    }),

  // The public chart reads this to show a published review beside a trade. Drafts
  // are unfinished writing and stay with the owner — the front end used to filter
  // them out itself, which meant they still travelled to every visitor.
  tradeReview: publicProcedure
    .input(z.object({ tradeExecId: z.string().min(1).max(160) }))
    .query(async ({ ctx, input }) => {
      const review = (await getTradeReview(input.tradeExecId)) ?? null;
      if (ctx.isAdmin) return review;
      return review?.status === "published" ? review : null;
    }),

  tradeReviews: publicProcedure
    .input(z.object({ tradeExecIds: z.array(z.string().min(1).max(160)).min(1).max(100) }))
    .query(async ({ input }) => getTradeReviews(input.tradeExecIds)),

  // Writes review content that the public chart renders, so it must be the owner.
  saveTradeReview: ownerProcedure
    .input(z.object({
      tradeExecId: z.string().min(1).max(160),
      symbol: z.string().min(1).max(64),
      entryPrice: z.string().max(64).optional(),
      stopLossPrice: z.string().max(64).optional(),
      takeProfitTarget: z.string().max(64).optional(),
      execQty: z.string().max(64).optional(),
      entryReason: z.string().max(10000).optional(),
      exitReason: z.string().max(10000).optional(),
      reviewSummary: z.string().max(20000).optional(),
      status: z.enum(["draft", "published"]).default("draft"),
    }))
    .mutation(async ({ input }) => {
      const normalizeDecimal = (value?: string) => value?.trim() ? value.trim() : undefined;
      const entryPriceValue = normalizeDecimal(input.entryPrice);
      const stopLossPriceValue = normalizeDecimal(input.stopLossPrice);
      const takeProfitTargetValue = normalizeDecimal(input.takeProfitTarget);
      const entryPrice = Number(entryPriceValue);
      const stopLossPrice = Number(stopLossPriceValue);
      const execQty = Number(input.execQty);
      const riskAmount = Number.isFinite(entryPrice) && entryPrice > 0
        && Number.isFinite(stopLossPrice) && stopLossPrice > 0
        && Number.isFinite(execQty) && execQty > 0
        ? String(Math.abs(entryPrice - stopLossPrice) * execQty)
        : undefined;
      const review = await upsertTradeReview({
        ...input,
        entryPrice: entryPriceValue,
        stopLossPrice: stopLossPriceValue,
        takeProfitTarget: takeProfitTargetValue,
        riskAmount,
      });
      if (!review) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "复盘内容未能写入数据库，请检查数据库连接配置。",
        });
      }
      return { success: true, review };
    }),

  pnlHistory: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().default(1000),
        accountId: z.string().max(32).optional(),
        // False for a full-history range, so the curve keeps Hyperliquid's own
        // cumulative PnL and agrees with the total shown in the account overview.
        rebase: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) =>
      withAccount(ctx, input, async () => {
        try {
          const portfolioRows = await getHyperliquidPortfolioSnapshots({
            startDate: input.startDate,
            endDate: input.endDate,
            limit: input.limit,
            rebase: input.rebase,
          });
          if (portfolioRows.length > 0) return portfolioRows;
        } catch (error) {
          console.warn("[Hyperliquid] Failed to read portfolio history, falling back to local snapshots:", error);
        }

        // The local pnl_snapshots table is not account-scoped — it only ever
        // recorded the default account, so other accounts must return empty
        // rather than borrow someone else's equity curve.
        if (!isDefaultHyperliquidAccount()) return [];

        const rows = await getPnlSnapshots({
          currency: "USDC",
          startDate: input.startDate ?? "2026-03-09",
          endDate: input.endDate,
          limit: input.limit,
        });
        return rows.reverse();
      })
    ),

  // Writes to the pnl_snapshots table, which is keyed by (currency, date) with no
  // account column, so this stays on the default account only.
  snapshotPnl: ownerProcedure.mutation(async () => {
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
