/**
 * Calendar Router
 * - economicCalendar: US economic events for the current week or month
 *   Primary source: TradingView economic calendar (includes actual values)
 *   Weekly fallback: ForexFactory free JSON API (nfs.faireconomy.media)
 *   Uses in-memory cache to avoid excessive upstream requests
 * - earningsCalendar: Top 50 US stocks earnings for the next 7 days
 *   Source: Alpha Vantage free API (no key required for demo)
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc.js";

// ─── In-memory cache ─────────────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // Date.now()
  ttlMs: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > entry.ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, fetchedAt: Date.now(), ttlMs });
}

// ─── Constants ───────────────────────────────────────────────────────────────
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.forexfactory.com/",
};

// S&P 100 constituents are used as the practical "top 100 US large-cap"
// universe. The index has 101 tickers because Alphabet has two share classes.
const TOP100_SYMBOLS = [
  "AAPL", "ABBV", "ABT", "ACN", "ADBE", "AMAT", "AMD", "AMGN", "AMT", "AMZN",
  "AVGO", "AXP", "BA", "BAC", "BKNG", "BLK", "BMY", "BNY", "BRK.B", "BRK-B",
  "C", "CAT", "CL", "CMCSA", "COF", "COP", "COST", "CRM", "CSCO", "CVS",
  "CVX", "DE", "DHR", "DIS", "DUK", "EMR", "FDX", "GD", "GE", "GEV",
  "GILD", "GM", "GOOG", "GOOGL", "GS", "HD", "HON", "IBM", "INTC", "INTU",
  "ISRG", "JNJ", "JPM", "KO", "LIN", "LLY", "LMT", "LOW", "LRCX", "MA",
  "MCD", "MDLZ", "MDT", "META", "MMM", "MO", "MRK", "MS", "MSFT", "MU",
  "NEE", "NFLX", "NKE", "NOW", "NVDA", "ORCL", "PEP", "PFE", "PG", "PLTR",
  "PM", "QCOM", "RTX", "SBUX", "SCHW", "SO", "SPG", "T", "TMO", "TMUS",
  "TSLA", "TXN", "UBER", "UNH", "UNP", "UPS", "USB", "V", "VZ", "WFC",
  "WMT", "XOM",
];

const TOP100_SET = new Set(TOP100_SYMBOLS);
const TOP100_RANK = new Map(TOP100_SYMBOLS.map((symbol, index) => [symbol, index]));

const IMPACT_MAP: Record<string, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
  Holiday: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function fetchText(
  url: string,
  referer = "https://www.alphavantage.co/"
) {
  const isNasdaq = referer.includes("nasdaq.com");
  const isTradingView = referer.includes("tradingview.com");
  const requestHeaders: Record<string, string> = {
    "User-Agent": HEADERS["User-Agent"],
    Accept:
      isNasdaq || isTradingView
        ? "application/json, text/plain, */*"
        : "application/json, text/csv, text/plain, */*",
    Referer: referer,
  };
  if (isNasdaq || isTradingView) {
    requestHeaders.Origin = isNasdaq
      ? "https://www.nasdaq.com"
      : "https://www.tradingview.com";
    requestHeaders["Accept-Language"] = "en-US,en;q=0.9";
    requestHeaders["Cache-Control"] = "no-cache";
  }

  try {
    const response = await fetch(url, {
      headers: requestHeaders,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Request returned ${response.status}`);
    return response.text();
  } catch {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sS",
        "-L",
        "--max-time",
        "15",
        "-A",
        HEADERS["User-Agent"],
        "-H",
        `Accept: ${requestHeaders.Accept}`,
        "-H",
        `Referer: ${referer}`,
        ...(requestHeaders.Origin
          ? [
              "-H",
              `Origin: ${requestHeaders.Origin}`,
              "-H",
              "Accept-Language: en-US,en;q=0.9",
            ]
          : []),
        url,
      ],
      { timeout: 18000 }
    );
    return stdout;
  }
}

function parseCsvLine(line: string) {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cols.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cols.push(current);
  return cols.map(col => col.trim());
}

function normalizeEarningsSymbol(symbol: string) {
  return symbol
    .trim()
    .toUpperCase()
    .replace("/", ".")
    .replace("BRK-B", "BRK.B");
}

function toUtc8Display(isoWithOffset: string): string {
  try {
    const d = new Date(isoWithOffset);
    if (isNaN(d.getTime())) return isoWithOffset.slice(0, 16).replace("T", " ");
    return d.toLocaleString("en-US", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return isoWithOffset.slice(0, 16).replace("T", " ");
  }
}

interface RawForexEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

export interface RawTradingViewEvent {
  id?: string | number;
  title?: string;
  country?: string;
  date?: string;
  importance?: number;
  actual?: string | number | null;
  previous?: string | number | null;
  forecast?: string | number | null;
  unit?: string | null;
  scale?: string | null;
}

interface TradingViewCalendarResponse {
  result?: RawTradingViewEvent[];
}

interface EconEvent {
  id: string;
  dateRaw: string;
  dateUtc8: string;
  dateIso: string;
  event: string;
  impact: string;
  importance: number;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  valueExpected: boolean;
}

export interface EconomicCalendarWindow {
  start: Date;
  endExclusive: Date;
}

function utc8DateParts(now: Date) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function utc8Midnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - 8 * 60 * 60 * 1000);
}

export function getEconomicCalendarWindow(
  range: "week" | "month",
  now = new Date()
): EconomicCalendarWindow {
  const { year, month, day, weekday } = utc8DateParts(now);

  if (range === "month") {
    return {
      start: utc8Midnight(year, month, 1),
      endExclusive: utc8Midnight(year, month + 1, 1),
    };
  }

  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return {
    start: utc8Midnight(year, month, day + mondayOffset),
    endExclusive: utc8Midnight(year, month, day + mondayOffset + 7),
  };
}

function compactNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(4)));
}

export function formatEconomicValue(
  value: string | number | null | undefined,
  unit?: string | null,
  scale?: string | null
) {
  if (value === null || value === undefined) return null;
  const base = typeof value === "number" ? compactNumber(value) : value.trim();
  if (!base || base === "-") return null;

  let formatted = base;
  if (scale && !formatted.toUpperCase().endsWith(scale.toUpperCase())) {
    formatted += scale;
  }
  if (unit && !formatted.toLowerCase().endsWith(unit.toLowerCase())) {
    formatted += unit;
  }
  return formatted;
}

function normalizeTradingViewImportance(value: number | undefined) {
  if (value === 1) return 3;
  if (value === 0) return 2;
  return 1;
}

function impactLabel(importance: number) {
  if (importance === 3) return "High";
  if (importance === 2) return "Medium";
  return "Low";
}

export function normalizeTradingViewEvents(
  rawEvents: RawTradingViewEvent[],
  window: EconomicCalendarWindow
): EconEvent[] {
  return rawEvents
    .filter(event => {
      if (event.country?.toUpperCase() !== "US" || !event.date || !event.title)
        return false;
      const timestamp = new Date(event.date).getTime();
      return (
        Number.isFinite(timestamp) &&
        timestamp >= window.start.getTime() &&
        timestamp < window.endExclusive.getTime()
      );
    })
    .map(event => {
      const date = new Date(event.date!);
      const importance = normalizeTradingViewImportance(event.importance);
      const actual = formatEconomicValue(event.actual, event.unit, event.scale);
      const forecast = formatEconomicValue(
        event.forecast,
        event.unit,
        event.scale
      );
      const previous = formatEconomicValue(
        event.previous,
        event.unit,
        event.scale
      );
      return {
        id: String(event.id ?? `${event.date}-${event.title}`),
        dateRaw: event.date!,
        dateUtc8: toUtc8Display(event.date!),
        dateIso: date.toISOString(),
        event: event.title!,
        impact: impactLabel(importance),
        importance,
        forecast,
        previous,
        actual,
        valueExpected: [
          actual,
          forecast,
          previous,
          event.unit,
          event.scale,
        ].some(value => value !== null && value !== undefined && value !== ""),
      };
    })
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

interface EarningsEvent {
  symbol: string;
  name: string;
  reportDate: string;
  estimate: string | null;
  currency: string;
  timeOfDay: string | null;
  timeOfDayUtc8: string | null;
  priorityRank: number;
}

function getUtc8DateWindow(days: number) {
  const startMs = Date.now() + 8 * 60 * 60 * 1000;
  const dates: string[] = [];
  for (let i = 0; i <= days; i++) {
    dates.push(
      new Date(startMs + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    );
  }
  return {
    start: dates[0],
    end: dates[dates.length - 1],
    dates,
  };
}

function normalizeTimeOfDay(value: string | null | undefined) {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  if (!lower || lower === "time-not-supplied" || lower === "not supplied")
    return null;
  if (lower.includes("pre") || lower.includes("before")) return "pre-market";
  if (lower.includes("post") || lower.includes("after")) return "post-market";
  return value.trim();
}

function describeUtc8Time(timeOfDay: string | null) {
  if (timeOfDay === "pre-market" || timeOfDay === "before-open") {
    return "盘前 (UTC+8 ~21:30 前一日)";
  }
  if (timeOfDay === "post-market" || timeOfDay === "after-close") {
    return "盘后 (UTC+8 ~04:00 次日)";
  }
  return timeOfDay;
}

function sortAndLimitEarnings(results: EarningsEvent[]) {
  const deduped = new Map<string, EarningsEvent>();
  for (const item of results) {
    deduped.set(`${item.symbol}-${item.reportDate}`, item);
  }

  return Array.from(deduped.values())
    .sort((a, b) => {
      const rankCmp = a.priorityRank - b.priorityRank;
      if (rankCmp !== 0) return rankCmp;
      const dateCmp = a.reportDate.localeCompare(b.reportDate);
      return dateCmp !== 0 ? dateCmp : a.symbol.localeCompare(b.symbol);
    })
    .slice(0, 100)
    .sort((a, b) => {
      const dateCmp = a.reportDate.localeCompare(b.reportDate);
      if (dateCmp !== 0) return dateCmp;
      const rankCmp = a.priorityRank - b.priorityRank;
      return rankCmp !== 0 ? rankCmp : a.symbol.localeCompare(b.symbol);
    });
}

async function fetchNasdaqEarningsFallback(
  dates: string[]
): Promise<EarningsEvent[]> {
  const results: EarningsEvent[] = [];

  for (const date of dates) {
    const url = `https://api.nasdaq.com/api/calendar/earnings?date=${encodeURIComponent(date)}`;
    let parsed: any;
    try {
      const text = await fetchText(
        url,
        "https://www.nasdaq.com/market-activity/earnings"
      );
      parsed = JSON.parse(text);
    } catch {
      continue;
    }

    const rows = parsed?.data?.rows;
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      const symbol = normalizeEarningsSymbol(String(row?.symbol ?? ""));
      if (!symbol || !TOP100_SET.has(symbol)) continue;

      const timeOfDay = normalizeTimeOfDay(row?.time);
      results.push({
        symbol,
        name: String(row?.name ?? symbol).trim() || symbol,
        reportDate: date,
        estimate:
          String(row?.epsForecast ?? row?.epsForecastDollar ?? "")
            .replace(/^\$/, "")
            .trim() || null,
        currency: "USD",
        timeOfDay,
        timeOfDayUtc8: describeUtc8Time(timeOfDay),
        priorityRank: TOP100_RANK.get(symbol) ?? 9999,
      });
    }
  }

  console.log(
    `[EarningsCalendar] Nasdaq fallback rows=${results.length} dates=${dates[0]}..${dates[dates.length - 1]}`
  );
  return results;
}

async function fetchForexFactoryWeek(
  week: "thisweek" | "nextweek"
): Promise<RawForexEvent[]> {
  const url = `https://nfs.faireconomy.media/ff_calendar_${week}.json`;

  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    if (week === "nextweek" && res.status === 404) {
      return [];
    }
    throw new Error(`ForexFactory API returned ${res.status}`);
  }

  return res.json() as Promise<RawForexEvent[]>;
}

async function fetchTradingViewCalendar(window: EconomicCalendarWindow) {
  const params = new URLSearchParams({
    from: window.start.toISOString(),
    to: window.endExclusive.toISOString(),
    countries: "US",
  });
  const url = `https://economic-calendar.tradingview.com/events?${params.toString()}`;
  const text = await fetchText(
    url,
    "https://www.tradingview.com/economic-calendar/"
  );
  const response = JSON.parse(text) as TradingViewCalendarResponse;
  if (!Array.isArray(response.result)) {
    throw new Error(
      "TradingView economic calendar returned an invalid payload"
    );
  }
  return response.result;
}

function normalizeForexFactoryEvents(
  rawEvents: RawForexEvent[],
  window: EconomicCalendarWindow
): EconEvent[] {
  const textOrNull = (value?: string) => {
    const normalized = value?.trim();
    if (!normalized) return null;
    return normalized;
  };

  return rawEvents
    .filter(event => {
      if (event.country?.toUpperCase() !== "USD") return false;
      const level = IMPACT_MAP[event.impact] ?? 0;
      if (level < 1) return false;

      const timestamp = new Date(event.date).getTime();
      return (
        Number.isFinite(timestamp) &&
        timestamp >= window.start.getTime() &&
        timestamp < window.endExclusive.getTime()
      );
    })
    .map(event => {
      const date = new Date(event.date);
      const forecast = textOrNull(event.forecast);
      const previous = textOrNull(event.previous);
      const actual = textOrNull(event.actual);
      return {
        id: `${event.date}-${event.title}`,
        dateRaw: event.date,
        dateUtc8: toUtc8Display(event.date),
        dateIso: date.toISOString(),
        event: event.title,
        impact: event.impact,
        importance: IMPACT_MAP[event.impact] ?? 1,
        forecast,
        previous,
        actual,
        valueExpected: [actual, forecast, previous].some(value => value !== null),
      };
    })
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const calendarRouter = router({
  /**
   * US economic events for the current week or full month.
   * Cached for 10 minutes so released values do not remain stale for long.
   */
  economicCalendar: publicProcedure
    .input(
      z.object({
        range: z.enum(["week", "month"]).optional().default("week"),
      })
    )
    .query(async ({ input }) => {
      const { range } = input;
      const CACHE_KEY = `economic_calendar_${range}`;
      const CACHE_TTL = 10 * 60 * 1000;

      const cached = getCached<EconEvent[]>(CACHE_KEY);
      if (cached) {
        return cached;
      }

      const window = getEconomicCalendarWindow(range);
      let events: EconEvent[];

      try {
        const rawEvents = await fetchTradingViewCalendar(window);
        events = normalizeTradingViewEvents(rawEvents, window);
      } catch (error) {
        if (range === "month") {
          console.error(
            "[EconomicCalendar] Full-month source unavailable",
            error
          );
          throw new Error("完整月份经济日历暂时不可用，请稍后重试", {
            cause: error,
          });
        }
        console.warn(
          "[EconomicCalendar] TradingView unavailable; using weekly fallback",
          error
        );
        const rawEvents = await fetchForexFactoryWeek("thisweek");
        events = normalizeForexFactoryEvents(rawEvents, window);
      }

      setCached(CACHE_KEY, events, CACHE_TTL);
      return events;
    }),

  /**
   * Top 50 US stocks earnings calendar for the next 7 days
   * Cached for 60 minutes
   */
  earningsCalendar: publicProcedure.query(async () => {
    const CACHE_KEY = "earnings_calendar_7d_v3";
    const CACHE_TTL = 60 * 60 * 1000; // 60 minutes

    const cached = getCached<unknown[]>(CACHE_KEY);
    if (cached) return cached;

    const { start: utc8Today, end: utc8End, dates } = getUtc8DateWindow(7);
    let results: EarningsEvent[] = [];

    try {
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "demo";
      const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${encodeURIComponent(apiKey)}`;
      const text = await fetchText(url);
      const normalizedText = text.trim();

      if (normalizedText && !normalizedText.startsWith("{")) {
        const lines = normalizedText.split(/\r?\n/);
        const headerCols = parseCsvLine(lines[0]);
        const symbolIdx = headerCols.indexOf("symbol");
        const nameIdx = headerCols.indexOf("name");
        const reportDateIdx = headerCols.indexOf("reportDate");
        const estimateIdx = headerCols.indexOf("estimate");
        const currencyIdx = headerCols.indexOf("currency");
        const timeIdx = headerCols.indexOf("timeOfTheDay");

        if (symbolIdx >= 0 && reportDateIdx >= 0) {
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]);
            const symbol = normalizeEarningsSymbol(cols[symbolIdx] ?? "");
            const reportDateStr = cols[reportDateIdx]?.trim();
            if (!symbol || !reportDateStr) continue;
            if (!TOP100_SET.has(symbol)) continue;
            if (reportDateStr < utc8Today || reportDateStr > utc8End) continue;

            const timeOfDay = normalizeTimeOfDay(cols[timeIdx]);

            results.push({
              symbol,
              name: cols[nameIdx]?.trim() || symbol,
              reportDate: reportDateStr,
              estimate: cols[estimateIdx]?.trim() || null,
              currency: cols[currencyIdx]?.trim() || "USD",
              timeOfDay,
              timeOfDayUtc8: describeUtc8Time(timeOfDay),
              priorityRank: TOP100_RANK.get(symbol) ?? 9999,
            });
          }
        }
      }
    } catch {
      results = [];
    }

    console.log(
      `[EarningsCalendar] AlphaVantage rows in 7d window=${results.length} window=${utc8Today}..${utc8End}`
    );
    const topResults = sortAndLimitEarnings(
      results.length > 0 ? results : await fetchNasdaqEarningsFallback(dates)
    );
    console.log(`[EarningsCalendar] Returning rows=${topResults.length}`);

    setCached(CACHE_KEY, topResults, CACHE_TTL);
    return topResults;
  }),
});
