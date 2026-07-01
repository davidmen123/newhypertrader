/**
 * Auto-snapshot scheduler
 * Runs every hour to record PnL snapshots.
 *
 * Your account uses USDC settlement, so we snapshot USDC (and USDT if non-zero).
 * BTC/ETH sub-accounts have 0 equity on this account type.
 *
 * Field mapping from Deribit USDC account summary:
 *   equity         → total account value (balance + options_value)
 *   balance        → cash balance (excluding options market value)
 *   session_upl    → unrealized PnL for the current session
 *   options_pl + futures_pl → total realized PnL
 *   delta_total    → portfolio delta
 */
import { getAccountSummary } from "./deribit";
import { upsertPnlSnapshot } from "./db";

// Snapshot both BTC and USDC sub-accounts for full portfolio coverage
const SNAPSHOT_CURRENCIES = ["BTC", "USDC"];
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface SchedulerState {
  lastRunAt: number | null;
  lastRunStatus: "success" | "error" | "pending" | null;
  lastError: string | null;
  nextRunAt: number | null;
  runCount: number;
}

const state: SchedulerState = {
  lastRunAt: null,
  lastRunStatus: null,
  lastError: null,
  nextRunAt: null,
  runCount: 0,
};

let timer: NodeJS.Timeout | null = null;

/** Safely convert a value to a decimal string, defaulting to "0" for null/undefined */
function toDecimalStr(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0";
  return String(val);
}

async function runSnapshot(): Promise<void> {
  state.lastRunStatus = "pending";
  const now = Date.now();
  const date = new Date(now).toISOString().slice(0, 10);

  try {
    for (const currency of SNAPSHOT_CURRENCIES) {
      const summary = await getAccountSummary(currency);

      if (!summary) {
        console.warn(`[Scheduler] No summary found for ${currency}, skipping`);
        continue;
      }

      // equity and balance must be non-null (they are NOT NULL in schema)
      const equity = summary.equity ?? 0;
      const balance = summary.balance ?? 0;

      // unrealized_pl is null for USDC accounts; use session_upl instead
      const unrealizedPnl = summary.session_upl ?? summary.unrealized_pl ?? 0;

      // session PnL
      const sessionPnl = summary.session_upl ?? 0;

      // total PnL = options_pl + futures_pl (both default to 0 if missing)
      const totalPnl = (summary.options_pl ?? 0) + (summary.futures_pl ?? 0);

      await upsertPnlSnapshot({
        currency,
        date,
        equity: toDecimalStr(equity),
        balance: toDecimalStr(balance),
        unrealizedPnl: toDecimalStr(unrealizedPnl),
        sessionPnl: toDecimalStr(sessionPnl),
        totalPnl: toDecimalStr(totalPnl),
        // Greeks — only meaningful for USDC (options sub-account)
        deltaTotal: toDecimalStr(summary.delta_total ?? null),
        optionsTheta: toDecimalStr(summary.options_theta ?? null),
        optionsVega: toDecimalStr(summary.options_vega ?? null),
        optionsGamma: toDecimalStr(summary.options_gamma ?? null),
        snapshotAt: now,
      });

      console.log(
        `[Scheduler] Snapshot saved for ${currency}: equity=${equity}, balance=${balance}, sessionUpl=${sessionPnl}, totalPnl=${totalPnl}`
      );
    }

    state.lastRunAt = now;
    state.lastRunStatus = "success";
    state.lastError = null;
    state.runCount += 1;
  } catch (err) {
    state.lastRunAt = now;
    state.lastRunStatus = "error";
    state.lastError = err instanceof Error ? err.message : String(err);
    console.error("[Scheduler] Auto-snapshot failed:", state.lastError);
  }

  // Schedule next run
  state.nextRunAt = Date.now() + INTERVAL_MS;
}

export function startScheduler(): void {
  if (timer) return; // already running

  console.log("[Scheduler] Auto-snapshot scheduler started (interval: 1 hour)");

  // Run immediately on start (after a short delay to let connections stabilize)
  const initialDelay = 10_000; // 10 seconds after boot
  setTimeout(async () => {
    await runSnapshot();
    // Then schedule hourly
    timer = setInterval(runSnapshot, INTERVAL_MS);
  }, initialDelay);

  state.nextRunAt = Date.now() + initialDelay;
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[Scheduler] Auto-snapshot scheduler stopped");
  }
}

export function getSchedulerState(): SchedulerState {
  return { ...state };
}
