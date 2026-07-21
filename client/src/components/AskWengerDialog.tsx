import { useEffect, useState } from "react";
import { HelpCircle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/contexts/LangContext";
import { OPEN_ASK_WENGER_EVENT } from "@/lib/ask-wenger";
import { trpc } from "@/lib/trpc";

const MAX_LEN = 1000;

export default function AskWengerDialog() {
  const { lang, tr } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    const openDialog = () => setOpen(true);
    window.addEventListener(OPEN_ASK_WENGER_EVENT, openDialog);
    return () => window.removeEventListener(OPEN_ASK_WENGER_EVENT, openDialog);
  }, []);

  const submit = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      toast.success(t("问题已提交，我们会尽快回复。", "Your question has been submitted. We'll reply as soon as possible."));
      setQuestion("");
      setContact("");
      setWebsite("");
      setOpen(false);
    },
    onError: (error) => {
      if (error.data?.code === "TOO_MANY_REQUESTS") {
        toast.error(tr.feedbackTooMany);
      } else {
        toast.error(tr.feedbackError);
      }
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    const trimmedContact = contact.trim();
    if (!trimmedQuestion || !trimmedContact || submit.isPending) return;

    submit.mutate({
      kind: "question",
      content: trimmedQuestion,
      contact: trimmedContact,
      page: window.location.pathname,
      website: website || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
            {t("向温格提问", "Ask Wenger")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "写下你的问题并留下联系方式，方便温格回复你。",
              "Write your question and leave contact details so Wenger can reply.",
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          <div className="space-y-2">
            <Label htmlFor="ask-wenger-question">{t("你的问题", "Your question")}</Label>
            <div className="relative">
              <Textarea
                id="ask-wenger-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value.slice(0, MAX_LEN))}
                placeholder={t("请尽量具体地描述你的问题…", "Describe your question as specifically as possible…")}
                rows={5}
                autoFocus
                className="resize-none pb-7"
                required
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-muted-foreground">
                {question.length}/{MAX_LEN}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ask-wenger-contact">
              {t("联系方式（必填）", "Contact (required)")}
            </Label>
            <Input
              id="ask-wenger-contact"
              value={contact}
              onChange={(event) => setContact(event.target.value.slice(0, 200))}
              placeholder={t("邮箱 / 微信 / Telegram", "Email / WeChat / Telegram")}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!question.trim() || !contact.trim() || submit.isPending}
          >
            {submit.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {tr.feedbackSending}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {t("提交问题", "Submit question")}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
