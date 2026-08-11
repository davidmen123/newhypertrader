import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DailyRange = "24H" | "30D" | "90D" | "MAX" | "CUSTOM";
type PnlRow = { date: string; totalPnl: string };
type TradeRow = {
  symbol: string;
  createdTime: string;
  execPnl: string;
  tradeSide?: string;
  fundingFee?: string;
  feeDetail?: Array<{ fee: string }>;
};
type DailyPoint = { day: string; dailyPnl: number; cumulativePnl: number };
type SymbolPnl = { symbol: string; pnl: number; absolutePnl: number };

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

function displaySymbol(symbol: string) {
  return symbol
    .replace(/-PERP$/i, "")
    .replace(/[-/]USDC$/i, "")
    .replace(/[-/]USDT0?$/i, "");
}

function tradeNetPnl(trade: TradeRow) {
  const realized = Number(trade.execPnl ?? 0) || 0;
  const funding = Number(trade.fundingFee ?? 0) || 0;
  const fees = (trade.feeDetail ?? []).reduce((sum, item) => sum + Math.abs(Number(item.fee ?? 0) || 0), 0);
  return realized + funding - fees;
}

function isCompletedTrade(trade: TradeRow) {
  const direction = String(trade.tradeSide ?? "").toLowerCase();
  if (direction.includes("close")) return true;
  // Spot fills do not always carry an explicit Close direction. Only accept
  // them when the exchange reports a non-zero realized PnL; an opening fill
  // with fees alone must not appear in the realized-PnL breakdown.
  const isSpot = !/-PERP$/i.test(trade.symbol);
  return isSpot && Math.abs(Number(trade.execPnl ?? 0) || 0) > 0.000001;
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

function PieTooltip({ active, payload, lang, totalAbsPnl }: { active?: boolean; payload?: Array<{ payload?: SymbolPnl }>; lang: string; totalAbsPnl: number }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--background)", borderColor: "var(--panel-border)" }}>
      <div className="mb-1 text-muted-foreground/70">{item.symbol}</div>
      <div style={{ color: item.pnl >= 0 ? PROFIT : LOSS }}>{lang === "zh" ? "净盈亏" : "Net PnL"}: {item.pnl >= 0 ? "+" : ""}{fmt(item.pnl)} USDC</div>
      <div className="mt-1 text-muted-foreground/70">{lang === "zh" ? "占比" : "Share"}: {totalAbsPnl > 0 ? (item.absolutePnl / totalAbsPnl * 100).toFixed(1) : "0.0"}%</div>
    </div>
  );
}

export default function DailyPnlCharts({ accountId }: { accountId?: string }) {
  const { lang } = useLang();
  const [range, setRange] = useState<DailyRange>("30D");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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
  const { data: tradeHistory } = trpc.hyperliquid.tradeHistory.useQuery(
    { accountId, startDate, endDate, category: "ALL", limit: 10000, allHistory: true },
    { staleTime: 60_000, refetchOnWindowFocus: false },
  );
  const points = useMemo<DailyPoint[]>(() => {
    const allTimePnlByDay = new Map<string, number>();
    for (const row of (accountHistory as PnlRow[])) {
      const time = parseUtc8(row.date);
      const pnl = Number(row.totalPnl);
      if (Number.isFinite(time) && Number.isFinite(pnl)) {
        allTimePnlByDay.set(utc8Date(time), pnl);
      }
    }
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
    // The cumulative chart must reconcile with the daily chart. The exchange
    // can return the selected range and all-time range on different sampling
    // grids, so reading each chart's PnL independently can create impossible
    // jumps (for example, a near-zero daily bar beside a -700 cumulative bar).
    // Use the all-time series only for the anchor before the visible range,
    // then carry the selected daily changes forward one day at a time.
    const firstSelectedDay = selected[0]?.[0];
    let cumulativePnl = 0;
    if (firstSelectedDay) {
      let hasAnchor = false;
      allTimePnlByDay.forEach((pnl, day) => {
        if (day < firstSelectedDay) {
          cumulativePnl = pnl;
          hasAnchor = true;
        }
      });
      if (!hasAnchor) cumulativePnl = allTimePnlByDay.get(firstSelectedDay) ?? selected[0][1].pnl;
    }

    return selected.map(([day, row]) => {
      const dailyPnl = previousPnl == null ? 0 : row.pnl - previousPnl;
      previousPnl = row.pnl;
      cumulativePnl += dailyPnl;
      return { day, dailyPnl, cumulativePnl };
    });
  }, [accountHistory, endDate, history, startDate]);

  useEffect(() => {
    if (selectedDay && !points.some((point) => point.day === selectedDay)) setSelectedDay(null);
  }, [points, selectedDay]);

  const selectedSymbolPnl = useMemo<SymbolPnl[]>(() => {
    if (!selectedDay) return [];
    const grouped = new Map<string, number>();
    for (const trade of (tradeHistory?.trades ?? []) as TradeRow[]) {
      if (utc8Date(Number(trade.createdTime)) !== selectedDay) continue;
      if (!isCompletedTrade(trade)) continue;
      const symbol = displaySymbol(trade.symbol) || trade.symbol;
      grouped.set(symbol, (grouped.get(symbol) ?? 0) + tradeNetPnl(trade));
    }
    return Array.from(grouped.entries())
      .map(([symbol, pnl]) => ({ symbol, pnl, absolutePnl: Math.abs(pnl) }))
      .filter((item) => item.absolutePnl > 0.000001)
      .sort((a, b) => b.absolutePnl - a.absolutePnl);
  }, [selectedDay, tradeHistory?.trades]);

  const selectedTotalAbsPnl = selectedSymbolPnl.reduce((sum, item) => sum + item.absolutePnl, 0);

  const labels = lang === "zh"
    ? { daily: "每日账户总盈亏", cumulative: "累计账户总盈亏", range: "周期", noData: "该区间暂无每日盈亏数据", dailyNote: "包含已实现盈亏、未实现盈亏变化及账户级费用/收入" }
    : { daily: "Daily Total Account PnL", cumulative: "Cumulative Total Account PnL", range: "Range", noData: "No daily PnL data for this range", dailyNote: "Includes realized PnL, changes in unrealized PnL, and account-level fees/income" };
  const rangeOptions: Array<{ key: DailyRange; label: string }> = lang === "zh"
    ? [{ key: "24H", label: "24H" }, { key: "30D", label: "30D" }, { key: "90D", label: "90D" }, { key: "MAX", label: "MAX" }, { key: "CUSTOM", label: "自定义" }]
    : [{ key: "24H", label: "24H" }, { key: "30D", label: "30D" }, { key: "90D", label: "90D" }, { key: "MAX", label: "MAX" }, { key: "CUSTOM", label: "Custom" }];

  return (
    <section className="glass-card px-4 py-5 sm:px-8 sm:py-7 fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-light sm:text-2xl" style={{ fontFamily: "Cormorant Garamond, serif" }}>{lang === "zh" ? "每日盈亏" : "Daily PnL"}</h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
          <div className="mt-2 text-muted-foreground/60" style={{ fontSize: "0.65rem" }}>{labels.dailyNote}</div>
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
            { title: labels.daily, key: "dailyPnl" as const, cumulative: false, interactive: true },
            { title: labels.cumulative, key: "cumulativePnl" as const, cumulative: true },
          ].map((chart) => (
            <div key={chart.key} className="min-w-0">
              <div className="mb-2 text-muted-foreground/70" style={{ fontSize: "0.72rem" }}>{chart.title}</div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={points}
                    margin={{ top: 8, right: 8, left: 4, bottom: 8 }}
                    onMouseMove={chart.interactive ? (state) => {
                      if (state?.activeLabel) setSelectedDay(String(state.activeLabel));
                    } : undefined}
                  >
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
      {selectedDay && (
        <div className="mt-7 border-t border-border/30 pt-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-muted-foreground/70" style={{ fontSize: "0.68rem" }}>{lang === "zh" ? "当日交易盈亏分布" : "Daily Trade PnL Distribution"}</div>
              <div className="mt-1 text-lg font-light">{dayLabel(selectedDay)}</div>
            </div>
            <div className="text-xs text-muted-foreground/70">{lang === "zh" ? "鼠标悬停每日盈亏柱查看" : "Hover a daily PnL bar to switch day"}</div>
          </div>
          <div className="mb-4 text-xs text-muted-foreground/60">
            {lang === "zh" ? "仅统计当日已平仓交易，未包含未平仓持仓的浮动盈亏，因此合计值可能与上方账户总盈亏不同。" : "Realized closed-trade PnL only; unrealized PnL from open positions is excluded, so the total may differ from the account PnL above."}
          </div>
          {selectedSymbolPnl.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground/60">{lang === "zh" ? "当日暂无已实现交易盈亏" : "No realized trade PnL for this day"}</div>
          ) : (
            <div className="grid items-center gap-6 lg:grid-cols-[minmax(220px,0.8fr)_minmax(260px,1.2fr)]">
              <div className="h-[230px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={selectedSymbolPnl} dataKey="absolutePnl" nameKey="symbol" cx="50%" cy="50%" outerRadius={86} paddingAngle={2} stroke="var(--background)" strokeWidth={2}>
                      {selectedSymbolPnl.map((item) => <Cell key={item.symbol} fill={item.pnl >= 0 ? PROFIT : LOSS} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip lang={lang} totalAbsPnl={selectedTotalAbsPnl} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {selectedSymbolPnl.map((item) => (
                  <div key={item.symbol} className="flex items-center justify-between gap-4 rounded-md border border-border/20 px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.pnl >= 0 ? PROFIT : LOSS }} />
                      <span className="truncate">{item.symbol}</span>
                    </div>
                    <span className="num-display shrink-0" style={{ color: item.pnl >= 0 ? PROFIT : LOSS }}>{item.pnl >= 0 ? "+" : ""}{fmt(item.pnl)} USDC</span>
                  </div>
                ))}
                <div className="border-t border-border/30 pt-2 text-right text-xs text-muted-foreground/70">
                  {lang === "zh" ? "按盈亏绝对值占比" : "Sized by absolute PnL"}: {fmt(selectedTotalAbsPnl)} USDC
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
