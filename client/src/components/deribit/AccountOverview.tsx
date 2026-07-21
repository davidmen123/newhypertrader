import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";

function StatCard({
  label,
  value,
  sub,
  colorClass = "text-foreground",
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1 px-4 py-3 rounded-xl"
      style={{
        background: "oklch(18% 0.025 200 / 60%)",
        border: "1px solid oklch(35% 0.02 200 / 25%)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-muted-foreground tracking-widest uppercase"
          style={{ fontSize: "0.6rem" }}
        >
          {label}
        </span>
        {badge}
      </div>
      <span className={`num-display font-light ${colorClass}`} style={{ fontSize: "1.05rem" }}>
        {value}
      </span>
      {sub && (
        <span className="text-muted-foreground/70 num-display" style={{ fontSize: "0.68rem" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function MarginBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 100);
  const color =
    pct >= 80
      ? "oklch(62% 0.15 25)"
      : pct >= 50
      ? "oklch(72% 0.14 55)"
      : "oklch(68% 0.15 145)";

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 rounded-xl" style={{
      background: "oklch(18% 0.025 200 / 60%)",
      border: "1px solid oklch(35% 0.02 200 / 25%)",
    }}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
          Margin Usage
        </span>
        <span className="num-display" style={{ fontSize: "0.75rem", color }}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "oklch(28% 0.02 200 / 50%)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="flex justify-between text-muted-foreground/50" style={{ fontSize: "0.58rem" }}>
        <span>0%</span>
        <span style={{ color: "oklch(62% 0.15 25)" }}>80% ⚠</span>
        <span>100%</span>
      </div>
    </div>
  );
}

export default function AccountOverview() {
  const { lang } = useLang();
  const [denomination, setDenomination] = useState<"USDC" | "BTC">("USDC");

  const { data, isLoading, isFetching, refetch } = trpc.deribit.accountOverview.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  // Fetch trade metrics (win rate, P/L ratio)
  const { data: metricsData } = trpc.deribit.tradeMetrics.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );

  const fmt = (v: number, decimals = 2) => {
    if (!isFinite(v)) return "—";
    return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const fmtSign = (v: number, decimals = 2) => {
    if (!isFinite(v)) return "—";
    const s = fmt(Math.abs(v), decimals);
    return v >= 0 ? `+${s}` : `-${s}`;
  };

  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  if (isLoading) {
    return (
      <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
        <div className="text-muted-foreground text-sm animate-pulse">{t("加载账户概览...", "Loading account overview...")}</div>
      </div>
    );
  }

  if (!data) return null;

  const isBtc = denomination === "BTC";
  const totalEquity = isBtc ? data.totalEquityBtc : data.totalEquityUsdc;
  const equityUnit = isBtc ? "BTC" : "USDC";
  const equityDecimals = isBtc ? 6 : 2;

  const uplColor =
    data.sessionUplUsdc > 0
      ? "text-profit"
      : data.sessionUplUsdc < 0
      ? "text-loss"
      : "text-muted-foreground";

  const uplIcon =
    data.sessionUplUsdc > 0 ? (
      <TrendingUp size={10} className="text-profit" />
    ) : data.sessionUplUsdc < 0 ? (
      <TrendingDown size={10} className="text-loss" />
    ) : (
      <Minus size={10} className="text-muted-foreground" />
    );

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {t("账户概览", "Account Overview")}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "oklch(58% 0.015 200 / 60%)" }} />
        </div>
        <div className="flex items-center gap-3">
          {/* Denomination toggle */}
          <div className="flex gap-1">
            {(["USDC", "BTC"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDenomination(d)}
                className={`pill-tab ${denomination === d ? "active" : ""}`}
              >
                {d}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* BTC price reference */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-muted-foreground/50 tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
          BTC/USDC
        </span>
        <span className="num-display text-muted-foreground/80" style={{ fontSize: "0.72rem" }}>
          {fmt(data.btcPrice, 2)}
        </span>
        <span className="text-muted-foreground/30" style={{ fontSize: "0.58rem" }}>·</span>
        <span className="text-muted-foreground/40 tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
          {t("30秒刷新", "30s refresh")}
        </span>
      </div>

      {/* Main stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
        {/* Total equity */}
        <div
          className="flex flex-col gap-1 px-4 py-3 rounded-xl"
          style={{
            background: "oklch(18% 0.025 200 / 60%)",
            border: "1px solid oklch(35% 0.02 200 / 25%)",
          }}
        >
          <span
            className="text-muted-foreground tracking-widest uppercase"
            style={{ fontSize: "0.6rem" }}
          >
            {t(`总净值 (${equityUnit})`, `Total Equity (${equityUnit})`)}
          </span>
          <span className="num-display font-light text-foreground" style={{ fontSize: "1.05rem" }}>
            {fmt(totalEquity, equityDecimals)} {equityUnit}
          </span>
          <span className="text-muted-foreground/70 num-display" style={{ fontSize: "0.68rem" }}>
            {isBtc
              ? `≈ $${fmt(data.totalEquityUsdc, 2)} USDC`
              : `≈ ${fmt(data.totalEquityBtc, 6)} BTC`}
          </span>
          {/* Total P&L row */}
          {data.totalPnlUsdc != null && (
            <div className="flex items-center gap-2 mt-1 pt-1" style={{ borderTop: "1px solid oklch(35% 0.02 200 / 20%)" }}>
              <span
                className="num-display font-medium"
                style={{
                  fontSize: "0.78rem",
                  color: data.totalPnlUsdc >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)",
                }}
              >
                {fmtSign(data.totalPnlUsdc, 2)} USDC
              </span>
              {data.totalPnlPct != null && (
                <span
                  className="num-display"
                  style={{
                    fontSize: "0.7rem",
                    color: data.totalPnlPct >= 0 ? "oklch(60% 0.13 145)" : "oklch(55% 0.13 25)",
                    background: data.totalPnlPct >= 0
                      ? "oklch(68% 0.15 145 / 12%)"
                      : "oklch(62% 0.15 25 / 12%)",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {data.totalPnlPct >= 0 ? "+" : ""}{data.totalPnlPct.toFixed(2)}%
                </span>
              )}
            </div>
          )}
          {data.totalPnlUsdc == null && (
            <div className="mt-1 pt-1" style={{ borderTop: "1px solid oklch(35% 0.02 200 / 20%)" }}>
              <span className="text-muted-foreground/40" style={{ fontSize: "0.62rem" }}>
                {t("总盈亏：暂无快照基准", "Total P&L: no snapshot baseline yet")}
              </span>
            </div>
          )}
        </div>

        {/* BTC balance */}
        <StatCard
          label={t("BTC 余额", "BTC Balance")}
          value={`${fmt(data.btcBalance, 6)} BTC`}
          sub={`equity ${fmt(data.btcEquity, 6)} BTC`}
        />

        {/* USDC balance */}
        <StatCard
          label={t("USDC 余额", "USDC Balance")}
          value={`${fmt(data.usdcBalance, 2)} USDC`}
          sub={`equity ${fmt(data.usdcEquity, 2)} USDC`}
        />

        {/* Session UPL */}
        <StatCard
          label={t("当日浮动盈亏", "Session UPL")}
          value={`${fmtSign(data.sessionUplUsdc, 2)} USDC`}
          colorClass={uplColor}
          badge={uplIcon}
        />
      </div>

      {/* Margin grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
        {/* IM */}
        <StatCard
          label={t("初始保证金 (IM)", "Initial Margin (IM)")}
          value={`${fmt(data.imUsdc, 2)} USDC`}
          sub={`${(data.marginUsageRatio * 100).toFixed(1)}% of equity`}
        />

        {/* MM */}
        <StatCard
          label={t("维持保证金 (MM)", "Maintenance Margin (MM)")}
          value={data.mmUsdc > 0 ? `${fmt(data.mmUsdc, 2)} USDC` : "—"}
          sub={data.mmUsdc > 0 ? t("强平触发线", "Liquidation trigger") : t("无持仓风险", "No liquidation risk")}
          colorClass={data.mmUsdc > 0 ? "text-loss" : "text-muted-foreground"}
        />

        {/* Available funds */}
        <StatCard
          label={t("可用资金", "Available Funds")}
          value={`${fmt(data.availableUsdc, 2)} USDC`}
          sub={t("可开新仓", "For new positions")}
        />

        {/* Margin usage bar */}
        <MarginBar ratio={data.marginUsageRatio} />
      </div>

      {/* Max Drawdown, Calmar Ratio, Win Rate, P/L Ratio */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
        {/* Max Drawdown card */}
        <div
          className="flex flex-col gap-1 px-4 py-3 rounded-xl col-span-2 sm:col-span-1"
          style={{
            background: "oklch(18% 0.025 200 / 60%)",
            border: "1px solid oklch(35% 0.02 200 / 25%)",
          }}
        >
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
            {t("最大回撤", "Max Drawdown")}
          </span>
          {data.maxDrawdownUsdc != null ? (
            <>
              <span
                className="num-display font-light"
                style={{
                  fontSize: "1.05rem",
                  color: data.maxDrawdownUsdc < 0 ? "oklch(62% 0.15 25)" : "oklch(68% 0.15 145)",
                }}
              >
                {data.maxDrawdownUsdc === 0
                  ? "0.00 USDC"
                  : `${fmt(data.maxDrawdownUsdc, 2)} USDC`}
              </span>
              {data.maxDrawdownPct != null && (
                <span
                  className="num-display"
                  style={{
                    fontSize: "0.78rem",
                    color: data.maxDrawdownPct < 0 ? "oklch(55% 0.13 25)" : "oklch(60% 0.13 145)",
                    marginTop: "0.1rem",
                  }}
                >
                  {data.maxDrawdownPct === 0
                    ? "0.00%"
                    : `${data.maxDrawdownPct.toFixed(2)}%`}
                </span>
              )}
              <span className="text-muted-foreground/40" style={{ fontSize: "0.58rem", marginTop: "0.15rem" }}>
                {t("自 2026-03-09", "since 2026-03-09")}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground/40" style={{ fontSize: "0.7rem" }}>
              {t("暂无历史快照", "No snapshot data yet")}
            </span>
          )}
        </div>

        {/* Calmar Ratio */}
        <StatCard
          label={t("卡玛比率", "Calmar Ratio")}
          value={data.calmarRatio != null && isFinite(data.calmarRatio) ? fmt(data.calmarRatio, 2) : "—"}
          sub={t("年化收益 / 最大回撤", "Ann. Return / Max DD")}
          colorClass={data.calmarRatio != null && data.calmarRatio > 1 ? "text-profit" : "text-muted-foreground"}
        />

        {/* Win Rate */}
        <StatCard
          label={t("胜率", "Win Rate")}
          value={metricsData?.winRate != null ? `${metricsData.winRate.toFixed(1)}%` : "—"}
          sub={metricsData?.totalTrades != null ? `${metricsData.winningTrades}/${metricsData.totalTrades}` : t("暂无交易", "No trades")}
          colorClass={metricsData?.winRate != null && metricsData.winRate >= 50 ? "text-profit" : "text-muted-foreground"}
        />

        {/* P/L Ratio */}
        <StatCard
          label={t("盈亏比", "P/L Ratio")}
          value={metricsData?.plRatio != null && isFinite(metricsData.plRatio) ? fmt(metricsData.plRatio, 2) : "—"}
          sub={t("平均盈利 / 平均亏损", "Avg Win / Avg Loss")}
          colorClass={metricsData?.plRatio != null && metricsData.plRatio > 1 ? "text-profit" : "text-muted-foreground"}
        />
      </div>

      {/* Trade Metrics Summary */}
      {metricsData && (
        <div className="mb-4 p-3 rounded-xl" style={{
          background: "oklch(18% 0.025 200 / 40%)",
          border: "1px solid oklch(35% 0.02 200 / 15%)",
        }}>
          <div className="text-muted-foreground/60 tracking-widest uppercase mb-2" style={{ fontSize: "0.58rem" }}>
            {t("交易统计", "Trade Statistics")}
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground/50" style={{ fontSize: "0.6rem" }}>{t("总交易数", "Total Trades")}</span>
              <div className="num-display" style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>{metricsData.totalTrades}</div>
            </div>
            <div>
              <span className="text-muted-foreground/50" style={{ fontSize: "0.6rem" }}>{t("盈利单数", "Winning Trades")}</span>
              <div className="num-display text-profit" style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>{metricsData.winningTrades}</div>
            </div>
            <div>
              <span className="text-muted-foreground/50" style={{ fontSize: "0.6rem" }}>{t("亏损单数", "Losing Trades")}</span>
              <div className="num-display text-loss" style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>{metricsData.losingTrades}</div>
            </div>
          </div>
        </div>
      )}

      {/* Greeks */}
      <div>
        <div className="text-muted-foreground/40 tracking-widest uppercase mb-2" style={{ fontSize: "0.58rem" }}>
          {t("期权 Greeks（账户合计）", "Options Greeks (Portfolio)")}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Delta (USD)"
            value={fmt(data.deltaTotal, 2)}
            colorClass={data.deltaTotal > 0 ? "text-profit" : data.deltaTotal < 0 ? "text-loss" : "text-muted-foreground"}
          />
          <StatCard
            label="Vega (USD)"
            value={fmt(data.optionsVega, 2)}
            colorClass="text-foreground/80"
          />
          <StatCard
            label="Theta (USD/day)"
            value={fmt(data.optionsTheta, 2)}
            colorClass={data.optionsTheta < 0 ? "text-loss" : "text-profit"}
          />
          <StatCard
            label="Gamma"
            value={data.optionsGamma.toExponential(2)}
            colorClass="text-foreground/80"
          />
        </div>
      </div>
    </div>
  );
}
