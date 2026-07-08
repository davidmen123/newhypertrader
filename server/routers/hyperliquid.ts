import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc.js";
import {
  getHyperliquidAccountOverview,
  getHyperliquidBtcPrice,
  getHyperliquidCandles,
  getHyperliquidConfigStatus,
  getHyperliquidMarketPrices,
  getHyperliquidOpenOrders,
  getHyperliquidOrderHistory,
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
import { seriesIndicators } from "../indicators.js";

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
  configStatus: publicProcedure.query(() => getHyperliquidConfigStatus()),

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

  accountOverview: publicProcedure.query(async () => {
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

  orderHistory: publicProcedure.query(async () => {
    return getHyperliquidOrderHistory();
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
