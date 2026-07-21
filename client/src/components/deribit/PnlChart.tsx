import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type Denomination = "USDC" | "BTC";

// ─── Series config ────────────────────────────────────────────────────────────
const SERIES = [
  {
    key: "equity" as const,
    color: "oklch(60% 0.1 210)",
    gradId: "equityGrad",
    gradColor: "oklch(60% 0.1 210)",
  },
  {
    key: "pnl" as const,
    color: "oklch(68% 0.15 145)",
    gradId: "pnlGrad",
    gradColor: "oklch(68% 0.15 145)",
  },
  {
    key: "roi" as const,
    color: "oklch(72% 0.14 55)",
    gradId: "roiGrad",
    gradColor: "oklch(72% 0.14 55)",
  },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

// ─── Tooltip ─────────────────────────────────────────────────────────────────
interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color?: string }>;
  label?: string;
  denomination: Denomination;
  labels: Record<SeriesKey, string>;
  visible: Record<SeriesKey, boolean>;
}

function CustomTooltip({ active, payload, label, denomination, labels, visible }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const unit = denomination === "BTC" ? "BTC" : "USDC";
  const decimals = denomination === "BTC" ? 6 : 2;

  return (
    <div style={{
      background: "oklch(22% 0.025 200 / 92%)",
      border: "1px solid oklch(40% 0.02 200 / 40%)",
      borderRadius: 8, padding: "10px 14px", backdropFilter: "blur(12px)",
      minWidth: 160,
    }}>
      <div style={{ fontSize: "0.65rem", color: "oklch(58% 0.015 200)", letterSpacing: "0.1em", marginBottom: 6 }}>
        {label}
      </div>
      {payload.map((p) => {
        const seriesKey = p.dataKey as SeriesKey;
        if (!visible[seriesKey]) return null;
        const isRoi = seriesKey === "roi";
        const val = p.value;
        const formatted = isRoi
          ? `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`
          : `${val >= 0 ? "+" : ""}${val.toFixed(decimals)} ${unit}`;
        return (
          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: "0.75rem", marginBottom: 2 }}>
            <span style={{ color: "oklch(58% 0.015 200)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {labels[seriesKey]}
            </span>
            <span style={{ color: val >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)", fontFamily: "DM Mono, monospace" }}>
              {formatted}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Countdown ────────────────────────────────────────────────────────────────
function Countdown({ nextRunAt }: { nextRunAt: number | null }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!nextRunAt) return;
    const update = () => {
      const diff = nextRunAt - Date.now();
      if (diff <= 0) { setRemaining("soon"); return; }
      const m = Math.floor(diff / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setRemaining(`${m}m ${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [nextRunAt]);
  return <span className="num-display">{remaining || "—"}</span>;
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
        border: `1px solid ${active ? color : "oklch(35% 0.02 200 / 40%)"}`,
        background: active ? `${color}22` : "transparent",
        color: active ? color : "oklch(48% 0.015 200)",
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
  const [denomination, setDenomination] = useState<Denomination>("USDC");
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    equity: true,
    pnl: true,
    roi: true,
  });
  const [timeRange, setTimeRange] = useState<"1D" | "7D" | "30D" | "90D" | "MAX">("MAX");

  // Compute startDate from timeRange
  // 1D  = today only (all intra-day snapshots)
  // 7D  = past 7 calendar days
  // 30D = past 30 calendar days
  // 90D = past 90 calendar days
  // MAX = all data since project launch (2026-03-09)
  const startDate = useMemo(() => {
    if (timeRange === "MAX") return "2026-03-09"; // fixed project launch date
    const now = new Date();
    if (timeRange === "1D") {
      // Today in UTC
      return now.toISOString().slice(0, 10);
    }
    const days = timeRange === "7D" ? 7 : timeRange === "30D" ? 30 : 90;
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }, [timeRange]);

  // Generous limit — actual filtering is done server-side by startDate
  const queryLimit = 1000;

  const snapshotMutation = trpc.deribit.snapshotPnl.useMutation();

  const { data, isLoading, error, refetch, isFetching } = trpc.deribit.pnlHistory.useQuery(
    { denomination, startDate, limit: queryLimit },
    { refetchInterval: 60_000 }
  );

  const { data: schedulerData, refetch: refetchScheduler } = trpc.deribit.schedulerStatus.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  // Backend already returns data in ascending date order (earliest → latest)
  const snapshots = data || [];
  const isBtc = denomination === "BTC";
  const unit = isBtc ? "BTC" : "USDC";
  const decimals = isBtc ? 6 : 2;

  // Labels per language
  const labels: Record<SeriesKey, string> = {
    equity: lang === "zh" ? `净值 (${unit})` : `Equity (${unit})`,
    pnl: lang === "zh" ? `盈亏 (${unit})` : `PnL (${unit})`,
    roi: lang === "zh" ? "收益率 (%)" : "ROI (%)",
  };

  // Build chart data: compute ROI relative to first snapshot equity
  const baseEquity = snapshots.length > 0 ? parseFloat(snapshots[0].equity) : null;
  const chartData = snapshots.map((s) => {
    const eq = parseFloat(s.equity);
    const roi = baseEquity && baseEquity !== 0
      ? ((eq - baseEquity) / baseEquity) * 100
      : 0;
    return {
      date: s.date,
      equity: eq,
      pnl: s.totalPnl ? parseFloat(s.totalPnl) : 0,
      roi,
    };
  });

  const latest = snapshots[snapshots.length - 1];
  const earliest = snapshots[0];
  const equityChange = latest && earliest
    ? parseFloat(latest.equity) - parseFloat(earliest.equity)
    : null;
  const roiLatest = baseEquity && baseEquity !== 0 && latest
    ? ((parseFloat(latest.equity) - baseEquity) / baseEquity) * 100
    : null;

  const fmtVal = (v: number) => isBtc ? v.toFixed(6) : v.toFixed(2);

  const fmtTime = (ts: number | null) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  };

  const statusIcon = schedulerData?.lastRunStatus === "success"
    ? <CheckCircle2 size={11} className="text-profit" />
    : schedulerData?.lastRunStatus === "error"
    ? <AlertCircle size={11} className="text-loss" />
    : schedulerData?.lastRunStatus === "pending"
    ? <Loader2 size={11} className="text-neutral animate-spin" />
    : <Clock size={11} className="text-muted-foreground" />;

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
  const needsRoiAxis = visible.roi && (visible.equity || visible.pnl);
  const onlyRoi = visible.roi && !visible.equity && !visible.pnl;

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {lang === "zh" ? "损益历史" : "PnL History"}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "oklch(58% 0.015 200 / 60%)" }} />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              await snapshotMutation.mutateAsync({});
              refetch();
              refetchScheduler();
            }}
            disabled={snapshotMutation.isPending}
            className="text-muted-foreground hover:text-foreground transition-colors text-xs tracking-widest uppercase border border-border/40 rounded-full px-3 py-1 disabled:opacity-40"
            style={{ fontSize: "0.65rem" }}
          >
            {snapshotMutation.isPending ? (lang === "zh" ? "保存中" : "Saving") : (lang === "zh" ? "快照" : "Snapshot")}
          </button>
          <button onClick={() => { refetch(); refetchScheduler(); }} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Auto-snapshot status bar */}
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 px-4 py-3 rounded-lg"
        style={{ background: "oklch(20% 0.02 200 / 50%)", border: "1px solid oklch(35% 0.02 200 / 30%)" }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "自动快照" : "Auto Snapshot"}
          </span>
          <span className="text-profit tracking-widest" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "每小时 · BTC + USDC" : "Hourly · BTC + USDC"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {statusIcon}
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "上次执行" : "Last Run"}
          </span>
          <span className="num-display text-foreground/80" style={{ fontSize: "0.72rem" }}>
            {fmtTime(schedulerData?.lastRunAt ?? null)}
          </span>
          {schedulerData?.lastRunStatus === "error" && schedulerData.lastError && (
            <span className="text-loss" style={{ fontSize: "0.65rem" }}>({schedulerData.lastError})</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={11} className="text-muted-foreground" />
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "下次执行" : "Next Run"}
          </span>
          <span style={{ fontSize: "0.72rem" }}>
            <Countdown nextRunAt={schedulerData?.nextRunAt ?? null} />
          </span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "已执行" : "Runs"}
          </span>
          <span className="num-display text-foreground/70" style={{ fontSize: "0.72rem" }}>
            {schedulerData?.runCount ?? 0}
          </span>
        </div>
      </div>

      {/* Controls row: denomination + series toggles — stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
        {/* Denomination */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {lang === "zh" ? "计价" : "Unit"}
          </span>
          <div className="flex gap-1">
            {(["USDC", "BTC"] as Denomination[]).map((d) => (
              <button
                key={d}
                onClick={() => setDenomination(d)}
                className={`pill-tab ${denomination === d ? "active" : ""}`}
              >
                {d === "USDC" ? (lang === "zh" ? "USDC 本位" : "USDC") : (lang === "zh" ? "BTC 本位" : "BTC")}
              </button>
            ))}
          </div>
        </div>

        {/* Divider — hidden on mobile */}
        <div className="hidden sm:block" style={{ width: 1, height: 16, background: "oklch(35% 0.02 200 / 40%)" }} />

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
        <div className="hidden sm:block" style={{ width: 1, height: 16, background: "oklch(35% 0.02 200 / 40%)" }} />

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

      {/* Summary stats */}
      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-5 mb-6">
          {[
            {
              label: `${lang === "zh" ? "净值" : "Equity"} (${unit})`,
              value: fmtVal(parseFloat(latest.equity)),
              cls: "text-foreground",
            },
            {
              label: lang === "zh" ? "BTC 余额" : "BTC Balance",
              value: latest.btcBalance != null
                ? parseFloat(latest.btcBalance).toFixed(6) + " BTC"
                : "—",
              cls: "text-foreground/90",
            },
            {
              label: lang === "zh" ? "USDC 余额" : "USDC Balance",
              value: latest.usdcBalance != null
                ? parseFloat(latest.usdcBalance).toFixed(2) + " USDC"
                : "—",
              cls: "text-foreground/90",
            },
            {
              label: lang === "zh" ? `区间变化 (${unit})` : `Period Δ (${unit})`,
              value: equityChange != null
                ? (equityChange >= 0 ? "+" : "") + fmtVal(equityChange)
                : "—",
              cls: equityChange != null
                ? equityChange >= 0 ? "text-profit" : "text-loss"
                : "text-muted-foreground",
            },
            {
              label: lang === "zh" ? "区间收益率" : "Period ROI",
              value: roiLatest != null
                ? `${roiLatest >= 0 ? "+" : ""}${roiLatest.toFixed(2)}%`
                : "—",
              cls: roiLatest != null
                ? roiLatest >= 0 ? "text-profit" : "text-loss"
                : "text-muted-foreground",
            },
          ].map(({ label, value, cls }) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>{label}</span>
              <span className={`num-display text-base ${cls}`}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {isLoading && <div className="text-muted-foreground text-sm animate-pulse py-8 text-center">{lang === "zh" ? "加载中..." : "Loading..."}</div>}
      {error && <div className="text-loss text-sm py-4">{error.message}</div>}

      {!isLoading && snapshots.length === 0 && (
        <div className="py-12 text-center space-y-2">
          <div className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.75rem" }}>
            {lang === "zh" ? "暂无快照数据" : "No snapshot data"}
          </div>
          <div className="text-muted-foreground/50" style={{ fontSize: "0.7rem" }}>
            {lang === "zh"
              ? `点击"快照"按钮记录当前 ${unit} 账户净值`
              : `Click "Snapshot" to record the current ${unit} account equity`}
          </div>
        </div>
      )}

      {snapshots.length > 0 && (
        <div className="h-56 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: needsRoiAxis ? 50 : 5, left: 0, bottom: 5 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.gradColor} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={s.gradColor} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="1 6" stroke="oklch(35% 0.02 200 / 25%)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "oklch(45% 0.015 200)", fontSize: 10, fontFamily: "DM Mono" }}
                tickLine={false}
                axisLine={{ stroke: "oklch(30% 0.02 200 / 40%)" }}
              />
              {/* Left Y axis: equity / pnl */}
              {(visible.equity || visible.pnl || onlyRoi === false) && !onlyRoi && (
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "oklch(45% 0.015 200)", fontSize: 10, fontFamily: "DM Mono" }}
                  tickLine={false}
                  axisLine={false}
                  width={isBtc ? 90 : 80}
                  tickFormatter={(v) => isBtc ? v.toFixed(4) : v.toFixed(0)}
                />
              )}
              {/* Right Y axis: ROI% (only shown when ROI is visible alongside other series) */}
              {needsRoiAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "oklch(72% 0.14 55)", fontSize: 10, fontFamily: "DM Mono" }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
              )}
              {/* Single axis when only ROI is shown */}
              {onlyRoi && (
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "oklch(72% 0.14 55)", fontSize: 10, fontFamily: "DM Mono" }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
              )}
              <Tooltip
                content={
                  <CustomTooltip
                    denomination={denomination}
                    labels={labels}
                    visible={visible}
                  />
                }
              />

              {/* Equity area */}
              {visible.equity && (
                <Area
                  yAxisId={onlyRoi ? "left" : "left"}
                  type="monotone"
                  dataKey="equity"
                  name={labels.equity}
                  stroke={SERIES[0].color}
                  strokeWidth={1.5}
                  fill={`url(#${SERIES[0].gradId})`}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              )}

              {/* PnL area */}
              {visible.pnl && (
                <Area
                  yAxisId={onlyRoi ? "left" : "left"}
                  type="monotone"
                  dataKey="pnl"
                  name={labels.pnl}
                  stroke={SERIES[1].color}
                  strokeWidth={1.5}
                  fill={`url(#${SERIES[1].gradId})`}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              )}

              {/* ROI line */}
              {visible.roi && (
                <Line
                  yAxisId={needsRoiAxis ? "right" : "left"}
                  type="monotone"
                  dataKey="roi"
                  name={labels.roi}
                  stroke={SERIES[2].color}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                  strokeDasharray="4 2"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
