/*
 * LiveTicker
 * Row 1 (Prices): BTC
 * Row 2 (Indices): VIX · GOLD · NAS100 · SSE
 */
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
}

function VolCard({ label, sublabel, current, prevDay, prevLabel, decimals = 2, lang, compact = false }: VolCardProps) {
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
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LiveTicker() {
  const { lang } = useLang();

  // Hyperliquid market indices + VIX (poll every 30s)
  const { data: volData } = trpc.hyperliquid.marketTicker.useQuery(undefined, {
    refetchInterval: 30 * 1000,
  });

  return (
    <div>
      {/* BTC · VIX · GOLD · NAS100 · SSE · Nikkei · KOSPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: "BTC", sub: lang === "zh" ? "永续" : "Perp", cur: volData?.btc ?? null, prev: volData?.btcPrevClose ?? null },
          { label: "VIX", sub: lang === "zh" ? "恐慌指数" : "Fear Index", cur: volData?.vix ?? null, prev: volData?.vixPrevClose ?? null },
          { label: "GOLD", sub: lang === "zh" ? "黄金" : "Gold", cur: volData?.gold ?? null, prev: volData?.goldPrevClose ?? null },
          { label: "NAS100", sub: lang === "zh" ? "纳斯达克100指数" : "Nasdaq 100", cur: volData?.nas100 ?? null, prev: volData?.nas100PrevClose ?? null, prevLabel: lang === "zh" ? "24h前" : "24h Ago" },
          { label: "SSE", sub: lang === "zh" ? "上证指数" : "Shanghai Composite", cur: volData?.shanghai ?? null, prev: volData?.shanghaiPrevClose ?? null },
          { label: "N225", sub: lang === "zh" ? "日经225指数" : "Nikkei 225", cur: volData?.nikkei ?? null, prev: volData?.nikkeiPrevClose ?? null },
          { label: "KOSPI", sub: lang === "zh" ? "韩国综合指数" : "KOSPI", cur: volData?.kospi ?? null, prev: volData?.kospiPrevClose ?? null },
        ].map((v) => (
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
          />
        ))}
      </div>
    </div>
  );
}
