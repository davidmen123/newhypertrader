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

function cleanXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": "PnLNote/1.0", ...headers }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.text();
}

async function fetchEarnings(symbol: string): Promise<EarningsItem | null> {
  const today = utc8DateString();
  for (let offset = 0; offset < 31; offset += 1) {
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
  if (!ENV.forgeApiKey) {
    console.warn("[Assistant] Chinese news summary unavailable: BUILT_IN_FORGE_API_KEY is not configured");
    return fallback;
  }
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是财经新闻编辑。把英文新闻标题改写成准确、客观、简洁的中文摘要。每条摘要不超过50个中文字符，不添加标题中没有的事实。只输出一个JSON对象，格式为{\"summaries\":[{\"index\":0,\"summary\":\"中文摘要\"}]}，不要输出Markdown代码块或其他文字。" },
        { role: "user", content: JSON.stringify(items.map((item, index) => ({ index, title: item.title }))) },
      ],
      responseFormat: { type: "json_object" },
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
      return { ...item, summaryZh: summary ? Array.from(summary).slice(0, 50).join("") : "中文摘要暂不可用" };
    });
  } catch (error) {
    console.warn("[Assistant] Chinese news summary unavailable:", error);
    return fallback;
  }
}

async function fetchNews(symbol: string): Promise<NewsItem[]> {
  const text = await fetchText(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`, { Accept: "application/rss+xml, application/xml, text/xml" });
  const items: Array<Omit<NewsItem, "summaryZh">> = [];
  for (const block of text.match(/<item>[\s\S]*?<\/item>/gi) ?? []) {
    const title = cleanXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link = cleanXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
    const pubDate = cleanXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
    if (!title || !link) continue;
    items.push({ title, link, publishedAt: pubDate || null, source: "Yahoo Finance" });
    if (items.length >= 5) break;
  }
  return summarizeNews(items);
}

async function getMonitorItem(item: { symbol: string; companyName: string | null; exchange: string | null; priority: string; note: string | null }): Promise<AssistantMonitorItem> {
  const cached = monitorCache.get(item.symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const [earnings, news] = await Promise.allSettled([fetchEarnings(item.symbol), fetchNews(item.symbol)]);
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
    const earnings = item.earnings ? `财报：${item.earnings.reportDate} ${item.earnings.timeOfDayUtc8 ?? ""}` : "财报：未来 31 天未找到已发布日期";
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
  add: ownerProcedure.input(z.object({ symbol: z.string().trim().min(1).max(32), companyName: z.string().trim().min(1).max(160), exchange: z.string().trim().min(1).max(64), assetType: z.string().trim().min(1).max(32), priority: z.enum(["高", "中", "低"]).default("中"), note: z.string().trim().max(200).optional() })).mutation(async ({ input }) => {
    await ensureAssistantSchema();
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const symbol = input.symbol.toUpperCase();
    const [row] = await db.insert(assistantWatchlist).values({ symbol, companyName: input.companyName, exchange: input.exchange, assetType: input.assetType, priority: input.priority, note: input.note || null }).onConflictDoUpdate({ target: assistantWatchlist.symbol, set: { companyName: input.companyName, exchange: input.exchange, assetType: input.assetType, priority: input.priority, note: input.note || null, updatedAt: new Date() } }).returning();
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
