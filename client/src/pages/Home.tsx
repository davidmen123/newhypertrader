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
import { useTheme } from "@/contexts/ThemeContext";
import { ChevronDown, Moon, Sun } from "lucide-react";

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
          style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap" }}
        >
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <ChevronDown
          size={13}
          style={{
            color: "var(--muted-foreground)",
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
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  // Page view counter: increment on mount, display total
  const incrementMutation = trpc.pageViews.increment.useMutation();
  const [pageViewCount, setPageViewCount] = useState<number | null>(null);

  useEffect(() => {
    incrementMutation.mutateAsync().then((res) => {
      setPageViewCount(res.count);
    }).catch(() => { /* silently ignore */ });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageBackground = isDark
    ? "#000000"
    : "linear-gradient(180deg, #fbfcfa 0%, #f4f6f2 46%, #eef1ed 100%)";
  const heroTitleColor = isDark ? "#fffef8" : "#101214";
  const heroAccentColor = isDark ? "rgb(242 231 201 / 88%)" : "rgb(31 107 79 / 86%)";
  const heroMetaColor = isDark ? "rgb(255 255 255 / 82%)" : "rgb(42 47 52 / 76%)";
  const subtleTextColor = isDark ? "rgb(230 230 224 / 76%)" : "rgb(75 82 89 / 72%)";
  const panelBackground = isDark ? "rgb(255 255 255 / 4%)" : "rgb(255 255 255 / 82%)";
  const panelBorder = isDark ? "rgb(255 255 255 / 9%)" : "rgb(17 19 21 / 10%)";
  const heroRule = isDark ? "rgb(242 231 201 / 42%)" : "rgb(17 19 21 / 18%)";

  return (
    <div
      className="min-h-screen text-foreground"
      style={{ background: pageBackground }}
    >
      {/* ── Header ── */}
      <header className="px-4 sm:px-12 pt-7 sm:pt-10 pb-8 sm:pb-11">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col gap-8 sm:gap-10">
            <div className="flex items-start justify-between gap-5">
              <div
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "0.68rem",
                  letterSpacing: "0.18em",
                  color: subtleTextColor,
                  paddingTop: "0.2rem",
                }}
              >
                PnLNote.com&nbsp;&nbsp;/&nbsp;&nbsp;Live Account
              </div>

              <div className="flex flex-col items-end gap-2.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleTheme}
                    className="pill-tab text-xs inline-flex items-center gap-2"
                    style={{ minWidth: 74 }}
                    title={isDark ? "切换到白天" : "切换到黑夜"}
                  >
                    {isDark ? <Sun size={13} /> : <Moon size={13} />}
                    {isDark ? "DAY" : "NIGHT"}
                  </button>
                  <button
                    onClick={() => setLang(lang === "en" ? "zh" : "en")}
                    className="pill-tab text-xs"
                    style={{ minWidth: 60 }}
                  >
                    {tr.langSwitch}
                  </button>
                </div>
                <div
                  style={{
                    fontFamily: "DM Mono, monospace",
                    fontSize: "0.65rem",
                    color: subtleTextColor,
                    letterSpacing: "0.04em",
                    textAlign: "right",
                  }}
                  className="hidden sm:block"
                >
                  {new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_290px] lg:items-end">
              <div>
                <h1
                  style={{
                    fontFamily: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif',
                    fontSize: "clamp(3rem, 6.6vw, 5.05rem)",
                    fontWeight: 300,
                    letterSpacing: "0.015em",
                    lineHeight: 0.98,
                    color: heroTitleColor,
                    textShadow: isDark ? "0 12px 42px rgb(0 0 0 / 55%)" : "none",
                  }}
                >
                  以交易为生
                </h1>
                <div
                  className="flex flex-wrap items-center gap-4 sm:gap-5"
                  style={{
                    marginTop: "1rem",
                  }}
                >
                  <span
                    style={{
                      fontFamily: '"Bodoni 72", Didot, "Cormorant Garamond", Georgia, serif',
                      fontSize: "clamp(1.08rem, 1.45vw, 1.28rem)",
                      fontWeight: 400,
                      letterSpacing: "0.015em",
                      color: heroAccentColor,
                    }}
                  >
                    Trading for a living
                  </span>
                  <span className="hidden sm:block" style={{ width: 76, height: 1, background: heroRule }} />
                </div>
              </div>

              <div
                style={{
                  fontFamily: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif',
                  color: heroMetaColor,
                  fontSize: "clamp(0.92rem, 1.1vw, 1.04rem)",
                  fontWeight: 300,
                  letterSpacing: "0.16em",
                  lineHeight: 1.9,
                  borderLeft: `1px solid ${heroRule}`,
                  paddingLeft: "1.25rem",
                }}
              >
                <div>{lang === "zh" ? "风控" : "Risk Control"}</div>
                <div>{lang === "zh" ? "累积" : "Accumulation"}</div>
                <div>{lang === "zh" ? "复利" : "Compounding"}</div>
              </div>
            </div>
          </div>

          {/* Decorative line */}
          <div
            style={{
              height: 1,
              background:
                isDark
                  ? "linear-gradient(to right, transparent, rgb(215 187 114 / 34%), transparent)"
                  : "linear-gradient(to right, transparent, rgb(17 19 21 / 16%), transparent)",
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
        style={{ borderTop: `1px solid ${panelBorder}` }}
      >
        <div className="max-w-6xl mx-auto flex flex-col gap-3">
          <div
            className="rounded-lg px-4 py-3"
            style={{
              background: panelBackground,
              border: `1px solid ${panelBorder}`,
              color: subtleTextColor,
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
              color: subtleTextColor,
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
              color: subtleTextColor,
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
                  color: subtleTextColor,
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
                color: subtleTextColor,
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
