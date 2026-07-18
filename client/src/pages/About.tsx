import { Sprout, Crosshair } from "lucide-react";
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
      <div className="mb-6" style={{ fontSize: "0.95rem", lineHeight: 1.9, color: "var(--text-soft)" }}>
        {lang === "zh" ? "我们专注于两种模式：" : "We focus on two modes:"}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-6">
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

      <div
        className="rounded-xl px-5 py-6 sm:px-7 sm:py-7 fade-in"
        style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
      >
        <div className="text-muted-foreground tracking-widest uppercase mb-2" style={{ fontSize: "0.6rem" }}>
          {lang === "zh" ? "配套课程" : "Companion Course"}
        </div>
        <div className="text-foreground mb-2" style={{ fontFamily: "Cormorant Garamond, serif", fontSize: "1.05rem", fontWeight: 500 }}>
          {t({
            zh: "《不预测也能交易盈利的概率体系课 · 8讲》",
            en: "The Probability System: Profiting Without Prediction · 8 Lessons",
          })}
        </div>
        <p style={{ fontSize: "0.88rem", lineHeight: 1.9, color: "var(--text-soft)" }}>
          {t({
            zh: "猎人模式拥有专属的系列课，并配套实盘陪跑与社群实战练习，帮助学员从「知」到「行」。",
            en: "Hunter Mode comes with its own course series, paired with live-account mentoring and hands-on community practice — helping members go from knowing to doing.",
          })}
        </p>
      </div>
    </PageShell>
  );
}
