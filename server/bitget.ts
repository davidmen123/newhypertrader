import crypto from "crypto";
import http from "http";
import https from "https";
import tls from "tls";

type Method = "GET" | "POST" | "PUT" | "DELETE";

const BITGET_BASE_URL = "https://api.bitget.com";

const API_KEY = process.env.BITGET_API_KEY || "";
const SECRET_KEY = process.env.BITGET_SECRET_KEY || "";
const PASSPHRASE = process.env.BITGET_PASSPHRASE || "";

function hasCredentials() {
  return Boolean(API_KEY && SECRET_KEY && PASSPHRASE);
}

export function getBitgetConfigStatus() {
  return {
    configured: hasCredentials(),
    missing: [
      !API_KEY ? "BITGET_API_KEY" : null,
      !SECRET_KEY ? "BITGET_SECRET_KEY" : null,
      !PASSPHRASE ? "BITGET_PASSPHRASE" : null,
    ].filter((v): v is string => Boolean(v)),
  };
}

function buildQuery(params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return "";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.toString();
}

function sign(timestamp: string, method: Method, requestPath: string, queryString: string, body: string) {
  const pathWithQuery = queryString ? `${requestPath}?${queryString}` : requestPath;
  const preHash = `${timestamp}${method.toUpperCase()}${pathWithQuery}${body}`;
  return crypto.createHmac("sha256", SECRET_KEY).update(preHash).digest("base64");
}

function getProxyUrl() {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  return proxy ? new URL(proxy) : null;
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
        reject(new Error(`Bitget returned a non-JSON response: ${text.slice(0, 120)}`));
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
      request.on("timeout", () => request.destroy(new Error("Bitget request timed out")));
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
      headers: {
        Host: `${target.hostname}:443`,
      },
      timeout: 20000,
    });

    connect.on("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Bitget proxy connection failed: ${response.statusCode}`));
        return;
      }

      const tlsSocket = tls.connect({ socket, servername: target.hostname }, () => {
        const request = http.request(
          {
            method,
            host: target.hostname,
            path: `${target.pathname}${target.search}`,
            headers: {
              Host: target.hostname,
              ...headers,
            },
            createConnection: () => tlsSocket,
            timeout: 20000,
          },
          async (bitgetResponse) => {
            try {
              resolve(await readJsonResponse<T>(bitgetResponse));
            } catch (error) {
              reject(error);
            }
          }
        );
        request.on("timeout", () => request.destroy(new Error("Bitget request timed out")));
        request.on("error", reject);
        if (body) request.write(body);
        request.end();
      });

      tlsSocket.on("error", reject);
    });

    connect.on("timeout", () => connect.destroy(new Error("Bitget proxy connection timed out")));
    connect.on("error", reject);
    connect.end();
  });
}

async function callPrivate<T>(
  method: Method,
  requestPath: string,
  params?: Record<string, string | number | boolean | undefined>,
  bodyData?: unknown
): Promise<T> {
  const status = getBitgetConfigStatus();
  if (!status.configured) {
    throw new Error(`Bitget API is not configured: missing ${status.missing.join(", ")}`);
  }

  const queryString = buildQuery(params);
  const body = bodyData ? JSON.stringify(bodyData) : "";
  const timestamp = Date.now().toString();
  const signature = sign(timestamp, method, requestPath, queryString, body);

  const payload = await requestJson<{ code?: string; msg?: string; data?: T }>(
    `${BITGET_BASE_URL}${requestPath}${queryString ? `?${queryString}` : ""}`,
    method,
    {
      "ACCESS-KEY": API_KEY,
      "ACCESS-SIGN": signature,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": PASSPHRASE,
      "Content-Type": "application/json",
      locale: "en-US",
    },
    body
  );

  if (payload?.code && payload.code !== "00000") {
    throw new Error(`Bitget API error [${requestPath}]: ${payload.code} ${payload.msg ?? ""}`);
  }

  return payload?.data as T;
}

export interface BitgetSpotAsset {
  coin: string;
  available: string;
  frozen: string;
  locked: string;
  limitAvailable: string;
  uTime: string;
}

export interface BitgetFuturesAccount {
  marginCoin: string;
  locked: string;
  available: string;
  crossedMaxAvailable: string;
  isolatedMaxAvailable: string;
  maxTransferOut: string;
  accountEquity: string;
  usdtEquity: string;
  btcEquity: string;
  crossedRiskRate: string;
  unrealizedPL: string;
}

export interface BitgetUnifiedAsset {
  coin: string;
  equity: string;
  usdValue: string;
  balance: string;
  available: string;
  debt: string;
  locked: string;
}

export interface BitgetUnifiedAccountAssets {
  accountEquity: string;
  usdtEquity: string;
  btcEquity: string;
  unrealisedPnl: string;
  usdtUnrealisedPnl: string;
  btcUnrealizedPnl: string;
  effEquity: string;
  mmr: string;
  imr: string;
  mgnRatio: string;
  positionMgnRatio: string;
  assets: BitgetUnifiedAsset[];
}

export interface BitgetPosition {
  category: string;
  symbol: string;
  marginCoin: string;
  holdMode: string;
  posSide: string;
  marginMode: string;
  positionBalance: string;
  available: string;
  frozen: string;
  total: string;
  leverage: string;
  curRealisedPnl: string;
  avgPrice: string;
  positionStatus: string;
  unrealisedPnl: string;
  liquidationPrice: string;
  mmr: string;
  profitRate: string;
  markPrice: string;
  breakEvenPrice: string;
  totalFunding: string;
  openFeeTotal: string;
  closeFeeTotal: string;
  createdTime: string;
  updatedTime: string;
}

export interface BitgetFill {
  execId: string;
  execLinkId: string;
  orderId: string;
  clientOid: string;
  category: string;
  symbol: string;
  orderType: string;
  side: string;
  execPrice: string;
  execQty: string;
  execValue: string;
  tradeScope: string;
  tradeSide: string;
  feeDetail?: Array<{
    feeCoin: string;
    fee: string;
  }>;
  createdTime: string;
  updatedTime: string;
  execPnl: string;
  isRPI: string;
}

function toNumber(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getUnifiedAccountAssets() {
  return callPrivate<BitgetUnifiedAccountAssets>("GET", "/api/v3/account/assets");
}

export async function getCurrentPositions(category = "USDT-FUTURES") {
  const data = await callPrivate<{ list?: BitgetPosition[] }>(
    "GET",
    "/api/v3/position/current-position",
    { category }
  );
  return data?.list ?? [];
}

export async function getAllCurrentPositions() {
  const categories = ["USDT-FUTURES", "COIN-FUTURES", "USDC-FUTURES"];
  const results = await Promise.allSettled(categories.map((category) => getCurrentPositions(category)));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

export async function getFillHistory(params: {
  category?: string;
  symbol?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  cursor?: string;
}) {
  const data = await callPrivate<{ list?: BitgetFill[]; cursor?: string }>(
    "GET",
    "/api/v3/trade/fills",
    {
      category: params.category,
      symbol: params.symbol,
      startTime: params.startTime,
      endTime: params.endTime,
      limit: params.limit,
      cursor: params.cursor,
    }
  );

  return {
    list: data?.list ?? [],
    cursor: data?.cursor ?? null,
  };
}

export async function getSpotAssets() {
  return callPrivate<BitgetSpotAsset[]>("GET", "/api/v2/spot/account/assets");
}

export async function getFuturesAccounts(productType = "USDT-FUTURES") {
  return callPrivate<BitgetFuturesAccount[]>("GET", "/api/v2/mix/account/accounts", {
    productType,
  });
}

export async function getBitgetAccountOverview() {
  try {
    const unifiedAccount = await getUnifiedAccountAssets();
    const totalEquityUsdt = toNumber(unifiedAccount.usdtEquity || unifiedAccount.accountEquity);
    const futuresUnrealizedPnl = toNumber(
      unifiedAccount.usdtUnrealisedPnl || unifiedAccount.unrealisedPnl
    );

    return {
      accountMode: "unified" as const,
      unifiedAccount,
      spotAssets: unifiedAccount.assets,
      futuresAccounts: [],
      spotAssetsCount: unifiedAccount.assets.length,
      futuresAccountsCount: 0,
      spotUsdtEquity: totalEquityUsdt,
      futuresEquityUsdt: 0,
      futuresUnrealizedPnl,
      totalEquityUsdt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("40085")) throw error;

    const [spotAssets, futuresAccounts] = await Promise.all([
      getSpotAssets(),
      getFuturesAccounts("USDT-FUTURES"),
    ]);

    const spotUsdt = spotAssets.find((asset) => asset.coin?.toUpperCase() === "USDT");
    const spotUsdtEquity =
      toNumber(spotUsdt?.available) +
      toNumber(spotUsdt?.frozen) +
      toNumber(spotUsdt?.locked) +
      toNumber(spotUsdt?.limitAvailable);

    const futuresEquityUsdt = futuresAccounts.reduce(
      (sum, account) => sum + toNumber(account.usdtEquity || account.accountEquity),
      0
    );
    const futuresUnrealizedPnl = futuresAccounts.reduce(
      (sum, account) => sum + toNumber(account.unrealizedPL),
      0
    );

    return {
      accountMode: "classic" as const,
      unifiedAccount: null,
      spotAssets,
      futuresAccounts,
      spotAssetsCount: spotAssets.length,
      futuresAccountsCount: futuresAccounts.length,
      spotUsdtEquity,
      futuresEquityUsdt,
      futuresUnrealizedPnl,
      totalEquityUsdt: spotUsdtEquity + futuresEquityUsdt,
    };
  }
}
