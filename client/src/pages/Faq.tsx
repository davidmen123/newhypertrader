import { useLang } from "@/contexts/LangContext";
import PageShell from "@/components/PageShell";
import FaqItem from "@/components/FaqItem";
import { FAQS } from "@/data/faq";

export default function Faq() {
  const { lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  return (
    <PageShell
      title={t("常见问题", "FAQ")}
      subtitle={t("关于交易方法与社群的常见疑问。", "Common questions about the trading method and the community.")}
    >
      <div className="flex flex-col gap-3">
        {FAQS.map((item, index) => (
          <FaqItem key={index} q={t(item.q.zh, item.q.en)} a={t(item.a.zh, item.a.en)} defaultOpen={index === 0} />
        ))}
      </div>
    </PageShell>
  );
}
