import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import FaqSection from "@/components/FaqSection";
import LiveTicker from "@/components/LiveTicker";
import PositionsTable from "@/components/PositionsTable";
import OpenOrdersTable from "@/components/OpenOrdersTable";
import OrderHistoryTable from "@/components/OrderHistoryTable";
import PnlChart from "@/components/PnlChart";
import AccountOverview from "@/components/AccountOverview";
import EconomicCalendar from "@/components/EconomicCalendar";
import TradeHistory from "@/components/TradeHistory";
import EarningsCalendar from "@/components/EarningsCalendar";
import Changelog from "@/components/Changelog";
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

  // Count the visit server-side; the total is no longer displayed.
  const incrementMutation = trpc.pageViews.increment.useMutation();

  useEffect(() => {
    incrementMutation.mutateAsync().catch(() => { /* silently ignore */ });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Match the zh kicker's width to the hero title width by measuring natural
  // text width and solving for the letter-spacing needed to stretch/compress
  // to fit — avoids distorting glyphs via scaleX.
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
  const kickerRef = useRef<HTMLDivElement>(null);
  const [kickerLetterSpacing, setKickerLetterSpacing] = useState<number | null>(null);

  useLayoutEffect(() => {
    // getBoundingClientRect() on the elements themselves would measure their
    // box width (which stretches to fill the flex column), not the glyphs —
    // a Range over the content gives the actual rendered text width instead.
    function contentWidth(el: HTMLElement | null): number {
      if (!el) return 0;
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width;
    }

    function matchWidthBySpacing(el: HTMLElement | null, targetWidth: number): number | null {
      if (!el) return null;
      const prevSpacing = el.style.letterSpacing;
      el.style.letterSpacing = "0px";
      const naturalWidth = contentWidth(el);
      el.style.letterSpacing = prevSpacing;
      const charCount = Array.from(el.textContent ?? "").length;
      if (charCount === 0 || naturalWidth === 0) return null;
      return (targetWidth - naturalWidth) / charCount;
    }

    function measure() {
      const targetWidth = contentWidth(heroTitleRef.current);
      if (!targetWidth) return;
      setKickerLetterSpacing(lang === "zh" ? matchWidthBySpacing(kickerRef.current, targetWidth) : null);
    }

    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, [lang]);

  const pageBackground = isDark
    ? "#000000"
    : "linear-gradient(180deg, #fbfcfa 0%, #f4f6f2 46%, #eef1ed 100%)";
  const heroTitleColor = isDark ? "#fffef8" : "#101214";
  const heroAccentColor = isDark ? "rgb(242 231 201 / 88%)" : "rgb(31 107 79 / 86%)";
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
                className="flex items-center gap-2.5"
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "0.68rem",
                  letterSpacing: "0.18em",
                  color: subtleTextColor,
                  paddingTop: "0.2rem",
                }}
              >
                <span>PnLNote.com&nbsp;&nbsp;/&nbsp;&nbsp;Live Account</span>
                <span
                  className="pulse-dot"
                  title={lang === "zh" ? "实时更新" : "Live updates"}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "oklch(68% 0.15 145)",
                    boxShadow: "0 0 8px oklch(68% 0.15 145 / 55%)",
                    flexShrink: 0,
                  }}
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={toggleTheme}
                  className="header-icon-button"
                  title={isDark ? "切换到白天" : "切换到黑夜"}
                  aria-label={isDark ? "切换到白天" : "切换到黑夜"}
                >
                  {isDark ? <Sun size={14} /> : <Moon size={14} />}
                </button>
                <button
                  onClick={() => setLang(lang === "en" ? "zh" : "en")}
                  className="header-icon-button header-lang-button"
                  title={lang === "en" ? "切换到中文" : "Switch to English"}
                  aria-label={lang === "en" ? "切换到中文" : "Switch to English"}
                >
                  {lang === "en" ? "中" : "EN"}
                </button>
              </div>
            </div>

            <div>
              {lang === "zh" && (
                <div
                  ref={kickerRef}
                  style={{
                    fontFamily: "DM Mono, monospace",
                    fontSize: "0.92rem",
                    letterSpacing: kickerLetterSpacing != null ? `${kickerLetterSpacing}px` : "0.22em",
                    textTransform: "uppercase",
                    color: subtleTextColor,
                    marginBottom: "0.9rem",
                  }}
                >
                  <span style={{ whiteSpace: "nowrap" }}>
                    风控 <span style={{ color: heroAccentColor }}>·</span>
                  </span>{" "}
                  <span style={{ whiteSpace: "nowrap" }}>
                    累积 <span style={{ color: heroAccentColor }}>·</span>
                  </span>{" "}
                  <span style={{ whiteSpace: "nowrap" }}>复利</span>
                </div>
              )}
              {lang === "en" && (
                <div
                  style={{
                    fontFamily: "DM Mono, monospace",
                    fontSize: "0.68rem",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: subtleTextColor,
                    marginBottom: "0.9rem",
                  }}
                >
                  <span style={{ whiteSpace: "nowrap" }}>
                    Risk Control <span style={{ color: heroAccentColor }}>·</span>
                  </span>{" "}
                  <span style={{ whiteSpace: "nowrap" }}>
                    Accumulation <span style={{ color: heroAccentColor }}>·</span>
                  </span>{" "}
                  <span style={{ whiteSpace: "nowrap" }}>Compounding</span>
                </div>
              )}
              <h1
                ref={heroTitleRef}
                style={{
                  fontFamily: '"Ma Shan Zheng", "Noto Serif SC", "Songti SC", "STSong", serif',
                  fontSize: "clamp(3rem, 6.6vw, 5.05rem)",
                  fontWeight: 400,
                  letterSpacing: "0.02em",
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
                  Trading for a Living
                </span>
              </div>
              <div
                style={{
                  marginTop: "1.25rem",
                  paddingLeft: "1rem",
                  borderLeft: `1px solid ${heroRule}`,
                }}
              >
                {(lang === "zh"
                  ? ["实盘教学账户全程公开", "每一笔交易实时可查", "交易逻辑在社群内呈现"]
                  : ["A fully public live teaching account", "Every trade visible in real time", "Trade reasoning shared in the community"]
                ).map((line) => (
                  <div
                    key={line}
                    style={{
                      fontFamily: lang === "zh"
                        ? '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif'
                        : "Inter, sans-serif",
                      fontSize: "clamp(0.85rem, 1vw, 0.95rem)",
                      fontWeight: lang === "zh" ? 300 : 400,
                      letterSpacing: lang === "zh" ? "0.08em" : "0.01em",
                      lineHeight: 2,
                      color: subtleTextColor,
                    }}
                  >
                    {line}
                  </div>
                ))}
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

          {/* 3. Open Orders — default open */}
          <CollapsibleSection label={lang === "zh" ? "当前委托" : "Open Orders"} defaultOpen={true}>
            <OpenOrdersTable />
          </CollapsibleSection>

          {/* 4. PnL History — default collapsed on mobile, open on desktop */}
          <CollapsibleSection label={tr.pnlHistory} defaultOpen={true}>
            <PnlChart />
          </CollapsibleSection>

          {/* 5. Trade History — default collapsed */}
          <CollapsibleSection label={lang === "zh" ? "历史成交" : "Trade History"} defaultOpen={false}>
            <TradeHistory />
          </CollapsibleSection>

          {/* 6. Order History — default collapsed */}
          <CollapsibleSection label={lang === "zh" ? "委托历史" : "Order History"} defaultOpen={false}>
            <OrderHistoryTable />
          </CollapsibleSection>

          {/* 7. Economic Calendar — default collapsed */}
          <CollapsibleSection label={tr.economicCalendar} defaultOpen={false}>
            <EconomicCalendar />
          </CollapsibleSection>

          {/* 8. Earnings Calendar — default collapsed */}
          <CollapsibleSection label={tr.earningsCalendar} defaultOpen={false}>
            <EarningsCalendar />
          </CollapsibleSection>

          {/* 9. FAQ — default collapsed, expands on demand to show all entries */}
          <CollapsibleSection label={lang === "zh" ? "常见问题" : "FAQ"} defaultOpen={false}>
            <FaqSection />
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
              ? "本页为实盘教学账户数据，不构成投资建议。交易有风险，请独立判断。"
              : "This page displays live account data only and does not constitute investment advice. Trading involves risk; please make independent decisions."}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-2">
            <div
              className="flex flex-wrap items-center gap-x-5 gap-y-2"
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "0.68rem",
                letterSpacing: "0.08em",
                color: subtleTextColor,
              }}
            >
              <span>公众号：温格笔记</span>
              <span>X：@mindwingsD</span>
            </div>
            <Changelog />
          </div>
        </div>
      </footer>
    </div>
  );
}
