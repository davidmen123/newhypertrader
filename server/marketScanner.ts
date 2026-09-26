const PKSCREENER_DEFAULT_LOOKBACK = 22;
const PKSCREENER_DEFAULT_CONSOLIDATION_PCT = 10;
const BOTTOM_MODE_LOOKBACK = 250;
const BOTTOM_MODE_MIN_DRAWDOWN_PCT = 60;
const NASDAQ_UNIVERSE_LIMIT = 100;
const CRYPTO_SCAN_CONCURRENCY = 16;
const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type ScannerMarket = "stocks" | "crypto";
export type ScannerMode = "consolidation" | "bottom";

export type MarketScanOptions = {
  market: ScannerMarket;
  mode?: ScannerMode;
  daysToLookback?: number;
  consolidationPercentage?: number;
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
};

export type ConsolidationMetrics = {
  qualified: boolean;
  rangePct: number;
  highClose: number;
  lowClose: number;
};

export type MarketScanItem = ConsolidationMetrics & {
  symbol: string;
  name: string;
  lastPrice: number;
  volume: number;
  averageVolume: number;
  priceChangePct: number | null;
  drawdownPct: number | null;
  longTermPositionPct: number | null;
  chartUrl: string;
};

export type MarketScanResult = {
  market: ScannerMarket;
  source: string;
  universeLabel: string;
  universeSize: number;
  candidateCount: number;
  scannedCount: number;
  failedCount: number;
  matchedCount: number;
  updatedAt: string;
  parameters: Required<Omit<MarketScanOptions, "market">>;
  results: MarketScanItem[];
};

type PriceBar = { close: number; volume: number };
type UniverseItem = {
  symbol: string;
  name: string;
  lastPrice: number;
  priceChangePct: number | null;
  volume: number;
};

const cache = new Map<string, { at: number; value: MarketScanResult }>();

function finiteNumber(value: unknown): number | null {
  const normalized = typeof value === "string" ? value.replace(/[$,%]/g, "").replaceAll(",", "").trim() : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function round(value: number, decimals: number) {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

/**
 * Exact numeric rule used by PKScreener's validateConsolidation():
 * Range% = abs((highest close - lowest close) / highest close) * 100,
 * rounded to one decimal. A flat 0% range is deliberately not a match.
 *
 * Source: pkjmesra/PKScreener, ScreeningStatistics.validateConsolidation
 * (MIT License, copyright (c) 2023 pkjmesra).
 */
export function calculatePkscreenerConsolidation(
  closes: number[],
  consolidationPercentage = PKSCREENER_DEFAULT_CONSOLIDATION_PCT,
): ConsolidationMetrics | null {
  const values = closes.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return null;
  const highClose = Math.max(...values);
  const lowClose = Math.min(...values);
  if (highClose <= 0) return null;
  const rangePct = round(Math.abs((highClose - lowClose) / highClose) * 100, 1);
  return {
    qualified: rangePct !== 0 && rangePct <= consolidationPercentage,
    rangePct,
    highClose,
    lowClose,
  };
}

export function calculateLongTermMetrics(closes: number[]) {
  const values = closes.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return null;
  const currentClose = values[0];
  const highClose = Math.max(...values);
  const lowClose = Math.min(...values);
  return {
    drawdownPct: round(((highClose - currentClose) / highClose) * 100, 1),
    positionPct: highClose === lowClose ? 0 : round(((currentClose - lowClose) / (highClose - lowClose)) * 100, 1),
  };
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json,text/plain,*/*", ...headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function isoDate(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

async function fetchNasdaqUniverse(): Promise<UniverseItem[]> {
  const url = `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=${NASDAQ_UNIVERSE_LIMIT}&offset=0&exchange=NASDAQ`;
  const payload = await fetchJson<any>(url, {
    Origin: "https://www.nasdaq.com",
    Referer: "https://www.nasdaq.com/",
  });
  const rows: any[] = payload?.data?.table?.rows ?? [];
  return rows
    .map((row) => ({
      symbol: String(row.symbol ?? "").trim().toUpperCase(),
      name: String(row.name ?? row.symbol ?? "").trim(),
      lastPrice: finiteNumber(row.lastsale) ?? 0,
      priceChangePct: finiteNumber(row.pctchange),
      volume: 0,
    }))
    .filter((item) => item.symbol && item.lastPrice > 0);
}

async function fetchNasdaqBars(symbol: string, daysToLookback: number): Promise<PriceBar[]> {
  const end = Date.now();
  const start = end - (daysToLookback * 2 + 14) * 24 * 60 * 60 * 1000;
  const url =
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical` +
    `?assetclass=stocks&fromdate=${isoDate(start)}&todate=${isoDate(end)}&limit=${Math.max(50, daysToLookback * 2)}`;
  const payload = await fetchJson<any>(url, { Referer: "https://www.nasdaq.com/" });
  const rows: any[] = payload?.data?.tradesTable?.rows ?? [];
  return rows
    .map((row) => ({ close: finiteNumber(row.close) ?? 0, volume: finiteNumber(row.volume) ?? 0 }))
    .filter((bar) => bar.close > 0)
    .slice(0, daysToLookback);
}

const STABLE_BASES = new Set([
  "USDC", "FDUSD", "TUSD", "USDP", "DAI", "BUSD", "USDE", "USDS", "USD1", "RLUSD", "PYUSD", "GUSD", "LUSD", "DUSD", "XUSD", "U",
  "EUR", "EURC", "AEUR", "TRY", "BRL", "GBP", "BIDR",
]);
const LEVERAGED_SUFFIXES = ["UP", "DOWN", "BULL", "BEAR"];

function isEligibleUsdtPair(symbol: string) {
  if (!symbol.endsWith("USDT")) return false;
  const base = symbol.slice(0, -4);
  return Boolean(base)
    && !STABLE_BASES.has(base)
    && !LEVERAGED_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

async function fetchBinanceFuturesUniverse(): Promise<UniverseItem[]> {
  const payload = await fetchJson<any[]>("https://fapi.binance.com/fapi/v1/ticker/24hr");
  return payload
    .filter((row) => isEligibleUsdtPair(String(row.symbol ?? "")))
    .map((row) => ({
      symbol: String(row.symbol),
      name: `${String(row.symbol).slice(0, -4)} / USDT`,
      lastPrice: finiteNumber(row.lastPrice) ?? 0,
      priceChangePct: finiteNumber(row.priceChangePercent),
      // For futures, the selectable threshold is based on 24h quote volume in USDT.
      volume: finiteNumber(row.quoteVolume) ?? 0,
    }))
    .filter((item) => item.lastPrice > 0)
    .sort((a, b) => b.volume - a.volume);
}

async function fetchBinanceFuturesBars(symbol: string, daysToLookback: number): Promise<PriceBar[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=${daysToLookback}`;
  const rows = await fetchJson<any[][]>(url);
  return rows
    // USDⓈ-M futures kline index 7 is quote-asset volume (USDT), not base volume.
    .map((row) => ({ close: finiteNumber(row[4]) ?? 0, volume: finiteNumber(row[7]) ?? 0 }))
    .filter((bar) => bar.close > 0)
    .reverse();
}

function normalizeOptions(options: MarketScanOptions): Required<Omit<MarketScanOptions, "market">> {
  const defaults = options.market === "stocks"
    ? { minPrice: 30, maxPrice: 10_000 }
    : { minPrice: 0, maxPrice: 1_000_000 };
  return {
    mode: options.mode ?? "consolidation",
    daysToLookback: Math.min(250, Math.max(5, Math.trunc(options.daysToLookback ?? PKSCREENER_DEFAULT_LOOKBACK))),
    consolidationPercentage: Math.min(50, Math.max(0.1, options.consolidationPercentage ?? PKSCREENER_DEFAULT_CONSOLIDATION_PCT)),
    minPrice: Math.max(0, options.minPrice ?? defaults.minPrice),
    maxPrice: Math.max(0, options.maxPrice ?? defaults.maxPrice),
    minVolume: Math.max(0, options.minVolume ?? 0),
  };
}

export async function scanMarket(options: MarketScanOptions): Promise<MarketScanResult> {
  const parameters = normalizeOptions(options);
  if (parameters.maxPrice < parameters.minPrice) throw new Error("最高价格不能低于最低价格");
  const cacheKey = JSON.stringify({ market: options.market, ...parameters });
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const isStocks = options.market === "stocks";
  const universe = isStocks ? await fetchNasdaqUniverse() : await fetchBinanceFuturesUniverse();
  // For futures, the selected 24h USDT turnover threshold defines the complete
  // scan universe. Do this before requesting daily candles so every qualified
  // contract is scanned rather than an arbitrary top-N subset.
  const candidates = universe.filter((item) => item.lastPrice >= parameters.minPrice
    && item.lastPrice <= parameters.maxPrice
    && (isStocks || item.volume >= parameters.minVolume));
  const historyDays = Math.max(parameters.daysToLookback, parameters.mode === "bottom" ? BOTTOM_MODE_LOOKBACK : 0);
  const settled = await mapConcurrent(candidates, isStocks ? 12 : CRYPTO_SCAN_CONCURRENCY, async (item): Promise<MarketScanItem | null> => {
    const bars = isStocks
      ? await fetchNasdaqBars(item.symbol, historyDays)
      : await fetchBinanceFuturesBars(item.symbol, historyDays);
    if (bars.length < parameters.daysToLookback) return null;
    if (parameters.mode === "bottom" && bars.length < BOTTOM_MODE_LOOKBACK) return null;
    const consolidation = calculatePkscreenerConsolidation(
      bars.slice(0, parameters.daysToLookback).map((bar) => bar.close),
      parameters.consolidationPercentage,
    );
    if (!consolidation?.qualified) return null;
    const longTermBars = bars.slice(0, BOTTOM_MODE_LOOKBACK);
    const longTermMetrics = calculateLongTermMetrics(longTermBars.map((bar) => bar.close));
    if (!longTermMetrics) return null;
    if (parameters.mode === "bottom" && longTermMetrics.drawdownPct < BOTTOM_MODE_MIN_DRAWDOWN_PCT) return null;
    const volume = item.volume || bars[0]?.volume || 0;
    if (volume < parameters.minVolume) return null;
    const averageVolume = bars.reduce((sum, bar) => sum + bar.volume, 0) / bars.length;
    return {
      ...item,
      ...consolidation,
      volume,
      averageVolume,
      drawdownPct: parameters.mode === "bottom" ? longTermMetrics.drawdownPct : null,
      longTermPositionPct: parameters.mode === "bottom" ? longTermMetrics.positionPct : null,
      chartUrl: isStocks
        ? `https://www.tradingview.com/chart/?symbol=NASDAQ%3A${encodeURIComponent(item.symbol)}`
        : `https://www.tradingview.com/chart/?symbol=BINANCE%3A${encodeURIComponent(item.symbol)}.P`,
    };
  });

  const results = settled
    .filter((entry): entry is PromiseFulfilledResult<MarketScanItem | null> => entry.status === "fulfilled")
    .map((entry) => entry.value)
    .filter((item): item is MarketScanItem => item != null)
    .sort((a, b) => parameters.mode === "bottom"
      ? (b.drawdownPct ?? 0) - (a.drawdownPct ?? 0) || a.rangePct - b.rangePct
      : a.rangePct - b.rangePct || b.averageVolume - a.averageVolume);
  const failedCount = settled.filter((entry) => entry.status === "rejected").length;
  const value: MarketScanResult = {
    market: options.market,
    source: isStocks ? "Nasdaq 官方行情" : "Binance USDⓈ-M 合约行情",
    universeLabel: isStocks ? "NASDAQ 市值前 100" : "全部 USDⓈ-M USDT 合约",
    universeSize: universe.length,
    candidateCount: candidates.length,
    scannedCount: settled.length - failedCount,
    failedCount,
    matchedCount: results.length,
    updatedAt: new Date().toISOString(),
    parameters,
    results,
  };
  if (value.scannedCount === 0 && candidates.length > 0) throw new Error("行情源暂时不可用，请稍后重试");
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
