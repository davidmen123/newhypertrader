import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  getAccountSummaries,
  getAccountSummary,
  getAllPositions,
  getAllUserTrades,
  getUserTradesByCurrency,
  getIndexPrice,
  deribitWs,
} from "../deribit";
import {
  upsertTrades,
  getTradesFromDb,
  upsertPnlSnapshot,
  getPnlSnapshots,
  getCombinedPnlSnapshots,
  getPnlAttributionSnapshots,
  getEarliestPnlSnapshots,
} from "../db";
import { getSchedulerState } from "../scheduler";

export const deribitRouter = router({
  // New procedure to calculate trade metrics like win rate and P/L ratio
  tradeMetrics: publicProcedure.query(async () => {
    const allTrades = await getTradesFromDb({}); // Fetch all trades
    const btcPrice = await getIndexPrice("btc_usdc"); // Get current BTC price for conversion

    let winningTrades = 0;
    let losingTrades = 0;
    let totalProfit = 0;
    let totalLoss = 0;

    const processedTrades = allTrades.trades.map(trade => {
      let convertedProfit = trade.profit ? parseFloat(trade.profit) : 0;
      let convertedFee = trade.fee ? parseFloat(trade.fee) : 0;

      // Convert BTC denominated trades to USDC
      if (trade.currency === "BTC" && btcPrice) {
        convertedProfit *= btcPrice;
        convertedFee *= btcPrice;
      }
      const netProfit = convertedProfit - convertedFee;
      return { ...trade, netProfit };
    }).filter(trade => trade.netProfit !== 0); // Filter out trades with 0 net profit after conversion

    for (const trade of processedTrades) {
      if (trade.netProfit > 0) {
        winningTrades++;
        totalProfit += trade.netProfit;
      } else if (trade.netProfit < 0) {
        losingTrades++;
        totalLoss += Math.abs(trade.netProfit);
      }
    }

    const totalTrades = winningTrades + losingTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const avgProfit = winningTrades > 0 ? totalProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
    const plRatio = avgLoss !== 0 ? avgProfit / avgLoss : 0;

    return {
      winRate,
      plRatio,
      totalTrades,
      winningTrades,
      losingTrades,
    };
  }),
  // Account summaries for all currencies
  accountSummaries: publicProcedure.query(async () => {
    const summaries = await getAccountSummaries();
    return summaries;
  }),

  // All open positions
  positions: publicProcedure.query(async () => {
    const positions = await getAllPositions();
    return positions;
  }),

  // Recent trades from Deribit API + sync to DB
  recentTrades: publicProcedure
    .input(
      z.object({
        currency: z.string().optional(),
        count: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      let apiTrades;
      if (input.currency) {
        apiTrades = await getUserTradesByCurrency(input.currency, input.count);
      } else {
        apiTrades = await getAllUserTrades(input.count);
      }

      // Sync to DB
      const insertList = apiTrades.map((t) => ({
        tradeId: t.trade_id,
        orderId: t.order_id,
        instrument: t.instrument_name,
        currency: t.instrument_name.split("-")[0] || "BTC",
        direction: t.direction as "buy" | "sell",
        amount: String(t.amount),
        price: String(t.price),
        fee: t.fee != null ? String(t.fee) : null,
        feeCurrency: t.fee_currency || null,
        indexPrice: t.index_price != null ? String(t.index_price) : null,
        markPrice: t.mark_price != null ? String(t.mark_price) : null,
        profit: t.profit_loss != null ? String(t.profit_loss) : null,
        tradeSeq: t.trade_seq,
        state: t.state || null,
        label: t.label || null,
        tradeTimestamp: t.timestamp,
      }));

      await upsertTrades(insertList);
      return apiTrades;
    }),

  // Backfill historical trades from Deribit API into DB.
  // Fetches up to `count` trades per currency starting from 2026-03-09.
  // Safe to call multiple times — upsert ensures no duplicates.
  backfillHistory: publicProcedure
    .input(
      z.object({
        count: z.number().min(1).max(500).default(500),
      })
    )
    .mutation(async ({ input }) => {
      const startTimestamp = new Date("2026-03-09T00:00:00Z").getTime();
      const currencies = ["BTC", "USDC"];
      let totalSynced = 0;

      for (const currency of currencies) {
        try {
          const apiTrades = await getUserTradesByCurrency(
            currency,
            input.count,
            startTimestamp,
            undefined
          );
          const insertList = apiTrades.map((t) => ({
            tradeId: t.trade_id,
            orderId: t.order_id,
            instrument: t.instrument_name,
            currency: t.instrument_name.split("-")[0] || currency,
            direction: t.direction as "buy" | "sell",
            amount: String(t.amount),
            price: String(t.price),
            fee: t.fee != null ? String(t.fee) : null,
            feeCurrency: t.fee_currency || null,
            indexPrice: t.index_price != null ? String(t.index_price) : null,
            markPrice: t.mark_price != null ? String(t.mark_price) : null,
            profit: t.profit_loss != null ? String(t.profit_loss) : null,
            tradeSeq: t.trade_seq,
            state: t.state || null,
            label: t.label || null,
            tradeTimestamp: t.timestamp,
          }));
          await upsertTrades(insertList);
          totalSynced += insertList.length;
        } catch (err) {
          console.error(`[backfillHistory] Failed for ${currency}:`, err);
        }
      }

      return { synced: totalSynced };
    }),

  // Historical trades from DB with time range filter
  historicalTrades: publicProcedure
    .input(
      z.object({
        currency: z.string().optional(),
        startTimestamp: z.number().optional(),
        endTimestamp: z.number().optional(),
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      return getTradesFromDb(input);
    }),

  // Total count of trades in DB (for pagination)
  tradeCount: publicProcedure
    .input(
      z.object({
        currency: z.string().optional(),
        startTimestamp: z.number().optional(),
        endTimestamp: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const result = await getTradesFromDb({ ...input, limit: 10000, offset: 0 });
      return { total: result.total };
    }),

  // PnL snapshots from DB — combined portfolio view
  // denomination: 'USDC' = total in USDC (btcEquity*btcPrice + usdcEquity)
  //               'BTC'  = total in BTC  (btcEquity + usdcEquity/btcPrice)
  // The earliest data starts from 2026-03-09 (project launch date).
  // Time range semantics:
  //   1D  = last 24 hours (startDate = today, high limit to get all intra-day snapshots)
  //   7D  = last 7 days
  //   30D = last 30 days
  //   90D = last 90 days
  //   MAX = all data since 2026-03-09
  pnlHistory: publicProcedure
    .input(
      z.object({
        denomination: z.enum(["USDC", "BTC"]).default("USDC"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        // limit is generous; real filtering is done by startDate
        limit: z.number().default(1000),
      })
    )
    .query(async ({ input }) => {
      // For MAX, always start from project launch date
      const effectiveStartDate = input.startDate ?? "2026-03-09";
      return getCombinedPnlSnapshots({ ...input, startDate: effectiveStartDate });
    }),

  // Snapshot current PnL to DB — saves BTC + USDC sub-accounts simultaneously with BTC price
  snapshotPnl: publicProcedure
    .input(z.object({ currency: z.string().optional() })) // kept for backward compat, ignored
    .mutation(async () => {
      const currencies = ["BTC", "USDC"];
      const now = Date.now();
      const date = new Date(now).toISOString().slice(0, 10);
      const toStr = (v: number | null | undefined) =>
        v == null || isNaN(v) ? "0" : String(v);

      // Fetch BTC spot price for cross-account denomination conversion
      let btcSpotPrice: number | null = null;
      try {
        btcSpotPrice = await getIndexPrice("btc_usdc");
      } catch { /* ignore, btcPrice will be null */ }

      const results: Record<string, { equity: number; balance: number }> = {};

      for (const currency of currencies) {
        const summary = await getAccountSummary(currency);
        if (!summary) continue;
        const unrealizedPnl = summary.session_upl ?? summary.unrealized_pl ?? 0;
        const totalPnl = (summary.options_pl ?? 0) + (summary.futures_pl ?? 0);
        await upsertPnlSnapshot({
          currency,
          date,
          equity: toStr(summary.equity ?? 0),
          balance: toStr(summary.balance ?? 0),
          unrealizedPnl: toStr(unrealizedPnl),
          sessionPnl: toStr(summary.session_upl ?? 0),
          totalPnl: toStr(totalPnl),
          btcPrice: btcSpotPrice != null ? toStr(btcSpotPrice) : null,
          // Greeks
          deltaTotal: toStr(summary.delta_total ?? 0),
          optionsTheta: toStr(summary.options_theta ?? 0),
          optionsVega: toStr(summary.options_vega ?? 0),
          optionsGamma: toStr(summary.options_gamma ?? 0),
          snapshotAt: now,
        });
        results[currency] = { equity: summary.equity ?? 0, balance: summary.balance ?? 0 };
      }

      return { success: true, btcPrice: btcSpotPrice, results };
    }),

  // Volatility indices: VIX + BTC DVOL + CRCL IV
  volatilityIndices: publicProcedure.query(async () => {
    const now = Date.now();
    const start = now - 2 * 3600 * 1000;

    const yahooHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: "https://finance.yahoo.com/",
    };

    // Helper: get CRCL IV via curl subprocess.
    // Node.js fetch/https cannot handle Yahoo Finance's large response headers
    // (37KB+), causing UND_ERR_HEADERS_OVERFLOW / Parse Error: Header overflow.
    // curl handles them fine, so we shell out to curl for the Yahoo session.
    async function getCrclIv(): Promise<number | null> {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      const cookieJar = `/tmp/yf_cookies_${Date.now()}.txt`;
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

      try {
        // Step 1: visit Yahoo Finance home to get session cookies
        await execFileAsync("curl", [
          "-s", "-c", cookieJar,
          "-A", ua,
          "-H", "Accept: text/html",
          "-H", "Accept-Language: en-US,en;q=0.9",
          "-o", "/dev/null",
          "https://finance.yahoo.com/",
        ], { timeout: 15000 });

        // Step 2: get crumb
        const { stdout: crumbRaw } = await execFileAsync("curl", [
          "-s", "-b", cookieJar,
          "-A", ua,
          "-H", "Accept: */*",
          "-H", "Referer: https://finance.yahoo.com/",
          "https://query1.finance.yahoo.com/v1/test/getcrumb",
        ], { timeout: 8000 });
        const crumb = crumbRaw.trim();
        if (!crumb || crumb.includes("error")) return null;

        // Step 3: get CRCL options chain
        const { stdout: optRaw } = await execFileAsync("curl", [
          "-s", "-b", cookieJar,
          "-A", ua,
          "-H", "Accept: application/json",
          "-H", "Referer: https://finance.yahoo.com/",
          `https://query2.finance.yahoo.com/v7/finance/options/CRCL?crumb=${encodeURIComponent(crumb)}`,
        ], { timeout: 10000 });

        const optData = JSON.parse(optRaw);
        const result = optData?.optionChain?.result?.[0];
        const spot: number = result?.quote?.regularMarketPrice ?? 0;
        const opts = result?.options?.[0];
        const calls: Array<{ strike: number; impliedVolatility: number }> = opts?.calls ?? [];
        const puts: Array<{ strike: number; impliedVolatility: number }> = opts?.puts ?? [];

        if (spot <= 0 || (calls.length === 0 && puts.length === 0)) return null;

        const atmCall = calls.length > 0 ? calls.reduce((a, b) => Math.abs(a.strike - spot) <= Math.abs(b.strike - spot) ? a : b) : null;
        const atmPut = puts.length > 0 ? puts.reduce((a, b) => Math.abs(a.strike - spot) <= Math.abs(b.strike - spot) ? a : b) : null;
        const ivs = [atmCall?.impliedVolatility, atmPut?.impliedVolatility].filter((v): v is number => v != null);
        if (ivs.length === 0) return null;
        return (ivs.reduce((a, b) => a + b, 0) / ivs.length) * 100;
      } finally {
        // Clean up temp cookie file
        const { unlink } = await import("fs/promises");
        await unlink(cookieJar).catch(() => {});
      }
    }

    const [btcDvolRes, vixRes, crclIvRes, spxRes, ndxRes, qqqRes, goldRes] = await Promise.allSettled([
      // BTC DVOL
      fetch(
        `https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&start_timestamp=${start}&end_timestamp=${now}&resolution=3600`
      ).then((r) => r.json()),
      // VIX
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d", {
        headers: yahooHeaders,
      }).then((r) => r.json()),
      // CRCL IV via curl subprocess (Node.js fetch cannot handle Yahoo's large headers)
      getCrclIv(),
      // S&P 500
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d", {
        headers: yahooHeaders,
      }).then((r) => r.json()),
      // NASDAQ Composite
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?interval=1d&range=5d", {
        headers: yahooHeaders,
      }).then((r) => r.json()),
      // QQQ ETF
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/QQQ?interval=1d&range=5d", {
        headers: yahooHeaders,
      }).then((r) => r.json()),
      // Gold futures
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=5d", {
        headers: yahooHeaders,
      }).then((r) => r.json()),
    ]);

    // BTC DVOL
    let btcDvol: number | null = null;
    let btcDvolPrev: number | null = null;
    if (btcDvolRes.status === "fulfilled") {
      const data: number[][] = btcDvolRes.value?.result?.data ?? [];
      if (data.length >= 1) btcDvol = data[data.length - 1][4];
      if (data.length >= 2) btcDvolPrev = data[data.length - 2][4];
    }

    // VIX
    let vix: number | null = null;
    let vixPrevClose: number | null = null;
    if (vixRes.status === "fulfilled") {
      const meta = vixRes.value?.chart?.result?.[0]?.meta ?? {};
      vix = meta.regularMarketPrice ?? null;
      vixPrevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    }

    // CRCL IV (getCrclIv returns number | null directly)
    let crclIv: number | null = null;
    if (crclIvRes.status === "fulfilled") {
      crclIv = crclIvRes.value ?? null;
    }

    // S&P 500
    let spx: number | null = null;
    let spxPrevClose: number | null = null;
    if (spxRes.status === "fulfilled") {
      const meta = spxRes.value?.chart?.result?.[0]?.meta ?? {};
      spx = meta.regularMarketPrice ?? null;
      spxPrevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    }

    // NASDAQ Composite
    let ndx: number | null = null;
    let ndxPrevClose: number | null = null;
    if (ndxRes.status === "fulfilled") {
      const meta = ndxRes.value?.chart?.result?.[0]?.meta ?? {};
      ndx = meta.regularMarketPrice ?? null;
      ndxPrevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    }

    // QQQ ETF
    let qqq: number | null = null;
    let qqqPrevClose: number | null = null;
    if (qqqRes.status === "fulfilled") {
      const meta = qqqRes.value?.chart?.result?.[0]?.meta ?? {};
      qqq = meta.regularMarketPrice ?? null;
      qqqPrevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    }

    // Gold futures
    let gold: number | null = null;
    let goldPrevClose: number | null = null;
    if (goldRes.status === "fulfilled") {
      const meta = goldRes.value?.chart?.result?.[0]?.meta ?? {};
      gold = meta.regularMarketPrice ?? null;
      goldPrevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    }

    return { btcDvol, btcDvolPrev, vix, vixPrevClose, crclIv, spx, spxPrevClose, ndx, ndxPrevClose, qqq, qqqPrevClose, gold, goldPrevClose };
  }),

  // Stock prices: MSTR, COIN, CRCL + HYPE (CoinGecko)
  stockPrices: publicProcedure.query(async () => {
    const yahooHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    };

    const symbols = ["MSTR", "COIN", "CRCL"];
    const [yahooResults, hypeRes] = await Promise.all([
      Promise.allSettled(
        symbols.map((sym) =>
          fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`, {
            headers: yahooHeaders,
          }).then((r) => r.json())
        )
      ),
      // HYPE from OKX public API (CoinGecko has strict rate limits; Binance is geo-blocked)
      fetch(
        "https://www.okx.com/api/v5/market/ticker?instId=HYPE-USDT",
        { headers: { Accept: "application/json" } }
      ).then((r) => r.json()).catch(() => null),
    ]);

    const prices: Record<string, { price: number | null; prevClose: number | null; change: number | null }> = {};
    symbols.forEach((sym, i) => {
      const res = yahooResults[i];
      if (res.status === "fulfilled") {
        const meta = res.value?.chart?.result?.[0]?.meta ?? {};
        const price: number | null = meta.regularMarketPrice ?? null;
        const prevClose: number | null = meta.previousClose ?? meta.chartPreviousClose ?? null;
        const change = price != null && prevClose != null && prevClose !== 0
          ? ((price - prevClose) / prevClose) * 100
          : null;
        prices[sym] = { price, prevClose, change };
      } else {
        prices[sym] = { price: null, prevClose: null, change: null };
      }
    });

    // HYPE from OKX: data[0].last = current price, data[0].open24h = 24h open price
    const hypeOkx = hypeRes?.data?.[0];
    const hypePrice: number | null = hypeOkx?.last != null ? parseFloat(hypeOkx.last) : null;
    const hypeOpen24h: number | null = hypeOkx?.open24h != null ? parseFloat(hypeOkx.open24h) : null;
    const hypeChange: number | null =
      hypePrice != null && hypeOpen24h != null && hypeOpen24h !== 0
        ? ((hypePrice - hypeOpen24h) / hypeOpen24h) * 100
        : null;
    prices["HYPE"] = { price: hypePrice, prevClose: hypeOpen24h, change: hypeChange };

    return prices;
  }),

  // WebSocket connection status
  wsStatus: publicProcedure.query(() => {
    return { connected: deribitWs.isConnected() };
  }),

  // Auto-snapshot scheduler status
  schedulerStatus: publicProcedure.query(() => {
    return getSchedulerState();
  }),

  // Account overview: merged BTC + USDC summary with IM/MM/equity/balance
  accountOverview: publicProcedure.query(async () => {
    const [summaries, btcPrice, earliest, allSnapshots] = await Promise.all([
      getAccountSummaries(),
      getIndexPrice("btc_usdc").catch(() => 0),
      getEarliestPnlSnapshots(),
      getCombinedPnlSnapshots({ denomination: 'USDC', startDate: '2026-03-09', limit: 2000 }),
    ]);

    const btc = summaries.find((s) => s.currency === "BTC");
    const usdc = summaries.find((s) => s.currency === "USDC");

    const price = btcPrice || 0;

    // Total equity in USDC
    const btcEquityUsdc = (btc?.equity ?? 0) * price;
    const usdcEquity = usdc?.equity ?? 0;
    const totalEquityUsdc = btcEquityUsdc + usdcEquity;

    // Total equity in BTC
    const usdcEquityBtc = price > 0 ? usdcEquity / price : 0;
    const btcEquity = btc?.equity ?? 0;
    const totalEquityBtc = btcEquity + usdcEquityBtc;

    // IM / MM (USDC sub-account has USD-denominated IM/MM; BTC sub-account IM/MM in BTC → convert)
    const imUsdc = (usdc?.initial_margin ?? 0) + (btc?.initial_margin ?? 0) * price;
    const mmUsdc = (usdc?.maintenance_margin ?? 0) + (btc?.maintenance_margin ?? 0) * price;

    // Available funds (USDC)
    const availableUsdc = (usdc?.available_funds ?? 0) + (btc?.available_funds ?? 0) * price;

    // Balance (raw, per currency)
    const btcBalance = btc?.balance ?? 0;
    const usdcBalance = usdc?.balance ?? 0;

    // Session UPL
    const sessionUplUsdc = (usdc?.session_upl ?? 0) + (btc?.session_upl ?? 0) * price;

    // Greeks:
    // - delta_total: BTC sub-account is in BTC → convert to USD; USDC sub-account is already in USD
    // - Vega/Theta/Gamma: both sub-accounts are already in USD terms (not per-BTC), just sum
    const deltaTotal = (usdc?.delta_total ?? 0) + (btc?.delta_total ?? 0) * price;
    const optionsVega = (usdc?.options_vega ?? 0) + (btc?.options_vega ?? 0);
    const optionsTheta = (usdc?.options_theta ?? 0) + (btc?.options_theta ?? 0);
    const optionsGamma = (usdc?.options_gamma ?? 0) + (btc?.options_gamma ?? 0);

    // Margin usage ratio
    const marginUsageRatio = totalEquityUsdc > 0 ? imUsdc / totalEquityUsdc : 0;

    // ── Total P&L (since first snapshot) ──────────────────────────────────────
    // Cost basis = earliest recorded equity (USDC-denominated)
    // We use equity (not balance) as the baseline because equity includes unrealized P&L
    // and is the most meaningful measure of account value over time.
    let totalPnlUsdc: number | null = null;
    let totalPnlPct: number | null = null;
    let costBasisUsdc: number | null = null;

    if (earliest.btc || earliest.usdc) {
      const earliestBtcEquity = parseFloat(earliest.btc?.equity ?? '0');
      const earliestUsdcEquity = parseFloat(earliest.usdc?.equity ?? '0');
      // Convert earliest BTC equity to USDC using current price
      const earliestTotalUsdc = earliestBtcEquity * price + earliestUsdcEquity;
      costBasisUsdc = earliestTotalUsdc;

      if (earliestTotalUsdc > 0) {
        totalPnlUsdc = totalEquityUsdc - earliestTotalUsdc;
        totalPnlPct = (totalPnlUsdc / earliestTotalUsdc) * 100;
      }
    }

    // ── Max Drawdown (since 2026-03-09) ──────────────────────────────────────
    // Algorithm: track running peak equity; drawdown = peak - current equity
    // maxDrawdown = max(peak - valley) across all snapshots
    let maxDrawdownUsdc: number | null = null;
    let maxDrawdownPct: number | null = null;

    if (allSnapshots.length >= 2) {
      let peak = parseFloat(allSnapshots[0].equity);
      let maxDD = 0;
      let maxDDPeak = peak;

      for (const snap of allSnapshots) {
        const eq = parseFloat(snap.equity);
        if (eq > peak) peak = eq;
        const dd = peak - eq;
        if (dd > maxDD) {
          maxDD = dd;
          maxDDPeak = peak;
        }
      }

      if (maxDD > 0) {
        maxDrawdownUsdc = -maxDD; // negative = drawdown
        maxDrawdownPct = maxDDPeak > 0 ? -(maxDD / maxDDPeak) * 100 : null;
      } else {
        maxDrawdownUsdc = 0;
        maxDrawdownPct = 0;
      }
    }

    return {
      btcPrice: price,
      // Total equity
      totalEquityUsdc,
      totalEquityBtc,
      // Per-currency balances
      btcBalance,
      usdcBalance,
      btcEquity,
      usdcEquity,
      // Margin
      imUsdc,
      mmUsdc,
      availableUsdc,
      marginUsageRatio,
      // Session PnL
      sessionUplUsdc,
      // Total P&L since first snapshot
      totalPnlUsdc,
      totalPnlPct,
      costBasisUsdc,
      // Max Drawdown since 2026-03-09
      maxDrawdownUsdc,
      maxDrawdownPct,
      // Calmar Ratio
      calmarRatio: null, // Placeholder, will calculate below
      // Greeks (USD-denominated)
      deltaTotal,
      optionsVega,
      optionsTheta,
      optionsGamma,
    };

    // Calculate Calmar Ratio
    if (result.totalPnlPct !== null && result.maxDrawdownPct !== null && result.maxDrawdownPct < 0) {
      // Annualize return: (1 + totalPnlPct/100)^(365/days) - 1
      const projectStartDate = new Date("2026-03-09T00:00:00Z");
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - projectStartDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        const annualizedReturn = (Math.pow(1 + result.totalPnlPct / 100, 365 / diffDays) - 1) * 100;
        result.calmarRatio = Math.abs(annualizedReturn / result.maxDrawdownPct);
      }
    }

    return result;
  }),

  // ─── Trade History (from DB — all historical records) ─────────────────────────────
  // Reads from the local DB (synced via recentTrades). Returns ALL stored records,
  // not just today's. Supports currency filter, date range, and pagination.
  // Server-side paginated trade history from DB.
  // page is 0-indexed. pageSize defaults to 20.
  tradeHistory: publicProcedure
    .input(
      z.object({
        currency: z.enum(["ALL", "BTC", "USDC"]).default("ALL"),
        startDate: z.string().optional(), // YYYY-MM-DD
        endDate: z.string().optional(),   // YYYY-MM-DD
        page: z.number().min(0).default(0),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const startTimestamp = input.startDate
        ? new Date(input.startDate + "T00:00:00Z").getTime()
        : undefined;
      const endTimestamp = input.endDate
        ? new Date(input.endDate + "T23:59:59Z").getTime()
        : undefined;

      const currency = input.currency === "ALL" ? undefined : input.currency;
      const { trades: rows, total } = await getTradesFromDb({
        currency,
        startTimestamp,
        endTimestamp,
        limit: input.pageSize,
        offset: input.page * input.pageSize,
      });

      const mapped = rows.map((t) => ({
        tradeId: t.tradeId,
        orderId: t.orderId,
        instrument: t.instrument,
        direction: t.direction,
        amount: t.amount ? parseFloat(t.amount) : 0,
        price: t.price ? parseFloat(t.price) : 0,
        fee: t.fee ? parseFloat(t.fee) : 0,
        feeCurrency: t.feeCurrency ?? "",
        indexPrice: t.indexPrice ? parseFloat(t.indexPrice) : null,
        markPrice: t.markPrice ? parseFloat(t.markPrice) : null,
        profitLoss: t.profit ? parseFloat(t.profit) : 0,
        orderType: t.state ?? "",
        liquidity: null,
        timestamp: t.tradeTimestamp ?? 0,
        label: t.label ?? "",
      }));

      return { trades: mapped, total, page: input.page, pageSize: input.pageSize };
    }),

  // P&L Attribution: break down daily P&L into Theta / Delta / Vega / Residual
  pnlAttribution: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().default(90),
      })
    )
    .query(async ({ input }) => {
      return getPnlAttributionSnapshots(input);
    }),
});
