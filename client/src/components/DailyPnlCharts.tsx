import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DailyRange = "24H" | "30D" | "90D" | "MAX" | "CUSTOM";
type PnlRow = { date: string; totalPnl: string };
type DailyPoint = { day: string; dailyPnl: number; cumulativePnl: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const PROFIT = "oklch(68% 0.15 145)";
const LOSS = "oklch(62% 0.15 25)";

function utc8Date(time: number) {
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseUtc8(value: string) {
  return new Date(`${value.replace(" ", "T")}:00+08:00`).getTime();
}

function dayLabel(day: string) {
  const [, month, date] = day.split("-");
  return `${month}/${date}`;
}

function fmt(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PnlTooltip({ active, payload, label, cumulative, lang }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string; cumulative?: boolean; lang: string }) {
  if (!active || !payload?.[0] || !label) return null;
  const value = Number(payload[0].value ?? 0);
  const title = cumulative ? (lang === "zh" ? "累计盈亏" : "Cumulative PnL") : (lang === "zh" ? "每日盈亏" : "Daily PnL");
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--background)", borderColor: "var(--panel-border)" }}>
      <div className="mb-1 text-muted-foreground/70">{dayLabel(label)}</div>
      <div style={{ color: value >= 0 ? PROFIT : LOSS }}>{title}: {value >= 0 ? "+" : ""}{fmt(value)} USDC</div>
    </div>
  );
}

export default function DailyPnlCharts({ accountId }: { accountId?: string }) {
  const { lang } = useLang();
  const [range, setRange] = useState<DailyRange>("30D");
  const [customStart, setCustomStart] = useState(() => utc8Date(Date.now() - 29 * DAY_MS));
  const [customEnd, setCustomEnd] = useState(() => utc8Date(Date.now()));
  const startDate = useMemo(() => {
    if (range === "MAX") return undefined;
    if (range === "CUSTOM") return customStart || undefined;
    const days = range === "24H" ? 1 : range === "30D" ? 30 : 90;
    return utc8Date(Date.now() - days * DAY_MS);
  }, [customStart, range]);
  const endDate = range === "CUSTOM" ? customEnd || undefined : undefined;
  const queryStartDate = startDate ? utc8Date(parseUtc8(`${startDate} 00:00`) - DAY_MS) : undefined;
  const { data: accountHistory = [] } = trpc.hyperliquid.pnlHistory.useQuery(
    { accountId, limit: 1000, rebase: false },
    { staleTime: 60_000, refetchOnWindowFocus: false },
  );
  const earliestDate = accountHistory[0]?.date ? utc8Date(parseUtc8(accountHistory[0].date)) : undefined;
  useEffect(() => {
    if (!earliestDate) return;
    if (customStart < earliestDate) setCustomStart(earliestDate);
    if (customEnd < earliestDate) setCustomEnd(utc8Date(Date.now()));
  }, [customEnd, customStart, earliestDate]);

  const { data: history = [], isLoading, isFetching, refetch } = trpc.hyperliquid.pnlHistory.useQuery(
    { accountId, startDate: queryStartDate, endDate, limit: 1000, rebase: false },
    { refetchInterval: 120_000 },
  );
  const points = useMemo<DailyPoint[]>(() => {
    const rows = (history as PnlRow[])
      .map((row) => ({ time: parseUtc8(row.date), day: utc8Date(parseUtc8(row.date)), pnl: Number(row.totalPnl) }))
      .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.pnl))
      .sort((a, b) => a.time - b.time);
    const lastByDay = new Map<string, { time: number; pnl: number }>();
    for (const row of rows) lastByDay.set(row.day, { time: row.time, pnl: row.pnl });
    const selectedStart = startDate ? parseUtc8(`${startDate} 00:00`) : Number.MIN_SAFE_INTEGER;
    const selectedEnd = endDate ? parseUtc8(`${endDate} 23:59`) : Number.MAX_SAFE_INTEGER;
    const selected = Array.from(lastByDay.entries())
      .filter(([day]) => {
        const time = parseUtc8(`${day} 00:00`);
        return time >= selectedStart && time <= selectedEnd;
      })
      .sort(([a], [b]) => a.localeCompare(b));
    let previousPnl: number | null = null;
    for (const row of rows) {
      if (row.time < selectedStart) previousPnl = row.pnl;
    }
    let cumulative = 0;
    return selected.map(([day, row]) => {
      const dailyPnl = previousPnl == null ? 0 : row.pnl - previousPnl;
      cumulative += dailyPnl;
      previousPnl = row.pnl;
      return { day, dailyPnl, cumulativePnl: cumulative };
    });
  }, [endDate, history, startDate]);

  const labels = lang === "zh"
    ? { daily: "每日账户盈亏", cumulative: "累计盈亏", range: "周期", noData: "该区间暂无每日盈亏数据" }
    : { daily: "Daily Account PnL", cumulative: "Cumulative PnL", range: "Range", noData: "No daily PnL data for this range" };
  const rangeOptions: Array<{ key: DailyRange; label: string }> = lang === "zh"
    ? [{ key: "24H", label: "24H" }, { key: "30D", label: "30D" }, { key: "90D", label: "90D" }, { key: "MAX", label: "MAX" }, { key: "CUSTOM", label: "自定义" }]
    : [{ key: "24H", label: "24H" }, { key: "30D", label: "30D" }, { key: "90D", label: "90D" }, { key: "MAX", label: "MAX" }, { key: "CUSTOM", label: "Custom" }];

  return (
    <section className="glass-card px-4 py-5 sm:px-8 sm:py-7 fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-light sm:text-2xl" style={{ fontFamily: "Cormorant Garamond, serif" }}>{lang === "zh" ? "每日盈亏" : "Daily PnL"}</h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground tracking-widest" style={{ fontSize: "0.62rem" }}>{labels.range}</span>
          {rangeOptions.map((item) => (
            <button key={item.key} type="button" onClick={() => setRange(item.key)} className={`pill-tab ${range === item.key ? "active" : ""}`} style={{ height: "1.75rem", padding: "0.25rem 0.7rem", fontSize: "0.64rem" }}>{item.label}</button>
          ))}
        </div>
      </div>
      {range === "CUSTOM" && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <input type="date" value={customStart} min={earliestDate} max={customEnd || undefined} onChange={(event) => setCustomStart(earliestDate && event.target.value < earliestDate ? earliestDate : event.target.value)} className="h-7 w-[118px] rounded-md border border-input bg-transparent px-1.5 text-[0.68rem] text-foreground" aria-label="自定义开始日期" />
          <span className="text-xs text-muted-foreground">—</span>
          <input type="date" value={customEnd} min={customStart || earliestDate} onChange={(event) => setCustomEnd(event.target.value < customStart ? customStart : event.target.value)} className="h-7 w-[118px] rounded-md border border-input bg-transparent px-1.5 text-[0.68rem] text-foreground" aria-label="自定义结束日期" />
          <button type="button" onClick={() => refetch()} className="text-muted-foreground hover:text-foreground" aria-label="刷新每日盈亏"><span className={isFetching ? "inline-block animate-spin" : "inline-block"}>↻</span></button>
        </div>
      )}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground animate-pulse">{lang === "zh" ? "加载每日盈亏中…" : "Loading daily PnL…"}</div>
      ) : points.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">{labels.noData}</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            { title: labels.daily, key: "dailyPnl" as const, cumulative: false },
            { title: labels.cumulative, key: "cumulativePnl" as const, cumulative: true },
          ].map((chart) => (
            <div key={chart.key} className="min-w-0">
              <div className="mb-2 text-muted-foreground/70" style={{ fontSize: "0.72rem" }}>{chart.title}</div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={points} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                    <CartesianGrid stroke="rgb(117 160 148 / 14%)" vertical={false} strokeDasharray="2 8" />
                    <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fill: "var(--text-soft)", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "var(--panel-border)" }} minTickGap={28} />
                    <YAxis tick={{ fill: "var(--text-soft)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(value)}`} width={48} />
                    <ReferenceLine y={0} stroke="var(--text-soft)" strokeOpacity={0.45} />
                    <Tooltip content={<PnlTooltip cumulative={chart.cumulative} lang={lang} />} cursor={{ fill: "var(--surface-subtle)" }} />
                    <Bar dataKey={chart.key} radius={[2, 2, 0, 0]}>
                      {points.map((point) => <Cell key={`${chart.key}-${point.day}`} fill={point[chart.key] >= 0 ? PROFIT : LOSS} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
