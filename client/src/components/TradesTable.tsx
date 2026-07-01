import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { RefreshCw } from "lucide-react";

function fmt(val: number | string | undefined | null, d = 4): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

const CURRENCIES = ["BTC", "ETH"];

export default function TradesTable() {
  const [currency, setCurrency] = useState("BTC");
  const [count, setCount] = useState(50);
  const [mode, setMode] = useState<"recent" | "historical">("recent");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const recentQuery = trpc.deribit.recentTrades.useQuery(
    { currency, count },
    { enabled: mode === "recent", refetchInterval: 30_000 }
  );

  const historicalQuery = trpc.deribit.historicalTrades.useQuery(
    {
      currency,
      startTimestamp: startDate ? new Date(startDate).getTime() : undefined,
      endTimestamp: endDate ? new Date(endDate + "T23:59:59").getTime() : undefined,
      limit: count,
    },
    { enabled: mode === "historical" }
  );

  const activeQuery = mode === "recent" ? recentQuery : historicalQuery;
  const trades = mode === "recent"
    ? (recentQuery.data || [])
    : (historicalQuery.data?.trades || []);

  return (
    <div className="glass-card px-8 py-7 fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-light tracking-tight" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            Trade History
            {trades.length > 0 && (
              <span className="ml-2 text-muted-foreground text-base font-light">({trades.length})</span>
            )}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <button onClick={() => activeQuery.refetch()} className="text-muted-foreground hover:text-foreground transition-colors p-1">
          <RefreshCw size={13} className={activeQuery.isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Mode */}
        <div className="flex gap-2">
          {(["recent", "historical"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`pill-tab ${mode === m ? "active" : ""}`}>
              {m}
            </button>
          ))}
        </div>

        {/* Currency */}
        <div className="flex gap-2">
          {CURRENCIES.map((c) => (
            <button key={c} onClick={() => setCurrency(c)} className={`pill-tab ${currency === c ? "active" : ""}`}>
              {c}
            </button>
          ))}
        </div>

        {/* Count */}
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="bg-transparent text-muted-foreground border border-border/50 rounded-full px-3 py-1 text-xs tracking-widest uppercase"
          style={{ outline: "none" }}
        >
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n} style={{ background: "rgb(17 17 20)" }}>{n} rows</option>
          ))}
        </select>

        {/* Date range */}
        {mode === "historical" && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent border border-border/50 rounded px-2 py-1 text-xs text-foreground/80"
              style={{ colorScheme: "light" }}
            />
            <span className="text-muted-foreground text-xs">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent border border-border/50 rounded px-2 py-1 text-xs text-foreground/80"
              style={{ colorScheme: "light" }}
            />
          </div>
        )}
      </div>

      {activeQuery.isLoading && <div className="text-muted-foreground text-sm animate-pulse py-4">Loading...</div>}
      {activeQuery.error && <div className="text-loss text-sm py-2">{activeQuery.error.message}</div>}
      {!activeQuery.isLoading && trades.length === 0 && (
        <div className="text-muted-foreground text-center py-10 tracking-widest uppercase" style={{ fontSize: "0.75rem" }}>
          No trades found
        </div>
      )}

      {trades.length > 0 && (
        <div className="overflow-x-auto">
          <table className="minimal-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Instrument</th>
                <th>Direction</th>
                <th>Amount</th>
                <th>Price</th>
                <th>Fee</th>
                <th>PnL</th>
                <th>Mark Price</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => {
                const isRecent = mode === "recent";
                const tradeId = isRecent ? (t as { trade_id: string }).trade_id : (t as { tradeId: string }).tradeId;
                const instrument = isRecent ? (t as { instrument_name: string }).instrument_name : (t as { instrument: string }).instrument;
                const direction = (t as { direction: string }).direction;
                const amount = isRecent ? (t as { amount: number }).amount : (t as { amount: string }).amount;
                const price = isRecent ? (t as { price: number }).price : (t as { price: string }).price;
                const fee = isRecent ? (t as { fee: number }).fee : (t as { fee: string | null }).fee;
                const profit = isRecent ? (t as { profit_loss: number }).profit_loss : (t as { profit: string | null }).profit;
                const markPrice = isRecent ? (t as { mark_price: number }).mark_price : null;
                const timestamp = isRecent ? (t as { timestamp: number }).timestamp : (t as { tradeTimestamp: number }).tradeTimestamp;
                const profitNum = typeof profit === "string" ? parseFloat(profit) : profit;

                return (
                  <tr key={tradeId || i}>
                    <td className="text-muted-foreground whitespace-nowrap" style={{ fontSize: "0.75rem" }}>{fmtTime(timestamp)}</td>
                    <td className="text-foreground" style={{ fontSize: "0.78rem" }}>{instrument}</td>
                    <td>
                      <span className={direction === "buy" ? "text-profit" : "text-loss"} style={{ fontSize: "0.75rem" }}>
                        {direction === "buy" ? "Long" : "Short"}
                      </span>
                    </td>
                    <td>{fmt(amount, 0)}</td>
                    <td>{fmt(price, 2)}</td>
                    <td className="text-muted-foreground">{fmt(fee, 6)}</td>
                    <td>
                      {profitNum != null ? (
                        <span className={profitNum > 0 ? "text-profit" : profitNum < 0 ? "text-loss" : "text-neutral"}>
                          {profitNum > 0 ? "+" : ""}{fmt(profitNum)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="text-muted-foreground">{markPrice ? fmt(markPrice, 2) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
