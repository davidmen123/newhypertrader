import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw, Database, X } from "lucide-react";

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
  payload?: Array<{ value: number | null; dataKey: string; color?: string; payload?: ChartPoint }>;
  label?: string;
  labels: Record<SeriesKey, string>;
  visible: Record<SeriesKey, boolean>;
}

type ChartPoint = {
  date: string;
  equity: number;
  pnl: number;
  accountPerformance: number;
  btcBenchmark: number | null;
  btcPrice: number | null;
  assetTrend: number;
};

type TradeFill = {
  execId: string;
  symbol: string;
  side: string;
  execPrice: string;
  execQty: string;
  createdTime: string;
  execPnl: string;
  closeMethod?: string;
};

type TradeMarker = ChartPoint & {
  trade: TradeFill;
  action: "买入" | "卖出";
  childLabel?: string;
};

type Candle = { time: number; open: number; high: number; low: number; close: number };
type PnlSnapshot = { date: string; equity: string; totalPnl?: string | null; btcPrice?: string | number | null };
type CandleInterval = "1h" | "4h" | "1d" | "1w";

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

function formatUtc8Date(date: Date) {
  const utc8OffsetMs = 8 * 60 * 60 * 1000;
  return new Date(date.getTime() + utc8OffsetMs).toISOString().slice(0, 10);
}

function makeValueGridTicks(values: number[], preferredCount = 6) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return [0];

  let min = Math.min(...finiteValues);
  let max = Math.max(...finiteValues);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.08, 1);
    min -= pad;
    max += pad;
  }

  if (min < 0 && max > 0) {
    const span = Math.max(Math.abs(min), Math.abs(max));
    min = -span;
    max = span;
  }

  const rawStep = (max - min) / Math.max(preferredCount - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawStep, 0.000001)));
  const residual = rawStep / magnitude;
  const niceStep = residual > 5 ? 10 * magnitude : residual > 2 ? 5 * magnitude : residual > 1 ? 2 * magnitude : magnitude;
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];

  for (let value = niceMin; value <= niceMax + niceStep * 0.5; value += niceStep) {
    ticks.push(Number(value.toFixed(6)));
  }

  return ticks.length > 0 ? ticks : [0];
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
        if (!Number.isFinite(val)) return null;
        const formatted = seriesKey === "assetTrend"
          ? `${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
          : `${formatSigned(val)}%`;
        const accountPnl =
          seriesKey === "accountPerformance" && p.payload
            ? `${formatSigned(p.payload.pnl)} USDC`
            : null;
        const btcPrice =
          seriesKey === "btcBenchmark" && p.payload?.btcPrice != null && Number.isFinite(p.payload.btcPrice)
            ? `$${p.payload.btcPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
            {btcPrice && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: "0.72rem" }}>
                <span style={{ color: "rgb(209 231 226 / 46%)" }}>
                  {labels.btcBenchmark.includes("BTC 涨跌幅") ? "BTC价格" : "BTC Price"}
                </span>
                <span style={{ color: "rgb(209 231 226 / 78%)", fontFamily: "DM Mono, monospace" }}>
                  {btcPrice}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniCandleChart({ candles, trade, interval }: { candles: Candle[]; trade: TradeFill; interval: CandleInterval }) {
  const visibleStart = Math.max(candles.length - 48, 0);
  const visible = candles.slice(visibleStart);
  if (visible.length === 0) return <div className="py-10 text-center text-muted-foreground text-sm">暂无K线数据</div>;
  const values = visible.flatMap((candle) => [candle.high, candle.low]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const chartTop = 12;
  const chartBottom = 178;
  const y = (value: number) => chartBottom - ((value - min) / range) * (chartBottom - chartTop);
  const width = 620;
  const step = width / visible.length;
  const emaPeriod = 20;
  const emaValues: Array<number | null> = [];
  const multiplier = 2 / (emaPeriod + 1);
  candles.forEach((candle, index) => {
    if (index === 0) {
      emaValues.push(candle.close);
      return;
    }
    const previous = emaValues[index - 1] ?? candle.close;
    emaValues.push((candle.close - previous) * multiplier + previous);
  });
  const visibleEma = emaValues.slice(visibleStart);
  const tradeTime = Number(trade.createdTime);
  const selectedIndex = visible.reduce((best, candle, index) => {
    const distance = Math.abs(candle.time - tradeTime);
    const bestDistance = Math.abs(visible[best].time - tradeTime);
    return distance < bestDistance ? index : best;
  }, 0);
  const selected = visible[selectedIndex];
  const markerColor = trade.side === "buy" || trade.side === "B" ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)";
  const labelStep = Math.max(1, Math.ceil(visible.length / 8));
  const formatAxisDate = (time: number) => new Date(time).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  const emaPoints = visibleEma
    .map((value, index) => value == null ? null : `${index * step + step / 2},${y(value)}`)
    .filter((point): point is string => point != null)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} 220`} className="w-full h-56" role="img" aria-label={`历史成交K线，${interval}周期，含EMA20均线`}>
      <line x1="0" y1={chartBottom} x2={width} y2={chartBottom} stroke="var(--panel-border)" />
      {visible.map((candle, index) => {
        const x = index * step + step / 2;
        const top = y(Math.max(candle.open, candle.close));
        const bottom = y(Math.min(candle.open, candle.close));
        const bullish = candle.close >= candle.open;
        const color = bullish ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)";
        return (
          <g key={candle.time}>
            <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.2" />
            <rect x={x - Math.max(step * 0.28, 2)} y={top} width={Math.max(step * 0.56, 3)} height={Math.max(bottom - top, 2)} fill={bullish ? "transparent" : color} stroke={color} strokeWidth="1.2" />
          </g>
        );
      })}
      {emaPoints && <polyline points={emaPoints} fill="none" stroke="#111" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={selectedIndex * step + step / 2} cy={trade.side === "buy" || trade.side === "B" ? Math.min(y(selected.low) + 12, chartBottom - 2) : Math.max(y(selected.high) - 12, chartTop + 2)} r="5" fill={markerColor} stroke="var(--background)" strokeWidth="2" />
      {visible.map((candle, index) => index % labelStep === 0 && (
        <text key={`date-${candle.time}`} x={index * step + step / 2} y="202" textAnchor="middle" fill="rgb(160 190 182 / 62%)" fontSize="10" fontFamily="DM Mono, monospace">
          {formatAxisDate(candle.time)}
        </text>
      ))}
    </svg>
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
        border: `1px solid ${active ? color : "var(--panel-border)"}`,
        background: active ? `${color}22` : "transparent",
        color: active ? color : "var(--text-soft)",
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
  type TimeRange = "7D" | "30D" | "90D" | "MAX";
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    accountPerformance: true,
    btcBenchmark: true,
    assetTrend: false,
  });
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<TradeMarker | null>(null);
  const [hoveredTradeId, setHoveredTradeId] = useState<string | null>(null);
  const [showReviewDetail, setShowReviewDetail] = useState(false);
  const [candleInterval, setCandleInterval] = useState<CandleInterval>("4h");

  // Compute startDate from timeRange
  // 7D  = past 7 calendar days
  // 30D = past 30 calendar days
  // 90D = past 90 calendar days
  // MAX = all available PnL data, capped by the account curve start date.
  const startDate = useMemo(() => {
    if (timeRange == null || timeRange === "MAX") return PNL_START_DATE;
    const now = new Date();
    const days = timeRange === "7D" ? 7 : timeRange === "30D" ? 30 : 90;
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    const rangeStart = formatUtc8Date(d);
    return rangeStart > PNL_START_DATE ? rangeStart : PNL_START_DATE;
  }, [timeRange]);

  // Generous limit — actual filtering is done server-side by startDate
  const queryLimit = 1000;

  const { data, isLoading, error, refetch, isFetching } = trpc.hyperliquid.pnlHistory.useQuery(
    { startDate, limit: queryLimit },
    { refetchInterval: 60_000 }
  );
  const { data: tradeHistory } = trpc.hyperliquid.tradeHistory.useQuery(
    { startDate, limit: 100 },
    { refetchInterval: 120_000 }
  );
  const selectedCoin = selectedTrade?.trade.symbol?.replace(/-PERP$/i, "") || "BTC";
  const selectedTime = Number(selectedTrade?.trade.createdTime);
  const candleWindowMs: Record<CandleInterval, number> = {
    "1h": 4 * 24 * 60 * 60 * 1000,
    "4h": 14 * 24 * 60 * 60 * 1000,
    "1d": 60 * 24 * 60 * 60 * 1000,
    "1w": 180 * 24 * 60 * 60 * 1000,
  };
  const candleWindow = candleWindowMs[candleInterval];
  const { data: candles } = trpc.hyperliquid.candles.useQuery(
    {
      coin: selectedCoin,
      interval: candleInterval,
      startTime: Number.isFinite(selectedTime) ? selectedTime - candleWindow : undefined,
      endTime: Number.isFinite(selectedTime) ? selectedTime + candleWindow : undefined,
    },
    { enabled: showReviewDetail && selectedTrade != null }
  );
  const { data: review } = trpc.hyperliquid.tradeReview.useQuery(
    { tradeExecId: selectedTrade?.trade.execId || "none" },
    { enabled: selectedTrade != null }
  );
  const visibleReview = review?.status === "published" ? review : null;

  // Backend already returns data in ascending date order (earliest → latest)
  const snapshots = (data || []) as PnlSnapshot[];
  const trades = (tradeHistory?.trades ?? []) as TradeFill[];

  // Labels per language
  const labels: Record<SeriesKey, string> = {
    accountPerformance: lang === "zh" ? "账户盈亏 (%)" : "Account PnL (%)",
    btcBenchmark: lang === "zh" ? "BTC 涨跌幅 (%)" : "BTC Change (%)",
    assetTrend: lang === "zh" ? "账户净值" : "Account Equity",
  };

  // Build chart data: account performance follows PnL, while BTC benchmark
  // follows BTC price change. Both are percentages on one axis.
  const baseEquity = snapshots.length > 0 ? parseFloat(snapshots[0].equity) : null;
  const validBtcPrices = snapshots
    .map((s) => parseFloat(String(s.btcPrice ?? "")))
    .filter((price) => Number.isFinite(price) && price > 0);
  const baseBtcPrice = validBtcPrices.length > 0 ? validBtcPrices[0] : null;
  const chartData = snapshots.map((s) => {
    const eq = parseFloat(s.equity);
    const btcPrice = parseFloat(String(s.btcPrice ?? ""));
    const btcBenchmark = baseBtcPrice && baseBtcPrice !== 0 && Number.isFinite(btcPrice) && btcPrice > 0
      ? ((btcPrice - baseBtcPrice) / baseBtcPrice) * 100
      : null;
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
      btcPrice: Number.isFinite(btcPrice) && btcPrice > 0 ? btcPrice : null,
      assetTrend: eq,
    };
  });
  const tradeMarkers = useMemo<TradeMarker[]>(() => {
    if (chartData.length === 0) return [];
    return trades
      .map((trade) => {
        const timestamp = Number(trade.createdTime);
        if (!Number.isFinite(timestamp)) return null;
        const tradeDate = new Date(timestamp).toISOString().slice(0, 10);
        const point = chartData.reduce((nearest, candidate) => {
          const distance = Math.abs(new Date(candidate.date).getTime() - new Date(tradeDate).getTime());
          const nearestDistance = Math.abs(new Date(nearest.date).getTime() - new Date(tradeDate).getTime());
          return distance < nearestDistance ? candidate : nearest;
        }, chartData[0]);
        const action: "买入" | "卖出" = trade.side === "buy" || trade.side === "B" ? "买入" : "卖出";
        const closeMethod = String(trade.closeMethod ?? "");
        const childLabel = closeMethod.includes("take_profit") ? "止盈"
          : closeMethod.includes("stop_loss") ? "止损"
            : undefined;
        return childLabel ? { ...point, trade, action, childLabel } : { ...point, trade, action };
      })
      .filter((marker): marker is TradeMarker => marker !== null);
  }, [chartData, trades]);
  const reviewChartData = useMemo(() => {
    return chartData.map((point) => {
      const markers = tradeMarkers.filter((marker) => marker.date === point.date);
      const buy = markers.find((marker) => marker.action === "买入");
      const sell = markers.find((marker) => marker.action === "卖出");
      return {
        ...point,
        buyMarker: buy?.assetTrend ?? null,
        sellMarker: sell?.assetTrend ?? null,
        buyTrade: buy,
        sellTrade: sell,
      };
    });
  }, [chartData, tradeMarkers]);
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
  const percentVisible = !reviewMode && (visible.accountPerformance || visible.btcBenchmark);
  const assetTrendVisible = reviewMode || visible.assetTrend;
  const percentGridValues = chartData.flatMap((d) => [
    visible.accountPerformance ? d.accountPerformance : null,
    visible.btcBenchmark ? d.btcBenchmark : null,
  ]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const percentGridTicks = makeValueGridTicks(percentGridValues);
  const assetGridTicks = makeValueGridTicks(assetValues);
  const gridMode = assetTrendVisible && !percentVisible ? "asset" : "percent";

  const toggleSeries = (key: SeriesKey) => {
    setVisible((prev) => {
      // Prevent hiding all series
      const nextActive = !prev[key];
      const wouldAllBeHidden = !nextActive && Object.entries(prev).every(([k, v]) => k === key || !v);
      if (wouldAllBeHidden) return prev;
      return { ...prev, [key]: nextActive };
    });
  };

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
          <button onClick={() => { refetch(); }} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Hyperliquid snapshot status bar */}
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 px-4 py-3 rounded-lg"
        style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
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
            {lang === "zh" ? "数据点" : "Data points"}
          </span>
          <span className="num-display text-foreground/80" style={{ fontSize: "0.72rem" }}>
            {snapshots.length}
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
            {(["7D", "30D", "90D", "MAX"] as const).map((r) => (
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
        <div className="hidden sm:block" style={{ width: 1, height: 16, background: "var(--panel-border)" }} />

        {/* Series toggles */}
        {!reviewMode && <div className="flex items-center gap-2">
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
        </div>}

        {reviewMode && (
          <div className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: "0.68rem" }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "oklch(72% 0.08 230)" }} />
            {lang === "zh" ? "账户净值" : "Account Equity"}
          </div>
        )}

        <div className="hidden sm:block" style={{ width: 1, height: 16, background: "var(--panel-border)" }} />

        <button
          onClick={() => {
            setReviewMode((active) => !active);
            setSelectedTrade(null);
            setShowReviewDetail(false);
          }}
          className="text-xs tracking-widest rounded-full px-3 py-1 transition-colors"
          style={{
            border: `1px solid ${reviewMode ? "rgb(92 211 184 / 62%)" : "var(--panel-border)"}`,
            color: reviewMode ? "rgb(92 211 184 / 92%)" : "var(--text-soft)",
            background: reviewMode ? "rgb(92 211 184 / 10%)" : "transparent",
          }}
        >
          {reviewMode ? (lang === "zh" ? "退出复盘模式" : "Exit Review Mode") : (lang === "zh" ? "复盘模式" : "Review Mode")}
        </button>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm animate-pulse py-8 text-center">{lang === "zh" ? "加载中..." : "Loading..."}</div>}
      {error && <div className="text-loss text-sm py-4">{error.message}</div>}

      {!isLoading && snapshots.length === 0 && (
        <div className="py-12 text-center space-y-2">
          <div className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.75rem" }}>
            {lang === "zh" ? "暂无历史数据" : "No history data"}
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
            <ComposedChart data={reviewMode ? reviewChartData : chartData} margin={{ top: 14, right: assetTrendVisible ? 78 : 62, left: 8, bottom: 10 }}>
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
              <CartesianGrid strokeDasharray="1 12" stroke="rgb(117 160 148 / 10%)" vertical horizontal={false} />
              {gridMode === "percent" && percentVisible && percentGridTicks.slice(0, -1).map((tick, index) => {
                const nextTick = percentGridTicks[index + 1];
                const midpoint = (tick + nextTick) / 2;
                const fill = midpoint >= 0
                  ? index % 2 === 0 ? "rgb(41 185 116 / 9%)" : "rgb(41 185 116 / 5%)"
                  : index % 2 === 0 ? "rgb(214 80 80 / 8%)" : "rgb(214 80 80 / 4%)";
                return (
                  <ReferenceArea
                    key={`percent-band-${tick}-${nextTick}`}
                    yAxisId="left"
                    y1={tick}
                    y2={nextTick}
                    fill={fill}
                    strokeOpacity={0}
                    ifOverflow="extendDomain"
                  />
                );
              })}
              {gridMode === "asset" && assetGridTicks.slice(0, -1).map((tick, index) => {
                const nextTick = assetGridTicks[index + 1];
                return (
                  <ReferenceArea
                    key={`asset-band-${tick}-${nextTick}`}
                    yAxisId="right"
                    y1={tick}
                    y2={nextTick}
                    fill={index % 2 === 0 ? "rgb(87 150 190 / 9%)" : "rgb(87 150 190 / 5%)"}
                    strokeOpacity={0}
                    ifOverflow="extendDomain"
                  />
                );
              })}
              {gridMode === "percent" && percentVisible && percentGridTicks.map((tick) => (
                <ReferenceLine
                  key={`percent-grid-${tick}`}
                  yAxisId="left"
                  y={tick}
                  stroke={tick === 0 ? "rgb(117 160 148 / 42%)" : "rgb(117 160 148 / 20%)"}
                  strokeDasharray={tick === 0 ? "4 6" : "1 10"}
                  ifOverflow="extendDomain"
                />
              ))}
              {gridMode === "asset" && assetGridTicks.map((tick) => (
                <ReferenceLine
                  key={`asset-grid-${tick}`}
                  yAxisId="right"
                  y={tick}
                  stroke="rgb(117 160 148 / 20%)"
                  strokeDasharray="1 10"
                  ifOverflow="extendDomain"
                />
              ))}
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
                  ticks={percentGridTicks}
                  tickFormatter={(v) => `${v.toFixed(2)}%`}
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
                  ticks={assetGridTicks}
                  tickFormatter={(v) => v.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                />
              )}
              {!reviewMode && (
                <Tooltip
                  content={
                    <CustomTooltip
                      labels={labels}
                      visible={visible}
                    />
                  }
                />
              )}
              {!reviewMode && visible.accountPerformance && (
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
              {!reviewMode && visible.btcBenchmark && (
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

              {(visible.assetTrend || reviewMode) && (
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
              {reviewMode && ([
                ["buyMarker", "buyTrade", "oklch(68% 0.15 145)"],
                ["sellMarker", "sellTrade", "oklch(62% 0.15 25)"],
              ] as const).map(([dataKey, tradeKey, color]) => (
                <Line
                  key={dataKey}
                  yAxisId="right"
                  type="monotone"
                  dataKey={dataKey}
                  stroke="transparent"
                  strokeWidth={0}
                  dot={(rawProps: unknown) => {
                    const props = rawProps as { cx?: number; cy?: number; payload?: Record<string, unknown> };
                    const marker = props.payload?.[tradeKey] as TradeMarker | undefined;
                    if (!marker || props.cx == null || props.cy == null) return <circle cx={0} cy={0} r={0} />;
                    const isHovered = hoveredTradeId === marker.trade.execId;
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={isHovered ? 7 : 5}
                        fill={color}
                        stroke="var(--background)"
                        strokeWidth={2}
                        style={{
                          cursor: "pointer",
                          filter: isHovered ? `drop-shadow(0 0 5px ${color})` : undefined,
                          transition: "r 120ms ease, filter 120ms ease",
                        }}
                        onMouseEnter={() => setHoveredTradeId(marker.trade.execId)}
                        onMouseLeave={() => setHoveredTradeId(null)}
                        onClick={() => {
                          setSelectedTrade(marker);
                          setShowReviewDetail(false);
                        }}
                      />
                    );
                  }}
                  activeDot={false}
                  connectNulls={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {reviewMode && (
        <div className="flex items-center justify-center gap-5 text-muted-foreground mb-3" style={{ fontSize: "0.7rem" }}>
          <span className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "oklch(68% 0.15 145)" }} />买入</span>
          <span className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "oklch(62% 0.15 25)" }} />卖出</span>
        </div>
      )}

      {selectedTrade && (
        <div className="mt-4 rounded-xl p-4 sm:p-5" style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: selectedTrade.action === "买入" ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }} />
                <span className="text-foreground font-medium">{selectedTrade.action}</span>
                <span className="text-muted-foreground">{selectedTrade.trade.symbol}</span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-muted-foreground" style={{ fontSize: "0.72rem" }}>
                <span>成交价：{Number(selectedTrade.trade.execPrice).toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
                <span>数量：{Number(selectedTrade.trade.execQty).toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
                <span>盈亏：{Number(selectedTrade.trade.execPnl) >= 0 ? "+" : ""}{Number(selectedTrade.trade.execPnl).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                {selectedTrade.childLabel && <span>{selectedTrade.childLabel}</span>}
              </div>
            </div>
            <button onClick={() => setSelectedTrade(null)} className="text-muted-foreground hover:text-foreground p-1" aria-label="关闭交易明细"><X size={15} /></button>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => setShowReviewDetail(true)}
              className="rounded-full px-4 py-1.5 text-xs tracking-widest transition-colors"
              style={{ border: "1px solid rgb(92 211 184 / 44%)", color: "rgb(92 211 184 / 92%)" }}
            >
              查看详情
            </button>
          </div>
        </div>
      )}

      {showReviewDetail && selectedTrade && (
        <div className="mt-4 rounded-xl p-4 sm:p-6" style={{ background: "var(--surface-subtle)", border: "1px solid rgb(92 211 184 / 30%)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-foreground font-medium">{selectedTrade.trade.symbol} · 交易详情 / 复盘</div>
            <button onClick={() => setShowReviewDetail(false)} className="text-muted-foreground hover:text-foreground p-1" aria-label="关闭交易详情"><X size={15} /></button>
          </div>
          <div className="rounded-lg p-3 mb-5" style={{ background: "var(--background)", border: "1px solid var(--panel-border)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-muted-foreground" style={{ fontSize: "0.68rem", letterSpacing: "0.08em" }}>历史成交 K线 · EMA20</div>
              <div className="flex items-center gap-1">
                {(["1h", "4h", "1d", "1w"] as const).map((interval) => (
                  <button
                    key={interval}
                    onClick={() => setCandleInterval(interval)}
                    className="rounded-full px-2.5 py-1 transition-colors"
                    style={{
                      fontSize: "0.64rem",
                      border: `1px solid ${candleInterval === interval ? "rgb(92 211 184 / 52%)" : "var(--panel-border)"}`,
                      color: candleInterval === interval ? "rgb(92 211 184 / 92%)" : "var(--text-soft)",
                      background: candleInterval === interval ? "rgb(92 211 184 / 10%)" : "transparent",
                    }}
                  >
                    {interval}
                  </button>
                ))}
              </div>
            </div>
            <MiniCandleChart candles={(candles ?? []) as Candle[]} trade={selectedTrade.trade} interval={candleInterval} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["买入理由", "entryReason"],
              ["卖出理由", "exitReason"],
              ["复盘总结", "reviewSummary"],
            ] as const).map(([label, key]) => (
              <div key={label} className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                <span>{label}</span>
                <div className="min-h-24 whitespace-pre-wrap rounded-lg px-3 py-2 text-foreground" style={{ border: "1px solid var(--panel-border)", background: "var(--background)" }}>
                  {visibleReview?.[key] || <span className="text-muted-foreground/50">暂无内容</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
