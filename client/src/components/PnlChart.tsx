import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw, Database } from "lucide-react";

// ─── Series config ────────────────────────────────────────────────────────────
const SERIES = [
  {
    key: "accountPerformance" as const,
    color: "oklch(68% 0.15 145)",
    gradId: "accountPerformanceGrad",
    gradColor: "oklch(68% 0.15 145)",
  },
  {
    key: "btcBenchmark" as const,
    color: "oklch(72% 0.14 55)",
    gradId: "btcBenchmarkGrad",
    gradColor: "oklch(72% 0.14 55)",
  },
  {
    key: "assetTrend" as const,
    color: "oklch(72% 0.08 230)",
    gradId: "assetTrendGrad",
    gradColor: "oklch(72% 0.08 230)",
  },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];
const PNL_START_DATE = "2026-06-27";

// ─── Tooltip ─────────────────────────────────────────────────────────────────
interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color?: string; payload?: ChartPoint }>;
  label?: string;
  labels: Record<SeriesKey, string>;
  visible: Record<SeriesKey, boolean>;
}

type ChartPoint = {
  date: string;
  equity: number;
  pnl: number;
  accountPerformance: number;
  btcBenchmark: number;
  assetTrend: number;
};

function formatSigned(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatAxisDay(value: string) {
  const raw = String(value ?? "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${Number(match[2])}/${Number(match[3])}`;
}

function getDateKey(value: string) {
  return String(value ?? "").slice(0, 10);
}

function CustomTooltip({ active, payload, label, labels, visible }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const seen = new Set<SeriesKey>();

  return (
    <div style={{
      background: "rgb(2 15 14 / 94%)",
      border: "1px solid rgb(92 211 184 / 18%)",
      borderRadius: 10, padding: "12px 14px", backdropFilter: "blur(16px)",
      boxShadow: "0 16px 40px rgb(0 0 0 / 42%)",
      minWidth: 190,
    }}>
      <div style={{ fontSize: "0.66rem", color: "rgb(209 231 226 / 62%)", letterSpacing: "0.08em", marginBottom: 8 }}>
        {label}
      </div>
      {payload.map((p) => {
        const seriesKey = p.dataKey as SeriesKey;
        if (seen.has(seriesKey)) return null;
        seen.add(seriesKey);
        if (!visible[seriesKey]) return null;
        const val = Number(p.value);
        const formatted = seriesKey === "assetTrend"
          ? `${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
          : `${formatSigned(val)}%`;
        const accountPnl =
          seriesKey === "accountPerformance" && p.payload
            ? `${formatSigned(p.payload.pnl)} USDC`
            : null;
        return (
          <div key={`${p.dataKey}-${label}`} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "0.78rem", marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ color: "rgb(209 231 226 / 62%)", letterSpacing: "0.04em" }}>
                {labels[seriesKey]}
              </span>
              <span style={{ color: val >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)", fontFamily: "DM Mono, monospace" }}>
                {formatted}
              </span>
            </div>
            {accountPnl && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: "0.72rem" }}>
                <span style={{ color: "rgb(209 231 226 / 46%)" }}>
                  {labels.accountPerformance.replace("(%)", "")}
                </span>
                <span style={{ color: val >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)", fontFamily: "DM Mono, monospace" }}>
                  {accountPnl}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Series toggle button ─────────────────────────────────────────────────────
function SeriesToggle({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-all"
      style={{
        fontSize: "0.68rem",
        letterSpacing: "0.06em",
        border: `1px solid ${active ? color : "rgb(255 255 255 / 12%)"}`,
        background: active ? `${color}22` : "transparent",
        color: active ? color : "rgb(190 190 186 / 76%)",
        boxShadow: active ? `0 0 18px ${color}18` : "none",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8, height: 8,
          borderRadius: "50%",
          background: active ? color : "oklch(35% 0.02 200 / 60%)",
          flexShrink: 0,
        }}
      />
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PnlChart() {
  const { lang } = useLang();
  type TimeRange = "1D" | "7D" | "30D" | "90D" | "MAX";
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    accountPerformance: true,
    btcBenchmark: true,
    assetTrend: false,
  });
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);

  // Compute startDate from timeRange
  // 1D  = today only (all intra-day snapshots)
  // 7D  = past 7 calendar days
  // 30D = past 30 calendar days
  // 90D = past 90 calendar days
  // MAX = all available PnL data, capped by the account curve start date.
  const startDate = useMemo(() => {
    if (timeRange == null || timeRange === "MAX") return PNL_START_DATE;
    const now = new Date();
    if (timeRange === "1D") {
      // Today in UTC
      const today = now.toISOString().slice(0, 10);
      return today > PNL_START_DATE ? today : PNL_START_DATE;
    }
    const days = timeRange === "7D" ? 7 : timeRange === "30D" ? 30 : 90;
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - days);
    const rangeStart = d.toISOString().slice(0, 10);
    return rangeStart > PNL_START_DATE ? rangeStart : PNL_START_DATE;
  }, [timeRange]);

  // Generous limit — actual filtering is done server-side by startDate
  const queryLimit = 1000;

  const snapshotMutation = trpc.hyperliquid.snapshotPnl.useMutation();

  const { data, isLoading, error, refetch, isFetching } = trpc.hyperliquid.pnlHistory.useQuery(
    { startDate, limit: queryLimit },
    { refetchInterval: 60_000 }
  );

  // Backend already returns data in ascending date order (earliest → latest)
  const snapshots = data || [];

  // Labels per language
  const labels: Record<SeriesKey, string> = {
    accountPerformance: lang === "zh" ? "账户盈亏 (%)" : "Account PnL (%)",
    btcBenchmark: lang === "zh" ? "BTC 涨跌幅 (%)" : "BTC Change (%)",
    assetTrend: lang === "zh" ? "资产走势" : "Asset Trend",
  };

  // Build chart data: account performance follows PnL, while BTC benchmark
  // follows BTC price change. Both are percentages on one axis.
  const baseEquity = snapshots.length > 0 ? parseFloat(snapshots[0].equity) : null;
  const baseBtcPrice = snapshots.length > 0 ? parseFloat(snapshots[0].btcPrice) : null;
  const chartData = snapshots.map((s) => {
    const eq = parseFloat(s.equity);
    const btcPrice = parseFloat(s.btcPrice);
    const btcBenchmark = baseBtcPrice && baseBtcPrice !== 0 && isFinite(btcPrice)
      ? ((btcPrice - baseBtcPrice) / baseBtcPrice) * 100
      : 0;
    const pnl = s.totalPnl ? parseFloat(s.totalPnl) : 0;
    const accountPerformance = baseEquity && baseEquity !== 0 && isFinite(pnl)
      ? (pnl / baseEquity) * 100
      : 0;
    return {
      date: s.date,
      equity: eq,
      pnl,
      accountPerformance,
      btcBenchmark,
      assetTrend: eq,
    };
  });
  const axisTicks = chartData.reduce<string[]>((ticks, point) => {
    const day = getDateKey(point.date);
    const previous = ticks[ticks.length - 1];
    if (!previous || getDateKey(previous) !== day) {
      ticks.push(point.date);
    }
    return ticks;
  }, []);
  const assetValues = chartData.map((d) => d.assetTrend).filter(Number.isFinite);
  const assetMin = assetValues.length > 0 ? Math.min(...assetValues) : 0;
  const assetMax = assetValues.length > 0 ? Math.max(...assetValues) : 0;
  const assetPadding = Math.max((assetMax - assetMin) * 0.18, Math.abs(assetMax || 1) * 0.002, 1);
  const assetDomain: [number, number] = [
    Math.max(0, assetMin - assetPadding),
    assetMax + assetPadding,
  ];

  const toggleSeries = (key: SeriesKey) => {
    setVisible((prev) => {
      // Prevent hiding all series
      const nextActive = !prev[key];
      const wouldAllBeHidden = !nextActive && Object.entries(prev).every(([k, v]) => k === key || !v);
      if (wouldAllBeHidden) return prev;
      return { ...prev, [key]: nextActive };
    });
  };

  // Determine which Y axes are needed
  const percentVisible = visible.accountPerformance || visible.btcBenchmark;
  const assetTrendVisible = visible.assetTrend;

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {lang === "zh" ? "损益历史" : "PnL History"}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              await snapshotMutation.mutateAsync();
              refetch();
            }}
            disabled={snapshotMutation.isPending}
            className="text-muted-foreground hover:text-foreground transition-colors text-xs tracking-widest uppercase border border-border/40 rounded-full px-3 py-1 disabled:opacity-40"
            style={{ fontSize: "0.65rem" }}
          >
            {snapshotMutation.isPending ? (lang === "zh" ? "保存中" : "Saving") : (lang === "zh" ? "快照" : "Snapshot")}
          </button>
          <button onClick={() => { refetch(); }} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Hyperliquid snapshot status bar */}
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 px-4 py-3 rounded-lg"
        style={{ background: "rgb(255 255 255 / 5%)", border: "1px solid rgb(255 255 255 / 9%)" }}
      >
        <div className="flex items-center gap-1.5">
          <Database size={12} className="text-profit" />
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "数据源" : "Source"}
          </span>
          <span className="text-profit tracking-widest" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "Hyperliquid 实盘账户 · USDC" : "Hyperliquid Live · USDC"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "快照数量" : "Snapshots"}
          </span>
          <span className="num-display text-foreground/80" style={{ fontSize: "0.72rem" }}>
            {snapshots.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "记录方式" : "Mode"}
          </span>
          <span className="num-display text-foreground/70" style={{ fontSize: "0.72rem" }}>
            {lang === "zh" ? "手动快照" : "Manual"}
          </span>
        </div>
      </div>

      {/* Controls row: time range + series toggles — stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
        {/* Time range */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "周期" : "Range"}
          </span>
          <div className="flex gap-1">
            {(["1D", "7D", "30D", "90D", "MAX"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`pill-tab ${timeRange === r ? "active" : ""}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Divider — hidden on mobile */}
        <div className="hidden sm:block" style={{ width: 1, height: 16, background: "rgb(255 255 255 / 10%)" }} />

        {/* Series toggles */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "显示" : "Show"}
          </span>
          <div className="flex gap-2">
            {SERIES.map((s) => (
              <SeriesToggle
                key={s.key}
                label={labels[s.key]}
                color={s.color}
                active={visible[s.key]}
                onClick={() => toggleSeries(s.key)}
              />
            ))}
          </div>
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm animate-pulse py-8 text-center">{lang === "zh" ? "加载中..." : "Loading..."}</div>}
      {error && <div className="text-loss text-sm py-4">{error.message}</div>}

      {!isLoading && snapshots.length === 0 && (
        <div className="py-12 text-center space-y-2">
          <div className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.75rem" }}>
            {lang === "zh" ? "暂无快照数据" : "No snapshot data"}
          </div>
          <div className="text-muted-foreground/50" style={{ fontSize: "0.7rem" }}>
            {lang === "zh"
              ? "Hyperliquid Portfolio 暂未返回该周期的历史曲线"
              : "Hyperliquid Portfolio has not returned history for this range"}
          </div>
        </div>
      )}

      {snapshots.length > 0 && (
        <div
          className="h-[360px] sm:h-[430px] -mx-1 sm:-mx-2"
          style={{
            filter: "drop-shadow(0 18px 30px rgb(0 0 0 / 22%))",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 14, right: assetTrendVisible ? 78 : 62, left: 8, bottom: 10 }}>
              <defs>
                <linearGradient id="accountPerformanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(68% 0.15 145)" stopOpacity={0.28} />
                  <stop offset="92%" stopColor="oklch(68% 0.15 145)" stopOpacity={0.02} />
                </linearGradient>
                {SERIES.slice(1).map((s) => (
                  <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.gradColor} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={s.gradColor} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="1 10" stroke="rgb(117 160 148 / 10%)" vertical horizontal />
              <XAxis
                dataKey="date"
                tick={{ fill: "rgb(160 190 182 / 42%)", fontSize: 11, fontFamily: "DM Mono" }}
                tickLine={false}
                axisLine={{ stroke: "rgb(117 160 148 / 12%)" }}
                minTickGap={34}
                ticks={axisTicks}
                tickFormatter={formatAxisDay}
              />
              {percentVisible && (
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "oklch(72% 0.14 55 / 72%)", fontSize: 11, fontFamily: "DM Mono" }}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
              )}
              {assetTrendVisible && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={assetDomain}
                  tick={{ fill: "oklch(72% 0.08 230 / 72%)", fontSize: 11, fontFamily: "DM Mono" }}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={(v) => v.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                />
              )}
              <Tooltip
                content={
                  <CustomTooltip
                    labels={labels}
                    visible={visible}
                  />
                }
              />
              {visible.accountPerformance && (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="accountPerformance"
                  name={labels.accountPerformance}
                  stroke={SERIES[0].color}
                  strokeWidth={2.1}
                  fill="url(#accountPerformanceGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls={false}
                />
              )}

              {/* BTC benchmark line */}
              {visible.btcBenchmark && (
                <Area
                  yAxisId="left"
                  type="natural"
                  dataKey="btcBenchmark"
                  name={labels.btcBenchmark}
                  stroke={SERIES[1].color}
                  strokeWidth={2}
                  fill="url(#btcBenchmarkGrad)"
                  fillOpacity={0.16}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  connectNulls
                />
              )}

              {visible.assetTrend && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="assetTrend"
                  name={labels.assetTrend}
                  stroke={SERIES[2].color}
                  strokeWidth={1.9}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
