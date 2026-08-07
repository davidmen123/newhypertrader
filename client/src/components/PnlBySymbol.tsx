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
  const row = payload as PnlBySymbolRow | undefined;
  const fill = row && row.netPnl >= 0 ? PROFIT : LOSS;
  const showLabel = width >= 72 && height >= 42;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="var(--background)" strokeWidth={3} rx={1} />
      {showLabel && row && (
        <>
          <text x={x + 10} y={y + 25} fill="#fff" fontSize={Math.min(22, Math.max(12, width / 11))} fontWeight={600}>{row.symbol}</text>
          {height >= 68 && <text x={x + 10} y={y + 49} fill="#fff" fontSize={Math.min(16, Math.max(10, width / 16))}>{signed(row.netPnl)} USDC</text>}
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
    </section>
  );
}
