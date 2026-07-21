import { useState } from "react";
import { Loader2, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_LEN = 1000;

export default function FeedbackWidget() {
  const { tr } = useLang();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, must stay empty

  const submit = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      toast.success(tr.feedbackThanks);
      setContent("");
      setContact("");
      setWebsite("");
      setOpen(false);
    },
    onError: (err) => {
      if (err.data?.code === "TOO_MANY_REQUESTS") {
        toast.error(tr.feedbackTooMany);
      } else {
        toast.error(tr.feedbackError);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || submit.isPending) return;
    submit.mutate({
      kind: "feedback",
      content: trimmed,
      contact: contact.trim() || undefined,
      page: window.location.pathname,
      website: website || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={tr.feedback}
          title={tr.feedback}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <MessageSquareText className="h-5 w-5" />
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr.feedback}</DialogTitle>
          <DialogDescription>{tr.feedbackDesc}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Honeypot: invisible to humans, bots fill it and get dropped server-side */}
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          <div className="space-y-2">
            <div className="relative">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, MAX_LEN))}
                placeholder={tr.feedbackPlaceholder}
                rows={5}
                autoFocus
                className="resize-none"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-muted-foreground">
                {content.length}/{MAX_LEN}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-contact" className="text-sm text-muted-foreground">
              {tr.feedbackContactLabel}
            </Label>
            <Input
              id="feedback-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value.slice(0, 200))}
              placeholder={tr.feedbackContactPlaceholder}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!content.trim() || submit.isPending}
          >
            {submit.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {tr.feedbackSending}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {tr.feedbackSubmit}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
