import axios from "axios";
import WebSocket from "ws";

const DERIBIT_BASE_URL = "https://www.deribit.com/api/v2";
const DERIBIT_WS_URL = "wss://www.deribit.com/ws/api/v2";

const CLIENT_ID = process.env.DERIBIT_CLIENT_ID || "";
const CLIENT_SECRET = process.env.DERIBIT_CLIENT_SECRET || "";

interface AuthToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  expiresAt: number;
}

let cachedToken: AuthToken | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.access_token;
  }

  const response = await axios.post(`${DERIBIT_BASE_URL}/public/auth`, {
    jsonrpc: "2.0",
    method: "public/auth",
    params: {
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    },
    id: 1,
  });

  const result = response.data?.result;
  if (!result?.access_token) {
    throw new Error("Deribit auth failed: " + JSON.stringify(response.data));
  }

  cachedToken = {
    ...result,
    expiresAt: now + result.expires_in * 1000,
  };

  return cachedToken!.access_token;
}

async function callPrivate<T>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const token = await getAccessToken();
  const response = await axios.post(
    `${DERIBIT_BASE_URL}/${method}`,
    {
      jsonrpc: "2.0",
      method,
      params,
      id: Math.floor(Math.random() * 100000),
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (response.data?.error) {
    throw new Error(
      `Deribit API error [${method}]: ${JSON.stringify(response.data.error)}`
    );
  }

  return response.data?.result as T;
}

async function callPublic<T>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const response = await axios.post(`${DERIBIT_BASE_URL}/${method}`, {
    jsonrpc: "2.0",
    method,
    params,
    id: Math.floor(Math.random() * 100000),
  });

  if (response.data?.error) {
    throw new Error(
      `Deribit API error [${method}]: ${JSON.stringify(response.data.error)}`
    );
  }

  return response.data?.result as T;
}

// ─── Account ────────────────────────────────────────────────────────────────

export interface AccountSummary {
  currency: string;
  balance: number;
  equity: number;
  available_funds: number;
  margin_balance: number;
  unrealized_pl: number;
  realized_pl: number;
  session_upl: number;
  session_rpl: number;
  initial_margin: number;
  maintenance_margin: number;
  delta_total: number;
  futures_pl: number;
  futures_session_upl: number;
  options_pl: number;
  options_session_upl: number;
  options_value: number;
  portfolio_margining_enabled: boolean;
  available_withdrawal_funds: number;
  options_vega: number;
  options_theta: number;
  options_gamma: number;
  total_pl: number;
  projected_initial_margin: number;
  projected_maintenance_margin: number;
}

export async function getAccountSummary(
  currency: string
): Promise<AccountSummary> {
  return callPrivate<AccountSummary>("private/get_account_summary", {
    currency,
    extended: true,
  });
}

export async function getAccountSummaries(): Promise<AccountSummary[]> {
  const result = await callPrivate<{ summaries: AccountSummary[] }>(
    "private/get_account_summaries",
    { extended: true }
  );
  return result.summaries || [];
}

// ─── Positions ──────────────────────────────────────────────────────────────

export interface Position {
  instrument_name: string;
  kind: string;
  direction: string;
  size: number;
  size_currency: number;
  average_price: number;
  average_price_usd: number;
  mark_price: number;
  index_price: number;
  settlement_price: number;
  open_orders_margin: number;
  initial_margin: number;
  maintenance_margin: number;
  unrealized_pnl: number;
  realized_pnl: number;
  total_profit_loss: number;
  realized_funding: number;
  floating_profit_loss: number;
  floating_profit_loss_usd: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  estimated_liquidation_price: number | null;
  leverage: number;
  currency: string;
  kind_type?: string;
  option_type?: string;
  strike?: number;
  expiration_timestamp?: number;
}

export async function getPositions(
  currency: string,
  kind?: string
): Promise<Position[]> {
  const params: Record<string, unknown> = { currency };
  if (kind) params.kind = kind;
  return callPrivate<Position[]>("private/get_positions", params);
}

export async function getAllPositions(): Promise<Position[]> {
  const currencies = ["BTC", "ETH", "USDC", "USDT", "SOL"];
  const results = await Promise.allSettled(
    currencies.map(c => getPositions(c))
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<Position[]> => r.status === "fulfilled"
    )
    .flatMap(r => r.value)
    .filter(p => p.size !== 0);
}

// ─── Trades ─────────────────────────────────────────────────────────────────

export interface DeribitTrade {
  trade_id: string;
  order_id: string;
  instrument_name: string;
  direction: "buy" | "sell";
  amount: number;
  price: number;
  fee: number;
  fee_currency: string;
  index_price: number;
  mark_price: number;
  profit_loss: number;
  trade_seq: number;
  state: string;
  label: string;
  timestamp: number;
  tick_direction: number;
  matching_id: string | null;
  liquidity: string;
  order_type: string;
}

export async function getUserTradesByCurrency(
  currency: string,
  count = 100,
  startTimestamp?: number,
  endTimestamp?: number
): Promise<DeribitTrade[]> {
  const params: Record<string, unknown> = {
    currency,
    count,
    sorting: "desc",
  };
  if (startTimestamp) params.start_timestamp = startTimestamp;
  if (endTimestamp) params.end_timestamp = endTimestamp;

  const result = await callPrivate<{ trades: DeribitTrade[] }>(
    "private/get_user_trades_by_currency",
    params
  );
  return result.trades || [];
}

export async function getAllUserTrades(
  count = 50,
  startTimestamp?: number,
  endTimestamp?: number
): Promise<DeribitTrade[]> {
  const currencies = ["BTC", "ETH", "USDC", "USDT", "SOL"];
  const results = await Promise.allSettled(
    currencies.map(c =>
      getUserTradesByCurrency(c, count, startTimestamp, endTimestamp)
    )
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<DeribitTrade[]> =>
        r.status === "fulfilled"
    )
    .flatMap(r => r.value)
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ─── Index Price ─────────────────────────────────────────────────────────────

export async function getIndexPrice(indexName: string): Promise<number> {
  const result = await callPublic<{ index_price: number }>(
    "public/get_index_price",
    {
      index_name: indexName,
    }
  );
  return result.index_price;
}

// ─── WebSocket Manager ───────────────────────────────────────────────────────

type WsListener = (data: unknown) => void;

class DeribitWebSocketManager {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<WsListener>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private authenticated = false;
  private pendingSubscriptions: string[] = [];

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    console.log("[Deribit WS] Connecting...");
    this.ws = new WebSocket(DERIBIT_WS_URL);

    this.ws.on("open", () => {
      console.log("[Deribit WS] Connected");
      this.authenticate();
      this.startPing();
    });

    this.ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleMessage(msg);
      } catch (e) {
        // ignore parse errors
      }
    });

    this.ws.on("close", () => {
      console.log("[Deribit WS] Disconnected, reconnecting in 5s...");
      this.authenticated = false;
      this.stopPing();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err: Error) => {
      console.error("[Deribit WS] Error:", err.message);
    });
  }

  private authenticate() {
    this.send({
      jsonrpc: "2.0",
      method: "public/auth",
      params: {
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      },
      id: 9999,
    });
  }

  private handleMessage(msg: Record<string, unknown>) {
    // Auth response
    if (msg.id === 9999 && msg.result) {
      this.authenticated = true;
      console.log("[Deribit WS] Authenticated");
      // Re-subscribe pending channels
      if (this.pendingSubscriptions.length > 0) {
        this.subscribeChannels(this.pendingSubscriptions);
        this.pendingSubscriptions = [];
      }
      return;
    }

    // Subscription notification
    if (msg.method === "subscription" && msg.params) {
      const params = msg.params as { channel: string; data: unknown };
      const channel = params.channel;
      const data = params.data;
      const listeners = this.listeners.get(channel);
      if (listeners) {
        listeners.forEach(fn => fn(data));
      }
      // Also broadcast to wildcard listeners
      const wildcardListeners = this.listeners.get("*");
      if (wildcardListeners) {
        wildcardListeners.forEach(fn => fn({ channel, data }));
      }
    }
  }

  private subscribeChannels(channels: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const hasPrivate = channels.some(c => c.startsWith("user."));
    const method = hasPrivate ? "private/subscribe" : "public/subscribe";
    this.send({
      jsonrpc: "2.0",
      method,
      params: { channels },
      id: Math.floor(Math.random() * 10000),
    });
  }

  subscribe(channel: string, listener: WsListener) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
      // Actually subscribe on WS
      if (this.authenticated) {
        this.subscribeChannels([channel]);
      } else {
        this.pendingSubscriptions.push(channel);
      }
    }
    this.listeners.get(channel)!.add(listener);
  }

  unsubscribe(channel: string, listener: WsListener) {
    this.listeners.get(channel)?.delete(listener);
  }

  private send(data: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startPing() {
    this.pingTimer = setInterval(() => {
      this.send({ jsonrpc: "2.0", method: "public/test", id: 8888 });
    }, 30_000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticated;
  }
}

export const deribitWs = new DeribitWebSocketManager();
