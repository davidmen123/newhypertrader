import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { ownerProcedure, router } from "../_core/trpc.js";
import { ENV } from "../_core/env.js";
import { getDb } from "../db.js";
import { assistantWatchlist } from "../../drizzle/schema.js";
import { invokeLLM } from "../_core/llm.js";

type EarningsItem = {
  symbol: string;
  name: string;
  reportDate: string;
  timeOfDay: string | null;
  timeOfDayUtc8: string | null;
};

type NewsItem = { title: string; summaryZh: string; link: string; publishedAt: string | null; source: string };
export type AssistantMonitorItem = {
  symbol: string;
  companyName: string | null;
  exchange: string | null;
  note: string | null;
  priority: string;
  earnings: EarningsItem | null;
  news: NewsItem[];
};

const monitorCache = new Map<string, { expiresAt: number; value: AssistantMonitorItem }>();
const CACHE_MS = 30 * 60 * 1000;
const NEWS_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
let assistantSchemaReady: Promise<void> | null = null;

async function ensureAssistantSchema(): Promise<void> {
  if (assistantSchemaReady) return assistantSchemaReady;
  assistantSchemaReady = (async () => {
    const db = await getDb();
    if (!db) return;
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS assistant_watchlist (
        id SERIAL PRIMARY KEY,
        symbol varchar(32) NOT NULL UNIQUE,
        companyname varchar(160),
        exchange varchar(64),
        assettype varchar(32),
        priority varchar(8) NOT NULL DEFAULT '中',
        note text,
        emailenabled boolean NOT NULL DEFAULT TRUE,
        lastdigestdate varchar(16),
        createdat timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedat timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));
    await db.execute(sql`ALTER TABLE assistant_watchlist ADD COLUMN IF NOT EXISTS companyname varchar(160)`).catch(() => {});
    await db.execute(sql`ALTER TABLE assistant_watchlist ADD COLUMN IF NOT EXISTS exchange varchar(64)`).catch(() => {});
    await db.execute(sql`ALTER TABLE assistant_watchlist ADD COLUMN IF NOT EXISTS assettype varchar(32)`).catch(() => {});
    await db.execute(sql`ALTER TABLE assistant_watchlist ADD COLUMN IF NOT EXISTS technicalstate varchar(32)`).catch(() => {});
    await db.execute(sql`ALTER TABLE assistant_watchlist ADD COLUMN IF NOT EXISTS observationperiods text`).catch(() => {});
    await db.execute(sql`ALTER TABLE assistant_watchlist ADD COLUMN IF NOT EXISTS keycondition text`).catch(() => {});
  })().catch((error) => {
    assistantSchemaReady = null;
    throw error;
  });
  return assistantSchemaReady;
}

function utc8DateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return utc8DateString(date);
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": "PnLNote/1.0", ...headers }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.text();
}

function cleanXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
}

async function fetchEarnings(symbol: string): Promise<EarningsItem | null> {
  const today = utc8DateString();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(today, offset);
    try {
      const text = await fetchText(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, { Accept: "application/json, text/plain, */*", Referer: "https://www.nasdaq.com/market-activity/earnings" });
      const rows = JSON.parse(text)?.data?.rows;
      if (!Array.isArray(rows)) continue;
      const row = rows.find((item: any) => String(item?.symbol ?? "").trim().toUpperCase() === symbol);
      if (!row) continue;
      const time = String(row?.time ?? "").trim().toLowerCase();
      const timeOfDay = time.includes("after") || time.includes("close") ? "after-close" : time.includes("before") || time.includes("open") ? "before-open" : null;
      return { symbol, name: String(row?.name ?? symbol).trim() || symbol, reportDate: date, timeOfDay, timeOfDayUtc8: timeOfDay === "after-close" ? "盘后" : timeOfDay === "before-open" ? "盘前" : null };
    } catch {
      // Continue with the next date; one upstream failure should not abort the monitor.
    }
  }
  return null;
}

async function summarizeNews(items: Array<Omit<NewsItem, "summaryZh">>): Promise<NewsItem[]> {
  if (items.length === 0) return [];
  const fallback = items.map((item) => ({ ...item, summaryZh: "中文摘要暂不可用" }));
  const newsProvider = ENV.newsLlmApiKey && ENV.newsLlmBaseUrl ? {
    apiKey: ENV.newsLlmApiKey,
    baseUrl: ENV.newsLlmBaseUrl,
    model: ENV.newsLlmModel,
  } : undefined;
  if (!newsProvider && !ENV.forgeApiKey) {
    console.warn("[Assistant] Chinese news summary unavailable: neither NEWS_LLM_API_KEY nor BUILT_IN_FORGE_API_KEY is configured");
    return fallback;
  }
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是财经新闻编辑。把英文新闻标题改写成准确、客观、简洁的中文概况。每条概况尽量控制在50到100个中文字符；如果标题信息不足，可以少于50字，但不能为了凑字数添加标题中没有的事实。只输出一个JSON对象，格式为{\"summaries\":[{\"index\":0,\"summary\":\"中文概况\"}]}，不要输出Markdown代码块或其他文字。" },
        { role: "user", content: JSON.stringify(items.map((item, index) => ({ index, title: item.title }))) },
      ],
      responseFormat: { type: "json_object" },
      provider: newsProvider,
    });
    const content = response.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("")
      : content ?? "";
    const normalizedText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed: unknown = JSON.parse(normalizedText);
    const summaries = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "summaries" in parsed ? parsed.summaries : null);
    if (!Array.isArray(summaries)) throw new Error("LLM response did not contain a summaries array");
    return items.map((item, index) => {
      const summary = String(summaries.find((entry: any) => Number(entry?.index) === index)?.summary ?? "").trim();
      return { ...item, summaryZh: summary ? Array.from(summary).slice(0, 100).join("") : "中文摘要暂不可用" };
    });
  } catch (error) {
    console.warn("[Assistant] Chinese news summary unavailable:", error);
    return fallback;
  }
}

function newsMatchesCompany(news: any, symbol: string, companyName: string): boolean {
  const symbolKey = symbol.split(/[.:-]/)[0].toLowerCase();
  const companyKey = companyName.toLowerCase().replace(/[,.'’]/g, " ").replace(/\b(inc|incorporated|corp|corporation|company|co|ltd|limited|plc)\b/g, " ").replace(/\s+/g, " ").trim();
  const title = String(news?.title ?? "").toLowerCase();
  const relatedTickers = Array.isArray(news?.relatedTickers) ? news.relatedTickers.map((value: unknown) => String(value).toLowerCase()) : [];
  if (relatedTickers.some((ticker: string) => ticker === symbol.toLowerCase() || ticker.split(/[.:-]/)[0] === symbolKey)) return true;
  const companyWords = companyKey.split(" ").filter((word) => word.length >= 3);
  return companyWords.length > 0 && companyWords.some((word) => title.includes(word));
}

async function fetchNews(item: { symbol: string; companyName: string | null }): Promise<NewsItem[]> {
  const companyName = item.companyName?.trim() || item.symbol;
  const cutoff = Date.now() - NEWS_LOOKBACK_MS;
  const items: Array<Omit<NewsItem, "summaryZh">> = [];
  const seenLinks = new Set<string>();

  try {
    const query = encodeURIComponent(companyName);
    const text = await fetchText(`https://query1.finance.yahoo.com/v1/finance/search?q=${query}&quotesCount=0&newsCount=10`, { Accept: "application/json, text/plain, */*" });
    const news = JSON.parse(text)?.news;
    for (const entry of Array.isArray(news) ? news : []) {
      if (!newsMatchesCompany(entry, item.symbol, companyName)) continue;
      const title = String(entry?.title ?? "").trim();
      const link = String(entry?.link ?? "").trim();
      const publishedAt = Number(entry?.providerPublishTime);
      const publishedMs = Number.isFinite(publishedAt) ? publishedAt * 1000 : 0;
      if (!title || !link || !publishedMs || publishedMs < cutoff || seenLinks.has(link)) continue;
      seenLinks.add(link);
      items.push({ title, link, publishedAt: new Date(publishedMs).toISOString(), source: String(entry?.publisher ?? "Yahoo Finance") });
    }
  } catch (error) {
    console.warn(`[Assistant] Yahoo news unavailable for ${item.symbol}:`, error);
  }

  try {
    const symbolKey = item.symbol.split(/[.:-]/)[0];
    const companyKey = companyName.split(/\s+/)[0];
    const query = encodeURIComponent(`"${symbolKey}" OR "${companyKey}"`);
    const text = await fetchText(`https://news.google.com/rss/search?q=${query}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`, { Accept: "application/rss+xml, application/xml, text/xml" });
    for (const block of text.match(/<item>[\s\S]*?<\/item>/gi) ?? []) {
      const title = cleanXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const link = cleanXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
      const pubDate = cleanXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
      const publishedMs = Date.parse(pubDate);
      if (!title || !link || !publishedMs || publishedMs < cutoff || seenLinks.has(link)) continue;
      seenLinks.add(link);
      items.push({ title, link, publishedAt: new Date(publishedMs).toISOString(), source: "Google 新闻" });
    }
  } catch (error) {
    console.warn(`[Assistant] Google news unavailable for ${item.symbol}:`, error);
  }

  items.sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime());
  return summarizeNews(items.slice(0, 5));
}

async function getMonitorItem(item: { symbol: string; companyName: string | null; exchange: string | null; priority: string; note: string | null }): Promise<AssistantMonitorItem> {
  const cached = monitorCache.get(item.symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const [earnings, news] = await Promise.allSettled([fetchEarnings(item.symbol), fetchNews(item)]);
  const value: AssistantMonitorItem = { symbol: item.symbol, companyName: item.companyName, exchange: item.exchange, priority: item.priority, note: item.note, earnings: earnings.status === "fulfilled" ? earnings.value : null, news: news.status === "fulfilled" ? news.value : [] };
  monitorCache.set(item.symbol, { expiresAt: Date.now() + CACHE_MS, value });
  return value;
}

async function readWatchlist() {
  await ensureAssistantSchema();
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assistantWatchlist).orderBy(desc(assistantWatchlist.createdAt));
}

async function sendDigestEmail(items: AssistantMonitorItem[], subject: string): Promise<boolean> {
  if (!ENV.resendApiKey || items.length === 0) return false;
  const lines = items.flatMap((item) => {
    const earnings = item.earnings ? `财报：${item.earnings.reportDate} ${item.earnings.timeOfDayUtc8 ?? ""}` : "财报：未来 7 天未找到已发布日期";
    return [`【${item.symbol}】${item.note ? `（${item.note}）` : ""}`, earnings, "相关新闻请登录网页端个人助手查看。", ""];
  });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${ENV.resendApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: "PnLNote 个人助手 <onboarding@resend.dev>", to: [ENV.feedbackTo], subject, text: [`时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`, "", ...lines].join("\n") }),
      signal: AbortSignal.timeout(15000),
    });
    return response.ok;
  } catch (error) {
    console.error("[Assistant] Email delivery failed:", error);
    return false;
  }
}

export async function runAssistantDailyDigest(now = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const today = utc8DateString(now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false }).format(now));
  if (hour !== 9) return;
  const rows = await readWatchlist();
  const pending = rows.filter((row: any) => row.emailEnabled && row.lastDigestDate !== today);
  if (pending.length === 0) return;
  const items = await Promise.all(pending.map((row: any) => getMonitorItem(row)));
  const reminders = items.filter((item) => {
    if (!item.earnings) return false;
    const days = Math.round((new Date(`${item.earnings.reportDate}T00:00:00+08:00`).getTime() - new Date(`${today}T00:00:00+08:00`).getTime()) / 86400000);
    return days >= 0 && days <= 3;
  });
  const subject = reminders.length > 0 ? `【PnLNote】关注标的财报提醒：${reminders.map((item) => item.symbol).join("、")}` : "【PnLNote】个人助手每日关注摘要";
  if (await sendDigestEmail(items, subject)) {
    await Promise.all(pending.map((row: any) => db.update(assistantWatchlist).set({ lastDigestDate: today, updatedAt: now }).where(eq(assistantWatchlist.id, row.id))));
  }
}

export const assistantRouter = router({
  search: ownerProcedure.input(z.object({ query: z.string().trim().min(1).max(80) })).query(async ({ input }) => {
    const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(input.query)}&quotesCount=10&newsCount=0`, { headers: { "User-Agent": "PnLNote/1.0" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Symbol search failed: ${response.status}`);
    const quotes = (await response.json())?.quotes;
    if (!Array.isArray(quotes)) return [];
    return quotes
      .filter((quote: any) => ["EQUITY", "ETF"].includes(String(quote?.quoteType ?? "").toUpperCase()) && quote?.symbol)
      .slice(0, 8)
      .map((quote: any) => ({
        symbol: String(quote.symbol).toUpperCase(),
        companyName: String(quote.longname ?? quote.shortname ?? quote.symbol).trim(),
        exchange: String(quote.fullExchangeName ?? quote.exchange ?? "").trim() || "未知交易所",
        assetType: String(quote.quoteType ?? "EQUITY").toUpperCase(),
      }));
  }),
  list: ownerProcedure.query(() => readWatchlist()),
  monitor: ownerProcedure.query(async () => {
    const rows = await readWatchlist();
    return Promise.all(rows.map((row: any) => getMonitorItem(row)));
  }),
  refresh: ownerProcedure.mutation(async () => {
    monitorCache.clear();
    const rows = await readWatchlist();
    return Promise.all(rows.map((row: any) => getMonitorItem(row)));
  }),
  add: ownerProcedure.input(z.object({ symbol: z.string().trim().min(1).max(32), companyName: z.string().trim().min(1).max(160), exchange: z.string().trim().min(1).max(64), assetType: z.string().trim().min(1).max(32), priority: z.enum(["高", "中", "低"]).default("中"), technicalState: z.enum(["筑底中", "底部动能钝化", "趋势延续", "区间震荡", "即将突破", "等待回踩"]).optional(), observationPeriods: z.array(z.enum(["1H", "4H", "1D", "1W"])).max(4).default([]), keyCondition: z.string().trim().max(200).optional(), note: z.string().trim().max(200).optional() })).mutation(async ({ input }) => {
    await ensureAssistantSchema();
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const symbol = input.symbol.toUpperCase();
    const observationPeriods = JSON.stringify(input.observationPeriods);
    const [row] = await db.insert(assistantWatchlist).values({ symbol, companyName: input.companyName, exchange: input.exchange, assetType: input.assetType, priority: input.priority, technicalState: input.technicalState || null, observationPeriods, keyCondition: input.keyCondition || null, note: input.note || null }).onConflictDoUpdate({ target: assistantWatchlist.symbol, set: { companyName: input.companyName, exchange: input.exchange, assetType: input.assetType, priority: input.priority, technicalState: input.technicalState || null, observationPeriods, keyCondition: input.keyCondition || null, note: input.note || null, updatedAt: new Date() } }).returning();
    monitorCache.delete(symbol);
    return row;
  }),
  remove: ownerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    await ensureAssistantSchema();
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    await db.delete(assistantWatchlist).where(eq(assistantWatchlist.id, input.id));
    return { success: true };
  }),
  sendNow: ownerProcedure.mutation(async () => {
    const rows = await readWatchlist();
    const items = await Promise.all(rows.map((row: any) => getMonitorItem(row)));
    return { sent: await sendDigestEmail(items, "【PnLNote】个人助手关注标的摘要"), count: items.length };
  }),
});
