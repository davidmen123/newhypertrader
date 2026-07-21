import { useLang } from "@/contexts/LangContext";
import { FAQS } from "@/data/faq";
import FaqItem from "@/components/FaqItem";
import { openFeedbackDialog } from "@/lib/feedback";

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
      <div className="mt-2 border-t border-border pt-5 text-center">
        <button
          type="button"
          onClick={openFeedbackDialog}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("没有找到你想要的答案？", "Didn't find the answer you need?")}{" "}
          <span className="font-medium text-foreground underline decoration-border underline-offset-4">
            {t("向温格提问", "Ask Wenger")}
          </span>
        </button>
      </div>
    </div>
  );
}
