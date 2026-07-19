import { and, asc, desc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, InsertTrade, InsertPnlSnapshot, InsertVisitorLog, pnlSnapshots, trades, users, pageViews, visitorLogs } from "../drizzle/schema.js";
import { ENV } from './_core/env.js';
import { getIndexPrice } from './deribit.js';

// Visitor-analytics day boundaries are UTC+8 calendar days (Asia/Shanghai):
// the audience and the owner are in China, so "today" means 00:00–24:00 +08.
// The frontend sends plain "YYYY-MM-DD" bounds, so pin them to +08:00 here.
function startOfDayUtc8(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00.000+08:00`);
}
function endOfDayUtc8(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T23:59:59.999+08:00`);
}
// createdat is a naive timestamp stored as UTC wall-clock. Shift it to UTC+8
// wall-clock for day/hour bucketing so charts read in China local time.
const createdAtUtc8 = sql`(${visitorLogs.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai'`;

// Shared filter for all visitor stats: UTC+8 date bounds, and excluding the
// /analytics dashboard itself so the owner's own visits (and test pings sent
// from that page) never pollute the numbers. NULL pages stay included.
function visitorAnalyticsWhere(params?: { startDate?: string; endDate?: string }) {
  const conditions = [or(isNull(visitorLogs.page), ne(visitorLogs.page, "/analytics"))];
  if (params?.startDate) conditions.push(gte(visitorLogs.createdAt, startOfDayUtc8(params.startDate)));
  if (params?.endDate) conditions.push(lte(visitorLogs.createdAt, endOfDayUtc8(params.endDate)));
  return and(...conditions);
}

let _db: any = null;
let _pool: any = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      if (!_pool) {
        _pool = postgres(process.env.DATABASE_URL, {
          max: 10,
          idle_timeout: 30,
          connect_timeout: 10,
        });
      }
      _db = drizzle(_pool);
      console.log("[Database] Connection successful");
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet as any,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function upsertTrade(trade: InsertTrade): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(trades).values(trade).onConflictDoUpdate({
    target: trades.tradeId,
    set: {
      price: trade.price,
      profit: trade.profit,
      state: trade.state,
    },
  });
}

export async function upsertTrades(tradeList: InsertTrade[]): Promise<void> {
  if (tradeList.length === 0) return;
  for (const trade of tradeList) {
    await upsertTrade(trade);
  }
}

export async function getTradesFromDb(params: {
  currency?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { trades: [], total: 0 };

  const conditions = [];
  if (params.currency) conditions.push(eq(trades.currency, params.currency));
  if (params.startTimestamp) conditions.push(gte(trades.tradeTimestamp, params.startTimestamp));
  if (params.endTimestamp) conditions.push(lte(trades.tradeTimestamp, params.endTimestamp));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(trades)
      .where(whereClause),
    db
      .select()
      .from(trades)
      .where(whereClause)
      .orderBy(desc(trades.tradeTimestamp))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  return { trades: rows, total };
}

export async function upsertPnlSnapshot(snapshot: InsertPnlSnapshot): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(pnlSnapshots).values(snapshot).onConflictDoUpdate({
    target: [pnlSnapshots.currency, pnlSnapshots.date],
    set: {
      equity: snapshot.equity,
      balance: snapshot.balance,
      unrealizedPnl: snapshot.unrealizedPnl,
      sessionPnl: snapshot.sessionPnl,
      totalPnl: snapshot.totalPnl,
      btcPrice: snapshot.btcPrice ?? null,
      deltaTotal: snapshot.deltaTotal ?? null,
      optionsTheta: snapshot.optionsTheta ?? null,
      optionsVega: snapshot.optionsVega ?? null,
      optionsGamma: snapshot.optionsGamma ?? null,
      snapshotAt: snapshot.snapshotAt,
    },
  });
}

export async function getPnlSnapshots(params: {
  currency: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(pnlSnapshots.currency, params.currency)];
  if (params.startDate) conditions.push(gte(pnlSnapshots.date, params.startDate));
  if (params.endDate) conditions.push(lte(pnlSnapshots.date, params.endDate));

  return db
    .select()
    .from(pnlSnapshots)
    .where(and(...conditions))
    .orderBy(desc(pnlSnapshots.snapshotAt))
    .limit(params.limit ?? 90);
}

export async function incrementPageViews(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  await db.insert(pageViews).values({ id: 1, count: 1 }).onConflictDoUpdate({
    target: pageViews.id,
    set: { count: sql`count + 1` },
  });
  const rows = await db.select().from(pageViews).where(eq(pageViews.id, 1)).limit(1);
  return rows[0]?.count ?? 1;
}

export async function getPageViews(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select().from(pageViews).where(eq(pageViews.id, 1)).limit(1);
  return rows[0]?.count ?? 0;
}

export async function logVisitor(data: InsertVisitorLog): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    const error = new Error("Database connection failed");
    console.error("[Analytics] Database not available, cannot log visitor");
    throw error;
  }
  try {
    const insertData: any = {
      ip: data.ip,
      userAgent: data.userAgent ?? null,
      deviceType: data.deviceType ?? null,
      os: data.os ?? null,
      browser: data.browser ?? null,
      page: data.page ?? null,
      referrer: data.referrer ?? null,
      duration: data.duration ?? null,
      city: data.city ?? null,
      region: data.region ?? null,
      isProxy: data.isProxy ?? null,
    };
    const inserted = await db.insert(visitorLogs).values(insertData).returning({ id: visitorLogs.id });
    console.log("[Analytics] Visitor logged successfully:", data.page, data.deviceType);
    return inserted[0]?.id ?? null;
  } catch (e) {
    console.error("[Analytics] Failed to log visitor:", e);
    throw e;
  }
}

// Records the on-leave dwell time onto the row created on page load, instead
// of inserting a second row — keeps one row per real visit so counts aren't
// doubled.
export async function updateVisitorDuration(id: number, duration: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(visitorLogs).set({ duration }).where(eq(visitorLogs.id, id));
  } catch (e) {
    console.warn("[Analytics] Failed to update visitor duration:", e);
  }
}

export async function getDailyVisitorStats(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<Array<{ date: string; visits: number; uniqueIps: number; avgDuration: number }>> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      date: sql<string>`DATE(${createdAtUtc8})`,
      visits: sql<number>`COUNT(*)`,
      uniqueIps: sql<number>`COUNT(DISTINCT ${visitorLogs.ip})`,
      avgDuration: sql<number>`COALESCE(AVG(${visitorLogs.duration}), 0)`,
    })
    .from(visitorLogs)
    .where(visitorAnalyticsWhere(params))
    .groupBy(sql`DATE(${createdAtUtc8})`)
    .orderBy(sql`DATE(${createdAtUtc8})`);
}

// Period totals with range-correct semantics: unique visitors are deduped
// across the whole range (not summed per day, which double-counts repeat
// visitors), and avg dwell is a row-level average weighted by visits rather
// than an average of daily averages.
export async function getVisitorSummary(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<{ visits: number; uniqueIps: number; avgDuration: number }> {
  const db = await getDb();
  if (!db) return { visits: 0, uniqueIps: 0, avgDuration: 0 };

  const rows = await db
    .select({
      visits: sql<number>`COUNT(*)`,
      uniqueIps: sql<number>`COUNT(DISTINCT ${visitorLogs.ip})`,
      avgDuration: sql<number>`COALESCE(AVG(${visitorLogs.duration}), 0)`,
    })
    .from(visitorLogs)
    .where(visitorAnalyticsWhere(params));
  const row = rows[0];
  return {
    visits: row?.visits ?? 0,
    uniqueIps: row?.uniqueIps ?? 0,
    avgDuration: Math.round(row?.avgDuration ?? 0),
  };
}

export async function getVisitorLogCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ count: sql<number>`COUNT(*)` }).from(visitorLogs);
  return rows[0]?.count ?? 0;
}

export async function getVisitorDeviceStats(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<Array<{ deviceType: string | null; count: number; percentage: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ deviceType: visitorLogs.deviceType, count: sql<number>`COUNT(*)` })
    .from(visitorLogs)
    .where(visitorAnalyticsWhere(params))
    .groupBy(visitorLogs.deviceType)
    .orderBy(desc(sql`COUNT(*)`));

  // Percentages derive from the grouped counts — no separate COUNT(*) round trip.
  const total = rows.reduce((sum: number, row: { count: number }) => sum + row.count, 0);
  return rows.map((row: { deviceType: string | null; count: number }) => ({
    deviceType: row.deviceType,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 100) : 0,
  }));
}

export async function getVisitorOsStats(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<Array<{ os: string | null; count: number; percentage: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ os: visitorLogs.os, count: sql<number>`COUNT(*)` })
    .from(visitorLogs)
    .where(visitorAnalyticsWhere(params))
    .groupBy(visitorLogs.os)
    .orderBy(desc(sql`COUNT(*)`));

  const total = rows.reduce((sum: number, row: { count: number }) => sum + row.count, 0);
  return rows.map((row: { os: string | null; count: number }) => ({
    os: row.os,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 100) : 0,
  }));
}

export async function getVisitorBrowserStats(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<Array<{ browser: string | null; count: number; percentage: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ browser: visitorLogs.browser, count: sql<number>`COUNT(*)` })
    .from(visitorLogs)
    .where(visitorAnalyticsWhere(params))
    .groupBy(visitorLogs.browser)
    .orderBy(desc(sql`COUNT(*)`));

  const total = rows.reduce((sum: number, row: { count: number }) => sum + row.count, 0);
  return rows.map((row: { browser: string | null; count: number }) => ({
    browser: row.browser,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 100) : 0,
  }));
}

export async function getVisitorHourlyStats(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<Array<{ hour: number; visits: number; percentage: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ hour: sql<number>`EXTRACT(HOUR FROM ${createdAtUtc8})`, visits: sql<number>`COUNT(*)` })
    .from(visitorLogs)
    .where(visitorAnalyticsWhere(params))
    .groupBy(sql`EXTRACT(HOUR FROM ${createdAtUtc8})`)
    .orderBy(sql`EXTRACT(HOUR FROM ${createdAtUtc8})`);

  // postgres.js returns EXTRACT (numeric) and COUNT (bigint) as strings, so
  // coerce explicitly — raw string keys made every byHour.get(number) miss
  // and the hourly chart stayed all-zero.
  const total = rows.reduce((sum: number, row: { visits: number }) => sum + Number(row.visits), 0);
  const byHour = new Map<number, number>(rows.map((row: { hour: number; visits: number }) => [Number(row.hour), Number(row.visits)]));

  const fullDay: Array<{ hour: number; visits: number; percentage: number }> = [];
  for (let h = 0; h < 24; h++) {
    const visits = byHour.get(h) ?? 0;
    fullDay.push({ hour: h, visits, percentage: total > 0 ? Math.round((visits / total) * 100) : 0 });
  }
  return fullDay;
}

// Day × hour breakdown for the GitHub-style visit heatmap.
export async function getVisitorDailyHourlyStats(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<Array<{ date: string; hour: number; visits: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      date: sql<string>`DATE(${createdAtUtc8})`,
      hour: sql<number>`EXTRACT(HOUR FROM ${createdAtUtc8})`,
      visits: sql<number>`COUNT(*)`,
    })
    .from(visitorLogs)
    .where(visitorAnalyticsWhere(params))
    .groupBy(sql`DATE(${createdAtUtc8})`, sql`EXTRACT(HOUR FROM ${createdAtUtc8})`)
    .orderBy(sql`DATE(${createdAtUtc8})`, sql`EXTRACT(HOUR FROM ${createdAtUtc8})`);

  // postgres.js returns EXTRACT (numeric) and COUNT (bigint) as strings.
  return rows.map((row: { date: string; hour: number; visits: number }) => ({
    date: row.date,
    hour: Number(row.hour),
    visits: Number(row.visits),
  }));
}

export async function getVisitorGeoStats(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<Array<{ region: string | null; city: string | null; count: number; percentage: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ region: visitorLogs.region, city: visitorLogs.city, count: sql<number>`COUNT(*)` })
    .from(visitorLogs)
    .where(visitorAnalyticsWhere(params))
    .groupBy(visitorLogs.region, visitorLogs.city)
    .orderBy(desc(sql`COUNT(*)`));

  const total = rows.reduce((sum: number, row: { count: number }) => sum + row.count, 0);
  return rows.map((row: { region: string | null; city: string | null; count: number }) => ({
    region: row.region,
    city: row.city,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 100) : 0,
  }));
}

export async function getRecentVisitors(limit?: number): Promise<Array<{ region: string | null; city: string | null; page: string | null; deviceType: string | null; os: string | null; browser: string | null; isProxy: boolean | null; createdAt: string }>> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      region: visitorLogs.region,
      city: visitorLogs.city,
      page: visitorLogs.page,
      deviceType: visitorLogs.deviceType,
      os: visitorLogs.os,
      browser: visitorLogs.browser,
      isProxy: visitorLogs.isProxy,
      createdAt: sql<string>`${visitorLogs.createdAt} AT TIME ZONE 'UTC'`,
    })
    .from(visitorLogs)
    .where(visitorAnalyticsWhere())
    .orderBy(desc(visitorLogs.createdAt))
    .limit(limit ?? 20);
}

export async function getEarliestPnlSnapshots(): Promise<{
  btc: { balance: string; equity: string; snapshotAt: number } | null;
  usdc: { balance: string; equity: string; snapshotAt: number } | null;
}> {
  const db = await getDb();
  if (!db) return { btc: null, usdc: null };

  const [btcRows, usdcRows] = await Promise.all([
    db.select({
      balance: pnlSnapshots.balance,
      equity: pnlSnapshots.equity,
      snapshotAt: pnlSnapshots.snapshotAt,
    })
      .from(pnlSnapshots)
      .where(eq(pnlSnapshots.currency, 'BTC'))
      .orderBy(asc(pnlSnapshots.snapshotAt))
      .limit(1),
    db.select({
      balance: pnlSnapshots.balance,
      equity: pnlSnapshots.equity,
      snapshotAt: pnlSnapshots.snapshotAt,
    })
      .from(pnlSnapshots)
      .where(eq(pnlSnapshots.currency, 'USDC'))
      .orderBy(asc(pnlSnapshots.snapshotAt))
      .limit(1),
  ]);

  return {
    btc: btcRows[0] ?? null,
    usdc: usdcRows[0] ?? null,
  };
}

export async function getCombinedPnlSnapshots(params: {
  denomination: 'USDC' | 'BTC';
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const limit = params.limit ?? 180;

  let liveBtcPrice: number | null = null;
  try {
    liveBtcPrice = await getIndexPrice('btc_usdc');
  } catch { /* ignore */ }

  const [btcRows, usdcRows] = await Promise.all([
    db.select().from(pnlSnapshots)
      .where(and(
        eq(pnlSnapshots.currency, 'BTC'),
        ...(params.startDate ? [gte(pnlSnapshots.date, params.startDate)] : []),
        ...(params.endDate ? [lte(pnlSnapshots.date, params.endDate)] : []),
      ))
      .orderBy(desc(pnlSnapshots.snapshotAt))
      .limit(limit),
    db.select().from(pnlSnapshots)
      .where(and(
        eq(pnlSnapshots.currency, 'USDC'),
        ...(params.startDate ? [gte(pnlSnapshots.date, params.startDate)] : []),
        ...(params.endDate ? [lte(pnlSnapshots.date, params.endDate)] : []),
      ))
      .orderBy(desc(pnlSnapshots.snapshotAt))
      .limit(limit),
  ]);

  const btcMap = new Map<string, typeof btcRows[0]>();
  for (const r of btcRows) { if (!btcMap.has(r.date)) btcMap.set(r.date, r); }
  const usdcMap = new Map<string, typeof usdcRows[0]>();
  for (const r of usdcRows) { if (!usdcMap.has(r.date)) usdcMap.set(r.date, r); }

  const allDates = Array.from(new Set([...Array.from(btcMap.keys()), ...Array.from(usdcMap.keys())])).sort();

  return allDates.map((date) => {
    const btc = btcMap.get(date);
    const usdc = usdcMap.get(date);

    const btcEquity = parseFloat(btc?.equity ?? '0');
    const usdcEquity = parseFloat(usdc?.equity ?? '0');
    const btcBalance = parseFloat(btc?.balance ?? '0');
    const usdcBalance = parseFloat(usdc?.balance ?? '0');
    const btcPnl = parseFloat(btc?.totalPnl ?? '0');
    const usdcPnl = parseFloat(usdc?.totalPnl ?? '0');
    const btcUnrealized = parseFloat(btc?.unrealizedPnl ?? '0');
    const usdcUnrealized = parseFloat(usdc?.unrealizedPnl ?? '0');

    const storedPrice = parseFloat(btc?.btcPrice ?? usdc?.btcPrice ?? '0');
    const btcPrice = storedPrice > 0 ? storedPrice : (liveBtcPrice ?? 0);

    let equity: number;
    let balance: number;
    let totalPnl: number;
    let unrealizedPnl: number;

    if (params.denomination === 'USDC') {
      const rate = btcPrice > 0 ? btcPrice : 0;
      equity = btcEquity * rate + usdcEquity;
      balance = btcBalance * rate + usdcBalance;
      totalPnl = btcPnl * rate + usdcPnl;
      unrealizedPnl = btcUnrealized * rate + usdcUnrealized;
    } else {
      const rate = btcPrice > 0 ? btcPrice : 1;
      equity = btcEquity + usdcEquity / rate;
      balance = btcBalance + usdcBalance / rate;
      totalPnl = btcPnl + usdcPnl / rate;
      unrealizedPnl = btcUnrealized + usdcUnrealized / rate;
    }

    return {
      date,
      equity: String(equity),
      balance: String(balance),
      btcBalance: String(btcBalance),
      usdcBalance: String(usdcBalance),
      totalPnl: String(totalPnl),
      unrealizedPnl: String(unrealizedPnl),
      btcPrice: String(btcPrice),
      snapshotAt: Math.max(btc?.snapshotAt ?? 0, usdc?.snapshotAt ?? 0),
    };
  });
}

export async function getPnlAttributionSnapshots(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const limit = params.limit ?? 90;

  let liveBtcPrice: number | null = null;
  try {
    liveBtcPrice = await getIndexPrice('btc_usdc');
  } catch { /* ignore */ }

  const conditions = [eq(pnlSnapshots.currency, 'USDC')];
  if (params.startDate) conditions.push(gte(pnlSnapshots.date, params.startDate));
  if (params.endDate) conditions.push(lte(pnlSnapshots.date, params.endDate));

  const usdcRows = await db
    .select()
    .from(pnlSnapshots)
    .where(and(...conditions))
    .orderBy(desc(pnlSnapshots.snapshotAt))
    .limit(limit + 1);

  const btcConditions = [eq(pnlSnapshots.currency, 'BTC')];
  if (params.startDate) btcConditions.push(gte(pnlSnapshots.date, params.startDate));
  if (params.endDate) btcConditions.push(lte(pnlSnapshots.date, params.endDate));

  const btcRows = await db
    .select()
    .from(pnlSnapshots)
    .where(and(...btcConditions))
    .orderBy(desc(pnlSnapshots.snapshotAt))
    .limit(limit + 1);

  const usdcMap = new Map<string, typeof usdcRows[0]>();
  for (const r of usdcRows) { if (!usdcMap.has(r.date)) usdcMap.set(r.date, r); }
  const btcMap = new Map<string, typeof btcRows[0]>();
  for (const r of btcRows) { if (!btcMap.has(r.date)) btcMap.set(r.date, r); }

  const allDates = Array.from(new Set([
    ...Array.from(usdcMap.keys()),
    ...Array.from(btcMap.keys()),
  ])).sort();

  const combinedEquity = (date: string): number => {
    const usdc = usdcMap.get(date);
    const btc = btcMap.get(date);
    const usdcEq = parseFloat(usdc?.equity ?? '0');
    const btcEq = parseFloat(btc?.equity ?? '0');
    const storedPrice = parseFloat(usdc?.btcPrice ?? btc?.btcPrice ?? '0');
    const price = storedPrice > 0 ? storedPrice : (liveBtcPrice ?? 0);
    return usdcEq + btcEq * price;
  };

  const result: Array<{
    date: string;
    totalPnl: number;
    thetaPnl: number;
    deltaPnl: number;
    vegaPnl: number;
    residual: number;
    deltaTotal: number;
    optionsTheta: number;
    optionsVega: number;
    optionsGamma: number;
    btcPrice: number;
  }> = [];

  for (let i = 1; i < allDates.length; i++) {
    const prevDate = allDates[i - 1];
    const currDate = allDates[i];

    const prev = usdcMap.get(prevDate);
    const curr = usdcMap.get(currDate);

    const prevEquity = combinedEquity(prevDate);
    const currEquity = combinedEquity(currDate);
    const totalPnl = currEquity - prevEquity;

    const prevBtcPrice = parseFloat(prev?.btcPrice ?? btcMap.get(prevDate)?.btcPrice ?? '0') || (liveBtcPrice ?? 0);
    const currBtcPrice = parseFloat(curr?.btcPrice ?? btcMap.get(currDate)?.btcPrice ?? '0') || (liveBtcPrice ?? 0);
    const deltaBtcPrice = currBtcPrice - prevBtcPrice;

    const prevTheta = parseFloat(prev?.optionsTheta ?? '0');
    const prevVega = parseFloat(prev?.optionsVega ?? '0');
    const prevDelta = parseFloat(prev?.deltaTotal ?? '0');
    const currVega = parseFloat(curr?.optionsVega ?? '0');

    const prevTs = prev?.snapshotAt ?? 0;
    const currTs = curr?.snapshotAt ?? 0;
    const dtDays = prevTs > 0 && currTs > 0
      ? (currTs - prevTs) / (24 * 3600 * 1000)
      : 1;

    const thetaPnl = prevTheta * dtDays;
    const deltaPnl = prevDelta * deltaBtcPrice;
    const vegaPnl = (currVega - prevVega) * currBtcPrice * 0.01;
    const residual = totalPnl - thetaPnl - deltaPnl - vegaPnl;

    result.push({
      date: currDate,
      totalPnl,
      thetaPnl,
      deltaPnl,
      vegaPnl,
      residual,
      deltaTotal: parseFloat(curr?.deltaTotal ?? '0'),
      optionsTheta: parseFloat(curr?.optionsTheta ?? '0'),
      optionsVega: parseFloat(curr?.optionsVega ?? '0'),
      optionsGamma: parseFloat(curr?.optionsGamma ?? '0'),
      btcPrice: currBtcPrice,
    });
  }

  return result;
}