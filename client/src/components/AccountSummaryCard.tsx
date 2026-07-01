import { trpc } from "@/lib/trpc";
import { RefreshCw } from "lucide-react";

const SUPPORTED = ["BTC", "ETH"];

function fmt(val: number | undefined | null, d = 4): string {
  if (val == null) return "—";
  return val.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function PnlValue({ value }: { value: number }) {
  const cls = value > 0 ? "text-profit" : value < 0 ? "text-loss" : "text-neutral";
  return <span className={`num-display ${cls}`}>{value > 0 ? "+" : ""}{fmt(value)}</span>;
}

function StatItem({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.65rem" }}>{label}</span>
      <span className={`num-display text-sm ${highlight ? "" : "text-foreground/90"}`}>{value}</span>
    </div>
  );
}

export default function AccountSummaryCard() {
  const { data, isLoading, error, refetch, isFetching } = trpc.deribit.accountSummaries.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  const summaries = (data || []).filter((s) => SUPPORTED.includes(s.currency));

  return (
    <div className="glass-card px-8 py-7 fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-light tracking-tight" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            Portfolio
          </h2>
          <div className="thin-divider mt-2" style={{ margin: "8px 0 0 0" }} />
        </div>
        <button
          onClick={() => refetch()}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-sm num-display animate-pulse">Loading...</div>
      )}
      {error && (
        <div className="text-loss text-sm">{error.message}</div>
      )}

      {!isLoading && summaries.length === 0 && !error && (
        <div className="text-muted-foreground text-sm">No account data</div>
      )}

      <div className="space-y-8">
        {summaries.map((s) => (
          <div key={s.currency}>
            {/* Currency header */}
            <div className="flex items-baseline gap-3 mb-5">
              <span className="text-3xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
                {s.currency}
              </span>
              <span className="text-muted-foreground text-xs tracking-widest uppercase">Perpetual</span>
            </div>

            {/* Primary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-5">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.65rem" }}>Balance</span>
                <span className="num-display text-xl text-foreground">{fmt(s.balance)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.65rem" }}>Equity</span>
                <span className="num-display text-xl text-foreground">{fmt(s.equity)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.65rem" }}>Unrealized PnL</span>
                <span className="text-xl"><PnlValue value={s.unrealized_pl} /></span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.65rem" }}>Session PnL</span>
                <span className="text-xl"><PnlValue value={s.session_upl} /></span>
              </div>
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border/40">
              <StatItem label="Available" value={fmt(s.available_funds)} />
              <StatItem label="Margin Bal" value={fmt(s.margin_balance)} />
              <StatItem label="Futures PnL" value={<PnlValue value={s.futures_pl} />} />
              <StatItem label="Options PnL" value={<PnlValue value={s.options_pl} />} />
              <StatItem label="Delta Total" value={fmt(s.delta_total, 4)} />
              <StatItem label="Options Value" value={fmt(s.options_value)} />
              <StatItem label="Realized PnL" value={<PnlValue value={s.realized_pl} />} />
              <StatItem label="Init Margin" value={fmt(s.initial_margin)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
