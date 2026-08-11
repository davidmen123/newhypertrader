import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ResponsiveContainer, Tooltip as ChartTooltip, Treemap } from "recharts";

type PnlBySymbolRow = {
  symbol: string;
  realizedPnl: number;
  unrealizedPnl: number;
  fundingFee: number;
  fees: number;
  netPnl: number;
};
type SymbolRange = "24H" | "7D" | "30D" | "MAX" | "CUSTOM";
const DAY_MS = 24 * 60 * 60 * 1000;

const PROFIT = "oklch(58% 0.16 158)";
const LOSS = "oklch(62% 0.16 25)";

function fmt(value: number | null | undefined, digits = 2) {
  const safeValue = Number(value ?? 0);
  return (Number.isFinite(safeValue) ? safeValue : 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signed(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);
  return `${safeValue >= 0 ? "+" : ""}${fmt(safeValue)}`;
}

function displaySymbol(symbol: string) {
  const baseSymbol = symbol.replace(/[-_:/\\.]?(?:PERP|USDT|USDC)$/i, "");
  return baseSymbol || symbol;
}

function TreemapContent(props: any) {
  const { x, y, width, height, payload, name, index, rows } = props;
  if (![x, y, width, height].every((value) => Number.isFinite(value)) || width <= 0 || height <= 0) return null;
  const candidate = payload as Partial<PnlBySymbolRow> | undefined;
  const payloadRow = candidate && typeof candidate.symbol === "string" && Number.isFinite(Number(candidate.netPnl))
    ? candidate as PnlBySymbolRow
    : undefined;
  const row = payloadRow ?? (Array.isArray(rows)
    ? rows.find((item: PnlBySymbolRow) => item.symbol === name) ?? rows[index]
    : undefined);
  const fill = row && row.netPnl >= 0 ? PROFIT : LOSS;
  const showLabel = Boolean(row) && width >= 46 && height >= 44;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const titleSize = Math.min(24, Math.max(11, width / 10));
  const valueSize = Math.min(16, Math.max(9, width / 15));
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="var(--background)" strokeWidth={3} rx={1} />
      {showLabel && row && (
        <>
          <text x={centerX} y={centerY - (height >= 70 ? valueSize * 0.75 : 0)} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={titleSize} fontWeight={400}>{displaySymbol(row.symbol)}</text>
          {height >= 70 && <text x={centerX} y={centerY + titleSize * 0.85} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={valueSize} fontWeight={300}>{signed(row.netPnl)} USDC</text>}
        </>
      )}
    </g>
  );
}

function PnlTooltip({ active, payload, lang }: { active?: boolean; payload?: Array<{ payload?: PnlBySymbolRow }>; lang: string }) {
  const candidate = payload?.[0]?.payload;
  const row = candidate && typeof candidate.symbol === "string" && Number.isFinite(Number(candidate.netPnl)) ? candidate : undefined;
  if (!active || !row) return null;
  const label = (zh: string, en: string) => lang === "zh" ? zh : en;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--background)", borderColor: "var(--panel-border)" }}>
      <div className="mb-1 font-medium">{row.symbol}</div>
      <div style={{ color: row.netPnl >= 0 ? PROFIT : LOSS }}>{label("净盈亏", "Net PnL")}: {signed(row.netPnl)} USDC</div>
      <div className="text-muted-foreground">{label("已实现", "Realized")}: {signed(row.realizedPnl)} USDC</div>
      <div className="text-muted-foreground">{label("未实现", "Unrealized")}: {signed(row.unrealizedPnl)} USDC</div>
      <div className="text-muted-foreground">{label("资金费", "Funding")}: {signed(row.fundingFee)} USDC</div>
      <div className="text-muted-foreground">{label("手续费", "Fees")}: -{fmt(row.fees)} USDC</div>
    </div>
  );
}

function utc8Date(time: number) {
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function utc8Start(value: string) {
  return new Date(`${value}T00:00:00+08:00`).getTime();
}

function utc8End(value: string) {
  return new Date(`${value}T23:59:59.999+08:00`).getTime();
}

export default function PnlBySymbol({ accountId }: { accountId?: string } = {}) {
  const { lang } = useLang();
  const [range, setRange] = useState<SymbolRange>("MAX");
  const [customStart, setCustomStart] = useState(() => utc8Date(Date.now() - 29 * DAY_MS));
  const [customEnd, setCustomEnd] = useState(() => utc8Date(Date.now()));
  const queryRange = useMemo(() => {
    if (range === "CUSTOM") {
      return {
        startTime: customStart ? utc8Start(customStart) : undefined,
        endTime: customEnd ? utc8End(customEnd) : undefined,
        label: customStart || customEnd ? `${customStart || "起始"} 至 ${customEnd || "今"}` : "自定义",
      };
    }
    if (range === "MAX") return { startTime: undefined, endTime: undefined, label: "MAX" };
    const endTime = Date.now();
    const days = range === "24H" ? 1 : range === "7D" ? 7 : 30;
    return { startTime: endTime - days * DAY_MS, endTime, label: range };
  }, [customEnd, customStart, range]);
  const { data = [], isLoading, isFetching, refetch } = trpc.hyperliquid.pnlBySymbol.useQuery(
    { accountId, startTime: queryRange.startTime, endTime: queryRange.endTime },
    { refetchInterval: 120_000 },
  );
  const rows = data as PnlBySymbolRow[];
  const chartData = rows.map((row) => ({ ...row, name: row.symbol, size: Math.max(Math.abs(row.netPnl), 0.01) }));
  const total = rows.reduce((sum, row) => sum + row.netPnl, 0);

  return (
    <section className="glass-card px-4 py-5 sm:px-8 sm:py-7 fade-in">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-light sm:text-2xl" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {lang === "zh" ? "盈亏图谱" : "Symbol PnL"}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
          <div className="mt-2 text-xs text-muted-foreground/60">
            {lang === "zh"
              ? `${queryRange.label}净盈亏贡献 · 已实现 + 未实现 + 资金费 − 手续费`
              : `${queryRange.label} PnL contribution · realized + unrealized + funding − fees`}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-muted-foreground tracking-widest" style={{ fontSize: "0.62rem" }}>{lang === "zh" ? "周期" : "Range"}</span>
          {(["24H", "7D", "30D", "MAX", "CUSTOM"] as SymbolRange[]).map((item) => (
            <button key={item} type="button" onClick={() => setRange(item)} className={`pill-tab ${range === item ? "active" : ""}`} style={{ height: "1.75rem", padding: "0.25rem 0.7rem", fontSize: "0.64rem" }}>
              {item === "CUSTOM" ? (lang === "zh" ? "自定义" : "Custom") : item}
            </button>
          ))}
          <span className="num-display text-xs text-muted-foreground">{signed(total)} USDC</span>
          <button type="button" onClick={() => refetch()} className="text-muted-foreground transition-colors hover:text-foreground" aria-label={lang === "zh" ? "刷新盈亏图谱" : "Refresh symbol PnL"}>
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {range === "CUSTOM" && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <input type="date" value={customStart} max={customEnd || undefined} onChange={(event) => setCustomStart(event.target.value)} className="h-7 w-[118px] rounded-md border border-input bg-transparent px-1.5 text-[0.68rem] text-foreground" aria-label={lang === "zh" ? "盈亏图谱开始日期" : "Symbol PnL start date"} />
          <span className="text-xs text-muted-foreground">—</span>
          <input type="date" value={customEnd} min={customStart || undefined} onChange={(event) => setCustomEnd(event.target.value)} className="h-7 w-[118px] rounded-md border border-input bg-transparent px-1.5 text-[0.68rem] text-foreground" aria-label={lang === "zh" ? "盈亏图谱结束日期" : "Symbol PnL end date"} />
        </div>
      )}
      {isLoading ? (
        <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground/60">{lang === "zh" ? "计算盈亏图谱中…" : "Calculating symbol PnL…"}</div>
      ) : chartData.length === 0 ? (
        <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground/60">{lang === "zh" ? "暂无盈亏图谱数据" : "No symbol PnL data"}</div>
      ) : (
        <div className="h-[360px] w-full sm:h-[430px]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={chartData} dataKey="size" aspectRatio={1.8} stroke="var(--background)" content={<TreemapContent rows={chartData} />}>
              <ChartTooltip content={<PnlTooltip lang={lang} />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      )}
      {chartData.length > 0 && (
        <div className="mt-3 flex items-center gap-5 text-xs text-muted-foreground/70">
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3" style={{ background: PROFIT }} />{lang === "zh" ? "盈利" : "Profit"}</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3" style={{ background: LOSS }} />{lang === "zh" ? "亏损" : "Loss"}</span>
          <span className="ml-2 text-muted-foreground/50">{lang === "zh" ? "面积按净盈亏绝对值计算，标签保留正负号" : "Area uses absolute net PnL; labels retain the sign"}</span>
        </div>
      )}
    </section>
  );
}
