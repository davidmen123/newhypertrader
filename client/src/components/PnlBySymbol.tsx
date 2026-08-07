import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
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

const PROFIT = "oklch(58% 0.16 158)";
const LOSS = "oklch(62% 0.16 25)";

function fmt(value: number, digits = 2) {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${fmt(value)}`;
}

function TreemapContent(props: any) {
  const { x, y, width, height, payload } = props;
  if (![x, y, width, height].every((value) => Number.isFinite(value)) || width <= 0 || height <= 0) return null;
  const row = (payload ?? props) as PnlBySymbolRow | undefined;
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
          <text x={centerX} y={centerY - (height >= 70 ? valueSize * 0.75 : 0)} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={titleSize} fontWeight={600}>{row.symbol}</text>
          {height >= 70 && <text x={centerX} y={centerY + titleSize * 0.85} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={valueSize}>{signed(row.netPnl)} USDC</text>}
        </>
      )}
    </g>
  );
}

function PnlTooltip({ active, payload, lang }: { active?: boolean; payload?: Array<{ payload?: PnlBySymbolRow }>; lang: string }) {
  const row = payload?.[0]?.payload;
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

export default function PnlBySymbol({ accountId }: { accountId?: string } = {}) {
  const { lang } = useLang();
  const { data = [], isLoading, isFetching, refetch } = trpc.hyperliquid.pnlBySymbol.useQuery(
    { accountId },
    { refetchInterval: 120_000 },
  );
  const rows = data as PnlBySymbolRow[];
  const chartData = rows.map((row) => ({ ...row, size: Math.max(Math.abs(row.netPnl), 0.01) }));
  const total = rows.reduce((sum, row) => sum + row.netPnl, 0);

  return (
    <section className="glass-card px-4 py-5 sm:px-8 sm:py-7 fade-in">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-light sm:text-2xl" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {lang === "zh" ? "盈亏币对" : "Symbol PnL"}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
          <div className="mt-2 text-xs text-muted-foreground/60">
            {lang === "zh" ? "全周期净盈亏贡献 · 已实现 + 未实现 + 资金费 − 手续费" : "All-time PnL contribution · realized + unrealized + funding − fees"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="num-display text-xs text-muted-foreground">{signed(total)} USDC</span>
          <button type="button" onClick={() => refetch()} className="text-muted-foreground transition-colors hover:text-foreground" aria-label={lang === "zh" ? "刷新盈亏币对" : "Refresh symbol PnL"}>
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground/60">{lang === "zh" ? "计算盈亏币对中…" : "Calculating symbol PnL…"}</div>
      ) : chartData.length === 0 ? (
        <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground/60">{lang === "zh" ? "暂无币对盈亏数据" : "No symbol PnL data"}</div>
      ) : (
        <div className="h-[360px] w-full sm:h-[430px]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={chartData} dataKey="size" aspectRatio={1.8} stroke="var(--background)" content={<TreemapContent />}>
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
