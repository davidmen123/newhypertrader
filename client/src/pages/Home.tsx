import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import LiveTicker from "@/components/LiveTicker";
import PositionsTable from "@/components/PositionsTable";
import PnlChart from "@/components/PnlChart";
import AccountOverview from "@/components/AccountOverview";
import EconomicCalendar from "@/components/EconomicCalendar";
import TradeHistory from "@/components/TradeHistory";
import EarningsCalendar from "@/components/EarningsCalendar";
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
          style={{ color: "rgb(205 222 211 / 78%)", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap" }}
        >
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: "rgb(255 255 255 / 10%)" }} />
        <ChevronDown
          size={13}
          style={{
            color: "rgb(205 222 211 / 72%)",
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

export default function Home() {
  const { tr, lang, setLang } = useLang();

  // Page view counter: increment on mount, display total
  const incrementMutation = trpc.pageViews.increment.useMutation();
  const [pageViewCount, setPageViewCount] = useState<number | null>(null);

  useEffect(() => {
    incrementMutation.mutateAsync().then((res) => {
      setPageViewCount(res.count);
    }).catch(() => { /* silently ignore */ });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="min-h-screen text-foreground"
      style={{
        background:
          "radial-gradient(ellipse at 18% 0%, rgb(215 187 114 / 13%) 0%, transparent 38%), " +
          "radial-gradient(ellipse at 84% 22%, rgb(255 255 255 / 8%) 0%, transparent 34%), " +
          "linear-gradient(115deg, #030304 0%, #070708 44%, #111114 100%)",
      }}
    >
      {/* ── Header ── */}
      <header className="px-4 sm:px-12 pt-7 sm:pt-10 pb-6 sm:pb-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between">
            {/* Title block */}
            <div>
              <h1
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "clamp(2.35rem, 7vw, 5.4rem)",
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  lineHeight: 0.96,
                  color: "#fffef8",
                  textShadow: "0 12px 42px rgb(0 0 0 / 55%)",
                }}
              >
                以交易为生
              </h1>
              <div
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "clamp(0.66rem, 1.2vw, 0.82rem)",
                  fontWeight: 500,
                  letterSpacing: "0.34em",
                  textTransform: "uppercase",
                  color: "rgb(242 231 201 / 88%)",
                  marginTop: "0.85rem",
                }}
              >
                Trading for a living
              </div>
              <div
                style={{
                  color: "rgb(255 255 255 / 86%)",
                  fontSize: "0.72rem",
                  fontWeight: 500,
                  letterSpacing: "0.24em",
                  marginTop: "1rem",
                }}
              >
                风控&nbsp;&nbsp;|&nbsp;&nbsp;累积&nbsp;&nbsp;|&nbsp;&nbsp;复利
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
                  color: "rgb(230 230 224 / 72%)",
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
              </div>
            </div>
          </div>

          {/* Decorative line */}
          <div
            style={{
              height: 1,
              background:
                "linear-gradient(to right, transparent, rgb(215 187 114 / 34%), transparent)",
              marginTop: "1.5rem",
            }}
          />
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="px-4 sm:px-12 pb-16">
        <div className="max-w-6xl mx-auto space-y-8 sm:space-y-10">

          {/* 0. Live Market — always open */}
          <CollapsibleSection label={tr.liveMarket} defaultOpen={true}>
            <LiveTicker />
          </CollapsibleSection>

          {/* 1. Account Overview — always open */}
          <CollapsibleSection label={lang === "zh" ? "账户概览" : "Account Overview"} defaultOpen={true}>
            <AccountOverview />
          </CollapsibleSection>

          {/* 2. Positions — always open */}
          <CollapsibleSection label={tr.positions} defaultOpen={true}>
            <PositionsTable />
          </CollapsibleSection>

          {/* 3. PnL History — default collapsed on mobile, open on desktop */}
          <CollapsibleSection label={tr.pnlHistory} defaultOpen={true}>
            <PnlChart />
          </CollapsibleSection>

          {/* 4. Trade History — default collapsed */}
          <CollapsibleSection label={lang === "zh" ? "历史成交" : "Trade History"} defaultOpen={false}>
            <TradeHistory />
          </CollapsibleSection>

          {/* 5. Economic Calendar — default collapsed */}
          <CollapsibleSection label={tr.economicCalendar} defaultOpen={false}>
            <EconomicCalendar />
          </CollapsibleSection>

          {/* 6. Earnings Calendar — default collapsed */}
          <CollapsibleSection label={tr.earningsCalendar} defaultOpen={false}>
            <EarningsCalendar />
          </CollapsibleSection>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer
        className="px-4 sm:px-12 py-5"
        style={{ borderTop: "1px solid rgb(255 255 255 / 9%)" }}
      >
        <div className="max-w-6xl mx-auto flex flex-col gap-3">
          <div
            className="rounded-lg px-4 py-3"
            style={{
              background: "rgb(255 255 255 / 4%)",
              border: "1px solid rgb(255 255 255 / 8%)",
              color: "rgb(230 230 224 / 62%)",
              fontSize: "0.68rem",
              lineHeight: 1.7,
            }}
          >
            {lang === "zh"
              ? "本页仅展示实盘账户数据，不构成投资建议。交易有风险，请独立判断。"
              : "This page displays live account data only and does not constitute investment advice. Trading involves risk; please make independent decisions."}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "0.6rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgb(205 222 211 / 70%)",
            }}
          >
            以交易为生 Trading for a living
          </span>
          <div
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "0.62rem",
              letterSpacing: "0.08em",
              color: "rgb(230 230 224 / 70%)",
            }}
          >
            <span>公众号：温格笔记</span>
            <span>X：@mindwingsD</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
            {pageViewCount !== null && (
              <span
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "0.55rem",
                  color: "rgb(205 222 211 / 66%)",
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
                color: "rgb(205 222 211 / 66%)",
              }}
            >
              {tr.autoRefresh}
            </span>
          </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
