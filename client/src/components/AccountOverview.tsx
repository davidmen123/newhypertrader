import { type ReactNode, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { Info, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function MetricTile({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
  // CJK glyphs fill the em box and read ~28% taller than DM Mono digits at the
  // same size, so text values step down to keep optical weight in line.
  valueFont = "mono",
  tooltip,
  tooltipClassName,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: "neutral" | "profit" | "loss" | "warning";
  valueFont?: "mono" | "text";
  tooltip?: string;
  tooltipClassName?: string;
}) {
  const color =
    tone === "profit"
      ? "oklch(68% 0.15 145)"
      : tone === "loss"
      ? "oklch(62% 0.15 25)"
      : tone === "warning"
      ? "oklch(72% 0.14 55)"
      : "var(--metric-neutral)";

  return (
    <div
      className="min-h-[86px] rounded-lg px-4 py-3"
      style={{
        background: "var(--surface-subtle)",
        border: "1px solid var(--panel-border)",
      }}
    >
      <div className="flex items-center gap-1 text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="text-muted-foreground/60 cursor-help" style={{ width: "12px", height: "12px" }} />
            </TooltipTrigger>
            <TooltipContent className={tooltipClassName ?? "text-xs"} style={{ fontSize: "0.7rem" }}>
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div
        className={valueFont === "text" ? "mt-2" : "num-display mt-2"}
        style={{ color, fontSize: valueFont === "text" ? "0.9rem" : "1.02rem", lineHeight: 1.05 }}
      >
        {value}
        {unit && (
          <span className="ml-1 text-muted-foreground/55" style={{ fontSize: "0.72rem" }}>
            {unit}
          </span>
        )}
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
        background: "var(--surface-subtle)",
        border: "1px solid var(--panel-border)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
            {t("总杠杆率", "Total Leverage")}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="text-muted-foreground/60 cursor-help" style={{ width: "12px", height: "12px" }} />
            </TooltipTrigger>
            <TooltipContent className="text-xs" style={{ fontSize: "0.7rem" }}>
              {t("当前使用的总杠杆倍数", "Current total leverage multiplier")}
            </TooltipContent>
          </Tooltip>
        </div>
        <span className="num-display" style={{ fontSize: "1rem", color }}>
          {leverage.toFixed(2)}x
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--panel-border)" }}>
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

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
      {children}
    </div>
  );
}

// accountId selects which configured Hyperliquid account to read. Left undefined
// (the home page) it reads the default account.
export default function AccountOverview({ accountId }: { accountId?: string } = {}) {
  const { lang } = useLang();
  const [denomination, setDenomination] = useState<"USDC" | "BTC" | "CNY">("USDC");

  const { data, isLoading, isFetching, refetch } = trpc.hyperliquid.accountOverview.useQuery(
    { accountId },
    { refetchInterval: 30_000 }
  );

  const { data: metricsData } = trpc.hyperliquid.tradeMetrics.useQuery(
    { accountId },
    { refetchInterval: 60_000 }
  );

  const { data: openOrdersData } = trpc.hyperliquid.openOrders.useQuery(
    { accountId },
    { refetchInterval: 10_000 }
  );

  const fmt = (v: number | null | undefined, decimals = 2) => {
    if (v == null || !isFinite(v)) return "--";
    return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const fmtSign = (v: number | null | undefined, decimals = 2) => {
    if (v == null || !isFinite(v)) return "--";
    const s = fmt(Math.abs(v), decimals);
    return v >= 0 ? `+${s}` : `-${s}`;
  };

  const fmtHoldingHours = (hours: number | null | undefined) => {
    if (hours == null || !isFinite(hours)) return "--";
    if (hours < 1) return t("不足 1 小时", "< 1 hour");
    const roundedHours = Math.round(hours);
    if (roundedHours < 24) return t(`${roundedHours} 小时`, `${roundedHours}h`);
    const days = Math.floor(roundedHours / 24);
    const restHours = roundedHours % 24;
    return restHours > 0
      ? t(`${days} 天 ${restHours} 小时`, `${days}d ${restHours}h`)
      : t(`${days} 天`, `${days}d`);
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
  const isCny = denomination === "CNY";
  const totalEquity = isBtc ? data.totalEquityBtc : isCny ? data.totalEquityCny : data.totalEquityUsdc;
  const equityUnit = isBtc ? "BTC" : isCny ? "CNY" : "USDC";
  const equityDecimals = isBtc ? 4 : 2;
  const totalPnlUsdc = data.totalPnlUsdc ?? null;
  const totalPnlBtc = totalPnlUsdc != null && data.btcPrice > 0 ? totalPnlUsdc / data.btcPrice : null;
  const totalPnlDisplay = isBtc ? totalPnlBtc : isCny ? (data.totalPnlCny ?? null) : totalPnlUsdc;
  const pnlTone = totalPnlUsdc != null && totalPnlUsdc >= 0 ? "profit" : "loss";
  const fmtUsdcDenom = (v: number | null | undefined) => {
    if (v == null || !isFinite(v)) return "--";
    if (isBtc) return data.btcPrice > 0 ? `${fmt(v / data.btcPrice, 4)} BTC` : "--";
    if (isCny) return data.usdCnyRate != null ? `${fmt(v * data.usdCnyRate, 2)} CNY` : "--";
    return `${fmt(v, 2)} USDC`;
  };
  const marginUsedUsdc = data.imUsdc ?? null;
  const marginUsedPct =
    marginUsedUsdc != null && data.totalEquityUsdc > 0
      ? (marginUsedUsdc / data.totalEquityUsdc) * 100
      : null;
  const annualizedPct = data.annualizedReturnPct ?? null;
  const annualizedSampleWeak = data.runningDays != null && data.runningDays < 30;
  const winRate = metricsData?.winRate ?? null;
  const plRatio = metricsData?.plRatio ?? null;
  const expectancyUsdc = metricsData?.expectancyUsdc ?? null;
  const profitFactor = metricsData?.profitFactor ?? null;
  const maxConsecutiveLosses = metricsData?.maxConsecutiveLosses ?? null;
  const maxConsecutiveLossUsdc = metricsData?.maxConsecutiveLossUsdc ?? null;
  const totalTrades = metricsData?.totalTrades ?? null;
  const leverage = Number.isFinite(data.marginUsageRatio) ? data.marginUsageRatio : 0;
  const hasExposure = data.totalNtlPos > 0 || leverage > 0;
  const strategyStatus = hasExposure
    ? totalPnlUsdc != null && totalPnlUsdc >= 0
      ? t("持仓中", "In Position")
      : t("持仓中", "Position Open")
    : t("空仓观察", "Watching");
  const strategyColor = hasExposure
    ? totalPnlUsdc != null && totalPnlUsdc >= 0
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
  // Trading style: single-dimension bucketing on average holding time.
  const avgHoldingHours = metricsData?.averageHoldingHours ?? null;
  const tradingStyle =
    avgHoldingHours == null
      ? "--"
      : avgHoldingHours < 24
      ? t("日内交易", "Intraday")
      : avgHoldingHours < 24 * 30
      ? t("波段交易", "Swing")
      : t("趋势跟踪", "Trend Following");
  const openOrders = openOrdersData ?? [];
  const hasStopLossOrder = openOrders.some((order) => {
    const type = String(order.orderType ?? "").toLowerCase();
    return type.includes("stop");
  });
  const hasTakeProfitOrder = openOrders.some((order) => {
    const type = String(order.orderType ?? "").toLowerCase();
    return type.includes("take profit");
  });
  const stopLossStatus = !hasExposure
    ? "--"
    : hasStopLossOrder
    ? t("已挂止损", "Stop Set")
    : t("未挂止损", "No Stop");
  const takeProfitStatus = !hasExposure
    ? "--"
    : hasTakeProfitOrder
    ? t("已挂止盈", "Take Profit Set")
    : t("未挂止盈", "No Take Profit");
  const stopLossColor = !hasExposure
    ? "var(--metric-neutral)"
    : hasStopLossOrder
    ? "oklch(68% 0.15 145)"
    : "oklch(72% 0.14 55)";
  const takeProfitColor = !hasExposure
    ? "var(--metric-neutral)"
    : hasTakeProfitOrder
    ? "oklch(68% 0.15 145)"
    : "oklch(72% 0.14 55)";

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
            {(["USDC", "BTC", "CNY"] as const).map((d) => (
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
          background: "var(--surface-subtle)",
          border: "1px solid var(--panel-border)",
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
        <StatusPill
          label={t("止损状态", "Stop Loss")}
          value={stopLossStatus}
          color={stopLossColor}
        />
        <StatusPill
          label={t("止盈状态", "Take Profit")}
          value={takeProfitStatus}
          color={takeProfitColor}
        />
        <span className="ml-auto text-muted-foreground/45 tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
          {t("30秒刷新", "30s refresh")}
        </span>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <SectionTitle>{t("核心账户状态", "Core Account")}</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.75fr)_minmax(260px,0.85fr)]">
            <div
              className="rounded-lg px-5 py-5 sm:px-6 sm:py-6"
              style={{
                background: "linear-gradient(135deg, var(--surface-soft), var(--surface-subtle))",
                border: "1px solid var(--panel-border)",
                boxShadow: "inset 0 1px 0 rgb(255 255 255 / 42%)",
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
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-muted-foreground/65 num-display" style={{ fontSize: "0.72rem" }}>
                  {isBtc || isCny ? `≈ $${fmt(data.totalEquityUsdc, 2)} USDC` : `≈ ${fmt(data.totalEquityBtc, 4)} BTC`}
                </span>
                <span className="text-muted-foreground/55" style={{ fontSize: "0.66rem" }}>
                  {t("净入金", "Net Deposits")} {data.netDepositsUsdc != null ? `${fmt(data.netDepositsUsdc, 2)} USDC` : "--"}
                </span>
                {data.runningDays != null && (
                  <span className="text-muted-foreground/55" style={{ fontSize: "0.66rem" }}>
                    {t("运行", "Running")}{" "}
                    <span className="num-display" style={{ fontSize: "0.78rem", fontWeight: 600, color: "oklch(68% 0.15 145)" }}>
                      {data.runningDays}
                    </span>{" "}
                    {t("天", "days")}
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              <MetricTile
                label={t("总盈亏", "Total PnL")}
                value={totalPnlDisplay != null ? `${fmtSign(totalPnlDisplay, isBtc ? 4 : 2)} ${equityUnit}` : "--"}
                sub={data.totalPnlPct != null ? `${data.totalPnlPct >= 0 ? "+" : ""}${data.totalPnlPct.toFixed(2)}%` : undefined}
                tone={pnlTone}
                tooltip={t(
                  "金额取自 Hyperliquid 的累计盈亏，含未实现盈亏，充值与提现不计入。百分比为时间加权收益率：按每段区间的盈亏除以该段期初净值后连乘，中途加减本金只改变后续区间的基数。",
                  "The amount is Hyperliquid's own cumulative PnL, including unrealized PnL, with deposits and withdrawals excluded. The percentage is a time-weighted return: each period's PnL over the equity at its start, chain-linked, so adding or removing capital only changes the base for later periods."
                )}
              />
              <MetricTile
                label={t("可用余额", "Available Balance")}
                value={fmtUsdcDenom(data.availableUsdc)}
                sub={t("当前未占用余额", "Currently unallocated")}
                tooltip={t(
                  "统一账户的 USDC 总余额减去持仓与委托占用金额",
                  "Unified-account USDC balance minus funds held by positions and orders"
                )}
              />
            </div>

            <div className="grid gap-3">
              <LeveragePanel ratio={data.marginUsageRatio} lang={lang} />
              <MetricTile
                label={t("已用保证金", "Margin Used")}
                value={fmtUsdcDenom(marginUsedUsdc)}
                sub={marginUsedPct != null ? t(`占用净值 ${marginUsedPct.toFixed(1)}%`, `${marginUsedPct.toFixed(1)}% of equity`) : undefined}
                tone={marginUsedPct != null && marginUsedPct >= 50 ? "warning" : "neutral"}
                tooltip={t("当前持仓占用的保证金总额", "Total margin occupied by open positions")}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <SectionTitle>{t("风险收益指标", "Risk & Return")}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricTile
              label={t("最大回撤", "Max Drawdown")}
              value={data.maxDrawdownPct != null ? `${data.maxDrawdownPct.toFixed(2)}%` : "--"}
              tone={data.maxDrawdownUsdc != null && data.maxDrawdownUsdc < 0 ? "loss" : "neutral"}
              tooltip={t(
                "基于累计 PnL 构造的现金流调整后策略净值，从历史峰值到其后谷值的最大跌幅，按全周期计算；充值和出金不直接计入回撤。与最大连续亏损（按已平仓交易统计）互为对照。",
                "Largest peak-to-trough decline of the cash-flow-adjusted strategy equity reconstructed from cumulative PnL over the full history. Deposits and withdrawals do not directly count as drawdown. The curve-based counterpart to max consecutive losses (closed trades only)."
              )}
            />
            <MetricTile
              label={t("最大连续亏损", "Max Consec. Losses")}
              value={maxConsecutiveLosses != null ? `${maxConsecutiveLosses}` : "--"}
              unit={maxConsecutiveLosses != null ? t("笔", "trades") : undefined}
              sub={
                maxConsecutiveLosses != null && maxConsecutiveLosses > 0 && maxConsecutiveLossUsdc != null
                  ? t(`累计 ${fmtSign(maxConsecutiveLossUsdc, 2)} USDC`, `Cumulative ${fmtSign(maxConsecutiveLossUsdc, 2)} USDC`)
                  : undefined
              }
              tone="neutral"
              tooltip={t(
                "历史上连续亏损的最长笔数及该段累计亏损。按已平仓交易统计，与最大回撤（现金流调整后的策略净值曲线口径）互为对照。",
                "Longest run of losing round trips and its cumulative loss. Closed trades only — the trade-based counterpart to max drawdown (cash-flow-adjusted strategy equity curve)."
              )}
            />
            <MetricTile
              label={t("夏普比率", "Sharpe Ratio")}
              value={data.sharpeRatio != null && isFinite(data.sharpeRatio) ? fmt(data.sharpeRatio, 2) : "--"}
              tone={data.sharpeRatio != null && data.sharpeRatio >= 1 ? "profit" : "neutral"}
              tooltip={t(
                "每承担一单位波动换来多少收益。按 UTC+8 日收益率计算：日均收益 ÷ 日收益标准差 × √365 年化。>1 良好，>2 优秀。本站未扣减无风险利率，数值略偏乐观；且它把上涨波动同样计为风险，运行天数少时会大幅跳动。",
                "How much return each unit of volatility buys. Computed from UTC+8 daily returns: mean ÷ standard deviation × √365. >1 is good, >2 excellent. No risk-free rate is subtracted here, so the figure runs slightly optimistic; it also penalizes upside volatility and swings wildly over short track records."
              )}
            />
            <MetricTile
              label={t("年化收益率", "Annualized Return")}
              value={annualizedPct != null && isFinite(annualizedPct) ? `${fmtSign(annualizedPct, 2)}%` : "--"}
              sub={annualizedPct != null && annualizedSampleWeak ? t("样本不足 · 仅供参考", "Small sample · indicative only") : undefined}
              tone={
                annualizedPct == null || annualizedSampleWeak
                  ? "neutral"
                  : annualizedPct >= 0
                  ? "profit"
                  : "loss"
              }
              tooltip={t(
                "按复利年化：（当前净值 ÷ 初始净值）^(365 ÷ 运行天数) − 1。运行天数越短，年化放大越失真；运行 < 30 天时仅供参考。",
                "Compounded: (current equity ÷ initial equity)^(365 ÷ running days) − 1. Short track records exaggerate the figure; treat as indicative below 30 days."
              )}
            />
            <MetricTile
              label={t("卡玛比率", "Calmar Ratio")}
              value={data.calmarRatio != null && isFinite(data.calmarRatio) ? fmt(data.calmarRatio, 2) : "--"}
              sub={data.calmarRatio != null && annualizedSampleWeak ? t("样本不足 · 仅供参考", "Small sample · indicative only") : undefined}
              tone={
                data.calmarRatio == null || annualizedSampleWeak
                  ? "neutral"
                  : data.calmarRatio < 0
                  ? "loss"
                  : data.calmarRatio >= 1
                  ? "profit"
                  : "neutral"
              }
              tooltip={t(
                "年化收益与最大回撤的比值，>2为优秀。分子为年化收益，运行 < 30 天时同样受短样本放大影响，仅供参考。",
                "Annualized return / max drawdown ratio, >2 is excellent. Built on the annualized figure, so short track records (< 30 days) distort it too — indicative only."
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <SectionTitle>{t("交易表现", "Trade Performance")}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricTile
              label={t("胜率", "Win Rate")}
              value={winRate != null ? `${winRate.toFixed(2)}%` : "--"}
              sub={
                metricsData && totalTrades != null && totalTrades > 0
                  ? `${t(`基于 ${totalTrades} 笔完整交易`, `${totalTrades} round trips`)} · ${t("盈", "W")} ${metricsData.winningTrades} ${t("亏", "L")} ${metricsData.losingTrades}${metricsData.breakevenTrades > 0 ? ` ${t("平", "BE")} ${metricsData.breakevenTrades}` : ""}`
                  : t("暂无交易", "No trades")
              }
              tone={winRate != null && winRate >= 50 ? "profit" : "neutral"}
              tooltip={t(
                "盈利交易笔数 ÷ 完整交易笔数。单看胜率无法判断盈亏——低胜率配大盈亏比同样能稳定盈利，需与盈亏比、期望值合看。",
                "Winning round trips ÷ total round trips. Win rate alone says nothing about profitability — a low win rate with a large P/L ratio still compounds. Read it with P/L ratio and expectancy."
              )}
            />
            <MetricTile
              label={t("盈亏比", "P/L Ratio")}
              value={plRatio != null && isFinite(plRatio) ? fmt(plRatio, 2) : "--"}
              sub={t("平均盈利 / 平均亏损", "Avg Win / Avg Loss")}
              tone={plRatio != null && plRatio > 1 ? "profit" : "neutral"}
              tooltip={t(
                "平均每笔盈利 ÷ 平均每笔亏损，>1 表示赚的单子平均比亏的单子大。用的是平均值，单笔大盈利会把它拉高，可与盈利因子（按总额计算）对照看。",
                "Average win ÷ average loss; >1 means winners are larger than losers on average. Built on averages, so one outsized win inflates it — cross-check against profit factor, which uses totals."
              )}
            />
            <MetricTile
              label={t("盈利因子", "Profit Factor")}
              value={profitFactor != null ? (isFinite(profitFactor) ? fmt(profitFactor, 2) : "∞") : "--"}
              sub={t("总盈利 / 总亏损", "Gross Win / Gross Loss")}
              tone={profitFactor == null ? "neutral" : profitFactor > 1 ? "profit" : profitFactor < 1 ? "loss" : "neutral"}
              tooltip={t(
                "总盈利与总亏损之比。>1 表示整体盈利，1.5 以上较为稳健。与盈亏比不同：盈亏比用平均值，会被单笔大盈利拉高；盈利因子用总额。",
                "Gross profit over gross loss. >1 means net profitable; above 1.5 is robust. Unlike P/L ratio (averages, skewed by outliers), this uses totals."
              )}
            />
            <MetricTile
              label={t("期望值", "Expectancy")}
              value={expectancyUsdc != null && isFinite(expectancyUsdc) ? `${fmtSign(expectancyUsdc, 2)} USDC` : "--"}
              sub={t("每笔完整交易", "Per round trip")}
              tone={expectancyUsdc != null && expectancyUsdc > 0 ? "profit" : expectancyUsdc != null && expectancyUsdc < 0 ? "loss" : "neutral"}
              tooltip={t(
                "每笔完整交易平均赚亏多少 = 总已实现盈亏 ÷ 完整交易数；为正表示长期正期望，用于结合胜率和盈亏比判断策略是否有优势。",
                "Average PnL per completed trade = total realized PnL ÷ completed trades; positive means a positive edge. Read it with win rate and P/L ratio to judge whether the strategy has an advantage."
              )}
              tooltipClassName="max-w-[220px] px-2 py-1 text-xs leading-snug"
            />
            <MetricTile
              label={t("交易风格", "Trading Style")}
              value={tradingStyle}
              valueFont="text"
              sub={
                avgHoldingHours == null
                  ? t("暂无完整交易", "No round trips yet")
                  : t(`均持 ${fmtHoldingHours(avgHoldingHours)}`, `Avg hold ${fmtHoldingHours(avgHoldingHours)}`)
              }
              tone="neutral"
              tooltip={t(
                "按平均持仓时长分档：<1天 日内 / 1–30天 波段 / >30天 趋势跟踪。",
                "Bucketed by average holding time: <1d intraday / 1–30d swing / >30d trend following."
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
