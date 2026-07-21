import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import LiveTicker from "@/components/deribit/LiveTicker";
import PositionsTable from "@/components/deribit/PositionsTable";
import PnlChart from "@/components/deribit/PnlChart";
import AccountOverview from "@/components/deribit/AccountOverview";
import EconomicCalendar from "@/components/deribit/EconomicCalendar";
import TradeHistory from "@/components/deribit/TradeHistory";
import PnlAttribution from "@/components/deribit/PnlAttribution";
import EarningsCalendar from "@/components/deribit/EarningsCalendar";
import { useLang } from "@/contexts/LangContext";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ label, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      {/* Section header — clickable on mobile, static on desktop */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 mb-5 group"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        aria-expanded={open}
      >
        <span
          className="text-xs tracking-[0.25em] uppercase"
          style={{ color: "oklch(48% 0.015 200)", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap" }}
        >
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: "oklch(35% 0.02 200 / 40%)" }} />
        <ChevronDown
          size={13}
          style={{
            color: "oklch(42% 0.015 200)",
            transition: "transform 0.25s ease",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            flexShrink: 0,
          }}
        />
      </button>

      {/* Collapsible content */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: open ? "9999px" : "0px",
          transition: "max-height 0.3s ease",
        }}
      >
        {children}
      </div>
    </section>
  );
}

export default function Deribit() {
  const { tr, lang, setLang } = useLang();

  // Page view counter: increment on mount, display total
  const incrementMutation = trpc.pageViews.increment.useMutation();
  const [pageViewCount, setPageViewCount] = useState<number | null>(null);

  // Backfill historical trades from Deribit API on first load (idempotent via upsert)
  const backfillMutation = trpc.deribit.backfillHistory.useMutation();

  useEffect(() => {
    incrementMutation.mutateAsync().then((res) => {
      setPageViewCount(res.count);
    }).catch(() => { /* silently ignore */ });

    // Trigger backfill once per session — safe to call multiple times
    backfillMutation.mutateAsync({ count: 500 }).catch(() => { /* silently ignore */ });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="min-h-screen text-foreground"
      style={{
        background:
          "radial-gradient(ellipse at 15% 0%, oklch(26% 0.045 215 / 55%) 0%, transparent 55%), " +
          "radial-gradient(ellipse at 85% 100%, oklch(21% 0.035 195 / 45%) 0%, transparent 55%), " +
          "oklch(17% 0.022 205)",
      }}
    >
      {/* ── Header ── */}
      <header className="px-4 sm:px-12 pt-7 sm:pt-10 pb-6 sm:pb-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between">
            {/* Title block */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <h1
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: "clamp(1.8rem, 4.5vw, 3.6rem)",
                    fontWeight: 300,
                    letterSpacing: "-0.01em",
                    lineHeight: 1,
                    color: "oklch(93% 0.005 200)",
                  }}
                >
                  Wings' option
                </h1>
              </div>
              <div
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "0.6rem",
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                  color: "oklch(48% 0.015 200)",
                  marginTop: "0.5rem",
                }}
              >
                {tr.subtitle}
              </div>
            </div>

            {/* Right: date + lang switch */}
            <div className="flex flex-col items-end gap-3">
              <button
                onClick={() => setLang(lang === "en" ? "zh" : "en")}
                className="pill-tab text-xs"
                style={{ minWidth: 60 }}
              >
                {tr.langSwitch}
              </button>
              <div
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "0.65rem",
                  color: "oklch(42% 0.015 200)",
                  letterSpacing: "0.04em",
                  textAlign: "right",
                }}
                className="hidden sm:block"
              >
                <div>
                  {new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <div style={{ marginTop: 3, color: "oklch(36% 0.015 200)" }}>BTC · ETH</div>
              </div>
            </div>
          </div>

          {/* Decorative line */}
          <div
            style={{
              height: 1,
              background:
                "linear-gradient(to right, transparent, oklch(50% 0.03 210 / 45%), transparent)",
              marginTop: "1.5rem",
            }}
          />
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="px-4 sm:px-12 pb-16">
        <div className="max-w-6xl mx-auto space-y-8 sm:space-y-10">

          {/* 0. Account Overview — always open */}
          <CollapsibleSection label={lang === "zh" ? "账户概览" : "Account Overview"} defaultOpen={true}>
            <AccountOverview />
          </CollapsibleSection>

          {/* 1. Live Market — always open */}
          <CollapsibleSection label={tr.liveMarket} defaultOpen={true}>
            <LiveTicker />
          </CollapsibleSection>

          {/* 2. Positions — always open */}
          <CollapsibleSection label={tr.positions} defaultOpen={true}>
            <PositionsTable />
          </CollapsibleSection>

          {/* 3. PnL History — default collapsed on mobile, open on desktop */}
          <CollapsibleSection label={tr.pnlHistory} defaultOpen={true}>
            <PnlChart />
          </CollapsibleSection>

          {/* 4. P&L Attribution — default open */}
          <CollapsibleSection label={lang === "zh" ? "P&L 归因分析" : "P&L Attribution"} defaultOpen={true}>
            <PnlAttribution />
          </CollapsibleSection>

          {/* 5. Trade History — default collapsed */}
          <CollapsibleSection label={lang === "zh" ? "历史成交" : "Trade History"} defaultOpen={false}>
            <TradeHistory />
          </CollapsibleSection>

          {/* 5. Economic Calendar — default collapsed */}
          <CollapsibleSection label={tr.economicCalendar} defaultOpen={false}>
            <EconomicCalendar />
          </CollapsibleSection>

          {/* 5. Earnings Calendar — default collapsed */}
          <CollapsibleSection label={tr.earningsCalendar} defaultOpen={false}>
            <EarningsCalendar />
          </CollapsibleSection>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer
        className="px-4 sm:px-12 py-5"
        style={{ borderTop: "1px solid oklch(28% 0.02 200 / 30%)" }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "0.6rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "oklch(36% 0.015 200)",
            }}
          >
            Wings' option · BTC · ETH
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
            {pageViewCount !== null && (
              <span
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "0.55rem",
                  color: "oklch(32% 0.012 200)",
                  letterSpacing: "0.06em",
                }}
              >
                {pageViewCount.toLocaleString()} views
              </span>
            )}
            <span
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: "0.6rem",
                color: "oklch(33% 0.015 200)",
              }}
            >
              {tr.autoRefresh}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
