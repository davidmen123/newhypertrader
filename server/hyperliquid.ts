import http from "http";
import https from "https";
import tls from "tls";

const HYPERLIQUID_API_URL = process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz";
const USER_ADDRESS = process.env.HYPERLIQUID_USER_ADDRESS || process.env.HYPERLIQUID_ADDRESS || "";
const MANUAL_INITIAL_CAPITAL_USDC = process.env.HYPERLIQUID_INITIAL_CAPITAL_USDC || "";
const DEFAULT_PERP_DEXS = ["", "xyz"];

type Method = "GET" | "POST";

function getProxyUrl() {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  return proxy ? new URL(proxy) : null;
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

function assertAddress() {
  const address = normalizeAddress(USER_ADDRESS);
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Hyperliquid account address is not configured. Please set HYPERLIQUID_USER_ADDRESS=0x...");
  }
  return address;
}

export function getHyperliquidConfigStatus() {
  return {
    configured: /^0x[a-fA-F0-9]{40}$/.test(normalizeAddress(USER_ADDRESS)),
    missing: USER_ADDRESS ? [] : ["HYPERLIQUID_USER_ADDRESS"],
    address: USER_ADDRESS ? `${USER_ADDRESS.slice(0, 6)}...${USER_ADDRESS.slice(-4)}` : null,
  };
}

function readJsonResponse<T>(response: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let text = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => {
      text += chunk;
    });
    response.on("end", () => {
      try {
        const payload = text ? JSON.parse(text) : null;
        resolve(payload as T);
      } catch {
        reject(new Error(`Hyperliquid returned a non-JSON response: ${text.slice(0, 120)}`));
      }
    });
    response.on("error", reject);
  });
}

function requestJson<T>(url: string, method: Method, headers: Record<string, string>, body: string): Promise<T> {
  const target = new URL(url);
  const proxy = getProxyUrl();

  if (!proxy) {
    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          method,
          hostname: target.hostname,
          path: `${target.pathname}${target.search}`,
          headers,
          timeout: 20000,
        },
        async (response) => {
          try {
            resolve(await readJsonResponse<T>(response));
          } catch (error) {
            reject(error);
          }
        }
      );
      request.on("timeout", () => request.destroy(new Error("Hyperliquid request timed out")));
      request.on("error", reject);
      if (body) request.write(body);
      request.end();
    });
  }

  return new Promise((resolve, reject) => {
    const connect = http.request({
      host: proxy.hostname,
      port: Number(proxy.port || 80),
      method: "CONNECT",
      path: `${target.hostname}:443`,
      headers: { Host: `${target.hostname}:443` },
      timeout: 20000,
    });

    connect.on("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Hyperliquid proxy connection failed: ${response.statusCode}`));
        return;
      }

      const tlsSocket = tls.connect({ socket, servername: target.hostname }, () => {
        const request = http.request(
          {
            method,
            host: target.hostname,
            path: `${target.pathname}${target.search}`,
            headers: { Host: target.hostname, ...headers },
            createConnection: () => tlsSocket,
            timeout: 20000,
          },
          async (hyperliquidResponse) => {
            try {
              resolve(await readJsonResponse<T>(hyperliquidResponse));
            } catch (error) {
              reject(error);
            }
          }
        );
        request.on("timeout", () => request.destroy(new Error("Hyperliquid request timed out")));
        request.on("error", reject);
        if (body) request.write(body);
        request.end();
      });

      tlsSocket.on("error", reject);
    });

    connect.on("timeout", () => connect.destroy(new Error("Hyperliquid proxy connection timed out")));
    connect.on("error", reject);
    connect.end();
  });
}

async function callInfo<T>(bodyData: Record<string, unknown>): Promise<T> {
  const body = JSON.stringify(bodyData);
  return requestJson<T>(
    `${HYPERLIQUID_API_URL}/info`,
    "POST",
    {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
    body
  );
}

function toNumber(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getPerpDexes() {
  const configured = process.env.HYPERLIQUID_PERP_DEXS?.split(",")
    .map((dex) => dex.trim())
    .filter(Boolean);
  const dexes = configured?.length ? ["", ...configured] : DEFAULT_PERP_DEXS;
  return [...new Set(dexes)];
}

function logHyperliquidPositions(dex: string, state: HyperliquidClearinghouseState) {
  const positions = state.assetPositions ?? [];
  const summary = state.marginSummary ?? state.crossMarginSummary ?? {};
  const sample = positions.slice(0, 8).map(({ position, type }) => ({
    coin: position.coin,
    szi: position.szi,
    entryPx: position.entryPx,
    positionValue: position.positionValue,
    unrealizedPnl: position.unrealizedPnl,
    type,
  }));

  console.info(
    "[Hyperliquid] current official positions",
    JSON.stringify({
      time: new Date().toISOString(),
      dex: dex || "default",
      assetPositions: positions.length,
      accountValue: summary.accountValue ?? null,
      totalNtlPos: summary.totalNtlPos ?? null,
      sample,
    })
  );
}

export interface HyperliquidPosition {
  coin: string;
  szi: string;
  entryPx?: string;
  positionValue?: string;
  unrealizedPnl?: string;
  returnOnEquity?: string;
  liquidationPx?: string | null;
  marginUsed?: string;
  leverage?: { type?: string; value?: number };
  cumFunding?: { allTime?: string; sinceOpen?: string; sinceChange?: string };
}

export interface HyperliquidClearinghouseState {
  assetPositions?: Array<{ position: HyperliquidPosition; type?: string }>;
  crossMarginSummary?: {
    accountValue?: string;
    totalNtlPos?: string;
    totalRawUsd?: string;
    totalMarginUsed?: string;
  };
  marginSummary?: {
    accountValue?: string;
    totalNtlPos?: string;
    totalRawUsd?: string;
    totalMarginUsed?: string;
  };
  withdrawable?: string;
  time?: number;
}

export interface HyperliquidSpotBalance {
  coin: string;
  token?: number;
  total: string;
  hold?: string;
  entryNtl?: string;
}

export interface HyperliquidSpotClearinghouseState {
  balances?: HyperliquidSpotBalance[];
}

export interface HyperliquidFill {
  coin: string;
  px: string;
  sz: string;
  side: "A" | "B" | string;
  time: number;
  startPosition?: string;
  dir?: string;
  closedPnl?: string;
  hash?: string;
  oid?: number | string;
  crossed?: boolean;
  fee?: string;
  feeToken?: string;
}

export interface HyperliquidPortfolioWindow {
  accountValueHistory?: Array<[number, string]>;
  pnlHistory?: Array<[number, string]>;
  vlm?: string;
}

export type HyperliquidPortfolio = Array<[string, HyperliquidPortfolioWindow]>;

export interface HyperliquidCandle {
  T?: number;
  c: string;
  h?: string;
  i?: string;
  l?: string;
  n?: number;
  o?: string;
  s?: string;
  t: number;
  v?: string;
}

export interface HyperliquidLedgerUpdate {
  time?: number;
  hash?: string;
  delta?: {
    type?: string;
    usdc?: string;
    amount?: string;
    ntl?: string;
    value?: string;
    token?: string;
    [key: string]: unknown;
  };
}

export interface HyperliquidOpenOrder {
  coin?: string;
  side?: string;
  limitPx?: string;
  sz?: string;
  origSz?: string;
  oid?: number | string;
  timestamp?: number;
  reduceOnly?: boolean;
  orderType?: string;
  tif?: string;
  triggerPx?: string;
  triggerCondition?: string;
  isTrigger?: boolean;
  cloid?: string | null;
  [key: string]: unknown;
}

export async function getHyperliquidState(dex = "") {
  const user = assertAddress();
  return callInfo<HyperliquidClearinghouseState>({
    type: "clearinghouseState",
    user,
    ...(dex ? { dex } : {}),
  });
}

export async function getHyperliquidPerpStates() {
  const results = await Promise.allSettled(
    getPerpDexes().map(async (dex) => ({
      dex,
      state: await getHyperliquidState(dex),
    }))
  );

  return results.flatMap((result) => {
    if (result.status === "fulfilled") return [result.value];
    console.warn("[Hyperliquid] Failed to read perp dex state:", result.reason);
    return [];
  });
}

function hasOpenPerpExposure(state: HyperliquidClearinghouseState) {
  const positions = state.assetPositions ?? [];
  const summary = state.marginSummary ?? state.crossMarginSummary ?? {};
  return positions.some(({ position }) => Math.abs(toNumber(position.szi)) > 0) || Math.abs(toNumber(summary.totalNtlPos)) > 0;
}

export function getActiveHyperliquidPerpStates(
  states: Array<{ dex: string; state: HyperliquidClearinghouseState }>
) {
  const active = states.filter(({ state }) => hasOpenPerpExposure(state));
  if (active.length > 0) return active;
  return states.filter(({ state }) => {
    const summary = state.marginSummary ?? state.crossMarginSummary ?? {};
    return toNumber(summary.accountValue) > 0;
  });
}

export async function getHyperliquidSpotState() {
  const user = assertAddress();
  return callInfo<HyperliquidSpotClearinghouseState>({ type: "spotClearinghouseState", user });
}

export function getHyperliquidSpotEquityUsdc(spotState: HyperliquidSpotClearinghouseState) {
  const balances = spotState.balances ?? [];
  return balances.reduce((sum, balance) => {
    const coin = balance.coin.toUpperCase();
    if (coin === "USDC" || coin === "USDC.E") return sum + toNumber(balance.total);

    // Hyperliquid spot balances include entryNtl; use it as a conservative value
    // fallback for non-USDC spot assets when a current mark value is not present.
    return sum + toNumber(balance.entryNtl);
  }, 0);
}

export function getHyperliquidSpotUsdcBalance(spotState: HyperliquidSpotClearinghouseState) {
  return (spotState.balances ?? []).reduce((sum, balance) => {
    const coin = balance.coin.toUpperCase();
    if (coin !== "USDC" && coin !== "USDC.E") return sum;
    return sum + toNumber(balance.total);
  }, 0);
}

export async function getHyperliquidFills(startTime?: number, endTime?: number) {
  const user = assertAddress();
  if (startTime || endTime) {
    return callInfo<HyperliquidFill[]>({
      type: "userFillsByTime",
      user,
      startTime: startTime ?? 0,
      endTime: endTime ?? Date.now(),
    });
  }
  return callInfo<HyperliquidFill[]>({ type: "userFills", user });
}

async function getHyperliquidOpenOrdersForDex(dex = "") {
  const user = assertAddress();
  return callInfo<HyperliquidOpenOrder[]>({
    type: "frontendOpenOrders",
    user,
    ...(dex ? { dex } : {}),
  });
}

export async function getHyperliquidOpenOrders() {
  const results = await Promise.allSettled(
    getPerpDexes().map(async (dex) => ({
      dex,
      orders: await getHyperliquidOpenOrdersForDex(dex),
    }))
  );

  const orders = results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value.orders.map((order) => ({ ...order, dex: result.value.dex }));
    }
    console.warn("[Hyperliquid] Failed to read open orders:", result.reason);
    return [];
  });

  return orders.map((order) => ({
    symbol: order.coin ? `${order.coin}-PERP` : "—",
    market: order.dex ? String(order.dex) : "default",
    coin: order.coin ?? "",
    side: order.side ?? "",
    orderType: order.orderType ?? (order.isTrigger ? "Trigger" : "Limit"),
    limitPrice: String(order.limitPx ?? ""),
    size: String(order.sz ?? ""),
    originalSize: String(order.origSz ?? order.sz ?? ""),
    orderId: String(order.oid ?? ""),
    timestamp: String(order.timestamp ?? ""),
    reduceOnly: Boolean(order.reduceOnly),
    tif: order.tif ?? "",
    triggerPrice: order.triggerPx != null ? String(order.triggerPx) : "",
    triggerCondition: order.triggerCondition ?? "",
    isTrigger: Boolean(order.isTrigger),
    cloid: order.cloid ?? "",
  }));
}

export async function getHyperliquidLedgerUpdates(startTime = 0, endTime = Date.now()) {
  const user = assertAddress();
  return callInfo<HyperliquidLedgerUpdate[]>({
    type: "userNonFundingLedgerUpdates",
    user,
    startTime,
    endTime,
  });
}

function getLedgerUsdcAmount(update: HyperliquidLedgerUpdate) {
  const delta = update.delta ?? {};
  return toNumber(delta.usdc ?? delta.amount ?? delta.ntl ?? delta.value);
}

export async function getHyperliquidInitialCapitalUsdc() {
  const manual = toNumber(MANUAL_INITIAL_CAPITAL_USDC);
  if (manual > 0) return manual;

  const updates = await getHyperliquidLedgerUpdates();
  let deposits = 0;
  let withdrawals = 0;

  for (const update of updates) {
    const type = String(update.delta?.type ?? "").toLowerCase();
    const amount = getLedgerUsdcAmount(update);
    if (amount <= 0) continue;
    if (type.includes("deposit")) {
      deposits += amount;
    } else if (type.includes("withdraw")) {
      withdrawals += amount;
    }
  }

  const netDeposits = deposits - withdrawals;
  return netDeposits > 0 ? netDeposits : null;
}

export async function getHyperliquidMids() {
  return callInfo<Record<string, string>>({ type: "allMids" });
}

function pickMid(mids: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(mids[key]);
    if (value > 0) return value;
  }
  return null;
}

export async function getHyperliquidMarketPrices() {
  const mids = await getHyperliquidMids();
  return {
    gold: pickMid(mids, ["GOLD", "XAU", "XAUUSD", "PAXG"]),
    sp500: pickMid(mids, ["SP500", "SPX", "US500", "SPX500"]),
  };
}

export async function getHyperliquidBtcPrice() {
  const mids = await getHyperliquidMids();
  return toNumber(mids.BTC || mids.BTCUSDC || mids.BTCUSDT);
}

export async function getHyperliquidPortfolio() {
  const user = assertAddress();
  return callInfo<HyperliquidPortfolio>({ type: "portfolio", user });
}

export function getLatestHyperliquidPortfolioEquity(portfolio: HyperliquidPortfolio) {
  const preferred =
    findPortfolioWindow(portfolio, "day") ??
    findPortfolioWindow(portfolio, "week") ??
    findPortfolioWindow(portfolio, "month") ??
    findPortfolioWindow(portfolio, "allTime") ??
    portfolio.find(([, data]) => data.accountValueHistory?.length)?.[1];

  const latest = preferred?.accountValueHistory?.at(-1);
  return latest ? toNumber(latest[1]) : null;
}

export function getInitialHyperliquidPortfolioEquity(portfolio: HyperliquidPortfolio) {
  const preferred =
    findPortfolioWindow(portfolio, "allTime") ??
    portfolio.find(([, data]) => data.accountValueHistory?.length)?.[1];

  const first = preferred?.accountValueHistory?.[0];
  return first ? toNumber(first[1]) : null;
}

export function getHyperliquidPortfolioEquitySummary(portfolio: HyperliquidPortfolio) {
  return {
    latest: getLatestHyperliquidPortfolioEquity(portfolio),
    initial: getInitialHyperliquidPortfolioEquity(portfolio),
  };
}

export function getHyperliquidMaxDrawdown(portfolio: HyperliquidPortfolio) {
  const windowData =
    findPortfolioWindow(portfolio, "allTime") ??
    portfolio.find(([, data]) => data.accountValueHistory?.length)?.[1];
  const history = windowData?.accountValueHistory ?? [];

  if (history.length < 2) {
    return { maxDrawdownUsdc: null, maxDrawdownPct: null };
  }

  let peak = toNumber(history[0][1]);
  let maxDrawdown = 0;
  let maxDrawdownPeak = peak;

  for (const [, equity] of history) {
    const value = toNumber(equity);
    if (value > peak) peak = value;
    const drawdown = peak - value;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPeak = peak;
    }
  }

  if (maxDrawdown <= 0) {
    return { maxDrawdownUsdc: 0, maxDrawdownPct: 0 };
  }

  return {
    maxDrawdownUsdc: -maxDrawdown,
    maxDrawdownPct: maxDrawdownPeak > 0 ? -(maxDrawdown / maxDrawdownPeak) * 100 : null,
  };
}

function getUtc8DateKey(time: number) {
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function getHyperliquidPerformanceStats(portfolio: HyperliquidPortfolio) {
  const windowData =
    findPortfolioWindow(portfolio, "allTime") ??
    portfolio.find(([, data]) => data.accountValueHistory?.length)?.[1];
  const history = windowData?.accountValueHistory ?? [];

  if (history.length < 2) {
    return {
      sharpeRatio: null,
      annualizedReturnPct: null,
      runningDays: null,
    };
  }

  const firstTime = history[0][0];
  const firstEquity = toNumber(history[0][1]);
  const latestEquity = toNumber(history[history.length - 1][1]);
  const runningDays = Math.max(1, Math.ceil((Date.now() - firstTime) / (24 * 60 * 60 * 1000)));
  const annualizedReturnPct = firstEquity > 0 && latestEquity > 0
    ? (Math.pow(latestEquity / firstEquity, 365 / runningDays) - 1) * 100
    : null;

  const dailyClose = new Map<string, number>();
  for (const [time, equity] of history) {
    dailyClose.set(getUtc8DateKey(time), toNumber(equity));
  }

  const dailyEquities = Array.from(dailyClose.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, equity]) => equity)
    .filter((equity) => Number.isFinite(equity) && equity > 0);
  const dailyReturns: number[] = [];
  for (let i = 1; i < dailyEquities.length; i += 1) {
    const prev = dailyEquities[i - 1];
    const current = dailyEquities[i];
    if (prev > 0) dailyReturns.push((current - prev) / prev);
  }

  if (dailyReturns.length < 2) {
    return {
      sharpeRatio: null,
      annualizedReturnPct,
      runningDays,
    };
  }

  const meanReturn = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, value) => sum + Math.pow(value - meanReturn, 2), 0) / (dailyReturns.length - 1);
  const volatility = Math.sqrt(variance);
  const sharpeRatio = volatility > 0 ? (meanReturn / volatility) * Math.sqrt(365) : null;

  return {
    sharpeRatio,
    annualizedReturnPct,
    runningDays,
  };
}

function signedFillSize(fill: HyperliquidFill) {
  const size = toNumber(fill.sz);
  return fill.side === "A" ? -size : size;
}

function calculateRoundTripTradeMetrics(fills: HyperliquidFill[]) {
  const tolerance = 0.00000001;
  const sortedFills = fills
    .slice()
    .sort((a, b) => a.time - b.time);
  const openTrades = new Map<string, { pnl: number }>();
  const completedPnls: number[] = [];

  for (const fill of sortedFills) {
    const coin = fill.coin;
    const startPosition = toNumber(fill.startPosition);
    const endPosition = startPosition + signedFillSize(fill);
    const startAbs = Math.abs(startPosition);
    const endAbs = Math.abs(endPosition);
    const startsFlat = startAbs <= tolerance;
    const endsFlat = endAbs <= tolerance;
    const flipsSide = startAbs > tolerance && endAbs > tolerance && Math.sign(startPosition) !== Math.sign(endPosition);
    const realizedPnl = toNumber(fill.closedPnl);

    if (!openTrades.has(coin) && !startsFlat) {
      openTrades.set(coin, { pnl: 0 });
    }

    if (startsFlat && !endsFlat && !openTrades.has(coin)) {
      openTrades.set(coin, { pnl: 0 });
    }

    const current = openTrades.get(coin);
    if (current) current.pnl += realizedPnl;

    if (endsFlat || flipsSide) {
      const closingTrade = openTrades.get(coin);
      if (closingTrade) completedPnls.push(closingTrade.pnl);
      openTrades.delete(coin);
      if (flipsSide) {
        openTrades.set(coin, { pnl: 0 });
      }
    }
  }

  const winningTrades = completedPnls.filter((pnl) => pnl > 0).length;
  const losingTrades = completedPnls.filter((pnl) => pnl < 0).length;
  const breakevenTrades = completedPnls.length - winningTrades - losingTrades;
  const grossWin = completedPnls.reduce((sum, pnl) => sum + Math.max(0, pnl), 0);
  const grossLoss = Math.abs(completedPnls.reduce((sum, pnl) => sum + Math.min(0, pnl), 0));
  const avgWin = winningTrades > 0 ? grossWin / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;

  return {
    totalTrades: completedPnls.length,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRate: completedPnls.length > 0 ? (winningTrades / completedPnls.length) * 100 : null,
    plRatio: avgLoss > 0 ? avgWin / avgLoss : null,
  };
}

export async function getHyperliquidOfficialBalanceUsdc() {
  const portfolio = await getHyperliquidPortfolio();
  return getHyperliquidPortfolioEquitySummary(portfolio).latest;
}

export async function getHyperliquidCandles(params: {
  coin: string;
  interval: string;
  startTime: number;
  endTime: number;
}) {
  return callInfo<HyperliquidCandle[]>({
    type: "candleSnapshot",
    req: params,
  });
}

function choosePortfolioWindow(startDate?: string) {
  if (!startDate) return "allTime";
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  const ageDays = (Date.now() - startMs) / (24 * 60 * 60 * 1000);
  if (ageDays <= 2) return "day";
  if (ageDays <= 10) return "week";
  if (ageDays <= 45) return "month";
  // Hyperliquid does not expose every custom range directly. Build 90D and
  // other longer ranges by filtering allTime account history.
  return "allTime";
}

function findPortfolioWindow(portfolio: HyperliquidPortfolio, name: string) {
  const windowData = portfolio.find(([windowName]) => windowName === name)?.[1];
  if (windowData?.accountValueHistory?.length) return windowData;
  return null;
}

function nearestHistoryValue(history: Array<[number, string]>, time: number) {
  if (history.length === 0) return null;
  let best = history[0];
  let bestDistance = Math.abs(history[0][0] - time);
  for (const row of history) {
    const distance = Math.abs(row[0] - time);
    if (distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }
  return best[1];
}

export async function getHyperliquidPortfolioSnapshots(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const portfolio = await getHyperliquidPortfolio();
  const preferredWindow = choosePortfolioWindow(params.startDate);
  const windowData =
    findPortfolioWindow(portfolio, preferredWindow) ??
    findPortfolioWindow(portfolio, "allTime") ??
    portfolio.find(([, data]) => data.accountValueHistory?.length)?.[1];

  if (!windowData) return [];

  const startMs = params.startDate ? new Date(`${params.startDate}T00:00:00Z`).getTime() : 0;
  const endMs = params.endDate ? new Date(`${params.endDate}T23:59:59Z`).getTime() : Number.MAX_SAFE_INTEGER;
  const pnlHistory = windowData.pnlHistory ?? [];
  const accountValueHistory = windowData.accountValueHistory ?? [];
  const baseEquity = accountValueHistory.length > 0 ? toNumber(accountValueHistory[0][1]) : 0;
  const filteredHistory = accountValueHistory
    .filter(([time]) => time >= startMs && time <= endMs)
    .slice(-(params.limit ?? 1000));

  const firstTime = filteredHistory[0]?.[0] ?? startMs;
  const lastTime = filteredHistory[filteredHistory.length - 1]?.[0] ?? Math.min(endMs, Date.now());
  const interval = lastTime - firstTime <= 2 * 24 * 60 * 60 * 1000 ? "1h" : "1d";
  const candles = filteredHistory.length > 0
    ? await getHyperliquidCandles({
      coin: "BTC",
      interval,
      startTime: Math.max(0, firstTime - 24 * 60 * 60 * 1000),
      endTime: Math.min(Date.now(), lastTime + 24 * 60 * 60 * 1000),
    }).catch(() => [])
    : [];

  const btcPriceForTime = (time: number) => {
    if (candles.length === 0) return null;
    let best = candles[0];
    let bestDistance = Math.abs(candles[0].t - time);
    for (const candle of candles) {
      const distance = Math.abs(candle.t - time);
      if (distance < bestDistance) {
        best = candle;
        bestDistance = distance;
      }
    }
    return best?.c ?? null;
  };

  return filteredHistory
    .map(([time, equity]) => {
      const totalPnl = nearestHistoryValue(pnlHistory, time) ?? String(toNumber(equity) - baseEquity);
      return {
        currency: "USDC",
        date: new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " "),
        equity,
        balance: equity,
        unrealizedPnl: totalPnl,
        sessionPnl: totalPnl,
        totalPnl,
        btcPrice: btcPriceForTime(time),
        deltaTotal: "0",
        optionsTheta: "0",
        optionsVega: "0",
        optionsGamma: "0",
        snapshotAt: time,
      };
    });
}

export async function getHyperliquidPositions() {
  const now = Date.now();
  const states = await getHyperliquidPerpStates();
  return states.flatMap(({ dex, state }) => {
    logHyperliquidPositions(dex, state);
    return (state.assetPositions ?? []).map(({ position }) => {
    const size = toNumber(position.szi);
    const side = size >= 0 ? "long" : "short";
    const entry = toNumber(position.entryPx);
    const mark = Math.abs(size) > 0 && toNumber(position.positionValue) > 0
      ? toNumber(position.positionValue) / Math.abs(size)
      : entry;

    return {
      category: "PERP",
      symbol: `${position.coin}-PERP`,
      marginCoin: "USDC",
      posSide: side,
      marginMode: position.leverage?.type ?? "cross",
      total: Math.abs(size).toString(),
      available: Math.abs(size).toString(),
      leverage: String(position.leverage?.value ?? 0),
      avgPrice: String(entry),
      markPrice: String(mark),
      unrealisedPnl: String(toNumber(position.unrealizedPnl)),
      curRealisedPnl: String(toNumber(position.cumFunding?.sinceOpen)),
      fundingFee: String(-toNumber(position.cumFunding?.sinceOpen)),
      liquidationPrice: position.liquidationPx ? String(position.liquidationPx) : "0",
      profitRate: String(toNumber(position.returnOnEquity)),
      updatedTime: String(state.time ?? now),
    };
    });
  });
}

export async function getHyperliquidAccountOverview() {
  const [perpStates, spotState, btcPrice, fills, portfolio, initialCapitalUsdc] = await Promise.all([
    getHyperliquidPerpStates(),
    getHyperliquidSpotState().catch(() => ({ balances: [] })),
    getHyperliquidBtcPrice().catch(() => 0),
    getHyperliquidFills(Date.now() - 30 * 24 * 60 * 60 * 1000).catch(() => []),
    getHyperliquidPortfolio().catch(() => null),
    getHyperliquidInitialCapitalUsdc().catch(() => null),
  ]);
  const portfolioEquity = portfolio
    ? getHyperliquidPortfolioEquitySummary(portfolio)
    : { latest: null, initial: null };
  const drawdown = portfolio
    ? getHyperliquidMaxDrawdown(portfolio)
    : { maxDrawdownUsdc: null, maxDrawdownPct: null };
  const performance = portfolio
    ? getHyperliquidPerformanceStats(portfolio)
    : { sharpeRatio: null, annualizedReturnPct: null, runningDays: null };
  const activePerpStates = getActiveHyperliquidPerpStates(perpStates);
  const summaries = activePerpStates.map(({ state }) => state.marginSummary ?? state.crossMarginSummary ?? {});
  const perpEquityUsdc = summaries.reduce((sum, summary) => sum + toNumber(summary.accountValue), 0);
  const spotEquityUsdc = getHyperliquidSpotEquityUsdc(spotState);
  const spotUsdcBalance = getHyperliquidSpotUsdcBalance(spotState);
  const fallbackEquityUsdc = portfolioEquity.latest && portfolioEquity.latest > 0
    ? portfolioEquity.latest
    : perpEquityUsdc;
  const totalEquityUsdc = spotEquityUsdc > 0 ? spotEquityUsdc : fallbackEquityUsdc;
  const totalMarginUsed = summaries.reduce((sum, summary) => sum + toNumber(summary.totalMarginUsed), 0);
  const totalNtlPos = summaries.reduce((sum, summary) => sum + toNumber(summary.totalNtlPos), 0);
  const withdrawable = activePerpStates.reduce((sum, { state }) => sum + toNumber(state.withdrawable), 0);
  const positions = activePerpStates.flatMap(({ state }) => state.assetPositions ?? []);
  const sessionUplUsdc = positions.reduce(
    (sum, item) => sum + toNumber(item.position.unrealizedPnl),
    0
  );
  const initialEquityUsdc = initialCapitalUsdc ?? portfolioEquity.initial;
  const totalPnlUsdc = initialEquityUsdc && initialEquityUsdc > 0
    ? totalEquityUsdc - initialEquityUsdc
    : null;
  const totalPnlPct = totalPnlUsdc != null && initialEquityUsdc && initialEquityUsdc > 0
    ? (totalPnlUsdc / initialEquityUsdc) * 100
    : null;
  const totalEquityBtc = btcPrice > 0 ? totalEquityUsdc / btcPrice : 0;
  const tradeMetrics = calculateRoundTripTradeMetrics(fills);

  return {
    exchange: "Hyperliquid",
    accountMode: "read-only" as const,
    btcPrice,
    perpEquityUsdc,
    spotEquityUsdc,
    spotUsdcBalance,
    spotBalances: spotState.balances ?? [],
    totalEquityUsdc,
    initialEquityUsdc,
    totalEquityBtc,
    btcBalance: totalEquityBtc,
    btcEquity: totalEquityBtc,
    usdcBalance: totalEquityUsdc,
    usdcEquity: totalEquityUsdc,
    sessionUplUsdc,
    totalPnlUsdc,
    totalPnlPct,
    imUsdc: totalMarginUsed,
    mmUsdc: 0,
    availableUsdc: withdrawable > 0 ? withdrawable : spotUsdcBalance,
    marginUsageRatio: totalEquityUsdc > 0 ? totalNtlPos / totalEquityUsdc : 0,
    maxDrawdownUsdc: drawdown.maxDrawdownUsdc,
    maxDrawdownPct: drawdown.maxDrawdownPct,
    sharpeRatio: performance.sharpeRatio,
    annualizedReturnPct: performance.annualizedReturnPct,
    runningDays: performance.runningDays,
    calmarRatio: null,
    totalNtlPos,
    metrics: tradeMetrics,
  };
}

export async function getHyperliquidTradeHistory(params: {
  startTime?: number;
  endTime?: number;
  limit?: number;
}) {
  const fills = await getHyperliquidFills(params.startTime, params.endTime);
  const mapped = fills
    .slice()
    .sort((a, b) => b.time - a.time)
    .slice(0, params.limit ?? 100)
    .map((fill) => {
      const side = fill.side === "B" ? "buy" : "sell";
      return {
        execId: fill.hash ? `${fill.hash}-${fill.oid}-${fill.time}` : `${fill.coin}-${fill.oid}-${fill.time}`,
        orderId: String(fill.oid ?? ""),
        category: "PERP",
        symbol: `${fill.coin}-PERP`,
        orderType: fill.crossed ? "Market" : "Limit",
        side,
        execPrice: fill.px,
        execQty: fill.sz,
        execValue: String(toNumber(fill.px) * toNumber(fill.sz)),
        tradeScope: "Hyperliquid",
        tradeSide: fill.dir ?? "",
        feeDetail: [{ feeCoin: fill.feeToken || "USDC", fee: fill.fee || "0" }],
        createdTime: String(fill.time),
        updatedTime: String(fill.time),
        execPnl: fill.closedPnl || "0",
        isRPI: "false",
      };
    });

  return { trades: mapped, total: mapped.length, cursor: null };
}
