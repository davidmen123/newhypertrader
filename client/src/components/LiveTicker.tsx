/*
 * LiveTicker
 * BTC · ETH · VIX · DXY · GOLD · NAS100 · SSE · HSI · N225 · KOSPI
 */
import { useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { trpc } from "@/lib/trpc";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function ChangeTag({ pct }: { pct: number | null }) {
  if (pct == null || isNaN(pct))
    return (
      <span style={{ color: "var(--text-faint)", fontFamily: "DM Mono, monospace", fontSize: "0.72rem" }}>—</span>
    );
  const up = pct >= 0;
  return (
    <span
      style={{
        fontFamily: "DM Mono, monospace",
        fontSize: "0.72rem",
        color: up ? "oklch(68% 0.14 145)" : "oklch(62% 0.18 25)",
        letterSpacing: "0.04em",
      }}
    >
      {up ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

// ─── Indicator types ──────────────────────────────────────────────────────────
type TimeframeIndicator = { emaAbove: boolean; rsi: number } | null;
type TickerIndicator = { d1: TimeframeIndicator; h4: TimeframeIndicator } | undefined;

const PROFIT = "oklch(68% 0.14 145)";
const LOSS = "oklch(62% 0.18 25)";

function rsiColor(rsi: number) {
  if (rsi >= 70) return LOSS;
  if (rsi <= 30) return PROFIT;
  return "var(--text-soft)";
}

// Compact EMA20-position + RSI14 row shown at the bottom of each card. Falls
// back to the 1D reading (with a tag) when 4H isn't available for that market.
function IndicatorRow({ indicator, timeframe }: { indicator: TickerIndicator; timeframe: "4H" | "1D" }) {
  if (!indicator) return null;
  const use4h = timeframe === "4H" && indicator.h4 != null;
  const data = use4h ? indicator.h4 : indicator.d1;
  const tag = use4h ? "4H" : "1D";
  if (!data) return null;

  return (
    <div
      className="mt-1.5 pt-1.5 flex items-center gap-x-2"
      style={{
        borderTop: "1px solid var(--panel-border)",
        fontFamily: "DM Mono, monospace",
        fontSize: "0.6rem",
        letterSpacing: "0.02em",
      }}
    >
      <span style={{ color: "var(--text-faint)" }}>{tag}</span>
      <span style={{ color: data.emaAbove ? PROFIT : LOSS }}>
        EMA20 {data.emaAbove ? "▲" : "▼"}
      </span>
      <span style={{ color: "var(--text-faint)" }}>
        RSI <span style={{ color: rsiColor(data.rsi) }}>{data.rsi.toFixed(0)}</span>
      </span>
    </div>
  );
}

// ─── Volatility card (Row 2) ──────────────────────────────────────────────────
interface VolCardProps {
  label: string;
  sublabel?: string;
  current: number | null;
  prevDay: number | null;
  prevLabel?: string;
  decimals?: number;
  lang: string;
  compact?: boolean;
  indicator?: TickerIndicator;
  timeframe?: "4H" | "1D";
}

function VolCard({ label, sublabel, current, prevDay, prevLabel, decimals = 2, lang, compact = false, indicator, timeframe = "4H" }: VolCardProps) {
  const change =
    current != null && prevDay != null && prevDay !== 0
      ? ((current - prevDay) / prevDay) * 100
      : null;

  return (
    <div className="glass-card fade-in" style={{ padding: compact ? "0.5rem 0.6rem" : "1rem 1.25rem" }}>
      {/* Header */}
      <div className="mb-1.5">
        <span
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: compact ? "0.56rem" : "0.62rem",
            letterSpacing: "0.12em",
            color: "var(--text-soft)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {sublabel && (
          <span
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: "0.54rem",
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
              marginLeft: "0.4rem",
            }}
          >
            {sublabel}
          </span>
        )}
      </div>

      {/* Current value (large) */}
      <div
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: compact ? "clamp(0.85rem, 1.4vw, 1.15rem)" : "clamp(1.4rem, 2.4vw, 2.1rem)",
          fontWeight: 300,
          letterSpacing: "-0.02em",
          color: "var(--metric-neutral)",
          lineHeight: 1.05,
        }}
      >
        {current != null ? fmt(current, decimals) : <span style={{ color: "var(--text-faint)" }}>—</span>}
      </div>

      {/* Previous day (small, below) */}
      <div className="mt-1.5 flex items-center gap-2">
        <span
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "0.68rem",
            color: "var(--text-faint)",
            letterSpacing: "0.04em",
          }}
        >
          {prevLabel ?? (lang === "zh" ? "昨收" : "Prev")}
          {" "}
          {prevDay != null ? fmt(prevDay, decimals) : "—"}
        </span>
        <ChangeTag pct={change} />
      </div>

      <IndicatorRow indicator={indicator} timeframe={timeframe} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LiveTicker() {
  const { lang } = useLang();
  const [timeframe, setTimeframe] = useState<"4H" | "1D">("4H");

  // Hyperliquid market indices + VIX (poll every 30s)
  const { data: volData } = trpc.hyperliquid.marketTicker.useQuery(undefined, {
    refetchInterval: 30 * 1000,
  });

  // EMA20 position + RSI14 per timeframe; changes slowly, so poll every 10 min.
  const { data: indicators } = trpc.hyperliquid.marketIndicators.useQuery(undefined, {
    refetchInterval: 10 * 60 * 1000,
  });

  const ind = (indicators ?? {}) as Record<string, TickerIndicator>;

  const cards = [
    { label: "BTC", key: "btc", sub: lang === "zh" ? "永续" : "Perp", cur: volData?.btc ?? null, prev: volData?.btcPrevClose ?? null },
    { label: "ETH", key: "eth", sub: lang === "zh" ? "永续" : "Perp", cur: volData?.eth ?? null, prev: volData?.ethPrevClose ?? null },
    { label: "VIX", key: "vix", sub: lang === "zh" ? "恐慌指数" : "Fear Index", cur: volData?.vix ?? null, prev: volData?.vixPrevClose ?? null },
    { label: "DXY", key: "dxy", sub: lang === "zh" ? "美元指数" : "Dollar Index", cur: volData?.dxy ?? null, prev: volData?.dxyPrevClose ?? null },
    { label: "GOLD", key: "gold", sub: lang === "zh" ? "黄金" : "Gold", cur: volData?.gold ?? null, prev: volData?.goldPrevClose ?? null },
    { label: "NAS100", key: "nas100", sub: lang === "zh" ? "纳斯达克100指数" : "Nasdaq 100", cur: volData?.nas100 ?? null, prev: volData?.nas100PrevClose ?? null, prevLabel: lang === "zh" ? "24h前" : "24h Ago" },
    { label: "SSE", key: "shanghai", sub: lang === "zh" ? "上证指数" : "Shanghai Composite", cur: volData?.shanghai ?? null, prev: volData?.shanghaiPrevClose ?? null },
    { label: "HSI", key: "hangSeng", sub: lang === "zh" ? "恒生指数" : "Hang Seng Index", cur: volData?.hangSeng ?? null, prev: volData?.hangSengPrevClose ?? null },
    { label: "N225", key: "nikkei", sub: lang === "zh" ? "日经225指数" : "Nikkei 225", cur: volData?.nikkei ?? null, prev: volData?.nikkeiPrevClose ?? null },
    { label: "KOSPI", key: "kospi", sub: lang === "zh" ? "韩国综合指数" : "KOSPI", cur: volData?.kospi ?? null, prev: volData?.kospiPrevClose ?? null },
  ];

  return (
    <div>
      {/* Timeframe toggle for the EMA/RSI readings */}
      <div className="flex items-center justify-end gap-1 mb-2">
        {(["4H", "1D"] as const).map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`pill-tab ${timeframe === tf ? "active" : ""}`}
            style={{ fontSize: "0.6rem", padding: "0.15rem 0.7rem" }}
          >
            {tf}
          </button>
        ))}
      </div>

      <p
        role="note"
        className="mb-2"
        style={{
          color: "var(--text-faint)",
          fontFamily: "DM Mono, monospace",
          fontSize: "0.58rem",
          lineHeight: 1.55,
          letterSpacing: "0.02em",
        }}
      >
        {lang === "zh"
          ? `说明（当前选择 ${timeframe}）：▲ 现价高于 EMA20，▼ 现价低于 EMA20；RSI 为 14 周期，≥70 偏热，≤30 偏弱。卡片左侧周期标签为实际数据周期；若 4H 数据不可用，会自动显示 1D。`
          : `Note (selected ${timeframe}): ▲ price is above EMA20; ▼ price is below EMA20. RSI uses 14 periods: ≥70 is overbought and ≤30 is oversold. The timeframe tag on each card shows the actual data used; 4H falls back to 1D when unavailable.`}
      </p>

      {/* BTC · ETH · VIX · DXY · GOLD · NAS100 · SSE · HSI · N225 · KOSPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {cards.map((v) => (
          <VolCard
            key={v.label}
            label={v.label}
            sublabel={v.sub}
            current={v.cur}
            prevDay={v.prev}
            prevLabel={v.prevLabel}
            decimals={2}
            lang={lang}
            compact
            indicator={ind[v.key]}
            timeframe={timeframe}
          />
        ))}
      </div>
    </div>
  );
}
