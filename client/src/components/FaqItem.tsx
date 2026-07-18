import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Single collapsible Q&A card, shared by the full FAQ page and the homepage
// FaqSection so both render identical styling and behavior.
export default function FaqItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="glass-card px-4 sm:px-6 fade-in" style={{ overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-4 text-left"
        style={{ background: "none", border: "none", cursor: "pointer" }}
        aria-expanded={open}
      >
        <span className="text-foreground" style={{ fontSize: "0.95rem", fontWeight: 500 }}>{q}</span>
        <ChevronDown
          size={16}
          className="text-muted-foreground"
          style={{ transition: "transform 0.25s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}
        />
      </button>
      <div style={{ overflow: "hidden", maxHeight: open ? "400px" : "0px", transition: "max-height 0.3s ease" }}>
        <p className="pb-4" style={{ fontSize: "0.88rem", lineHeight: 1.9, color: "var(--text-soft)" }}>{a}</p>
      </div>
    </div>
  );
}
