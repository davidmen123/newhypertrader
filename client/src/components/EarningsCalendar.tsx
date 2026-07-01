import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw } from "lucide-react";

function TimeOfDayBadge({ time, lang }: { time: string | null; lang: string }) {
  if (!time) return <span style={{ color: "rgb(176 198 185 / 68%)" }}>—</span>;

  const isPre = time === "pre-market" || time === "before-open";
  const isPost = time === "post-market" || time === "after-close";

  const color = isPre
    ? "oklch(72% 0.12 210)"
    : isPost
    ? "oklch(72% 0.12 280)"
    : "oklch(65% 0.01 200)";

  const label = isPre
    ? lang === "zh" ? "盘前" : "Pre-Mkt"
    : isPost
    ? lang === "zh" ? "盘后" : "Post-Mkt"
    : time;

  return (
    <span
      style={{
        color,
        fontFamily: "DM Mono, monospace",
        fontSize: "0.68rem",
        letterSpacing: "0.04em",
      }}
    >
      {label}
    </span>
  );
}

function groupByDate(
  items: Array<{
    symbol: string;
    name: string;
    reportDate: string;
    estimate: string | null;
    currency: string;
    timeOfDay: string | null;
    timeOfDayUtc8: string | null;
  }>
) {
  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    if (!groups[item.reportDate]) groups[item.reportDate] = [];
    groups[item.reportDate].push(item);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function formatDate(dateStr: string, lang: string) {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    return d.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
      timeZone: "Asia/Shanghai",
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function EarningsCalendar() {
  const { lang } = useLang();

  const { data, isLoading, error, refetch, isFetching } =
    trpc.calendar.earningsCalendar.useQuery(undefined, {
      refetchInterval: 10 * 60 * 1000, // refresh every 10 min
    });

  const earnings = (data ?? []) as Array<{
    symbol: string;
    name: string;
    reportDate: string;
    estimate: string | null;
    currency: string;
    timeOfDay: string | null;
    timeOfDayUtc8: string | null;
  }>;
  const grouped = groupByDate(earnings);

  return (
    <div className="glass-card px-8 py-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="text-2xl font-light"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {lang === "zh" ? "美股财报日历" : "US Earnings Calendar"}
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
              ? "市值前100 · 未来 7 天 · UTC+8 时间"
              : "Top 100 US Large Caps · Next 7 Days · UTC+8"}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && (
        <div
          className="text-muted-foreground text-sm animate-pulse py-8 text-center"
          style={{ fontSize: "0.75rem", letterSpacing: "0.08em" }}
        >
          {lang === "zh" ? "加载中..." : "Loading..."}
        </div>
      )}

      {error && (
        <div className="text-loss text-sm py-4" style={{ fontSize: "0.75rem" }}>
          {error.message}
        </div>
      )}

      {!isLoading && earnings.length === 0 && (
        <div className="py-10 text-center">
          <div
            className="text-muted-foreground tracking-widest uppercase"
            style={{ fontSize: "0.72rem" }}
          >
            {lang === "zh"
              ? "未来 7 天暂无市值前100公司财报"
              : "No top-100 US large-cap earnings in the next 7 days"}
          </div>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <div key={date}>
              {/* Date header */}
              <div
                className="flex items-center gap-3 mb-3"
                style={{ borderBottom: "1px solid oklch(40% 0.02 200 / 25%)", paddingBottom: 6 }}
              >
                <span
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: "1rem",
                    color: "oklch(78% 0.015 200)",
                    fontStyle: "italic",
                  }}
                >
                  {formatDate(date, lang)}
                </span>
                <span
                  style={{
                    fontFamily: "DM Mono, monospace",
                    fontSize: "0.62rem",
                    color: "oklch(48% 0.01 200)",
                    letterSpacing: "0.08em",
                  }}
                >
                  {items.length} {lang === "zh" ? "家" : items.length === 1 ? "company" : "companies"}
                </span>
              </div>

              {/* Earnings table */}
              <div className="overflow-x-auto">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                  <thead>
                    <tr>
                      {[
                        lang === "zh" ? "代码" : "Symbol",
                        lang === "zh" ? "公司" : "Company",
                        lang === "zh" ? "EPS 预期" : "EPS Est.",
                        lang === "zh" ? "发布时间" : "Time",
                        lang === "zh" ? "UTC+8 说明" : "UTC+8 Note",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "4px 10px",
                            color: "oklch(42% 0.015 200)",
                            fontWeight: 400,
                            letterSpacing: "0.08em",
                            fontSize: "0.6rem",
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
                    {items.map((item, idx) => (
                      <tr
                        key={item.symbol}
                        style={{
                          borderBottom: "1px solid rgb(255 255 255 / 8%)",
                          background:
                            idx % 2 === 0 ? "transparent" : "rgb(255 255 255 / 4%)",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background =
                            "rgb(77 142 116 / 28%)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background =
                            idx % 2 === 0 ? "transparent" : "rgb(255 255 255 / 4%)";
                        }}
                      >
                        <td
                          style={{
                            padding: "7px 10px",
                            fontFamily: "DM Mono, monospace",
                            color: "oklch(78% 0.12 210)",
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.symbol}
                        </td>
                        <td
                          style={{
                            padding: "7px 10px",
                            color: "oklch(75% 0.015 200)",
                            maxWidth: 200,
                          }}
                        >
                          {item.name}
                        </td>
                        <td
                          style={{
                            padding: "7px 10px",
                            fontFamily: "DM Mono, monospace",
                            color: item.estimate
                              ? "oklch(72% 0.12 145)"
                              : "rgb(176 198 185 / 68%)",
                          }}
                        >
                          {item.estimate ? `$${item.estimate}` : "—"}
                        </td>
                        <td style={{ padding: "7px 10px" }}>
                          <TimeOfDayBadge time={item.timeOfDay} lang={lang} />
                        </td>
                        <td
                          style={{
                            padding: "7px 10px",
                            color: "oklch(52% 0.01 200)",
                            fontSize: "0.65rem",
                            maxWidth: 200,
                          }}
                        >
                          {item.timeOfDayUtc8 ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div
        className="mt-6 pt-4 flex flex-wrap gap-4"
        style={{ borderTop: "1px solid rgb(255 255 255 / 9%)" }}
      >
        {[
          {
            color: "oklch(72% 0.12 210)",
            label: lang === "zh" ? "盘前 = 美东 ~09:30 = UTC+8 ~21:30（前一日）" : "Pre-Mkt = ~09:30 ET = ~21:30 UTC+8 (prev day)",
          },
          {
            color: "oklch(72% 0.12 280)",
            label: lang === "zh" ? "盘后 = 美东 ~16:00 = UTC+8 ~04:00（次日）" : "Post-Mkt = ~16:00 ET = ~04:00 UTC+8 (next day)",
          },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "0.62rem", color: "oklch(48% 0.01 200)", letterSpacing: "0.04em" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
