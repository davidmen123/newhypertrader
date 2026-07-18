import { type ReactNode } from "react";
import { Link } from "wouter";
import { Moon, Sun, ArrowLeft } from "lucide-react";
import { useLang } from "@/contexts/LangContext";
import { useTheme } from "@/contexts/ThemeContext";

// Shared wrapper for the secondary content pages (FAQ) so they match the
// homepage: same background, a minimal header that links back home, the
// theme/language toggles, and the disclaimer footer.
export default function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { lang, setLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const pageBackground = isDark
    ? "#000000"
    : "linear-gradient(180deg, #fbfcfa 0%, #f4f6f2 46%, #eef1ed 100%)";
  const heroTitleColor = isDark ? "#fffef8" : "#101214";
  const subtleTextColor = isDark ? "rgb(230 230 224 / 76%)" : "rgb(75 82 89 / 72%)";
  const panelBackground = isDark ? "rgb(255 255 255 / 4%)" : "rgb(255 255 255 / 82%)";
  const panelBorder = isDark ? "rgb(255 255 255 / 9%)" : "rgb(17 19 21 / 10%)";

  return (
    <div className="min-h-screen text-foreground" style={{ background: pageBackground }}>
      <header className="px-4 sm:px-12 pt-7 sm:pt-10 pb-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: "0.68rem",
                letterSpacing: "0.18em",
                color: subtleTextColor,
              }}
            >
              <ArrowLeft size={13} />
              <span>PnLNote.com&nbsp;&nbsp;/&nbsp;&nbsp;{lang === "zh" ? "返回实盘看板" : "Back to Dashboard"}</span>
            </Link>

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

          <div className="mt-8 sm:mt-10">
            <h1
              style={{
                fontFamily: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
                fontSize: "clamp(1.9rem, 4vw, 2.9rem)",
                fontWeight: 300,
                letterSpacing: "0.02em",
                lineHeight: 1.1,
                color: heroTitleColor,
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3" style={{ color: subtleTextColor, fontSize: "0.9rem", lineHeight: 1.8 }}>
                {subtitle}
              </p>
            )}
            <div className="mt-4" style={{ width: 44, height: 1, background: "rgb(215 187 114 / 62%)" }} />
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-12 pb-16">
        <div className="max-w-4xl mx-auto">{children}</div>
      </main>

      <footer className="px-4 sm:px-12 py-5" style={{ borderTop: `1px solid ${panelBorder}` }}>
        <div className="max-w-4xl mx-auto flex flex-col gap-3">
          <div
            className="rounded-lg px-4 py-3"
            style={{ background: panelBackground, border: `1px solid ${panelBorder}`, color: subtleTextColor, fontSize: "0.68rem", lineHeight: 1.7 }}
          >
            {lang === "zh"
              ? "本站内容仅为交易实战与社群介绍，不构成投资建议。交易有风险，请独立判断。"
              : "Content here is for trading practice and community introduction only and does not constitute investment advice. Trading involves risk; please make independent decisions."}
          </div>
          <div
            className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2"
            style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", letterSpacing: "0.08em", color: subtleTextColor }}
          >
            <span>公众号：温格笔记</span>
            <span>X：@mindwingsD</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
