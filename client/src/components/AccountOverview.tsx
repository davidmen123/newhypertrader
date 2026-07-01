import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw } from "lucide-react";

function MetricTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "profit" | "loss" | "warning";
}) {
  const color =
    tone === "profit"
      ? "oklch(68% 0.15 145)"
      : tone === "loss"
      ? "oklch(62% 0.15 25)"
      : tone === "warning"
      ? "oklch(72% 0.14 55)"
      : "oklch(92% 0.01 200)";

  return (
    <div
      className="min-h-[86px] rounded-lg px-4 py-3"
      style={{
        background: "rgb(255 255 255 / 4%)",
        border: "1px solid rgb(255 255 255 / 8%)",
      }}
    >
      <div className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
        {label}
      </div>
      <div className="num-display mt-2" style={{ color, fontSize: "1.02rem", lineHeight: 1.05 }}>
        {value}
      </div>
      {sub && (
        <div className="text-muted-foreground/55 mt-1" style={{ fontSize: "0.66rem" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LeveragePanel({ ratio, lang }: { ratio: number; lang: string }) {
  const leverage = Number.isFinite(ratio) ? ratio : 0;
  const pct = Math.min((leverage / 10) * 100, 100);
  const color =
    leverage >= 8
      ? "oklch(62% 0.15 25)"
      : leverage >= 5
      ? "oklch(72% 0.14 55)"
      : "oklch(68% 0.15 145)";
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{
        background: "rgb(255 255 255 / 4%)",
        border: "1px solid rgb(255 255 255 / 8%)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
          {t("总杠杆率", "Total Leverage")}
        </span>
        <span className="num-display" style={{ fontSize: "1rem", color }}>
          {leverage.toFixed(2)}x
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgb(255 255 255 / 10%)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 18px ${color}44` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-muted-foreground/45" style={{ fontSize: "0.58rem" }}>
        <span>0x</span>
        <span>5x</span>
        <span>10x</span>
      </div>
    </div>
  );
}

function StatusPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-full px-3 py-1"
      style={{
        background: `${color}18`,
        border: `1px solid ${color}44`,
      }}
    >
      <span className="text-muted-foreground/70 tracking-widest uppercase" style={{ fontSize: "0.55rem" }}>
        {label}
      </span>
      <span className="font-medium" style={{ color, fontSize: "0.68rem", letterSpacing: "0.08em" }}>
        {value}
      </span>
    </div>
  );
}

export default function AccountOverview() {
  const { lang } = useLang();
  const [denomination, setDenomination] = useState<"USDC" | "BTC">("USDC");

  const { data, isLoading, isFetching, refetch } = trpc.hyperliquid.accountOverview.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  const { data: metricsData } = trpc.hyperliquid.tradeMetrics.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );

  const fmt = (v: number, decimals = 2) => {
    if (!isFinite(v)) return "--";
    return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const fmtSign = (v: number, decimals = 2) => {
    if (!isFinite(v)) return "--";
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
  const pnlTone = data.totalPnlUsdc >= 0 ? "profit" : "loss";
  const winRate = metricsData?.winRate ?? null;
  const plRatio = metricsData?.plRatio ?? null;
  const leverage = Number.isFinite(data.marginUsageRatio) ? data.marginUsageRatio : 0;
  const hasExposure = data.totalNtlPos > 0 || leverage > 0;
  const strategyStatus = hasExposure
    ? data.totalPnlUsdc >= 0
      ? t("持仓中", "In Position")
      : t("持仓观察", "Monitoring")
    : t("空仓观察", "Watching");
  const strategyColor = hasExposure
    ? data.totalPnlUsdc >= 0
      ? "oklch(68% 0.15 145)"
      : "oklch(72% 0.14 55)"
    : "oklch(72% 0.08 230)";
  const riskLevel = leverage >= 8
    ? t("高风险", "High")
    : leverage >= 5
    ? t("中风险", "Medium")
    : t("低风险", "Low");
  const riskColor = leverage >= 8
    ? "oklch(62% 0.15 25)"
    : leverage >= 5
    ? "oklch(72% 0.14 55)"
    : "oklch(68% 0.15 145)";

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {t("账户概览", "Account Overview")}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <div className="flex items-center gap-3">
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

      <div
        className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-4 py-3"
        style={{
          background: "rgb(255 255 255 / 4%)",
          border: "1px solid rgb(255 255 255 / 8%)",
        }}
      >
        <StatusPill
          label={t("策略状态", "Status")}
          value={strategyStatus}
          color={strategyColor}
        />
        <StatusPill
          label={t("风险等级", "Risk")}
          value={riskLevel}
          color={riskColor}
        />
        <span className="ml-auto text-muted-foreground/45 tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
          {t("30秒刷新", "30s refresh")}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        <div
          className="rounded-lg px-5 py-5 sm:px-6 sm:py-6"
          style={{
            background: "linear-gradient(135deg, rgb(255 255 255 / 7%), rgb(255 255 255 / 3%))",
            border: "1px solid rgb(255 255 255 / 10%)",
            boxShadow: "inset 0 1px 0 rgb(255 255 255 / 6%)",
          }}
        >
          <div className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {t(`总净值 (${equityUnit})`, `Total Equity (${equityUnit})`)}
          </div>
          <div className="num-display mt-3 text-foreground" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 0.98 }}>
            {fmt(totalEquity, equityDecimals)}
            <span className="ml-2 text-muted-foreground/55" style={{ fontSize: "0.85rem" }}>
              {equityUnit}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground/65 num-display" style={{ fontSize: "0.72rem" }}>
              {isBtc ? `≈ $${fmt(data.totalEquityUsdc, 2)} USDC` : `≈ ${fmt(data.totalEquityBtc, 6)} BTC`}
            </span>
            <span
              className="rounded px-2 py-0.5 num-display"
              style={{
                fontSize: "0.72rem",
                color: data.totalPnlUsdc >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)",
                background: data.totalPnlUsdc >= 0
                  ? "oklch(68% 0.15 145 / 12%)"
                  : "oklch(62% 0.15 25 / 12%)",
              }}
            >
              {fmtSign(data.totalPnlUsdc, 2)} USDC
              {data.totalPnlPct != null ? ` · ${data.totalPnlPct >= 0 ? "+" : ""}${data.totalPnlPct.toFixed(2)}%` : ""}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MetricTile
              label={t("初始资金", "Initial Capital")}
              value={data.initialEquityUsdc != null ? `${fmt(data.initialEquityUsdc, 2)} USDC` : "--"}
              tone="neutral"
            />
            <MetricTile
              label={t("当前盈亏", "Current PnL")}
              value={`${fmtSign(data.totalPnlUsdc, 2)} USDC`}
              sub={data.totalPnlPct != null ? `${data.totalPnlPct >= 0 ? "+" : ""}${data.totalPnlPct.toFixed(2)}%` : undefined}
              tone={pnlTone}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <MetricTile
              label={t("最大回撤", "Max Drawdown")}
              value={data.maxDrawdownPct != null ? `${data.maxDrawdownPct.toFixed(2)}%` : "--"}
              tone={data.maxDrawdownUsdc != null && data.maxDrawdownUsdc < 0 ? "loss" : "neutral"}
            />
          </div>
        </div>

        <div className="grid gap-3">
          <LeveragePanel ratio={data.marginUsageRatio} lang={lang} />
          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              label={t("胜率", "Win Rate")}
              value={winRate != null ? `${winRate.toFixed(1)}%` : "--"}
              sub={metricsData?.totalTrades != null ? `${metricsData.winningTrades}/${metricsData.totalTrades}` : t("暂无交易", "No trades")}
              tone={winRate != null && winRate >= 50 ? "profit" : "neutral"}
            />
            <MetricTile
              label={t("盈亏比", "P/L Ratio")}
              value={plRatio != null && isFinite(plRatio) ? fmt(plRatio, 2) : "--"}
              sub={t("平均盈利 / 平均亏损", "Avg Win / Avg Loss")}
              tone={plRatio != null && plRatio > 1 ? "profit" : "neutral"}
            />
          </div>
          {metricsData && (
            <div
              className="rounded-lg px-4 py-3"
              style={{
                background: "rgb(255 255 255 / 4%)",
                border: "1px solid rgb(255 255 255 / 8%)",
              }}
            >
              <div className="text-muted-foreground/60 tracking-widest uppercase mb-3" style={{ fontSize: "0.58rem" }}>
                {t("交易统计", "Trade Statistics")}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-muted-foreground/50" style={{ fontSize: "0.6rem" }}>{t("总交易数", "Total")}</span>
                  <div className="num-display mt-1" style={{ fontSize: "0.95rem" }}>{metricsData.totalTrades}</div>
                </div>
                <div>
                  <span className="text-muted-foreground/50" style={{ fontSize: "0.6rem" }}>{t("盈利", "Wins")}</span>
                  <div className="num-display mt-1 text-profit" style={{ fontSize: "0.95rem" }}>{metricsData.winningTrades}</div>
                </div>
                <div>
                  <span className="text-muted-foreground/50" style={{ fontSize: "0.6rem" }}>{t("亏损", "Losses")}</span>
                  <div className="num-display mt-1 text-loss" style={{ fontSize: "0.95rem" }}>{metricsData.losingTrades}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
