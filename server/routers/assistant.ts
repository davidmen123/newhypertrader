import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { ownerProcedure, router } from "../_core/trpc.js";
import { ENV } from "../_core/env.js";
import { getDb } from "../db.js";
import { assistantWatchlist } from "../../drizzle/schema.js";

type EarningsItem = {
  symbol: string;
  name: string;
  reportDate: string;
  timeOfDay: string | null;
  timeOfDayUtc8: string | null;
};

type NewsItem = { title: string; link: string; publishedAt: string | null; source: string };
export type AssistantMonitorItem = {
  symbol: string;
  note: string | null;
  priority: string;
  earnings: EarningsItem | null;
  news: NewsItem[];
};

const monitorCache = new Map<string, { expiresAt: number; value: AssistantMonitorItem }>();
const CACHE_MS = 30 * 60 * 1000;

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

async function fetchNews(symbol: string): Promise<NewsItem[]> {
  const text = await fetchText(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`, { Accept: "application/rss+xml, application/xml, text/xml" });
  const items: NewsItem[] = [];
  for (const block of text.match(/<item>[\s\S]*?<\/item>/gi) ?? []) {
    const title = cleanXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link = cleanXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
    const pubDate = cleanXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
    if (!title || !link) continue;
    items.push({ title, link, publishedAt: pubDate || null, source: "Yahoo Finance" });
    if (items.length >= 5) break;
  }
  return items;
}

async function getMonitorItem(item: { symbol: string; priority: string; note: string | null }): Promise<AssistantMonitorItem> {
  const cached = monitorCache.get(item.symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const [earnings, news] = await Promise.allSettled([fetchEarnings(item.symbol), fetchNews(item.symbol)]);
  const value: AssistantMonitorItem = { symbol: item.symbol, priority: item.priority, note: item.note, earnings: earnings.status === "fulfilled" ? earnings.value : null, news: news.status === "fulfilled" ? news.value : [] };
  monitorCache.set(item.symbol, { expiresAt: Date.now() + CACHE_MS, value });
  return value;
}

async function readWatchlist() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assistantWatchlist).orderBy(desc(assistantWatchlist.createdAt));
}

async function sendDigestEmail(items: AssistantMonitorItem[], subject: string): Promise<boolean> {
  if (!ENV.resendApiKey || items.length === 0) return false;
  const lines = items.flatMap((item) => {
    const earnings = item.earnings ? `财报：${item.earnings.reportDate} ${item.earnings.timeOfDayUtc8 ?? ""}` : "财报：未来 31 天未找到已发布日期";
    const news = item.news.length > 0 ? item.news.slice(0, 3).map((entry) => `- ${entry.title}\n  ${entry.link}`).join("\n") : "暂无新闻摘要";
    return [`【${item.symbol}】${item.note ? `（${item.note}）` : ""}`, earnings, "相关新闻：", news, ""];
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
  list: ownerProcedure.query(() => readWatchlist()),
  monitor: ownerProcedure.query(async () => {
    const rows = await readWatchlist();
    return Promise.all(rows.map((row: any) => getMonitorItem(row)));
  }),
  add: ownerProcedure.input(z.object({ symbol: z.string().trim().min(1).max(32), priority: z.enum(["高", "中", "低"]).default("中"), note: z.string().trim().max(200).optional() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const symbol = input.symbol.toUpperCase();
    const [row] = await db.insert(assistantWatchlist).values({ symbol, priority: input.priority, note: input.note || null }).onConflictDoUpdate({ target: assistantWatchlist.symbol, set: { priority: input.priority, note: input.note || null, updatedAt: new Date() } }).returning();
    monitorCache.delete(symbol);
    return row;
  }),
  remove: ownerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
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
