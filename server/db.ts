import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  InsertTrade,
  InsertPnlSnapshot,
  pnlSnapshots,
  trades,
  users,
  pageViews,
} from "../drizzle/schema.js";
import { ENV } from "./_core/env.js";
import { getIndexPrice } from "./deribit.js";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
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
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
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

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Trades ──────────────────────────────────────────────────────────────────

export async function upsertTrade(trade: InsertTrade): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(trades)
    .values(trade)
    .onDuplicateKeyUpdate({
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
  if (params.startTimestamp)
    conditions.push(gte(trades.tradeTimestamp, params.startTimestamp));
  if (params.endTimestamp)
    conditions.push(lte(trades.tradeTimestamp, params.endTimestamp));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Run count and data queries in parallel
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

// ─── PnL Snapshots ───────────────────────────────────────────────────────────

export async function upsertPnlSnapshot(
  snapshot: InsertPnlSnapshot
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(pnlSnapshots)
    .values(snapshot)
    .onDuplicateKeyUpdate({
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
  if (params.startDate)
    conditions.push(gte(pnlSnapshots.date, params.startDate));
  if (params.endDate) conditions.push(lte(pnlSnapshots.date, params.endDate));

  return db
    .select()
    .from(pnlSnapshots)
    .where(and(...conditions))
    .orderBy(desc(pnlSnapshots.snapshotAt))
    .limit(params.limit ?? 90);
}

/**
 * Returns combined portfolio snapshots merging BTC + USDC sub-accounts.
 * denomination = 'USDC': totalEquity = btcEquity * btcPrice + usdcEquity
 * denomination = 'BTC':  totalEquity = btcEquity + usdcEquity / btcPrice
 * Rows are matched by date; only dates where both sub-accounts have a snapshot are included.
 */
// ─── Page Views ──────────────────────────────────────────────────────────────

/**
 * Atomically increment the page view counter and return the new total.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE to handle the single-row pattern.
 */
export async function incrementPageViews(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Ensure row id=1 exists, then increment
  await db
    .insert(pageViews)
    .values({ id: 1, count: 1 })
    .onDuplicateKeyUpdate({
      set: { count: sql`count + 1` },
    });
  const rows = await db
    .select()
    .from(pageViews)
    .where(eq(pageViews.id, 1))
    .limit(1);
  return rows[0]?.count ?? 1;
}

export async function getPageViews(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(pageViews)
    .where(eq(pageViews.id, 1))
    .limit(1);
  return rows[0]?.count ?? 0;
}

/**
 * Returns the earliest recorded snapshot for each currency.
 * Used to compute total P&L = currentEquity - initialBalance.
 */
export async function getEarliestPnlSnapshots(): Promise<{
  btc: { balance: string; equity: string; snapshotAt: number } | null;
  usdc: { balance: string; equity: string; snapshotAt: number } | null;
}> {
  const db = await getDb();
  if (!db) return { btc: null, usdc: null };

  const [btcRows, usdcRows] = await Promise.all([
    db
      .select({
        balance: pnlSnapshots.balance,
        equity: pnlSnapshots.equity,
        snapshotAt: pnlSnapshots.snapshotAt,
      })
      .from(pnlSnapshots)
      .where(eq(pnlSnapshots.currency, "BTC"))
      .orderBy(asc(pnlSnapshots.snapshotAt))
      .limit(1),
    db
      .select({
        balance: pnlSnapshots.balance,
        equity: pnlSnapshots.equity,
        snapshotAt: pnlSnapshots.snapshotAt,
      })
      .from(pnlSnapshots)
      .where(eq(pnlSnapshots.currency, "USDC"))
      .orderBy(asc(pnlSnapshots.snapshotAt))
      .limit(1),
  ]);

  return {
    btc: btcRows[0] ?? null,
    usdc: usdcRows[0] ?? null,
  };
}

export async function getCombinedPnlSnapshots(params: {
  denomination: "USDC" | "BTC";
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const limit = params.limit ?? 180;

  // Fetch current BTC price as fallback for rows with btcPrice = 0 or null
  let liveBtcPrice: number | null = null;
  try {
    liveBtcPrice = await getIndexPrice("btc_usdc");
  } catch {
    /* ignore */
  }

  // Fetch both currencies
  const [btcRows, usdcRows] = await Promise.all([
    db
      .select()
      .from(pnlSnapshots)
      .where(
        and(
          eq(pnlSnapshots.currency, "BTC"),
          ...(params.startDate
            ? [gte(pnlSnapshots.date, params.startDate)]
            : []),
          ...(params.endDate ? [lte(pnlSnapshots.date, params.endDate)] : [])
        )
      )
      .orderBy(desc(pnlSnapshots.snapshotAt))
      .limit(limit),
    db
      .select()
      .from(pnlSnapshots)
      .where(
        and(
          eq(pnlSnapshots.currency, "USDC"),
          ...(params.startDate
            ? [gte(pnlSnapshots.date, params.startDate)]
            : []),
          ...(params.endDate ? [lte(pnlSnapshots.date, params.endDate)] : [])
        )
      )
      .orderBy(desc(pnlSnapshots.snapshotAt))
      .limit(limit),
  ]);

  // Build maps keyed by date (keep latest snapshot per date)
  const btcMap = new Map<string, (typeof btcRows)[0]>();
  for (const r of btcRows) {
    if (!btcMap.has(r.date)) btcMap.set(r.date, r);
  }
  const usdcMap = new Map<string, (typeof usdcRows)[0]>();
  for (const r of usdcRows) {
    if (!usdcMap.has(r.date)) usdcMap.set(r.date, r);
  }

  // Merge: use dates present in either map (fill missing side with 0)
  const allDates = Array.from(
    new Set([...Array.from(btcMap.keys()), ...Array.from(usdcMap.keys())])
  ).sort();

  return allDates.map(date => {
    const btc = btcMap.get(date);
    const usdc = usdcMap.get(date);

    const btcEquity = parseFloat(btc?.equity ?? "0");
    const usdcEquity = parseFloat(usdc?.equity ?? "0");
    const btcBalance = parseFloat(btc?.balance ?? "0");
    const usdcBalance = parseFloat(usdc?.balance ?? "0");
    const btcPnl = parseFloat(btc?.totalPnl ?? "0");
    const usdcPnl = parseFloat(usdc?.totalPnl ?? "0");
    const btcUnrealized = parseFloat(btc?.unrealizedPnl ?? "0");
    const usdcUnrealized = parseFloat(usdc?.unrealizedPnl ?? "0");

    // BTC price: prefer the snapshot's recorded price (must be > 0), fall back to live price
    const storedPrice = parseFloat(btc?.btcPrice ?? usdc?.btcPrice ?? "0");
    const btcPrice = storedPrice > 0 ? storedPrice : (liveBtcPrice ?? 0);

    let equity: number;
    let balance: number;
    let totalPnl: number;
    let unrealizedPnl: number;

    if (params.denomination === "USDC") {
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
      // Raw per-currency balances (not converted) for display purposes
      btcBalance: String(btcBalance),
      usdcBalance: String(usdcBalance),
      totalPnl: String(totalPnl),
      unrealizedPnl: String(unrealizedPnl),
      btcPrice: String(btcPrice),
      snapshotAt: Math.max(btc?.snapshotAt ?? 0, usdc?.snapshotAt ?? 0),
    };
  });
}

// ─── P&L Attribution ─────────────────────────────────────────────────────────

/**
 * Returns per-period P&L attribution data.
 *
 * Attribution methodology (approximation):
 *   - ThetaPnL  ≈ avgTheta × Δt (hours between snapshots / 24)
 *   - DeltaPnL  ≈ avgDelta × ΔBTC_price (in USDC)
 *   - VegaPnL   ≈ (currentVega - prevVega) × 1  (vega change contribution)
 *   - Residual  = totalEquityChange - ThetaPnL - DeltaPnL - VegaPnL
 *
 * All values are in USDC denomination.
 * Greeks are taken from the USDC sub-account (options account).
 */
export async function getPnlAttributionSnapshots(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const limit = params.limit ?? 90;

  // Fetch current BTC price as fallback
  let liveBtcPrice: number | null = null;
  try {
    liveBtcPrice = await getIndexPrice("btc_usdc");
  } catch {
    /* ignore */
  }

  // Fetch USDC snapshots (options account — has Greeks)
  const conditions = [eq(pnlSnapshots.currency, "USDC")];
  if (params.startDate)
    conditions.push(gte(pnlSnapshots.date, params.startDate));
  if (params.endDate) conditions.push(lte(pnlSnapshots.date, params.endDate));

  const usdcRows = await db
    .select()
    .from(pnlSnapshots)
    .where(and(...conditions))
    .orderBy(desc(pnlSnapshots.snapshotAt))
    .limit(limit + 1); // fetch one extra for diff calculation

  // Also fetch BTC snapshots to compute combined equity
  const btcConditions = [eq(pnlSnapshots.currency, "BTC")];
  if (params.startDate)
    btcConditions.push(gte(pnlSnapshots.date, params.startDate));
  if (params.endDate)
    btcConditions.push(lte(pnlSnapshots.date, params.endDate));

  const btcRows = await db
    .select()
    .from(pnlSnapshots)
    .where(and(...btcConditions))
    .orderBy(desc(pnlSnapshots.snapshotAt))
    .limit(limit + 1);

  // Build maps keyed by date (keep latest snapshot per date)
  const usdcMap = new Map<string, (typeof usdcRows)[0]>();
  for (const r of usdcRows) {
    if (!usdcMap.has(r.date)) usdcMap.set(r.date, r);
  }
  const btcMap = new Map<string, (typeof btcRows)[0]>();
  for (const r of btcRows) {
    if (!btcMap.has(r.date)) btcMap.set(r.date, r);
  }

  // Get all dates sorted ascending
  const allDates = Array.from(
    new Set([...Array.from(usdcMap.keys()), ...Array.from(btcMap.keys())])
  ).sort();

  // Helper: compute combined USDC equity for a date
  const combinedEquity = (date: string): number => {
    const usdc = usdcMap.get(date);
    const btc = btcMap.get(date);
    const usdcEq = parseFloat(usdc?.equity ?? "0");
    const btcEq = parseFloat(btc?.equity ?? "0");
    const storedPrice = parseFloat(usdc?.btcPrice ?? btc?.btcPrice ?? "0");
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
    // raw Greeks at this snapshot
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

    // Equity change (USDC denomination, combined BTC+USDC)
    const prevEquity = combinedEquity(prevDate);
    const currEquity = combinedEquity(currDate);
    const totalPnl = currEquity - prevEquity;

    // BTC price at each snapshot
    const prevBtcPrice =
      parseFloat(prev?.btcPrice ?? btcMap.get(prevDate)?.btcPrice ?? "0") ||
      (liveBtcPrice ?? 0);
    const currBtcPrice =
      parseFloat(curr?.btcPrice ?? btcMap.get(currDate)?.btcPrice ?? "0") ||
      (liveBtcPrice ?? 0);
    const deltaBtcPrice = currBtcPrice - prevBtcPrice;

    // Greeks at previous snapshot (used to estimate contribution over the period)
    const prevTheta = parseFloat(prev?.optionsTheta ?? "0");
    const prevVega = parseFloat(prev?.optionsVega ?? "0");
    const prevDelta = parseFloat(prev?.deltaTotal ?? "0");
    const currVega = parseFloat(curr?.optionsVega ?? "0");

    // Time elapsed in days
    const prevTs = prev?.snapshotAt ?? 0;
    const currTs = curr?.snapshotAt ?? 0;
    const dtDays =
      prevTs > 0 && currTs > 0 ? (currTs - prevTs) / (24 * 3600 * 1000) : 1; // default 1 day

    // Theta contribution: theta (per day in currency) × elapsed days
    // Deribit options_theta is in the settlement currency per day
    // For USDC account: theta is in USDC directly
    const thetaPnl = prevTheta * dtDays;

    // Delta contribution: delta (in BTC) × BTC price change (in USDC)
    const deltaPnl = prevDelta * deltaBtcPrice;

    // Vega contribution: vega change × 1 (simplified — vega itself changes with vol)
    // Better approximation: (currVega - prevVega) captures vol-driven vega P&L
    const vegaPnl = (currVega - prevVega) * currBtcPrice * 0.01; // ~1% vol move contribution

    // Residual = everything else (gamma, rho, pin risk, realized vol, etc.)
    const residual = totalPnl - thetaPnl - deltaPnl - vegaPnl;

    result.push({
      date: currDate,
      totalPnl,
      thetaPnl,
      deltaPnl,
      vegaPnl,
      residual,
      deltaTotal: parseFloat(curr?.deltaTotal ?? "0"),
      optionsTheta: parseFloat(curr?.optionsTheta ?? "0"),
      optionsVega: parseFloat(curr?.optionsVega ?? "0"),
      optionsGamma: parseFloat(curr?.optionsGamma ?? "0"),
      btcPrice: currBtcPrice,
    });
  }

  return result;
}
