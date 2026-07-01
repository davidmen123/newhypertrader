/**
 * Calendar Router
 * - economicCalendar: US important economic events for the current week
 *   Source: ForexFactory free JSON API (nfs.faireconomy.media)
 *   Uses in-memory cache (30 min TTL) to avoid rate limiting (429)
 * - earningsCalendar: Top 50 US stocks earnings for the next 7 days
 *   Source: Alpha Vantage free API (no key required for demo)
 */
import { publicProcedure, router } from "../_core/trpc";

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
async function fetchText(url: string, referer = "https://www.alphavantage.co/") {
  const isNasdaq = referer.includes("nasdaq.com");
  const requestHeaders: Record<string, string> = {
    "User-Agent": HEADERS["User-Agent"],
    Accept: isNasdaq ? "application/json, text/plain, */*" : "application/json, text/csv, text/plain, */*",
    Referer: referer,
  };
  if (isNasdaq) {
    requestHeaders.Origin = "https://www.nasdaq.com";
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
  } catch (error) {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("curl", [
      "-sS",
      "-L",
      "--max-time", "15",
      "-A", HEADERS["User-Agent"],
      "-H", `Accept: ${requestHeaders.Accept}`,
      "-H", `Referer: ${referer}`,
      ...(isNasdaq ? ["-H", "Origin: https://www.nasdaq.com", "-H", "Accept-Language: en-US,en;q=0.9"] : []),
      url,
    ], { timeout: 18000 });
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
    if (char === "\"" && next === "\"") {
      current += "\"";
      i++;
      continue;
    }
    if (char === "\"") {
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
  return cols.map((col) => col.trim());
}

function normalizeEarningsSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace("/", ".").replace("BRK-B", "BRK.B");
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
    dates.push(new Date(startMs + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
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
  if (!lower || lower === "time-not-supplied" || lower === "not supplied") return null;
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

async function fetchNasdaqEarningsFallback(dates: string[]): Promise<EarningsEvent[]> {
  const results: EarningsEvent[] = [];

  for (const date of dates) {
    const url = `https://api.nasdaq.com/api/calendar/earnings?date=${encodeURIComponent(date)}`;
    let parsed: any;
    try {
      const text = await fetchText(url, "https://www.nasdaq.com/market-activity/earnings");
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
        estimate: String(row?.epsForecast ?? row?.epsForecastDollar ?? "").replace(/^\$/, "").trim() || null,
        currency: "USD",
        timeOfDay,
        timeOfDayUtc8: describeUtc8Time(timeOfDay),
        priorityRank: TOP100_RANK.get(symbol) ?? 9999,
      });
    }
  }

  console.log(`[EarningsCalendar] Nasdaq fallback rows=${results.length} dates=${dates[0]}..${dates[dates.length - 1]}`);
  return results;
}

async function fetchForexFactoryRaw(): Promise<RawForexEvent[]> {
  // Only thisweek is reliably available; nextweek returns 404
  const url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`ForexFactory API returned ${res.status}`);
  }

  return res.json() as Promise<RawForexEvent[]>;
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const calendarRouter = router({
  /**
   * US important economic events for the current week
   * Cached for 30 minutes to avoid rate limiting
   */
  economicCalendar: publicProcedure.query(async () => {
    const CACHE_KEY = "economic_calendar_thisweek";
    const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

    // Try cache first
    const cached = getCached<EconEvent[]>(CACHE_KEY);
    if (cached) {
      return cached;
    }

    // Fetch fresh data
    const rawEvents = await fetchForexFactoryRaw();

    // Filter: USD only, Medium+ impact, within next 7 days from today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysLater = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const filtered: EconEvent[] = rawEvents
      .filter((e) => {
        if (!e.country || e.country.toUpperCase() !== "USD") return false;
        const level = IMPACT_MAP[e.impact] ?? 0;
        if (level < 1) return false; // exclude Holiday and Low by default (frontend can filter further)

        const d = new Date(e.date);
        if (isNaN(d.getTime())) return false;
        if (d < todayStart || d > sevenDaysLater) return false;

        return true;
      })
      .map((e) => {
        const d = new Date(e.date);
        return {
          id: `${e.date}-${e.title}`,
          dateRaw: e.date,
          dateUtc8: toUtc8Display(e.date),
          dateIso: d.toISOString(),
          event: e.title,
          impact: e.impact,
          importance: IMPACT_MAP[e.impact] ?? 1,
          forecast: e.forecast || null,
          previous: e.previous || null,
          actual: e.actual || null,
        };
      })
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    setCached(CACHE_KEY, filtered, CACHE_TTL);
    return filtered;
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

    console.log(`[EarningsCalendar] AlphaVantage rows in 7d window=${results.length} window=${utc8Today}..${utc8End}`);
    const topResults = sortAndLimitEarnings(
      results.length > 0 ? results : await fetchNasdaqEarningsFallback(dates)
    );
    console.log(`[EarningsCalendar] Returning rows=${topResults.length}`);

    setCached(CACHE_KEY, topResults, CACHE_TTL);
    return topResults;
  }),
});
