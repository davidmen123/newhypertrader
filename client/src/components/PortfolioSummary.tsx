import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw } from "lucide-react";

const SUPPORTED = ["BTC", "ETH"];

function fmt(val: number | undefined | null, d = 4): string {
  if (val == null) return "—";
  return val.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function PnlValue({ value }: { value: number }) {
  const cls = value > 0 ? "text-profit" : value < 0 ? "text-loss" : "text-neutral";
  return (
    <span className={`num-display ${cls}`}>
      {value > 0 ? "+" : ""}{fmt(value)}
    </span>
  );
}

function StatBox({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-1.5 p-4 rounded-lg" style={{ background: "rgb(255 255 255 / 5%)", border: "1px solid rgb(255 255 255 / 8%)" }}>
      <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>{label}</span>
      <div className="num-display text-lg">{value}</div>
      {sub && <span className="text-muted-foreground/60" style={{ fontSize: "0.65rem" }}>{sub}</span>}
    </div>
  );
}

export default function PortfolioSummary() {
  const { tr } = useLang();
  const { data, isLoading, error, refetch, isFetching } = trpc.deribit.accountSummaries.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  const summaries = (data || []).filter((s) => SUPPORTED.includes(s.currency));

  // Compute USDT equivalent totals
  const btc = summaries.find((s) => s.currency === "BTC");
  const eth = summaries.find((s) => s.currency === "ETH");

  return (
    <div className="glass-card px-8 py-7 fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {tr.portfolio}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground transition-colors p-1">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm animate-pulse py-4">{tr.loading}</div>}
      {error && <div className="text-loss text-sm py-2">{error.message}</div>}

      {!isLoading && summaries.length === 0 && !error && (
        <div className="text-muted-foreground text-sm text-center py-8">{tr.noData}</div>
      )}

      {summaries.map((s) => (
        <div key={s.currency} className="mb-8 last:mb-0">
          {/* Currency header */}
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-4xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
              {s.currency}
            </span>
            <span className="text-muted-foreground text-xs tracking-widest uppercase">{tr.perpetual}</span>
          </div>

          {/* Primary grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
            <StatBox
              label={tr.currentEquity}
              value={<span className="text-foreground">{fmt(s.equity)}</span>}
              sub={s.currency}
            />
            <StatBox
              label={tr.balance}
              value={<span className="text-foreground/90">{fmt(s.balance)}</span>}
              sub={s.currency}
            />
            <StatBox
              label={tr.unrealizedPnlLabel}
              value={<PnlValue value={s.unrealized_pl} />}
              sub={s.currency}
            />
            <StatBox
              label={tr.sessionPnl}
              value={<PnlValue value={s.session_upl} />}
              sub={s.currency}
            />
            <StatBox
              label={tr.deltaTotal}
              value={<span className="text-neutral">{fmt(s.delta_total, 4)}</span>}
            />
            <StatBox
              label={tr.marginBalance}
              value={<span className="text-foreground/80">{fmt(s.margin_balance)}</span>}
              sub={s.currency}
            />
            <StatBox
              label={tr.availableFunds}
              value={<span className="text-foreground/80">{fmt(s.available_funds)}</span>}
              sub={s.currency}
            />
            <StatBox
              label={tr.initialMargin}
              value={<span className="text-foreground/80">{fmt(s.initial_margin)}</span>}
              sub={s.currency}
            />
          </div>

          {/* Secondary grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label={tr.realizedPnl} value={<PnlValue value={s.realized_pl} />} sub={s.currency} />
            <StatBox label={tr.futuresPnl} value={<PnlValue value={s.futures_pl} />} sub={s.currency} />
            <StatBox label={tr.optionsPnl} value={<PnlValue value={s.options_pl} />} sub={s.currency} />
            <StatBox label={tr.optionsValue} value={<span className="text-foreground/80">{fmt(s.options_value)}</span>} sub={s.currency} />
          </div>

          {/* Divider between currencies */}
          {s.currency !== summaries[summaries.length - 1].currency && (
            <div className="mt-6" style={{ height: 1, background: "rgb(255 255 255 / 10%)" }} />
          )}
        </div>
      ))}

      {/* Cross-currency summary row */}
      {btc && eth && (
        <div className="mt-6 pt-6" style={{ borderTop: "1px solid rgb(255 255 255 / 10%)" }}>
          <div className="text-muted-foreground tracking-widest uppercase mb-3" style={{ fontSize: "0.65rem" }}>
            {tr.portfolio} — Cross Asset
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox
              label={tr.btcBalance}
              value={<span className="text-foreground">{fmt(btc.balance, 6)}</span>}
              sub="BTC"
            />
            <StatBox
              label={tr.ethBalance}
              value={<span className="text-foreground">{fmt(eth.balance, 6)}</span>}
              sub="ETH"
            />
            <StatBox
              label="BTC Delta"
              value={<span className="text-neutral">{fmt(btc.delta_total, 4)}</span>}
            />
            <StatBox
              label="ETH Delta"
              value={<span className="text-neutral">{fmt(eth.delta_total, 4)}</span>}
            />
          </div>
        </div>
      )}
    </div>
  );
}
