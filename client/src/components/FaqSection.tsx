import { useLang } from "@/contexts/LangContext";
import { FAQS } from "@/data/faq";
import FaqItem from "@/components/FaqItem";

// Homepage FAQ block: renders the full question list inline at the end of the
// dashboard flow. The surrounding CollapsibleSection keeps it folded until
// the visitor explicitly opens it.
export default function FaqSection() {
  const { lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  return (
    <div className="flex flex-col gap-3">
      {FAQS.map((item, index) => (
        <FaqItem key={index} q={t(item.q.zh, item.q.en)} a={t(item.a.zh, item.a.en)} defaultOpen={index === 0} />
      ))}
    </div>
  );
}
