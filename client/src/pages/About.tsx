import { Sprout, Crosshair, Mail, MessageCircle } from "lucide-react";
import { useLang } from "@/contexts/LangContext";
import PageShell from "@/components/PageShell";

const MODES = [
  {
    icon: Sprout,
    name: { zh: "农民模式", en: "Farmer Mode" },
    body: {
      zh: "中长周期的投资标的选择，等进入击球区，便与社群成员一同投入。模式很像农民的春耕秋收，故称「农民模式」。",
      en: "Selecting medium-to-long-term positions and, once they enter the strike zone, committing together with the community. Like a farmer's sowing and harvest — hence \"Farmer Mode\".",
    },
  },
  {
    icon: Crosshair,
    name: { zh: "猎人模式", en: "Hunter Mode" },
    body: {
      zh: "依靠固定的狙击模式等待时机出现，更重视技术面。一旦出现技术面信号，则扣下扳机。模式很像猎人狩猎，故称「猎人模式」。",
      en: "Waiting for the moment with a fixed sniping playbook, focused on technicals. When a technical signal appears, pull the trigger. Like a hunter's stalk — hence \"Hunter Mode\".",
    },
  },
];

const OUTLINE = [
  { zh: "交易本质：概率思维的觉醒与技术分析的本质", en: "The nature of trading: awakening to probabilistic thinking and the essence of technical analysis" },
  { zh: "市场结构：读懂趋势的骨架，识别趋势与震荡", en: "Market structure: reading the skeleton of trends, distinguishing trend from range" },
  { zh: "关键位置：识别支撑阻力和筹码密集区", en: "Key levels: identifying support, resistance and high-volume zones" },
  { zh: "价格行为：K线信号的扣板时刻", en: "Price action: the trigger moment in candlestick signals" },
  { zh: "量价关系：动力验证之成交量与量价真相", en: "Volume and price: confirming momentum — the truth of volume-price" },
  { zh: "交易计划：一笔交易的结构化流程", en: "The trade plan: a structured process for a single trade" },
  { zh: "交易执行：从计划到复盘的单笔闭环", en: "Execution: the single-trade loop from plan to review" },
  { zh: "风险管理：构建回撤控制机制，实现稳健增长", en: "Risk management: building drawdown control for steady growth" },
  { zh: "总结串讲：温格老师和 Sober 老师疑问解答", en: "Wrap-up and Q&A: with Wenge and Sober" },
];

// Selected topics from the internal live-session archive (节选), shown as a
// numbered catalog. Titles are owner-provided; keep the "…… 等等" tail honest.
const LIVE_SESSIONS = [
  { zh: "AI时代的存储周期", en: "The storage cycle in the AI era" },
  { zh: "以交易为生进阶版", en: "Trading for a Living: Advanced" },
  { zh: "交易的5个极简步骤", en: "Five minimalist steps to a trade" },
  { zh: "如何通过双币策略有效指数增强", en: "Effective index enhancement with dual-currency strategies" },
  { zh: "如何利用VCP交易法，筛选强势股", en: "Using VCP to screen strong stocks" },
  { zh: "从三篇论文解析TQQQ的择时策略", en: "TQQQ timing strategies, decoded from three papers" },
  { zh: "2026年温格的四大认知升级", en: "Wenge's four cognitive upgrades of 2026" },
  { zh: "常用的四个经典骑牛策略", en: "Four classic bull-riding strategies" },
  { zh: "均线之大周期极简策略", en: "Minimalist moving-average strategies on large timeframes" },
  { zh: "格兰威尔八大法则", en: "Granville's Eight Rules" },
];

export default function About() {
  const { lang } = useLang();
  const t = (b: { zh: string; en: string }) => (lang === "zh" ? b.zh : b.en);

  return (
    <PageShell
      title={lang === "zh" ? "关于社群" : "About the Community"}
      subtitle={t({
        zh: "温格私享VIP社群，一个以交易为主的实战社群。",
        en: "Wenge Private VIP — a hands-on community centered on trading.",
      })}
    >
      {/* Hero visual — black-gold ridge-into-chart banner, works on both themes */}
      <div
        className="rounded-xl overflow-hidden fade-in mb-8"
        style={{ border: "1px solid var(--panel-border)", background: "#000" }}
      >
        <img
          src="/images/about-hero.png"
          alt={lang === "zh" ? "山脊化作上升行情的抽象横幅" : "Abstract banner of a mountain ridge turning into a rising chart"}
          className="w-full block"
          loading="lazy"
        />
      </div>

      <div className="mb-6" style={{ fontSize: "0.95rem", lineHeight: 1.9, color: "var(--text-soft)" }}>
        {lang === "zh" ? "我们专注于两种模式：" : "We focus on two modes:"}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          return (
            <div key={mode.name.en} className="glass-card px-5 py-6 sm:px-6 sm:py-7 fade-in">
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 38, height: 38, background: "rgb(215 187 114 / 16%)", color: "rgb(215 187 114 / 95%)", flexShrink: 0 }}
                >
                  <Icon size={19} />
                </span>
                <h2 className="text-xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
                  {t(mode.name)}
                </h2>
              </div>
              <p style={{ fontSize: "0.88rem", lineHeight: 1.9, color: "var(--text-soft)" }}>{t(mode.body)}</p>
            </div>
          );
        })}
      </div>

      {/* Course + outline */}
      <div className="glass-card px-5 py-6 sm:px-8 sm:py-7 fade-in mb-6">
        <div className="text-muted-foreground tracking-widest uppercase mb-2" style={{ fontSize: "0.6rem" }}>
          {lang === "zh" ? "配套课程" : "Companion Course"}
        </div>
        <div className="text-foreground mb-1" style={{ fontFamily: "Cormorant Garamond, serif", fontSize: "1.15rem", fontWeight: 500 }}>
          {t({ zh: "《不预测也能交易盈利的概率体系课》", en: "The Probability System: Profiting Without Prediction" })}
        </div>
        <p className="mb-5" style={{ fontSize: "0.85rem", lineHeight: 1.9, color: "var(--text-soft)" }}>
          {t({
            zh: "猎人模式的专属系列课，配套实盘陪跑与社群实战练习，帮助学员从「知」到「行」。",
            en: "The Hunter Mode course series, with live-account mentoring and hands-on community practice — from knowing to doing.",
          })}
        </p>

        <div className="text-muted-foreground tracking-widest uppercase mb-3" style={{ fontSize: "0.6rem" }}>
          {lang === "zh" ? "课程大纲" : "Course Outline"}
        </div>
        <ol className="flex flex-col">
          {OUTLINE.map((lesson, index) => (
            <li
              key={index}
              className="flex gap-3 sm:gap-4 py-2.5"
              style={{ borderTop: index === 0 ? "none" : "1px solid var(--panel-border)" }}
            >
              <span
                className="num-display flex-shrink-0"
                style={{ fontSize: "0.72rem", color: "rgb(215 187 114 / 95%)", paddingTop: "0.1rem", minWidth: "3.4rem" }}
              >
                Lesson {index + 1}
              </span>
              <span style={{ fontSize: "0.86rem", lineHeight: 1.7, color: "var(--text-soft)" }}>{t(lesson)}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Live sessions — selected topics from the internal live archive */}
      <div className="glass-card px-5 py-6 sm:px-8 sm:py-7 fade-in mb-6">
        <div className="text-muted-foreground tracking-widest uppercase mb-2" style={{ fontSize: "0.6rem" }}>
          {lang === "zh" ? "主题直播" : "Live Sessions"}
        </div>
        <div className="text-foreground mb-1" style={{ fontFamily: "Cormorant Garamond, serif", fontSize: "1.15rem", fontWeight: 500 }}>
          {lang === "zh" ? "内部主题直播课程（节选）" : "Live Topic Sessions (Selected)"}
        </div>
        <p className="mb-5" style={{ fontSize: "0.85rem", lineHeight: 1.9, color: "var(--text-soft)" }}>
          {lang === "zh"
            ? "体系课之外，社群内部持续进行的主题直播，覆盖宏观周期、策略拆解与认知升级。"
            : "Beyond the core course: ongoing internal live sessions on macro cycles, strategy teardowns and mental models."}
        </p>

        <ol className="grid gap-x-8 sm:grid-cols-2">
          {LIVE_SESSIONS.map((topic, index) => (
            <li key={index} className="flex gap-3 sm:gap-4 py-2.5">
              <span
                className="num-display flex-shrink-0"
                style={{ fontSize: "0.72rem", color: "rgb(215 187 114 / 95%)", paddingTop: "0.1rem", minWidth: "1.6rem" }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: "0.86rem", lineHeight: 1.7, color: "var(--text-soft)" }}>{t(topic)}</span>
            </li>
          ))}
        </ol>
        <div
          className="pt-3 mt-1 text-right"
          style={{ borderTop: "1px solid var(--panel-border)", fontSize: "0.8rem", color: "var(--text-faint)" }}
        >
          {lang === "zh" ? "…… 等等" : "…… and more"}
        </div>
      </div>

      {/* Contact / apply */}
      <div
        className="rounded-xl px-5 py-6 sm:px-8 sm:py-7 fade-in"
        style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
      >
        <div className="text-muted-foreground tracking-widest uppercase mb-4" style={{ fontSize: "0.6rem" }}>
          {lang === "zh" ? "了解 / 申请加入" : "Learn More / Apply"}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Mail size={16} className="flex-shrink-0" style={{ color: "rgb(215 187 114 / 95%)", marginTop: "0.15rem" }} />
            <div>
              <div className="text-foreground mb-0.5" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                {lang === "zh" ? "申请了解社群" : "Apply to learn about the community"}
              </div>
              <div style={{ fontSize: "0.85rem", lineHeight: 1.8, color: "var(--text-soft)" }}>
                {lang === "zh" ? "发送邮件至 " : "Email "}
                <a href="mailto:pnlnotes@gmail.com" className="num-display hover:opacity-75 transition-opacity" style={{ color: "rgb(215 187 114 / 95%)" }}>
                  pnlnotes@gmail.com
                </a>
                {lang === "zh" ? "，请在申请内容中留下您的微信。" : ", and include your WeChat in the message."}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MessageCircle size={16} className="flex-shrink-0" style={{ color: "rgb(215 187 114 / 95%)", marginTop: "0.15rem" }} />
            <div>
              <div className="text-foreground mb-0.5" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                {lang === "zh" ? "了解课程" : "Learn about the course"}
              </div>
              <div className="flex flex-col gap-1" style={{ fontSize: "0.85rem", lineHeight: 1.8, color: "var(--text-soft)" }}>
                <span>
                  {lang === "zh" ? "温格微信：" : "Wenge WeChat: "}
                  <span className="num-display text-foreground">web3_0101</span>
                </span>
                <span>
                  {lang === "zh" ? "社群助手微信：" : "Assistant WeChat: "}
                  <span className="num-display text-foreground">yuanyuan-asd</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
