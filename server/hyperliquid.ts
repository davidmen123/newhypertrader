import http from "http";
import https from "https";
import tls from "tls";
import {
  getCurrentHyperliquidAccount,
  isDefaultHyperliquidAccount,
  listHyperliquidAccounts,
  maskHyperliquidAddress,
  requireCurrentHyperliquidAddress,
} from "./accounts.js";

const HYPERLIQUID_API_URL = process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz";
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

// Reads the address of the account scoped to the current request. See
// server/accounts.ts — every Hyperliquid read below goes through here, which is
// what keeps a response from ever mixing two accounts' data.
function assertAddress() {
  return requireCurrentHyperliquidAddress();
}

export function getHyperliquidConfigStatus() {
  const account = getCurrentHyperliquidAccount();
  return {
    configured: account != null,
    missing: account ? [] : ["HYPERLIQUID_USER_ADDRESS"],
    address: account ? maskHyperliquidAddress(account.address) : null,
    accountId: account?.id ?? null,
    accountCount: listHyperliquidAccounts().length,
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
  return Array.from(new Set(dexes));
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

export type HyperliquidAccountAbstraction =
  | "unifiedAccount"
  | "portfolioMargin"
  | "disabled"
  | "default"
  | "dexAbstraction";

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
  liquidation?: {
    liquidatedUser?: string;
    markPx?: string;
    method?: string;
  };
}

interface HyperliquidSpotPair {
  name?: string;
  index?: number | string;
  tokens?: Array<number | string>;
}

interface HyperliquidSpotToken {
  name?: string;
  index?: number | string;
}

interface HyperliquidSpotMeta {
  tokens?: HyperliquidSpotToken[];
  universe?: HyperliquidSpotPair[];
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
  t?: number;
  v?: string;
}

export interface HyperliquidLedgerUpdate {
  time?: number;
  hash?: string;
  delta?: {
    type?: string;
    usdc?: string;
    /** USD value of a `send`, whose `amount` is denominated in the sent token. */
    usdcValue?: string;
    amount?: string;
    ntl?: string;
    value?: string;
    token?: string;
    /** Sender of a `send`. */
    user?: string;
    /** Recipient of a `send`. */
    destination?: string;
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

export async function getHyperliquidAccountAbstraction() {
  const user = assertAddress();
  return callInfo<HyperliquidAccountAbstraction>({ type: "userAbstraction", user });
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

export function getHyperliquidSpotAvailableUsdc(spotState: HyperliquidSpotClearinghouseState) {
  const available = (spotState.balances ?? []).reduce((sum, balance) => {
    const coin = balance.coin.toUpperCase();
    if (coin !== "USDC" && coin !== "USDC.E") return sum;
    return sum + toNumber(balance.total) - toNumber(balance.hold);
  }, 0);

  return Math.max(available, 0);
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

async function getHyperliquidSpotPairMap() {
  const meta = await callInfo<HyperliquidSpotMeta>({ type: "spotMeta" });
  const tokenNames = new Map(
    (meta.tokens ?? [])
      .filter((token) => token.name && token.index != null)
      .map((token) => [String(token.index), token.name as string])
  );
  return new Map(
    (meta.universe ?? [])
      .filter((pair) => pair.index != null)
      .map((pair) => {
        const pairName = String(pair.name ?? "");
        if (pairName && !/^@\d+$/.test(pairName)) {
          return [`@${pair.index}`, pairName];
        }
        const [baseToken, quoteToken] = pair.tokens ?? [];
        const baseName = tokenNames.get(String(baseToken));
        const quoteName = tokenNames.get(String(quoteToken));
        const resolvedName = baseName && quoteName ? `${baseName}/${quoteName}` : pairName;
        return [`@${pair.index}`, resolvedName || `@${pair.index}`];
      })
  );
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

interface HyperliquidHistoricalOrder {
  order?: HyperliquidOpenOrder;
  status?: string;
  statusTimestamp?: number;
}

async function getHyperliquidOrderHistoryForDex(dex = "") {
  const user = assertAddress();
  return callInfo<HyperliquidHistoricalOrder[]>({
    type: "historicalOrders",
    user,
    ...(dex ? { dex } : {}),
  });
}

export async function getHyperliquidOrderHistory(limit = 200) {
  const results = await Promise.allSettled(
    getPerpDexes().map(async (dex) => ({
      dex,
      entries: await getHyperliquidOrderHistoryForDex(dex),
    }))
  );

  const entries = results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value.entries.map((entry) => ({ ...entry, dex: result.value.dex }));
    }
    console.warn("[Hyperliquid] Failed to read order history:", result.reason);
    return [];
  });

  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      const key = `${entry.order?.oid ?? ""}-${entry.statusTimestamp ?? ""}-${entry.status ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.statusTimestamp ?? 0) - (a.statusTimestamp ?? 0))
    .slice(0, limit)
    .map((entry) => {
      const order = entry.order ?? {};
      return {
        symbol: order.coin ? `${order.coin}-PERP` : "—",
        market: entry.dex ? String(entry.dex) : "default",
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
        status: entry.status ?? "",
        statusTimestamp: String(entry.statusTimestamp ?? ""),
      };
    });
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

// Overview is polled every 30s, so each ledger type is reported once per process
// instead of on every request.
const reportedLedgerTypes = new Set<string>();

function reportUncountedLedgerTypes(types: Set<string>) {
  const fresh = Array.from(types).filter((type) => !reportedLedgerTypes.has(type));
  if (fresh.length === 0) return;
  for (const type of fresh) reportedLedgerTypes.add(type);
  console.warn(
    "[Hyperliquid] ledger types seen but not counted as external capital:",
    JSON.stringify(fresh)
  );
}

function getLedgerUsdcAmount(update: HyperliquidLedgerUpdate) {
  const delta = update.delta ?? {};
  // usdcValue before amount: a `send` reports `amount` in the token being sent,
  // so a non-USDC send would otherwise be read as that many dollars.
  return toNumber(delta.usdc ?? delta.usdcValue ?? delta.amount ?? delta.ntl ?? delta.value);
}

/** 1 = capital in, -1 = capital out, 0 = moves inside the account, null = unrecognised. */
type LedgerFlowDirection = 1 | -1 | 0 | null;

export function classifyHyperliquidLedgerFlow(
  update: HyperliquidLedgerUpdate,
  address: string
): LedgerFlowDirection {
  const delta = update.delta ?? {};
  const self = address.trim().toLowerCase();
  const isSelf = (value: unknown) => String(value ?? "").trim().toLowerCase() === self;

  switch (delta.type) {
    case "deposit":
      return 1;
    case "withdraw":
      return -1;
    // `send` covers both a transfer between two addresses and an address moving
    // its own USDC between perp dexes. In the latter the sender and the recipient
    // are the same address and nothing enters or leaves the account.
    case "send":
      if (isSelf(delta.user) && isSelf(delta.destination)) return 0;
      if (isSelf(delta.destination)) return 1;
      if (isSelf(delta.user)) return -1;
      return 0;
    // Spot ↔ perp within one account; the equity figure already spans both sides.
    case "accountClassTransfer":
      return 0;
    default:
      return null;
  }
}

/**
 * Capital put into the account from outside it, in USDC.
 *
 * Counts on-chain deposits and withdrawals plus transfers from or to a different
 * address, and excludes the moves that only shuffle money inside the account
 * (spot ↔ perp, and one address sending USDC to itself across perp dexes). A type
 * that is not recognised is logged rather than guessed at, so a ledger entry the
 * site has not seen before surfaces in the server log instead of silently shifting
 * the figure.
 *
 * This is a reference line: total PnL and the return figures come from
 * Hyperliquid's own PnL series and do not depend on it.
 */
export async function getHyperliquidNetDepositsUsdc() {
  // The manual override describes the default account only; other accounts derive
  // their own figure from their own ledger.
  const manual = isDefaultHyperliquidAccount() ? toNumber(MANUAL_INITIAL_CAPITAL_USDC) : 0;
  if (manual > 0) return manual;

  const address = assertAddress();
  const updates = await getHyperliquidLedgerUpdates();
  let netDeposits = 0;
  let counted = 0;
  const unknownTypes = new Set<string>();

  for (const update of updates) {
    const amount = Math.abs(getLedgerUsdcAmount(update));
    if (amount <= 0) continue;
    const direction = classifyHyperliquidLedgerFlow(update, address);
    if (direction == null) {
      const type = String(update.delta?.type ?? "");
      if (type) unknownTypes.add(type);
      continue;
    }
    if (direction === 0) continue;
    netDeposits += direction * amount;
    counted += 1;
  }

  reportUncountedLedgerTypes(unknownTypes);

  // A withdrawal-heavy account can legitimately land at or below zero; returning
  // the real figure beats collapsing the whole panel to "--".
  return counted > 0 ? netDeposits : null;
}

export async function getHyperliquidMids() {
  return callInfo<Record<string, string>>({ type: "allMids" });
}

interface HyperliquidMetaAsset {
  name?: string;
  maxLeverage?: number;
  isDelisted?: boolean;
}

export interface HyperliquidPerpetualAsset {
  value: string;
  label: string;
  maxLeverage: number;
  maintenanceMarginPercent: string;
}

export async function getHyperliquidPerpetualAssets(): Promise<HyperliquidPerpetualAsset[]> {
  try {
    const readMeta = async (dex?: string) => callInfo<{ universe?: HyperliquidMetaAsset[] }>({
      type: "meta",
      ...(dex ? { dex } : {}),
    });
    const [mainMeta, xyzMeta] = await Promise.all([
      readMeta(),
      readMeta("xyz").catch(() => ({ universe: [] })),
    ]);
    const mapAssets = (universe: HyperliquidMetaAsset[] = [], dex?: string) => universe
      .filter((asset) => asset.name && !asset.isDelisted && Number(asset.maxLeverage) > 0)
      .map((asset) => {
        const maxLeverage = Number(asset.maxLeverage);
        const rawName = asset.name as string;
        const normalizedName = dex && rawName.startsWith(`${dex}:`)
          ? rawName.slice(dex.length + 1)
          : rawName;
        const prefix = dex ? `${dex}:` : "";
        return {
          value: `${prefix}${normalizedName}-PERP`,
          label: `${prefix}${normalizedName}-PERP`,
          maxLeverage,
          maintenanceMarginPercent: (50 / maxLeverage).toFixed(2),
        };
      });
    return [...mapAssets(mainMeta.universe), ...mapAssets(xyzMeta.universe, "xyz")]
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (error) {
    console.warn("[Hyperliquid] Failed to read perpetual asset metadata:", error);
    return [];
  }
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
    btc: pickMid(mids, ["BTC", "BTCUSDC", "BTCUSDT"]),
    eth: pickMid(mids, ["ETH", "ETHUSDC", "ETHUSDT"]),
    gold: pickMid(mids, ["GOLD", "XAU", "XAUUSD", "PAXG"]),
    nas100: pickMid(mids, ["NAS100", "NDX", "NASDAQ", "US100"]),
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

export interface HyperliquidPortfolioPoint {
  time: number;
  equity: number;
  /** Hyperliquid's own cumulative PnL since the window start. */
  pnl: number;
}

/**
 * Pairs the account value and PnL series of the all-time window into one list.
 *
 * Hyperliquid returns both on the same sampling grid; when a PnL sample is
 * missing the previous value carries forward, which reads as "no PnL change at
 * this point" rather than inventing one.
 */
export function getHyperliquidPortfolioSeries(portfolio: HyperliquidPortfolio): HyperliquidPortfolioPoint[] {
  const windowData =
    findPortfolioWindow(portfolio, "allTime") ??
    portfolio.find(([, data]) => data.accountValueHistory?.length)?.[1];
  const equityHistory = windowData?.accountValueHistory ?? [];
  const pnlHistory = windowData?.pnlHistory ?? [];
  if (equityHistory.length === 0) return [];

  const pnlByTime = new Map(pnlHistory.map(([time, value]) => [time, toNumber(value)]));
  let lastPnl = pnlHistory.length > 0 ? toNumber(pnlHistory[0][1]) : 0;
  return equityHistory.map(([time, equity]) => {
    const pnl = pnlByTime.get(time);
    if (pnl != null) lastPnl = pnl;
    return { time, equity: toNumber(equity), pnl: lastPnl };
  });
}

/**
 * Hyperliquid's own cumulative PnL for the account, in USDC.
 *
 * Preferred over "current equity − net deposits": Hyperliquid derives it from the
 * account's trade and funding ledger, so deposits, withdrawals and transfers can
 * never leak into it. The two agree while the ledger is simple; this one stays
 * right when it isn't.
 */
export function getHyperliquidCumulativePnlUsdc(portfolio: HyperliquidPortfolio) {
  const series = getHyperliquidPortfolioSeries(portfolio);
  const latest = series.at(-1);
  return latest ? latest.pnl : null;
}

/**
 * Time-weighted return over the whole account history, in percent.
 *
 * Each interval contributes Hyperliquid's PnL change divided by the equity at the
 * start of that interval, and the intervals are chain-linked. Because the
 * numerator is PnL rather than equity change, a deposit or withdrawal only moves
 * the base for later intervals — it never registers as a gain or a loss the way
 * "current equity ÷ net deposits" does.
 */
export function getHyperliquidTimeWeightedReturnPct(portfolio: HyperliquidPortfolio) {
  const series = getHyperliquidPortfolioSeries(portfolio);
  if (series.length < 2) return null;

  let growth = 1;
  let counted = 0;
  for (let i = 1; i < series.length; i += 1) {
    const previous = series[i - 1];
    // Samples taken before the account was funded have no base to return on.
    if (previous.equity <= 0) continue;
    const intervalReturn = (series[i].pnl - previous.pnl) / previous.equity;
    if (!Number.isFinite(intervalReturn)) continue;
    growth *= 1 + intervalReturn;
    counted += 1;
    if (growth <= 0) return -100;
  }

  return counted > 0 ? (growth - 1) * 100 : null;
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

/** Compounds a total return over `runningDays` up to a yearly rate. */
function annualizeReturnPct(totalReturnPct: number | null | undefined, runningDays: number | null | undefined) {
  if (totalReturnPct == null || !Number.isFinite(totalReturnPct)) return null;
  if (!runningDays || runningDays <= 0) return null;
  const growth = 1 + totalReturnPct / 100;
  if (growth <= 0) return -100;
  return (Math.pow(growth, 365 / runningDays) - 1) * 100;
}

function calculateCalmarRatio(annualizedReturnPct: number | null | undefined, maxDrawdownPct: number | null | undefined) {
  if (annualizedReturnPct == null || maxDrawdownPct == null) return null;
  if (!Number.isFinite(annualizedReturnPct) || !Number.isFinite(maxDrawdownPct)) return null;
  const drawdownAbsPct = Math.abs(maxDrawdownPct);
  if (drawdownAbsPct <= 0) return null;
  return annualizedReturnPct / drawdownAbsPct;
}

function calculateRunningDaysFromFirstFill(fills: HyperliquidFill[]) {
  const firstFillTime = fills.reduce<number | null>((earliest, fill) => {
    const time = Number(fill.time);
    if (!Number.isFinite(time) || time <= 0) return earliest;
    return earliest == null || time < earliest ? time : earliest;
  }, null);

  if (firstFillTime == null) return null;
  return Math.max(1, Math.ceil((Date.now() - firstFillTime) / (24 * 60 * 60 * 1000)));
}

export function getHyperliquidPerformanceStats(portfolio: HyperliquidPortfolio) {
  const series = getHyperliquidPortfolioSeries(portfolio);

  if (series.length < 2) {
    return {
      sharpeRatio: null,
      annualizedReturnPct: null,
      runningDays: null,
    };
  }

  const runningDays = Math.max(1, Math.ceil((Date.now() - series[0].time) / (24 * 60 * 60 * 1000)));
  const annualizedReturnPct = annualizeReturnPct(getHyperliquidTimeWeightedReturnPct(portfolio), runningDays);

  // Daily returns drive volatility, so they are PnL over the prior day's equity
  // rather than the change in equity — otherwise the day of a deposit reads as a
  // huge "return" and inflates the volatility that Sharpe divides by.
  const dailyClose = new Map<string, HyperliquidPortfolioPoint>();
  for (const point of series) {
    dailyClose.set(getUtc8DateKey(point.time), point);
  }

  const dailyPoints = Array.from(dailyClose.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);
  const dailyReturns: number[] = [];
  for (let i = 1; i < dailyPoints.length; i += 1) {
    const previous = dailyPoints[i - 1];
    if (previous.equity <= 0) continue;
    const dailyReturn = (dailyPoints[i].pnl - previous.pnl) / previous.equity;
    if (Number.isFinite(dailyReturn)) dailyReturns.push(dailyReturn);
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

export function calculateRoundTripTradeMetrics(fills: HyperliquidFill[]) {
  const tolerance = 0.00000001;
  // `userFills` returns newest-first while `userFillsByTime` returns oldest-first.
  // Array#sort is stable, so partial fills sharing a timestamp keep their input
  // order — a newest-first batch must be reversed before sorting, otherwise the
  // startPosition chain reads backwards and round trips split apart.
  const chronological =
    fills.length > 1 && fills[0].time > fills[fills.length - 1].time
      ? fills.slice().reverse()
      : fills.slice();
  const sortedFills = chronological.sort((a, b) => a.time - b.time);
  const openTrades = new Map<string, { pnl: number; openedAt: number }>();
  const completedPnls: number[] = [];
  const completedHoldingHours: number[] = [];

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
      openTrades.set(coin, { pnl: 0, openedAt: fill.time });
    }

    if (startsFlat && !endsFlat && !openTrades.has(coin)) {
      openTrades.set(coin, { pnl: 0, openedAt: fill.time });
    }

    const current = openTrades.get(coin);
    if (current) current.pnl += realizedPnl;

    if (endsFlat || flipsSide) {
      const closingTrade = openTrades.get(coin);
      if (closingTrade) {
        completedPnls.push(closingTrade.pnl);
        const holdingHours = (fill.time - closingTrade.openedAt) / (60 * 60 * 1000);
        if (Number.isFinite(holdingHours) && holdingHours >= 0) {
          completedHoldingHours.push(holdingHours);
        }
      }
      openTrades.delete(coin);
      if (flipsSide) {
        openTrades.set(coin, { pnl: 0, openedAt: fill.time });
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
  const expectancyUsdc = completedPnls.length > 0
    ? completedPnls.reduce((sum, pnl) => sum + pnl, 0) / completedPnls.length
    : null;
  const averageHoldingHours = completedHoldingHours.length > 0
    ? completedHoldingHours.reduce((sum, hours) => sum + hours, 0) / completedHoldingHours.length
    : null;

  // Longest losing streak over completed round trips (already in close-time order).
  // Ties on streak length resolve to the streak with the larger cumulative loss.
  let maxConsecutiveLosses = 0;
  let maxConsecutiveLossUsdc = 0;
  let streakCount = 0;
  let streakLossUsdc = 0;
  for (const pnl of completedPnls) {
    if (pnl < 0) {
      streakCount += 1;
      streakLossUsdc += pnl;
      if (
        streakCount > maxConsecutiveLosses ||
        (streakCount === maxConsecutiveLosses && streakLossUsdc < maxConsecutiveLossUsdc)
      ) {
        maxConsecutiveLosses = streakCount;
        maxConsecutiveLossUsdc = streakLossUsdc;
      }
    } else {
      streakCount = 0;
      streakLossUsdc = 0;
    }
  }

  return {
    totalTrades: completedPnls.length,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRate: completedPnls.length > 0 ? (winningTrades / completedPnls.length) * 100 : null,
    plRatio: avgLoss > 0 ? avgWin / avgLoss : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    maxConsecutiveLosses: completedPnls.length > 0 ? maxConsecutiveLosses : null,
    maxConsecutiveLossUsdc: completedPnls.length > 0 ? maxConsecutiveLossUsdc : null,
    expectancyUsdc,
    averageHoldingHours,
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

// Pick the finest-grained portfolio window whose history actually covers the
// requested start time. Choosing by range age alone can silently drop the
// earliest days of a range (e.g. a 10-day range served from the ~7-day week
// window). The tolerance absorbs the gap between the date-floored start and
// the window's first sample so boundary requests keep the finer granularity.
function choosePortfolioWindow(portfolio: HyperliquidPortfolio, startMs: number) {
  const toleranceMs = 24 * 60 * 60 * 1000;
  let fallback: HyperliquidPortfolioWindow | null = null;
  for (const name of ["day", "week", "month", "allTime"]) {
    const windowData = findPortfolioWindow(portfolio, name);
    if (!windowData) continue;
    fallback = windowData;
    const firstTime = windowData.accountValueHistory?.[0]?.[0];
    if (firstTime != null && firstTime <= startMs + toleranceMs) return windowData;
  }
  return fallback;
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
  const startMs = params.startDate ? new Date(`${params.startDate}T00:00:00Z`).getTime() : 0;
  const endMs = params.endDate ? new Date(`${params.endDate}T23:59:59Z`).getTime() : Number.MAX_SAFE_INTEGER;
  const windowData =
    choosePortfolioWindow(portfolio, startMs) ??
    portfolio.find(([, data]) => data.accountValueHistory?.length)?.[1];

  if (!windowData) return [];
  const pnlHistory = windowData.pnlHistory ?? [];
  const accountValueHistory = windowData.accountValueHistory ?? [];
  const baseEquity = accountValueHistory.length > 0 ? toNumber(accountValueHistory[0][1]) : 0;
  const filteredHistory = accountValueHistory
    .filter(([time]) => time >= startMs && time <= endMs)
    .slice(-(params.limit ?? 1000));

  const firstTime = filteredHistory[0]?.[0] ?? startMs;
  const lastTime = filteredHistory[filteredHistory.length - 1]?.[0] ?? Math.min(endMs, Date.now());
  const historySpanMs = lastTime - firstTime;
  const interval = historySpanMs <= 30 * 24 * 60 * 60 * 1000 ? "1h" : "1d";
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
    const candleTime = (candle: HyperliquidCandle) => candle.t ?? candle.T ?? 0;
    let best = candles[0];
    let bestDistance = Math.abs(candleTime(candles[0]) - time);
    for (const candle of candles) {
      const distance = Math.abs(candleTime(candle) - time);
      if (distance < bestDistance) {
        best = candle;
        bestDistance = distance;
      }
    }
    return best?.c ?? null;
  };

  // Rebase PnL to the first visible point so every range starts at 0 and only
  // reflects performance within that range. The window's pnlHistory is
  // cumulative since the window start (inception for allTime), which drifts
  // from the range start once the account outlives the requested range.
  const rawPnlAt = (time: number, equity: string) =>
    toNumber(nearestHistoryValue(pnlHistory, time) ?? toNumber(equity) - baseEquity);
  const pnlBase = filteredHistory.length > 0
    ? rawPnlAt(filteredHistory[0][0], filteredHistory[0][1])
    : 0;

  return filteredHistory
    .map(([time, equity]) => {
      const totalPnl = String(rawPnlAt(time, equity) - pnlBase);
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
      positionValue: String(toNumber(position.positionValue)),
      marginUsed: String(toNumber(position.marginUsed)),
      leverage: String(position.leverage?.value ?? 0),
      avgPrice: String(entry),
      markPrice: String(mark),
      unrealisedPnl: String(toNumber(position.unrealizedPnl)),
      fundingFee: String(-toNumber(position.cumFunding?.sinceOpen)),
      liquidationPrice: position.liquidationPx ? String(position.liquidationPx) : "0",
      profitRate: String(toNumber(position.returnOnEquity)),
      updatedTime: String(state.time ?? now),
    };
    });
  });
}

export async function getHyperliquidAccountOverview() {
  const [
    perpStates,
    spotState,
    accountAbstraction,
    btcPrice,
    allTimeFills,
    portfolio,
    ledgerNetDepositsUsdc,
  ] = await Promise.all([
    getHyperliquidPerpStates(),
    getHyperliquidSpotState().catch(() => ({ balances: [] })),
    getHyperliquidAccountAbstraction().catch(() => null),
    getHyperliquidBtcPrice().catch(() => 0),
    getHyperliquidFills(0).catch(() => []),
    getHyperliquidPortfolio().catch(() => null),
    getHyperliquidNetDepositsUsdc().catch(() => null),
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
  const spotAvailableUsdc = getHyperliquidSpotAvailableUsdc(spotState);
  const fallbackEquityUsdc = portfolioEquity.latest && portfolioEquity.latest > 0
    ? portfolioEquity.latest
    : perpEquityUsdc;
  const totalEquityUsdc = spotEquityUsdc > 0 ? spotEquityUsdc : fallbackEquityUsdc;
  const totalMarginUsed = summaries.reduce((sum, summary) => sum + toNumber(summary.totalMarginUsed), 0);
  const totalNtlPos = summaries.reduce((sum, summary) => sum + toNumber(summary.totalNtlPos), 0);
  const perpWithdrawableUsdc = activePerpStates.reduce(
    (sum, { state }) => sum + toNumber(state.withdrawable),
    0
  );
  const usesUnifiedBalance =
    accountAbstraction === "unifiedAccount" || accountAbstraction === "portfolioMargin";
  const availableUsdc = usesUnifiedBalance
    ? spotAvailableUsdc
    : accountAbstraction
      ? perpWithdrawableUsdc + spotAvailableUsdc
      : perpWithdrawableUsdc > 0
        ? perpWithdrawableUsdc
        : spotAvailableUsdc;
  const positions = activePerpStates.flatMap(({ state }) => state.assetPositions ?? []);
  const sessionUplUsdc = positions.reduce(
    (sum, item) => sum + toNumber(item.position.unrealizedPnl),
    0
  );
  const netDepositsUsdc = ledgerNetDepositsUsdc ?? portfolioEquity.initial;
  // Total PnL comes from Hyperliquid's own cumulative figure so the site always
  // agrees with what the exchange shows. "Equity − net deposits" is only a
  // fallback for when the portfolio endpoint is unavailable; it drifts whenever
  // the ledger contains anything beyond plain deposits and withdrawals.
  const cumulativePnlUsdc = portfolio ? getHyperliquidCumulativePnlUsdc(portfolio) : null;
  const fallbackPnlUsdc = netDepositsUsdc && netDepositsUsdc > 0
    ? totalEquityUsdc - netDepositsUsdc
    : null;
  const totalPnlUsdc = cumulativePnlUsdc ?? fallbackPnlUsdc;
  // Time-weighted, so mid-way deposits and withdrawals change the base for later
  // periods without counting as performance.
  const timeWeightedReturnPct = portfolio ? getHyperliquidTimeWeightedReturnPct(portfolio) : null;
  const fallbackPnlPct = fallbackPnlUsdc != null && netDepositsUsdc && netDepositsUsdc > 0
    ? (fallbackPnlUsdc / netDepositsUsdc) * 100
    : null;
  const totalPnlPct = timeWeightedReturnPct ?? fallbackPnlPct;
  const totalEquityBtc = btcPrice > 0 ? totalEquityUsdc / btcPrice : 0;
  // Trade metrics run on the full fill history so their scope matches running
  // days and the metric tooltips; a trailing window would silently drop trades
  // and clip the holding time of any position opened before the window edge.
  const tradeMetrics = calculateRoundTripTradeMetrics(allTimeFills);
  const tradeRunningDays = calculateRunningDaysFromFirstFill(allTimeFills);
  const runningDays = tradeRunningDays ?? performance.runningDays;
  const annualizedReturnPct =
    annualizeReturnPct(timeWeightedReturnPct, runningDays) ?? performance.annualizedReturnPct;
  const calmarRatio = calculateCalmarRatio(annualizedReturnPct, drawdown.maxDrawdownPct);

  return {
    exchange: "Hyperliquid",
    accountMode: "read-only" as const,
    btcPrice,
    perpEquityUsdc,
    spotEquityUsdc,
    spotUsdcBalance,
    spotBalances: spotState.balances ?? [],
    totalEquityUsdc,
    netDepositsUsdc,
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
    availableUsdc,
    marginUsageRatio: totalEquityUsdc > 0 ? totalNtlPos / totalEquityUsdc : 0,
    maxDrawdownUsdc: drawdown.maxDrawdownUsdc,
    maxDrawdownPct: drawdown.maxDrawdownPct,
    sharpeRatio: performance.sharpeRatio,
    annualizedReturnPct,
    runningDays,
    calmarRatio,
    totalNtlPos,
    metrics: tradeMetrics,
  };
}

interface HyperliquidFundingUpdate {
  time?: number;
  delta?: {
    type?: string;
    coin?: string;
    usdc?: string | number;
    szi?: string;
    fundingRate?: string;
  };
}

// Signed funding credited to the account (delta.usdc): positive = received,
// negative = paid.
export async function getHyperliquidFundingHistory(startTime = 0, endTime = Date.now()) {
  const user = assertAddress();
  return callInfo<HyperliquidFundingUpdate[]>({
    type: "userFunding",
    user,
    startTime,
    endTime,
  });
}

export async function getHyperliquidTradeHistory(params: {
  startTime?: number;
  endTime?: number;
  limit?: number;
  category?: "ALL" | "PERP" | "SPOT";
}) {
  const [fills, fundingUpdates, orderHistory, spotPairMap] = await Promise.all([
    getHyperliquidFills(params.startTime, params.endTime),
    getHyperliquidFundingHistory(params.startTime ?? 0, params.endTime ?? Date.now()).catch(() => []),
    getHyperliquidOrderHistory(1000).catch(() => []),
    getHyperliquidSpotPairMap().catch(() => new Map<string, string>()),
  ]);
  const ordersById = new Map(orderHistory.map((order) => [order.orderId, order]));
  const grouped = new Map<string, {
    fill: HyperliquidFill;
    qty: number;
    value: number;
    fee: number;
    pnl: number;
    latestTime: number;
  }>();

  for (const fill of fills) {
    const side = fill.side === "B" ? "buy" : "sell";
    const timeBucket = Math.floor(fill.time / 1000);
    const orderKey = fill.oid != null && fill.oid !== ""
      ? String(fill.oid)
      : `${fill.hash ?? ""}-${timeBucket}`;
    const key = [
      fill.coin,
      orderKey,
      side,
      fill.dir ?? "",
      fill.crossed ? "market" : "limit",
    ].join("|");
    const qty = toNumber(fill.sz);
    const value = toNumber(fill.px) * qty;
    const current = grouped.get(key);

    if (current) {
      current.qty += qty;
      current.value += value;
      current.fee += toNumber(fill.fee);
      current.pnl += toNumber(fill.closedPnl);
      current.latestTime = Math.max(current.latestTime, fill.time);
    } else {
      grouped.set(key, {
        fill,
        qty,
        value,
        fee: toNumber(fill.fee),
        pnl: toNumber(fill.closedPnl),
        latestTime: fill.time,
      });
    }
  }

  const mapped = Array.from(grouped.values())
    .map((group) => {
      const fill = group.fill;
      const side = fill.side === "B" ? "buy" : "sell";
      const price = group.qty > 0 ? group.value / group.qty : toNumber(fill.px);
      const isSpot = fill.coin.includes("/") || /^@\d+$/.test(fill.coin);
      const category = isSpot ? "SPOT" : "PERP";
      const symbol = isSpot
        ? (fill.coin.includes("/") ? fill.coin : spotPairMap.get(fill.coin) ?? fill.coin)
        : `${fill.coin}-PERP`;
      const orderId = String(fill.oid ?? "");
      const historicalOrder = ordersById.get(orderId);
      const historicalType = String(historicalOrder?.orderType ?? "").toLowerCase();
      const isClosingTrade = String(fill.dir ?? "").toLowerCase().includes("close");
      // Hyperliquid reports the literal string "N/A" (not an empty value) for
      // non-trigger orders — treat it as absent or every manual market close
      // gets misread as a preset trigger.
      const triggerCondition = String(historicalOrder?.triggerCondition ?? "").trim();
      const isPresetTrigger =
        Boolean(historicalOrder?.isTrigger) ||
        (triggerCondition !== "" && triggerCondition.toLowerCase() !== "n/a") ||
        toNumber(historicalOrder?.triggerPrice) > 0;
      // Close method describes the exit *mechanism* (pre-committed trigger vs
      // manual decision), never the PnL outcome — the PnL column already says
      // whether the trade won or lost.
      const isLiquidation =
        Boolean(fill.liquidation) || String(fill.dir ?? "").toLowerCase().includes("liquidat");
      const closeMethod = (() => {
        if (!isClosingTrade) return "";
        if (isLiquidation) return "liquidation";
        if (historicalType.includes("take profit")) return "preset_take_profit";
        if (historicalType.includes("stop")) return "preset_stop_loss";
        if (isPresetTrigger) return "preset_trigger";
        return "active_close";
      })();
      return {
        execId: fill.hash ? `${fill.hash}-${orderId}-${group.latestTime}` : `${fill.coin}-${orderId}-${group.latestTime}`,
        orderId,
        category,
        symbol,
        orderType: fill.crossed ? "Market" : "Limit",
        side,
        execPrice: String(price),
        execQty: String(group.qty),
        execValue: String(group.value),
        tradeScope: "Hyperliquid",
        tradeSide: fill.dir ?? "",
        feeDetail: [{ feeCoin: fill.feeToken || "USDC", fee: String(group.fee) }],
        createdTime: String(group.latestTime),
        updatedTime: String(group.latestTime),
        execPnl: String(group.pnl),
        closeMethod,
        triggerPrice: toNumber(historicalOrder?.triggerPrice) > 0 ? String(historicalOrder?.triggerPrice) : "",
        isRPI: "false",
      };
    });

  const categoryFiltered = params.category && params.category !== "ALL"
    ? mapped.filter((trade) => trade.category === params.category)
    : mapped;
  const trades = categoryFiltered
    .sort((a, b) => Number(b.createdTime) - Number(a.createdTime))
    .slice(0, params.limit ?? 100);

  const totalFundingUsdc = fundingUpdates.reduce(
    (sum, update) => sum + toNumber(update.delta?.usdc),
    0
  );

  return { trades, total: categoryFiltered.length, cursor: null, totalFundingUsdc };
}
