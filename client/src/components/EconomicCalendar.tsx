/**
 * EconomicCalendar
 * Fetches US economic events via backend tRPC proxy (avoids CORS & rate limiting).
 */
import { useLang } from "@/contexts/LangContext";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

function ImportanceBadge({ level }: { level: number }) {
  const styles =
    level === 3
      ? {
          bg: "oklch(55% 0.18 25 / 20%)",
          border: "oklch(55% 0.18 25 / 60%)",
          text: "oklch(72% 0.15 25)",
          label: "HIGH",
        }
      : level === 2
      ? {
          bg: "oklch(70% 0.14 80 / 15%)",
          border: "oklch(70% 0.14 80 / 50%)",
          text: "oklch(78% 0.12 80)",
          label: "MED",
        }
      : {
          bg: "oklch(50% 0.01 200 / 10%)",
          border: "oklch(50% 0.01 200 / 30%)",
          text: "oklch(55% 0.01 200)",
          label: "LOW",
        };

  return (
    <span
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        color: styles.text,
        fontSize: "0.58rem",
        letterSpacing: "0.08em",
        padding: "1px 6px",
        borderRadius: 4,
        fontFamily: "DM Mono, monospace",
        whiteSpace: "nowrap",
      }}
    >
      {styles.label}
    </span>
  );
}

export default function EconomicCalendar() {
  const { lang } = useLang();
  const [minImportance, setMinImportance] = useState(2);

  const { data, isLoading, error, refetch, isFetching } =
    trpc.calendar.economicCalendar.useQuery(undefined, {
      refetchInterval: 10 * 60 * 1000, // refresh every 10 min
    });

  const events = data ?? [];
  const filtered = events.filter((e) => e.importance >= minImportance);

  const filterLabels = {
    1: { zh: "全部", en: "All" },
    2: { zh: "中高", en: "Med+" },
    3: { zh: "高", en: "High" },
  };

  const colHeaders =
    lang === "zh"
      ? ["时间 (UTC+8)", "事件", "重要性", "预测值", "前值", "实际值"]
      : ["Time (UTC+8)", "Event", "Impact", "Forecast", "Previous", "Actual"];

  return (
    <div className="glass-card px-8 py-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="text-2xl font-light"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {lang === "zh" ? "美国经济数据日历" : "US Economic Calendar"}
          </h2>
          <div
            className="mt-2"
            style={{
              width: 40,
              height: 1,
              background: "rgb(215 187 114 / 62%)",
            }}
          />
          <p
            className="text-muted-foreground mt-2"
            style={{ fontSize: "0.68rem", letterSpacing: "0.06em" }}
          >
            {lang === "zh"
              ? "本周重要经济事件 · UTC+8 时间"
              : "This week's key events · UTC+8"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {([1, 2, 3] as const).map((level) => (
              <button
                key={level}
                onClick={() => setMinImportance(level)}
                className={`pill-tab ${minImportance === level ? "active" : ""}`}
                style={{ fontSize: "0.62rem", padding: "3px 10px" }}
              >
                {filterLabels[level][lang as "zh" | "en"]}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {isLoading && (
        <div
          className="text-muted-foreground animate-pulse py-8 text-center"
          style={{ fontSize: "0.75rem", letterSpacing: "0.08em" }}
        >
          {lang === "zh" ? "加载中…" : "Loading…"}
        </div>
      )}

      {error && (
        <div
          className="py-4"
          style={{ fontSize: "0.75rem", color: "oklch(60% 0.18 25)" }}
        >
          {lang === "zh" ? "加载失败：" : "Error: "}
          {error.message}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="py-10 text-center">
          <div
            className="text-muted-foreground tracking-widest uppercase"
            style={{ fontSize: "0.72rem" }}
          >
            {lang === "zh"
              ? "本周暂无符合条件的经济数据"
              : "No matching events this week"}
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.72rem",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid oklch(40% 0.02 200 / 30%)",
                }}
              >
                {colHeaders.map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      color: "rgb(190 190 186 / 76%)",
                      fontWeight: 400,
                      letterSpacing: "0.08em",
                      fontSize: "0.62rem",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((event, idx) => (
                <tr
                  key={event.id}
                  style={{
                    borderBottom: "1px solid rgb(255 255 255 / 9%)",
                    background:
                      idx % 2 === 0
                        ? "transparent"
                        : "rgb(255 255 255 / 4%)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      "rgb(77 142 116 / 28%)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      idx % 2 === 0
                        ? "transparent"
                        : "rgb(255 255 255 / 4%)";
                  }}
                >
                  <td
                    style={{
                      padding: "8px 10px",
                      fontFamily: "DM Mono, monospace",
                      color: "rgb(210 226 215 / 78%)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {event.dateUtc8}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      color:
                        event.importance === 3
                          ? "oklch(88% 0.015 200)"
                          : "oklch(78% 0.015 200)",
                      fontWeight: event.importance === 3 ? 500 : 400,
                      maxWidth: 300,
                    }}
                  >
                    {event.event}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <ImportanceBadge level={event.importance} />
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      fontFamily: "DM Mono, monospace",
                      color: "rgb(210 226 215 / 78%)",
                    }}
                  >
                    {event.forecast ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      fontFamily: "DM Mono, monospace",
                      color: "rgb(190 190 186 / 78%)",
                    }}
                  >
                    {event.previous ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      fontFamily: "DM Mono, monospace",
                      fontWeight: 600,
                      color: event.actual
                        ? "oklch(72% 0.12 145)"
                        : "rgb(176 198 185 / 68%)",
                    }}
                  >
                    {event.actual ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
