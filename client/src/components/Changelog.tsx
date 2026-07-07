import { useLang } from "@/contexts/LangContext";
import { CHANGELOG } from "@/data/changelog.generated";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Footer version badge that opens the site changelog in a modal.
export default function Changelog() {
  const { lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const latest = CHANGELOG[0]?.version;
  if (!latest) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "0.6rem",
            letterSpacing: "0.06em",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          v{latest} · {t("更新日志", "Changelog")}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogTitle asChild>
          <div className="mb-4">
            <h2 className="text-xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
              {t("更新日志", "Changelog")}
              <span className="ml-2 text-muted-foreground text-base">v{latest}</span>
            </h2>
            <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
          </div>
        </DialogTitle>

        <div className="relative">
          {/* Vertical timeline rail */}
          <div
            className="absolute top-1 bottom-1"
            style={{ left: "5rem", width: 1, background: "var(--panel-border)" }}
          />

          <ol className="flex flex-col gap-4">
            {CHANGELOG.map((release) => (
              <li key={release.version} className="grid grid-cols-[5rem_1fr] items-baseline">
                {/* Left: version + date */}
                <div className="pr-4 text-right">
                  <div className="num-display text-foreground" style={{ fontSize: "0.78rem" }}>
                    v{release.version}
                  </div>
                  <div className="text-muted-foreground/60 num-display" style={{ fontSize: "0.58rem" }}>
                    {release.date}
                  </div>
                </div>

                {/* Right: one-line summary */}
                <div className="relative pl-5">
                  {/* Timeline dot */}
                  <span
                    className="absolute rounded-full"
                    style={{
                      left: "-0.26rem",
                      top: "0.36rem",
                      width: 7,
                      height: 7,
                      background: "rgb(215 187 114 / 92%)",
                      boxShadow: "0 0 0 3px var(--surface-subtle)",
                    }}
                  />
                  <span className="text-foreground" style={{ fontSize: "0.82rem", lineHeight: 1.6 }}>
                    {t(release.zh, release.en)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
