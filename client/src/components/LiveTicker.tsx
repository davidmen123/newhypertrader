/*
 * LiveTicker
 * Row 1 (Prices): BTC
 * Row 2 (Indices): VIX · GOLD · QQQ
 */
import { useEffect, useRef, useState } from "react";
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
      <span style={{ color: "rgb(180 180 176 / 68%)", fontFamily: "DM Mono, monospace", fontSize: "0.72rem" }}>—</span>
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

// ─── Price card (Row 1) ───────────────────────────────────────────────────────
interface PriceCardProps {
  label: string;
  sublabel?: string;
  price: number | null | undefined;
  change: number | null;
  isLive?: boolean;
  flash?: "up" | "down" | null;
  priceDecimals?: number;
  lang: string;
  compact?: boolean;
}

function PriceCard({
  label,
  sublabel,
  price,
  change,
  isLive,
  flash,
  priceDecimals = 2,
  lang,
  compact = false,
}: PriceCardProps) {
  const flashBg =
    flash === "up"
      ? "oklch(68% 0.14 145 / 12%)"
      : flash === "down"
        ? "oklch(62% 0.18 25 / 12%)"
        : "transparent";

  const priceColor =
    flash === "up"
      ? "oklch(72% 0.14 145)"
      : flash === "down"
        ? "oklch(68% 0.18 25)"
        : "oklch(92% 0.01 200)";

  return (
    <div
      className="glass-card fade-in"
      style={{ background: flashBg, transition: "background 0.5s ease", padding: compact ? "0.5rem 0.6rem" : "1rem" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-baseline gap-1">
          <span
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: compact ? "0.56rem" : "0.62rem",
              letterSpacing: "0.12em",
              color: "rgb(190 190 186 / 78%)",
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
                color: "rgb(170 170 166 / 64%)",
              }}
            >
              {sublabel}
            </span>
          )}
        </div>
        {isLive && (
          <div className="flex items-center gap-1">
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "oklch(68% 0.14 145)",
                display: "inline-block",
                boxShadow: "0 0 5px oklch(68% 0.14 145 / 60%)",
              }}
            />
            <span
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: "0.52rem",
                color: "rgb(190 190 186 / 78%)",
                letterSpacing: "0.08em",
              }}
            >
              {lang === "zh" ? "实时" : "LIVE"}
            </span>
          </div>
        )}
      </div>

      {/* Price */}
      <div
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: compact ? "clamp(0.85rem, 1.4vw, 1.15rem)" : "clamp(1.4rem, 2.4vw, 2.1rem)",
          fontWeight: 300,
          letterSpacing: "-0.02em",
          color: priceColor,
          transition: "color 0.5s ease",
          lineHeight: 1.05,
        }}
      >
        {price != null ? (
          fmt(price, priceDecimals)
        ) : (
          <span style={{ color: "rgb(190 190 186 / 62%)", animation: "pulse 2s infinite" }}>—</span>
        )}
      </div>

      {/* 24h change */}
      <div className="mt-1.5">
        <ChangeTag pct={change} />
      </div>
    </div>
  );
}

// ─── Volatility card (Row 2) ──────────────────────────────────────────────────
interface VolCardProps {
  label: string;
  sublabel?: string;
  current: number | null;
  prevDay: number | null;
  decimals?: number;
  lang: string;
  compact?: boolean;
}

function VolCard({ label, sublabel, current, prevDay, decimals = 2, lang, compact = false }: VolCardProps) {
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
            color: "rgb(190 190 186 / 78%)",
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
              color: "rgb(170 170 166 / 64%)",
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
          color: "oklch(92% 0.01 200)",
          lineHeight: 1.05,
        }}
      >
        {current != null ? fmt(current, decimals) : <span style={{ color: "rgb(190 190 186 / 62%)" }}>—</span>}
      </div>

      {/* Previous day (small, below) */}
      <div className="mt-1.5 flex items-center gap-2">
        <span
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "0.68rem",
            color: "rgb(180 180 176 / 68%)",
            letterSpacing: "0.04em",
          }}
        >
          {lang === "zh" ? "昨收" : "Prev"}
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

  // BTC price via WebSocket
  const [btcLast, setBtcLast] = useState<number | null>(null);
  const [btcChange, setBtcChange] = useState<number | null>(null);
  const [btcFlash, setBtcFlash] = useState<"up" | "down" | null>(null);
  const prevBtc = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Hyperliquid market indices + VIX (poll every 30s)
  const { data: volData } = trpc.hyperliquid.marketTicker.useQuery(undefined, {
    refetchInterval: 30 * 1000,
  });

  // WebSocket for BTC price
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let pingTimer: ReturnType<typeof setInterval>;

    function connect() {
      const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "public/subscribe",
            params: { channels: ["ticker.BTC-PERPETUAL.100ms"] },
          })
        );
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ jsonrpc: "2.0", method: "public/test", id: 9999 }));
        }, 30_000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.method !== "subscription") return;
          const channel: string = msg.params?.channel ?? "";
          const data = msg.params?.data;
          if (!data) return;

          const last: number = data.last_price;
          const change24h: number | null = data.stats?.price_change ?? null;

          if (channel.startsWith("ticker.BTC")) {
            setBtcLast(last);
            setBtcChange(change24h);
            if (prevBtc.current != null && last !== prevBtc.current) {
              const dir = last > prevBtc.current ? "up" : "down";
              setBtcFlash(dir);
              setTimeout(() => setBtcFlash(null), 600);
            }
            prevBtc.current = last;
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        reconnectTimer = setTimeout(connect, 5000);
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      wsRef.current?.close();
    };
  }, []);

  const rowLabel = (text: string, mt = false) => (
    <p
      style={{
        fontSize: "0.6rem",
        letterSpacing: "0.16em",
        color: "rgb(164 188 174 / 64%)",
        textTransform: "uppercase",
        marginBottom: "0.5rem",
        marginTop: mt ? "1.4rem" : 0,
      }}
    >
      {text}
    </p>
  );

  return (
    <div>
      {rowLabel(lang === "zh" ? "实时行情" : "Live Prices")}

      {/* BTC · VIX · GOLD · QQQ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <PriceCard
          label="BTC"
          sublabel={lang === "zh" ? "永续" : "PERP"}
          price={btcLast}
          change={btcChange}
          isLive
          flash={btcFlash}
          priceDecimals={0}
          lang={lang}
          compact
        />
        {[
          { label: "VIX", sub: lang === "zh" ? "恐慌指数" : "Fear Index", cur: volData?.vix ?? null, prev: volData?.vixPrevClose ?? null },
          { label: "GOLD", sub: lang === "zh" ? "黄金" : "Gold", cur: volData?.gold ?? null, prev: volData?.goldPrevClose ?? null },
          { label: "QQQ", sub: lang === "zh" ? "科技ETF" : "Tech ETF", cur: volData?.qqq ?? null, prev: volData?.qqqPrevClose ?? null },
        ].map((v) => (
          <VolCard
            key={v.label}
            label={v.label}
            sublabel={v.sub}
            current={v.cur}
            prevDay={v.prev}
            decimals={2}
            lang={lang}
            compact
          />
        ))}
      </div>
    </div>
  );
}
