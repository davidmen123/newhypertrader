import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ReferenceArea, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown, Info, RefreshCw, Database, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
// Hyperliquid launched in 2023, so this reaches back past any account's first
// trade. Only the trade query needs a date spelled out: an absent start date means
// "everything" to the PnL query but "the last 30 days" to the trade query.
const FULL_HISTORY_START_DATE = "2023-01-01";
type BenchmarkKey = "btc" | "shanghai" | "sp500" | "nasdaq" | "hangSeng";

// ─── Tooltip ─────────────────────────────────────────────────────────────────
interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number | null; dataKey: string; color?: string; payload?: ChartPoint }>;
  label?: string | number;
  labels: Record<SeriesKey, string>;
  visible: Record<SeriesKey, boolean>;
  benchmarkValueLabel: string;
}

type ChartPoint = {
  date: string;
  timestamp: number;
  equity: number;
  pnl: number;
  accountPerformance: number;
  btcBenchmark: number | null;
  benchmarkPrice: number | null;
  assetTrend: number;
};

type TradeFill = {
  execId: string;
  category?: string;
  symbol: string;
  side: string;
  execPrice: string;
  execQty: string;
  createdTime: string;
  execPnl: string;
  closeMethod?: string;
  triggerPrice?: string;
};

type TradeMarker = ChartPoint & {
  trade: TradeFill;
  trades: TradeFill[];
  dayTrades: TradeFill[];
  dayKey: string;
  action: "买入" | "卖出";
  childLabel?: string;
};

type Candle = { time: number; open: number; high: number; low: number; close: number };
type PnlSnapshot = {
  date: string;
  equity: string;
  totalPnl?: string | null;
  /** Time-weighted return over the visible range; absent on local snapshot rows. */
  returnPct?: number | null;
  btcPrice?: string | number | null;
};
const ENTRY_INTENT_LABELS: Record<string, string> = { continuation: "趋势延续", reversal: "趋势反转", range: "区间交易" };
const ENTRY_TRIGGER_LABELS: Record<string, string> = { pullback: "回踩确认", engulfing: "吞没形态", pin_bar: "Pin Bar形态", ema20: "EMA20突破/站稳", key_level_breakout: "关键位突破", range_boundary: "区间边界反应" };
const ENTRY_TIMEFRAME_LABELS: Record<string, string> = { "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W" };
type CandleInterval = "1h" | "4h" | "1d" | "1w";
const REVIEW_AUTO_READ_FROM = Date.parse("2026-07-25T16:00:00.000Z");

function formatSigned(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatReviewNumber(value: string | number | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";
}

function calculateRiskAmount(entryPrice: string | number | null | undefined, stopLossPrice: string | number | null | undefined, quantity: string | number | null | undefined) {
  const entry = Number(entryPrice);
  const stop = Number(stopLossPrice);
  const qty = Number(quantity);
  if (![entry, stop, qty].every(Number.isFinite) || entry <= 0 || stop <= 0 || qty <= 0) return "";
  return String(Math.abs(entry - stop) * qty);
}

function formatAxisDay(value: string | number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatUtc8Date(new Date(value)).slice(5).replace("-", "/");
  }
  const raw = String(value ?? "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${Number(match[2])}/${Number(match[3])}`;
}

function parseUtc8Timestamp(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
    return Date.parse(`${raw.replace(" ", "T")}+08:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return Date.parse(raw);
  return Date.parse(`${raw.slice(0, 10)}T00:00:00.000+08:00`);
}

function getDateKey(value: string) {
  return String(value ?? "").slice(0, 10);
}

function formatUtc8Date(date: Date) {
  const utc8OffsetMs = 8 * 60 * 60 * 1000;
  return new Date(date.getTime() + utc8OffsetMs).toISOString().slice(0, 10);
}

function getTradeMeta(trade: TradeFill): { action: "买入" | "卖出"; childLabel?: string } {
  const action: "买入" | "卖出" = trade.side === "buy" || trade.side === "B" ? "买入" : "卖出";
  const closeMethod = String(trade.closeMethod ?? "");
  const childLabel = closeMethod.includes("take_profit") ? "止盈"
    : closeMethod.includes("stop_loss") ? "止损"
      : undefined;
  return { action, childLabel };
}

function formatTradeTime(createdTime: string) {
  const timestamp = Number(createdTime);
  if (!Number.isFinite(timestamp)) return "—";
  return new Date(timestamp).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRelatedOpeningTrades(trades: TradeFill[], selectedTrade: TradeFill) {
  const selectedTime = Number(selectedTrade.createdTime);
  const sameSymbol = trades
    .filter((trade) => trade.symbol === selectedTrade.symbol && Number(trade.createdTime) <= selectedTime)
    .slice()
    .sort((a, b) => Number(a.createdTime) - Number(b.createdTime));
  const activeLots: Array<{ trade: TradeFill; remaining: number }> = [];
  const matchedOpeningIds = new Set<string>();

  for (const trade of sameSymbol) {
    const quantity = Math.abs(Number(trade.execQty));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!trade.closeMethod) {
      activeLots.push({ trade, remaining: quantity });
      continue;
    }

    const openingAction = getTradeMeta(trade).action === "买入" ? "卖出" : "买入";
    let remainingClose = quantity;
    for (const lot of activeLots) {
      if (remainingClose <= 0) break;
      if (getTradeMeta(lot.trade).action !== openingAction || lot.remaining <= 0) continue;
      const matched = Math.min(lot.remaining, remainingClose);
      lot.remaining -= matched;
      remainingClose -= matched;
      if (trade.execId === selectedTrade.execId) {
        // Keep each opening action once; its saved risk is the risk unit for
        // the continuous position cycle, even when the close is partial.
        matchedOpeningIds.add(lot.trade.execId);
      }
    }
    if (trade.execId === selectedTrade.execId) {
      return activeLots
        .filter((lot) => matchedOpeningIds.has(lot.trade.execId))
        .map((lot) => lot.trade);
    }
  }
  return selectedTrade.closeMethod ? [] : [selectedTrade];
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

function CustomTooltip({ active, payload, label, labels, visible, benchmarkValueLabel }: TooltipProps) {
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
        {formatAxisDay(label ?? "")}
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
        const benchmarkPrice =
          seriesKey === "btcBenchmark" && p.payload?.benchmarkPrice != null && Number.isFinite(p.payload.benchmarkPrice)
            ? p.payload.benchmarkPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
            {benchmarkPrice && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: "0.72rem" }}>
                <span style={{ color: "rgb(209 231 226 / 46%)" }}>
                  {benchmarkValueLabel}
                </span>
                <span style={{ color: "rgb(209 231 226 / 78%)", fontFamily: "DM Mono, monospace" }}>
                  {benchmarkPrice}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniCandleChart({ candles, trade, interval, emaColor }: { candles: Candle[]; trade: TradeFill; interval: CandleInterval; emaColor: string }) {
  const tradeTime = Number(trade.createdTime);
  const fullSelectedIndex = candles.reduce((best, candle, index) => {
    const distance = Math.abs(candle.time - tradeTime);
    const bestDistance = Math.abs(candles[best].time - tradeTime);
    return distance < bestDistance ? index : best;
  }, 0);
  const maxVisible = 48;
  const lastVisibleStart = Math.max(candles.length - maxVisible, 0);
  const centeredVisibleStart = Math.max(
    0,
    Math.min(fullSelectedIndex - Math.floor(maxVisible / 2), Math.max(candles.length - maxVisible, 0))
  );
  const visibleStart = interval === "1h" || interval === "4h" ? centeredVisibleStart : lastVisibleStart;
  const visible = candles.slice(visibleStart, visibleStart + maxVisible);
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
  const visibleEma = emaValues.slice(visibleStart, visibleStart + visible.length);
  const selectedIndex = visible.reduce((best, candle, index) => {
    const distance = Math.abs(candle.time - tradeTime);
    const bestDistance = Math.abs(visible[best].time - tradeTime);
    return distance < bestDistance ? index : best;
  }, 0);
  const selected = visible[selectedIndex];
  const markerColor = trade.side === "buy" || trade.side === "B" ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)";
  const markerLabel = trade.side === "buy" || trade.side === "B" ? "B" : "S";
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
            {bullish ? (
              <>
                <line x1={x} x2={x} y1={y(candle.high)} y2={y(Math.max(candle.open, candle.close))} stroke={color} strokeWidth="1.2" />
                <line x1={x} x2={x} y1={y(Math.min(candle.open, candle.close))} y2={y(candle.low)} stroke={color} strokeWidth="1.2" />
              </>
            ) : (
              <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.2" />
            )}
            <rect x={x - Math.max(step * 0.28, 2)} y={top} width={Math.max(step * 0.56, 3)} height={Math.max(bottom - top, 2)} fill={bullish ? "transparent" : color} stroke={color} strokeWidth="1.2" />
          </g>
        );
      })}
      {emaPoints && <polyline points={emaPoints} fill="none" stroke={emaColor} strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />}
      <g>
        <circle
          cx={selectedIndex * step + step / 2}
          cy={trade.side === "buy" || trade.side === "B" ? Math.min(y(selected.low) + 14, chartBottom - 2) : Math.max(y(selected.high) - 14, chartTop + 8)}
          r="8"
          fill="none"
          stroke={markerColor}
          strokeWidth="1"
        />
        <text
          x={selectedIndex * step + step / 2}
          y={trade.side === "buy" || trade.side === "B" ? Math.min(y(selected.low) + 14, chartBottom - 2) : Math.max(y(selected.high) - 14, chartTop + 8)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={markerColor}
          fontSize="10"
          fontWeight="700"
          fontFamily="DM Mono, monospace"
        >
          {markerLabel}
        </text>
      </g>
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

function BenchmarkSeriesToggle({
  label,
  color,
  active,
  value,
  options,
  onToggle,
  onValueChange,
}: {
  label: string;
  color: string;
  active: boolean;
  value: BenchmarkKey;
  options: Array<{ key: BenchmarkKey; label: string; menuLabel?: string }>;
  onToggle: () => void;
  onValueChange: (value: BenchmarkKey) => void;
}) {
  return (
    <div
      className="flex items-center rounded-full transition-all"
      style={{
        border: `1px solid ${active ? color : "var(--panel-border)"}`,
        background: active ? `${color}22` : "transparent",
        color: active ? color : "var(--text-soft)",
        boxShadow: active ? `0 0 18px ${color}18` : "none",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 py-1 pl-3 pr-1"
        style={{ fontSize: "0.68rem", letterSpacing: "0.06em" }}
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: active ? color : "oklch(35% 0.02 200 / 60%)" }}
        />
        {label}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="选择对比指数"
            className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-foreground/5"
          >
            <ChevronDown size={11} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuRadioGroup value={value} onValueChange={(next) => onValueChange(next as BenchmarkKey)}>
            {options.map((option) => (
              <DropdownMenuRadioItem key={option.key} value={option.key} className="text-xs">
                {option.menuLabel ?? option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
// accountId selects which configured Hyperliquid account to chart. Left undefined
// (the home page) it charts the default account.
export default function PnlChart({ accountId }: { accountId?: string } = {}) {
  const { lang } = useLang();
  const { theme } = useTheme();
  type TimeRange = "7D" | "30D" | "90D" | "MAX";
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    accountPerformance: true,
    btcBenchmark: true,
    assetTrend: false,
  });
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkKey>("btc");
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<TradeMarker | null>(null);
  const [hoveredTradeId, setHoveredTradeId] = useState<string | null>(null);
  const [showReviewDetail, setShowReviewDetail] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [candleInterval, setCandleInterval] = useState<CandleInterval>("4h");
  const [selectedDayTrades, setSelectedDayTrades] = useState<TradeFill[]>([]);
  const [expandedReviewSummary, setExpandedReviewSummary] = useState(false);
  const [hoveredTradePreview, setHoveredTradePreview] = useState<{ marker: TradeMarker; x: number; y: number } | null>(null);
  const hoverPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute startDate from timeRange
  // 7D  = past 7 calendar days
  // 30D = past 30 calendar days
  // 90D = past 90 calendar days
  // MAX = the account's whole history, requested with no start date at all. The
  //       server returns every sample and trims the stretch before the account was
  //       funded, so the curve begins where the money did and the chart never has
  //       to be told when that was.
  const startDate = useMemo(() => {
    if (timeRange == null || timeRange === "MAX") return undefined;
    const now = new Date();
    const days = timeRange === "7D" ? 7 : timeRange === "30D" ? 30 : 90;
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return formatUtc8Date(d);
  }, [timeRange]);

  // Generous limit — actual filtering is done server-side by startDate
  const queryLimit = 1000;

  // MAX covers the account's whole history, so it keeps Hyperliquid's cumulative
  // PnL rather than zeroing at the first sample — that is what makes the figure in
  // the tooltip agree with the total PnL in the account overview.
  const isFullHistory = timeRange == null || timeRange === "MAX";

  const { data, isLoading, error, refetch, isFetching } = trpc.hyperliquid.pnlHistory.useQuery(
    { startDate, limit: queryLimit, accountId, rebase: !isFullHistory },
    { refetchInterval: 60_000 }
  );
  const externalBenchmark = selectedBenchmark === "btc" ? "sp500" : selectedBenchmark;
  const { data: benchmarkHistory = [], isFetching: isBenchmarkFetching, refetch: refetchBenchmark } = trpc.hyperliquid.benchmarkHistory.useQuery(
    { benchmark: externalBenchmark, startDate },
    { enabled: selectedBenchmark !== "btc", staleTime: 10 * 60_000 }
  );

  useEffect(() => {
    const updateViewport = () => setIsMobileViewport(window.innerWidth < 640);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  const clearHoverPreviewTimer = () => {
    if (hoverPreviewTimer.current) {
      clearTimeout(hoverPreviewTimer.current);
      hoverPreviewTimer.current = null;
    }
  };
  const dismissHoverPreviewSoon = () => {
    clearHoverPreviewTimer();
    hoverPreviewTimer.current = setTimeout(() => setHoveredTradePreview(null), 220);
  };
  const openTradeDetails = (marker: TradeMarker) => {
    clearHoverPreviewTimer();
    setHoveredTradePreview(null);
    setSelectedTrade(marker);
    setSelectedDayTrades(marker.dayTrades);
    setExpandedReviewSummary(false);
    setShowReviewDetail(true);
  };
  const reviewTradeStartDate = reviewMode ? undefined : (startDate ?? FULL_HISTORY_START_DATE);
  const { data: tradeHistory } = trpc.hyperliquid.tradeHistory.useQuery(
    { startDate: reviewTradeStartDate, limit: 10000, allHistory: true, accountId },
    { refetchInterval: 120_000 }
  );
  const { data: reviewPnlHistory } = trpc.hyperliquid.pnlHistory.useQuery(
    { startDate: FULL_HISTORY_START_DATE, limit: 10000, accountId, rebase: false },
    { enabled: reviewMode, refetchInterval: 60_000 }
  );
  // Review nodes currently describe perpetual open/close decisions. Exclude
  // only fills explicitly identified as spot: older API responses may omit
  // category even though the symbol is a perpetual contract.
  const allTrades = ((tradeHistory?.trades ?? []) as TradeFill[])
    .filter((trade) => trade.category !== "SPOT");
  const reviewStartTimestamp = startDate
    ? parseUtc8Timestamp(`${startDate}T00:00:00+08:00`)
    : 0;
  const trades = allTrades.filter((trade) => {
    const timestamp = Number(trade.createdTime);
    return Number.isFinite(timestamp) && timestamp >= reviewStartTimestamp;
  });
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
  const selectedOpeningTrades = useMemo(
    () => selectedTrade ? getRelatedOpeningTrades(allTrades, selectedTrade.trade) : [],
    [selectedTrade, allTrades]
  );
  const selectedOpeningExecIds = selectedOpeningTrades.map((trade) => trade.execId);
  const { data: openingReviews = [] } = trpc.hyperliquid.tradeReviews.useQuery(
    { tradeExecIds: selectedOpeningExecIds.length > 0 ? selectedOpeningExecIds : ["none"] },
    { enabled: selectedTrade != null }
  );
  const { data: accountOverview } = trpc.hyperliquid.accountOverview.useQuery(
    { accountId },
    { enabled: selectedTrade != null && !selectedTrade.trade.closeMethod, refetchInterval: 60_000 }
  );
  const { data: openOrders } = trpc.hyperliquid.openOrders.useQuery(
    { accountId },
    { enabled: selectedTrade != null && !selectedTrade.trade.closeMethod, refetchInterval: 10_000 }
  );
  const visibleReview = review?.status === "published" ? review : null;
  const canAutoReadSelectedTrade = selectedTrade != null && Number(selectedTrade.trade.createdTime) >= REVIEW_AUTO_READ_FROM;
  const selectedStopOrder = selectedTrade && !selectedTrade.trade.closeMethod
    ? openOrders?.find((order) => {
        const orderType = String(order.orderType ?? "").toLowerCase();
        const isStopOrder = orderType.includes("stop") || (
          Boolean(order.isTrigger) && Boolean(order.reduceOnly) && !orderType.includes("take profit")
        );
        return order.symbol === selectedTrade.trade.symbol && isStopOrder && Number(order.triggerPrice) > 0;
      })
    : undefined;
  const selectedStopLossPrice = visibleReview?.stopLossPrice || (canAutoReadSelectedTrade ? selectedStopOrder?.triggerPrice || selectedTrade?.trade.triggerPrice : "") || "";
  const openingRiskAmount = selectedOpeningTrades.reduce((total, trade) => {
    const savedReview = openingReviews.find((item: { tradeExecId: string; status?: string; riskAmount?: string | null; entryPrice?: string | null; stopLossPrice?: string | null }) => item.tradeExecId === trade.execId && item.status === "published");
    const savedRisk = Number(savedReview?.riskAmount);
    if (Number.isFinite(savedRisk) && savedRisk > 0) return total + savedRisk;
    return total + Number(calculateRiskAmount(savedReview?.entryPrice || trade.execPrice, savedReview?.stopLossPrice, trade.execQty) || 0);
  }, 0);
  const selectedActualPnl = selectedTrade?.trade.closeMethod ? Number(selectedTrade.trade.execPnl) : Number.NaN;
  const selectedRValue = Number.isFinite(selectedActualPnl) && openingRiskAmount > 0
    ? selectedActualPnl / openingRiskAmount
    : null;
  const reviewDetailFields = selectedTrade
    ? selectedTrade.trade.closeMethod
      ? [
          {
            label: selectedTrade.action === "买入" ? "买入/做多理由" : "卖出/做空理由",
            value: visibleReview?.[selectedTrade.action === "买入" ? "entryReason" : "exitReason"] ?? "",
          },
          { label: "复盘总结", value: visibleReview?.reviewSummary ?? "" },
          { label: "改进点", value: visibleReview?.improvementPoint ?? "" },
        ]
        : [
          { label: "进场价格", value: formatReviewNumber(visibleReview?.entryPrice || (canAutoReadSelectedTrade ? selectedTrade.trade.execPrice : "")) },
          { label: "止损价格", value: formatReviewNumber(selectedStopLossPrice) },
          { label: "实际成交数量", value: formatReviewNumber(selectedTrade.trade.execQty) },
          {
            label: "单笔风险",
            value: (() => {
              const riskAmount = Number(visibleReview?.riskAmount || calculateRiskAmount(
                visibleReview?.entryPrice || (canAutoReadSelectedTrade ? selectedTrade.trade.execPrice : ""),
                selectedStopLossPrice,
                selectedTrade.trade.execQty,
              ));
              const equity = Number(accountOverview?.totalEquityUsdc);
              const riskPercent = riskAmount > 0 && equity > 0 ? (riskAmount / equity) * 100 : null;
              return riskAmount > 0
                ? `${formatReviewNumber(riskAmount)} USDC（${riskPercent != null ? `${riskPercent.toFixed(2)}%` : "—"}）`
                : "";
            })(),
          },
          { label: "止盈目标", value: formatReviewNumber(visibleReview?.takeProfitTarget) },
          {
            label: selectedTrade.action === "买入" ? "买入/做多理由" : "卖出/做空理由",
            value: visibleReview?.[selectedTrade.action === "买入" ? "entryReason" : "exitReason"] ?? "",
          },
          {
            label: "进场标签",
            value: [
              visibleReview?.entryIntent ? ENTRY_INTENT_LABELS[visibleReview.entryIntent] : "",
              visibleReview?.entryTimeframe ? ENTRY_TIMEFRAME_LABELS[visibleReview.entryTimeframe] : "",
              visibleReview?.entryTrigger ? ENTRY_TRIGGER_LABELS[visibleReview.entryTrigger] : "",
            ].filter(Boolean).join(" · "),
          },
        ]
    : [];

  // Backend already returns data in ascending date order (earliest → latest)
  // Review mode must use the same full-history window as its trade nodes. The
  // regular curve query is intentionally range-scoped for normal analytics,
  // but reusing it here makes older nodes disappear or forces flat synthetic
  // anchors when switching between 7D, 90D and MAX.
  const allSnapshots = (reviewMode ? (reviewPnlHistory ?? data) : data || []) as PnlSnapshot[];
  const snapshots = reviewMode
    ? allSnapshots.filter((snapshot) => {
        if (!reviewStartTimestamp) return true;
        return parseUtc8Timestamp(snapshot.date) >= reviewStartTimestamp;
      })
    : allSnapshots;
  // Labels per language
  const benchmarkOptions: Array<{ key: BenchmarkKey; label: string; menuLabel: string; valueLabel: string }> = lang === "zh"
    ? [
        { key: "btc", label: "BTC 涨跌幅", menuLabel: "BTC", valueLabel: "BTC 价格" },
        { key: "shanghai", label: "上证指数涨跌幅", menuLabel: "上证指数", valueLabel: "上证指数点位" },
        { key: "sp500", label: "标普500指数涨跌幅", menuLabel: "标普500指数", valueLabel: "标普500指数点位" },
        { key: "nasdaq", label: "纳斯达克指数涨跌幅", menuLabel: "纳斯达克指数", valueLabel: "纳斯达克指数点位" },
        { key: "hangSeng", label: "恒生指数涨跌幅", menuLabel: "恒生指数", valueLabel: "恒生指数点位" },
      ]
    : [
        { key: "btc", label: "BTC Change", menuLabel: "BTC", valueLabel: "BTC Price" },
        { key: "shanghai", label: "Shanghai Composite", menuLabel: "Shanghai Composite", valueLabel: "Shanghai Composite Level" },
        { key: "sp500", label: "S&P 500", menuLabel: "S&P 500", valueLabel: "S&P 500 Level" },
        { key: "nasdaq", label: "Nasdaq Composite", menuLabel: "Nasdaq Composite", valueLabel: "Nasdaq Composite Level" },
        { key: "hangSeng", label: "Hang Seng Index", menuLabel: "Hang Seng Index", valueLabel: "Hang Seng Index Level" },
      ];
  const selectedBenchmarkOption = benchmarkOptions.find((option) => option.key === selectedBenchmark) ?? benchmarkOptions[0];
  const labels: Record<SeriesKey, string> = {
    accountPerformance: lang === "zh" ? "账户盈亏" : "Account PnL",
    btcBenchmark: selectedBenchmarkOption.label,
    assetTrend: lang === "zh" ? "账户净值" : "Account Equity",
  };

  // Build chart data: account performance follows PnL, while the selected
  // market benchmark follows its own price change. Both share one percent axis.
  const baseEquity = snapshots.length > 0 ? parseFloat(snapshots[0].equity) : null;
  const benchmarkPrices = snapshots.map((snapshot) => {
    if (selectedBenchmark === "btc") {
      const price = parseFloat(String(snapshot.btcPrice ?? ""));
      return Number.isFinite(price) && price > 0 ? price : null;
    }
    const snapshotDay = getDateKey(snapshot.date);
    let latestPrice: number | null = null;
    for (const point of benchmarkHistory) {
      const pointDay = new Date(point.timestamp).toISOString().slice(0, 10);
      if (pointDay > snapshotDay) break;
      if (Number.isFinite(point.close) && point.close > 0) latestPrice = point.close;
    }
    return latestPrice;
  });
  const baseBenchmarkPrice = benchmarkPrices.find((price): price is number => price != null && Number.isFinite(price) && price > 0) ?? null;
  const baseChartData = snapshots.map((s, index) => {
    const eq = parseFloat(s.equity);
    const benchmarkPrice = benchmarkPrices[index];
    const btcBenchmark = baseBenchmarkPrice && baseBenchmarkPrice !== 0 && benchmarkPrice != null
      ? ((benchmarkPrice - baseBenchmarkPrice) / baseBenchmarkPrice) * 100
      : null;
    const pnl = s.totalPnl ? parseFloat(s.totalPnl) : 0;
    // The server sends a time-weighted return per point, which is what makes the
    // last point agree with the account overview. Dividing PnL by the first
    // sample's equity is the fallback for snapshot rows that carry no such field.
    const accountPerformance = Number.isFinite(Number(s.returnPct))
      ? Number(s.returnPct)
      : baseEquity && baseEquity !== 0 && isFinite(pnl)
      ? (pnl / baseEquity) * 100
      : 0;
    return {
      date: s.date,
      timestamp: parseUtc8Timestamp(s.date),
      equity: eq,
      pnl,
      accountPerformance,
      btcBenchmark,
      benchmarkPrice,
      assetTrend: eq,
    };
  });
  const chartData = useMemo(() => {
    if (!reviewMode || baseChartData.length === 0) return baseChartData;
    const snapshotDays = new Set(baseChartData.map((point) => getDateKey(point.date)));
    const missingTradeDays = Array.from(new Set(
      trades
        .map((trade) => Number(trade.createdTime))
        .filter((timestamp) => Number.isFinite(timestamp))
        .map((timestamp) => formatUtc8Date(new Date(timestamp)))
        .filter((day) => !snapshotDays.has(day))
    )).sort();
    if (missingTradeDays.length === 0) return baseChartData;

    // Portfolio history may not contain a point on every trade day. Add an
    // explicit anchor for each missing day so the node is part of the x-axis
    // even when the exchange returns sparse equity snapshots.
    const firstPoint = baseChartData[0];
    const anchorPoints = missingTradeDays.map((day) => ({
      ...firstPoint,
      date: `${day}T00:00:00+08:00`,
      timestamp: parseUtc8Timestamp(`${day}T00:00:00+08:00`),
    }));
    return [...anchorPoints, ...baseChartData].sort((a, b) => a.timestamp - b.timestamp);
  }, [baseChartData, reviewMode, trades]);
  const tradeMarkers = useMemo<TradeMarker[]>(() => {
    if (chartData.length === 0) return [];
    const tradesByDay = new Map<string, TradeFill[]>();
    trades.forEach((trade) => {
      const timestamp = Number(trade.createdTime);
      if (!Number.isFinite(timestamp)) return;
      const dayKey = formatUtc8Date(new Date(timestamp));
      const dayTrades = tradesByDay.get(dayKey) ?? [];
      dayTrades.push(trade);
      tradesByDay.set(dayKey, dayTrades);
    });
    const grouped = new Map<string, TradeMarker>();
    trades.forEach((trade) => {
      const timestamp = Number(trade.createdTime);
      if (!Number.isFinite(timestamp)) return;
      const dayKey = formatUtc8Date(new Date(timestamp));
      const { action, childLabel } = getTradeMeta(trade);
      const dayPoints = chartData.filter((candidate) => getDateKey(candidate.date) === dayKey);
      const point = (dayPoints.length > 0 ? dayPoints : chartData).reduce((nearest, candidate) => {
        const distance = Math.abs(new Date(candidate.date).getTime() - timestamp);
        const nearestDistance = Math.abs(new Date(nearest.date).getTime() - timestamp);
        return distance < nearestDistance ? candidate : nearest;
      }, (dayPoints.length > 0 ? dayPoints : chartData)[0]);
      const groupKey = `${dayKey}:${action}`;
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.trades.push(trade);
        return;
      }
      const marker = {
        ...point,
        trade,
        trades: [trade],
        dayTrades: tradesByDay.get(dayKey) ?? [trade],
        dayKey,
        action,
      };
      grouped.set(groupKey, childLabel ? { ...marker, childLabel } : marker);
    });
    return Array.from(grouped.values());
  }, [chartData, trades]);
  const markerOffset = (() => {
    const values = chartData.map((point) => point.assetTrend).filter(Number.isFinite);
    if (values.length < 2) return 1;
    return Math.max((Math.max(...values) - Math.min(...values)) * 0.018, 1);
  })();
  const reviewChartData = useMemo(() => {
    return chartData.map((point) => {
      const dayMarkers = tradeMarkers.filter((candidate) => candidate.dayKey === getDateKey(point.date));
      const buy = dayMarkers.find((candidate) => candidate.action === "买入");
      const sell = dayMarkers.find((candidate) => candidate.action === "卖出");
      return {
        ...point,
        buyMarkerY: buy?.date === point.date ? point.assetTrend - markerOffset : null,
        sellMarkerY: sell?.date === point.date ? point.assetTrend + markerOffset : null,
        buyTrade: buy?.date === point.date ? buy : undefined,
        sellTrade: sell?.date === point.date ? sell : undefined,
      };
    });
  }, [chartData, markerOffset, tradeMarkers]);
  let lastAxisDay = "";
  const axisTicks = chartData.reduce<number[]>((ticks, point) => {
    const day = getDateKey(point.date);
    if (day !== lastAxisDay) {
      ticks.push(point.timestamp);
      lastAxisDay = day;
    }
    return ticks;
  }, [] as number[]);
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
    <div className="glass-card w-full min-w-0 px-4 sm:px-8 py-5 sm:py-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {lang === "zh" ? "损益历史" : "PnL History"}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { refetch(); if (selectedBenchmark !== "btc") refetchBenchmark(); }} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <RefreshCw size={13} className={isFetching || isBenchmarkFetching ? "animate-spin" : ""} />
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
        {reviewMode && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
              {lang === "zh" ? "交易范围" : "Trade scope"}
            </span>
            <span className="text-foreground/80" style={{ fontSize: "0.68rem" }}>
              {lang === "zh" ? "最近 100 条" : "Latest 100"}
            </span>
          </div>
        )}
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
          <div className="flex flex-wrap gap-2">
            {SERIES.map((s) => s.key === "btcBenchmark" ? (
              <BenchmarkSeriesToggle
                key={s.key}
                label={labels[s.key]}
                color={s.color}
                active={visible[s.key]}
                value={selectedBenchmark}
                options={benchmarkOptions}
                onToggle={() => toggleSeries(s.key)}
                onValueChange={(value) => {
                  setSelectedBenchmark(value);
                  setVisible((current) => ({ ...current, btcBenchmark: true }));
                }}
              />
            ) : (
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
            clearHoverPreviewTimer();
            setHoveredTradePreview(null);
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

      {reviewMode && (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1 mb-5 rounded-lg px-3 py-2.5 text-muted-foreground" style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)", fontSize: "0.68rem" }}>
          <span className="shrink-0 text-foreground/80 tracking-widest">{lang === "zh" ? "说明" : "Guide"}</span>
          <span>
            {lang === "zh" ? (
              <>
                点击净值曲线上的交易节点（
                <i className="inline-block mx-0.5 h-2 w-2 rounded-full align-middle" style={{ background: "oklch(68% 0.15 145)" }} />
                <i className="inline-block mx-0.5 h-2 w-2 rounded-full align-middle" style={{ background: "oklch(62% 0.15 25)" }} />
                ）悬停查看摘要，点击“查看详情”展开复盘；同日有多笔交易时，可在详情区切换；K 线支持 1h、4h、1d、1w，EMA20 仅作辅助参考。
              </>
            ) : (
              <>
                Click a trade node on the equity curve (
                <i className="inline-block mx-0.5 h-2 w-2 rounded-full align-middle" style={{ background: "oklch(68% 0.15 145)" }} />
                <i className="inline-block mx-0.5 h-2 w-2 rounded-full align-middle" style={{ background: "oklch(62% 0.15 25)" }} />
                ) to preview a summary on hover; click “View Details” to expand the review. Switch between same-day trades in the detail panel. Candles support 1h, 4h, 1d and 1w, with EMA20 as a reference.
              </>
            )}
          </span>
        </div>
      )}

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

      <div className="w-full">
        <div className="w-full min-w-0 flex-1">
          {snapshots.length > 0 && (
            <div
              className={`relative min-w-0 h-[360px] sm:h-[430px] ${
                reviewMode ? "w-[calc(100%+2rem)] -mx-4 sm:w-full sm:mx-0" : "w-full -mx-1 sm:-mx-2"
              }`}
              style={{
                filter: "drop-shadow(0 18px 30px rgb(0 0 0 / 22%))",
              }}
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <ComposedChart data={reviewMode ? reviewChartData : chartData} margin={{ top: 14, right: isMobileViewport ? 8 : 14, left: isMobileViewport ? 2 : 8, bottom: 10 }}>
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
                dataKey="timestamp"
                type="number"
                domain={["dataMin", "dataMax"]}
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
                <ChartTooltip
                  content={
                    <CustomTooltip
                      labels={labels}
                      visible={visible}
                      benchmarkValueLabel={selectedBenchmarkOption.valueLabel}
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
                ["buyMarkerY", "buyTrade", "oklch(68% 0.15 145)"],
                ["sellMarkerY", "sellTrade", "oklch(62% 0.15 25)"],
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
                      <g
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => {
                          clearHoverPreviewTimer();
                          setHoveredTradeId(marker.trade.execId);
                          if (!isMobileViewport) {
                            setHoveredTradePreview({ marker, x: props.cx ?? 0, y: props.cy ?? 0 });
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredTradeId(null);
                          dismissHoverPreviewSoon();
                        }}
                        onClick={() => {
                          openTradeDetails(marker);
                        }}
                      >
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={12}
                          fill="transparent"
                          stroke="transparent"
                          pointerEvents="all"
                        />
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={isHovered ? 7 : 5}
                          fill={color}
                          stroke="var(--background)"
                          strokeWidth={2}
                          style={{
                            filter: isHovered ? `drop-shadow(0 0 5px ${color})` : undefined,
                            transition: "r 120ms ease, filter 120ms ease",
                          }}
                        />
                        {marker.trades.length > 1 && (
                          <text x={(props.cx ?? 0) + 8} y={(props.cy ?? 0) - 8} fill="var(--foreground)" fontSize="10" fontFamily="DM Mono, monospace">
                            {marker.trades.length}
                          </text>
                        )}
                      </g>
                    );
                  }}
                  activeDot={false}
                  connectNulls={false}
                />
              ))}
            </ComposedChart>
              </ResponsiveContainer>
              {hoveredTradePreview && (
                <div
                  className="absolute rounded-lg p-3"
                  onMouseEnter={clearHoverPreviewTimer}
                  onMouseLeave={dismissHoverPreviewSoon}
                  style={{
                    zIndex: 20,
                    width: 190,
                    left: `clamp(8px, ${hoveredTradePreview.x + 12}px, calc(100% - 198px))`,
                    top: `clamp(8px, ${hoveredTradePreview.y + 12}px, calc(100% - 150px))`,
                    background: "var(--surface-subtle)",
                    border: "1px solid rgb(92 211 184 / 42%)",
                    boxShadow: "0 12px 28px rgb(0 0 0 / 22%)",
                  }}
                >
                  <div className="grid gap-1.5">
                    <span className="truncate text-foreground font-medium" style={{ fontSize: "0.78rem" }}>{hoveredTradePreview.marker.trade.symbol}</span>
                    <span className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>
                      <i className="inline-block mr-1.5 h-2 w-2 rounded-full align-middle" style={{ background: hoveredTradePreview.marker.action === "买入" ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }} />
                      {hoveredTradePreview.marker.action}
                    </span>
                      <span className="text-foreground" style={{ fontSize: "0.78rem" }}>成交价：{Number(hoveredTradePreview.marker.trade.execPrice).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                    <span className="whitespace-nowrap text-muted-foreground" style={{ fontSize: "0.68rem" }}>成交时间：{formatTradeTime(hoveredTradePreview.marker.trade.createdTime)}</span>
                  </div>
                  <button
                    onClick={() => openTradeDetails(hoveredTradePreview.marker)}
                    className="mt-3 w-full rounded-full px-3 py-1 text-xs tracking-widest transition-colors"
                    style={{ border: "1px solid rgb(92 211 184 / 44%)", color: "rgb(92 211 184 / 92%)" }}
                  >
                    查看详情
                  </button>
                </div>
              )}
            </div>
          )}

          {reviewMode && (
            <div className="flex items-center justify-center gap-5 text-muted-foreground mb-3" style={{ fontSize: "0.7rem" }}>
              <span className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "oklch(68% 0.15 145)" }} />买入</span>
              <span className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "oklch(62% 0.15 25)" }} />卖出</span>
            </div>
          )}
        </div>

      {selectedTrade && showReviewDetail && (
        <div className="mt-4 w-full rounded-xl p-4 sm:p-5" style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}>
          <div className="pt-1" style={{ borderTop: "1px solid rgb(92 211 184 / 22%)" }}>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setShowReviewDetail(false)}
              className="rounded-full px-3 py-1 text-xs tracking-widest transition-colors"
              style={{ border: "1px solid var(--panel-border)", color: "var(--text-soft)" }}
            >
              收起详情
            </button>
          </div>
          {selectedDayTrades.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedDayTrades.map((trade) => {
                const meta = getTradeMeta(trade);
                const isActive = trade.execId === selectedTrade.trade.execId;
                return (
                  <button
                    key={trade.execId}
                    onClick={() => {
                      setSelectedTrade({ ...selectedTrade, trade, action: meta.action, childLabel: meta.childLabel });
                      setExpandedReviewSummary(false);
                    }}
                    className="rounded-lg px-3 py-2 text-left transition-colors"
                    style={{
                      border: `1px solid ${isActive ? "rgb(92 211 184 / 52%)" : "var(--panel-border)"}`,
                      background: isActive ? "rgb(92 211 184 / 10%)" : "transparent",
                    }}
                  >
                    <div className="flex items-center gap-2 text-foreground" style={{ fontSize: "0.7rem" }}>
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: meta.action === "买入" ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }} />
                      {meta.action} · {trade.symbol}
                    </div>
                    <div className="text-muted-foreground/60 mt-1" style={{ fontSize: "0.62rem" }}>
                      {new Date(Number(trade.createdTime)).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · 盈亏 {Number(trade.execPnl) >= 0 ? "+" : ""}{Number(trade.execPnl).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="rounded-lg p-3 mb-5" style={{ background: "var(--background)", border: "1px solid var(--panel-border)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="grid gap-1 text-muted-foreground" style={{ fontSize: "0.68rem", letterSpacing: "0.08em" }}>
                <span>历史成交 K线</span>
                <span className="flex items-center gap-1.5" style={{ fontSize: "0.62rem", letterSpacing: "0.04em" }}>
                  <i className="inline-block" style={{ width: 14, height: 1, background: "#111" }} />
                  EMA20
                </span>
              </div>
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
            <MiniCandleChart
              candles={(candles ?? []) as Candle[]}
              trade={selectedTrade.trade}
              interval={candleInterval}
              emaColor={theme === "dark" ? "#fff" : "#111"}
            />
          </div>
          {selectedTrade.trade.closeMethod ? (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="grid min-w-0 gap-1 text-muted-foreground" style={{ fontSize: "0.68rem" }}>
                  <span>实际盈亏</span>
                  <div className="truncate rounded-lg px-2.5 py-1.5 text-foreground" style={{ border: "1px solid var(--panel-border)", background: "var(--background)" }}>
                    {formatSigned(selectedActualPnl)} USDC
                  </div>
                </div>
                <div className="grid min-w-0 gap-1 text-muted-foreground" style={{ fontSize: "0.68rem" }}>
                  <span className="flex items-center gap-1">
                    本次平仓 R
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="cursor-help text-muted-foreground/60" style={{ width: "12px", height: "12px" }} />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] text-xs" style={{ fontSize: "0.7rem" }}>
                        R 代表一份计划承担的风险金额。本次平仓 R = 本次平仓实际盈亏 ÷ 关联开仓的计划风险；例如 +2R 表示赚取了 2 倍计划风险，-1R 表示亏损 1 倍计划风险。R 用于统一比较不同仓位的交易、判断实际亏损是否超出计划风险，并评估每笔交易的风险回报质量。
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <div className="truncate rounded-lg px-2.5 py-1.5 text-foreground" style={{ border: "1px solid var(--panel-border)", background: "var(--background)" }}>
                    {selectedRValue != null ? `${formatSigned(selectedRValue)}R` : "—"}
                  </div>
                </div>
                <div className="grid min-w-0 gap-1 text-muted-foreground" style={{ fontSize: "0.68rem" }}>
                  <span className="flex items-center gap-1">
                    关联开仓
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="cursor-help text-muted-foreground/60" style={{ width: "12px", height: "12px" }} />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] text-xs" style={{ fontSize: "0.7rem" }}>
                        显示用于计算本次平仓 R 和计划风险的相关开仓成交。若分批开仓，会合并列出相关开仓。
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <div className="truncate rounded-lg px-2.5 py-1.5 text-foreground" style={{ border: "1px solid var(--panel-border)", background: "var(--background)" }}>
                    {selectedOpeningTrades.length > 0
                      ? selectedOpeningTrades.map((trade) => `${formatTradeTime(trade.createdTime)} · ${Number(trade.execPrice).toLocaleString("en-US", { maximumFractionDigits: 2 })}`).join("；")
                      : "—"}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {reviewDetailFields.map(({ label, value }) => {
                  const isReviewSummary = label === "复盘总结";
                  const hasMore = isReviewSummary && value.length > 20;
                  const shownValue = hasMore && !expandedReviewSummary ? `${value.slice(0, 20)}…` : value;
                  return (
                    <div key={label} className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                      <span>{label}</span>
                      <div
                        className={`${expandedReviewSummary && isReviewSummary ? "whitespace-pre-wrap" : "flex min-w-0 items-center"} rounded-lg px-3 py-1.5 text-foreground`}
                        style={{ border: "1px solid var(--panel-border)", background: "var(--background)" }}
                      >
                        <span className={!expandedReviewSummary && isReviewSummary ? "truncate" : undefined}>
                          {shownValue || <span className="text-muted-foreground/50">暂无内容</span>}
                        </span>
                        {hasMore && (
                          <button
                            type="button"
                            onClick={() => setExpandedReviewSummary((expanded) => !expanded)}
                            className="ml-2 shrink-0 text-xs text-accent hover:underline"
                          >
                            {expandedReviewSummary ? "收起" : "更多"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {reviewDetailFields.slice(0, 4).map(({ label, value }) => (
                  <div key={label} className="grid gap-1 text-muted-foreground" style={{ fontSize: "0.66rem" }}>
                    <span>{label}</span>
                    <div className="whitespace-pre-wrap rounded-lg px-2 py-1.5 text-foreground" style={{ border: "1px solid var(--panel-border)", background: "var(--background)" }}>
                      {value || <span className="text-muted-foreground/50">暂无</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 mt-3 sm:grid-cols-2">
                {reviewDetailFields.slice(4).map(({ label, value }) => (
                  <div key={label} className="grid gap-1 text-muted-foreground" style={{ fontSize: "0.66rem" }}>
                    <span>{label}</span>
                    <div className="min-h-8 rounded-lg px-2 py-1.5 text-foreground" style={{ border: "1px solid var(--panel-border)", background: "var(--background)" }}>
                      {label === "进场标签" && value ? (
                        <div className="flex flex-wrap gap-1.5">
                          {value.split(" · ").map((tag: string) => (
                            <span key={tag} className="rounded-full px-2 py-0.5 text-[0.62rem]" style={{ color: "var(--accent)", border: "1px solid color-mix(in oklab, var(--accent) 38%, transparent)", background: "color-mix(in oklab, var(--accent) 8%, transparent)" }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : value || <span className="text-muted-foreground/50">暂无内容</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
