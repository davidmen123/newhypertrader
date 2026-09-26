import { useMemo, useState } from "react";
import { ExternalLink, Info, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

type ScannerMarket = "stocks" | "crypto";
type ScannerMode = "consolidation" | "bottom";

type ScannerSettings = {
  daysToLookback: number;
  consolidationPercentage: number;
  minPrice: number;
  maxPrice: number;
  minVolume: number;
};

const DEFAULTS: Record<ScannerMarket, Record<ScannerMode, ScannerSettings>> = {
  stocks: {
    consolidation: { daysToLookback: 22, consolidationPercentage: 10, minPrice: 30, maxPrice: 10_000, minVolume: 0 },
    bottom: { daysToLookback: 90, consolidationPercentage: 30, minPrice: 30, maxPrice: 10_000, minVolume: 0 },
  },
  crypto: {
    consolidation: { daysToLookback: 22, consolidationPercentage: 10, minPrice: 0, maxPrice: 1_000_000, minVolume: 5_000_000 },
    bottom: { daysToLookback: 90, consolidationPercentage: 30, minPrice: 0, maxPrice: 1_000_000, minVolume: 5_000_000 },
  },
};

const FUTURES_VOLUME_OPTIONS = [
  { value: 0, label: "不限制" },
  { value: 1_000_000, label: "≥ 100 万 U" },
  { value: 5_000_000, label: "≥ 500 万 U" },
  { value: 10_000_000, label: "≥ 1,000 万 U" },
  { value: 30_000_000, label: "≥ 3,000 万 U" },
  { value: 100_000_000, label: "≥ 1 亿 U" },
];

function formatNumber(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits });
}

function formatPrice(value: number) {
  if (value >= 500) return formatNumber(value, 0);
  if (value >= 1) return formatNumber(value, 2);
  return formatNumber(value, 6);
}

function NumericField({ label, value, min = 0, max, step = 1, onChange }: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="min-w-[8rem] flex-1 space-y-1.5">
      <span className="block text-muted-foreground tracking-widest" style={{ fontSize: "0.59rem" }}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg bg-transparent px-3 py-2 outline-none transition-colors focus:border-foreground/40"
        style={{ border: "1px solid var(--panel-border)", color: "var(--foreground)", fontSize: "0.72rem" }}
      />
    </label>
  );
}

export default function MarketScanner() {
  const [market, setMarket] = useState<ScannerMarket>("stocks");
  const [mode, setMode] = useState<ScannerMode>("consolidation");
  const [drafts, setDrafts] = useState(DEFAULTS);
  const [applied, setApplied] = useState(DEFAULTS);
  const draft = drafts[market][mode];
  const queryInput = useMemo(() => ({ market, mode, ...applied[market][mode] }), [applied, market, mode]);
  const { data, isLoading, isFetching, error, refetch } = trpc.marketScanner.scan.useQuery(queryInput, {
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const updateDraft = (key: keyof ScannerSettings, value: number) => {
    setDrafts((current) => ({
      ...current,
      [market]: {
        ...current[market],
        [mode]: { ...current[market][mode], [key]: Number.isFinite(value) ? value : 0 },
      },
    }));
  };

  const runScan = () => {
    setApplied((current) => ({
      ...current,
      [market]: { ...current[market], [mode]: { ...drafts[market][mode] } },
    }));
  };

  return (
    <div className="space-y-5">
      <div className="glass-card px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap gap-1 rounded-lg p-1" style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}>
              {([[
                "stocks", "NASDAQ 股票",
              ], [
                "crypto", "USDⓈ-M 合约",
              ]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMarket(key)}
                  className="rounded-md px-5 py-2 transition-colors"
                  style={{
                    color: market === key ? "var(--foreground)" : "var(--text-soft)",
                    background: market === key ? "var(--background)" : "transparent",
                    boxShadow: market === key ? "0 2px 10px rgb(0 0 0 / 12%)" : "none",
                    fontSize: "0.72rem",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1 rounded-lg p-1" style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}>
              {([[
                "consolidation", "普通模式",
              ], [
                "bottom", "底部箱体模式",
              ]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className="rounded-md px-4 py-1.5 transition-colors"
                  style={{
                    color: mode === key ? "var(--foreground)" : "var(--text-soft)",
                    background: mode === key ? "var(--background)" : "transparent",
                    boxShadow: mode === key ? "0 2px 10px rgb(0 0 0 / 12%)" : "none",
                    fontSize: "0.68rem",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-3 max-w-2xl text-muted-foreground/65 leading-relaxed" style={{ fontSize: "0.68rem" }}>
              {mode === "bottom"
                ? "要求当前价格相对过去250日最高收盘价至少回撤60%，并在最近设定天数内形成箱体；箱体宽度和成交额仍可调整。"
                : "按 PKScreener 原版 Consolidation 规则筛选：最近 N 根日线收盘价区间不超过设定百分比。这里只识别盘整，不判断底部、突破方向或买卖时点。"}
              {" 合约会扫描全部达到所选 24 小时 USDT 成交额门槛的标的。"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground/60" style={{ fontSize: "0.64rem" }}>
            <Info size={12} />
            {mode === "bottom" ? "底部模式：90 日 · 30% · 回撤≥60%" : "普通模式：1D · 22 日 · 10%"}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <NumericField label="回看天数" value={draft.daysToLookback} min={5} max={250} onChange={(value) => updateDraft("daysToLookback", value)} />
          <NumericField label="最大箱体宽度 (%)" value={draft.consolidationPercentage} min={0.1} max={50} step={0.1} onChange={(value) => updateDraft("consolidationPercentage", value)} />
          <NumericField label="最低价格" value={draft.minPrice} min={0} step={0.01} onChange={(value) => updateDraft("minPrice", value)} />
          <NumericField label="最高价格" value={draft.maxPrice} min={0.01} step={1} onChange={(value) => updateDraft("maxPrice", value)} />
          {market === "stocks" ? (
            <NumericField label="最低当日成交量（股）" value={draft.minVolume} min={0} step={1} onChange={(value) => updateDraft("minVolume", value)} />
          ) : (
            <label className="min-w-[11rem] flex-1 space-y-1.5">
              <span className="block text-muted-foreground tracking-widest" style={{ fontSize: "0.59rem" }}>最低24H成交额（USDT）</span>
              <select
                value={draft.minVolume}
                onChange={(event) => updateDraft("minVolume", Number(event.target.value))}
                className="w-full rounded-lg bg-transparent px-3 py-2 outline-none"
                style={{ border: "1px solid var(--panel-border)", color: "var(--foreground)", fontSize: "0.72rem" }}
              >
                {FUTURES_VOLUME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={runScan}
            disabled={isFetching || draft.maxPrice < draft.minPrice}
            className="rounded-lg px-5 py-2 transition-colors disabled:opacity-40"
            style={{ border: "1px solid var(--panel-border)", background: "var(--surface-subtle)", fontSize: "0.72rem" }}
          >
            {isFetching ? "扫描中…" : "开始扫描"}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            title="重新请求（服务端结果最多缓存 30 分钟）"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card px-8 py-20 text-center text-sm text-muted-foreground animate-pulse">
          正在读取并扫描 {market === "stocks" ? "NASDAQ" : "全部符合成交额门槛的 Binance USDⓈ-M 合约"} 日线数据…
        </div>
      ) : error ? (
        <div className="glass-card px-8 py-16 text-center">
          <div className="text-sm" style={{ color: "oklch(62% 0.15 25)" }}>扫描暂时失败</div>
          <div className="mt-2 text-xs text-muted-foreground">{error.message}</div>
          <button type="button" onClick={() => refetch()} className="mt-4 underline underline-offset-4 text-xs text-muted-foreground hover:text-foreground">重新扫描</button>
        </div>
      ) : data ? (
        <div className="glass-card overflow-hidden">
          <div className="grid grid-cols-2 gap-px border-b sm:grid-cols-5" style={{ borderColor: "var(--panel-border)", background: "var(--panel-border)" }}>
            {[
              ["扫描范围", data.universeLabel],
              [market === "crypto" ? "成交额达标" : "价格达标", `${data.candidateCount} / ${data.universeSize} 个`],
              ["参与扫描", `${data.scannedCount} 个`],
              ["符合条件", `${data.matchedCount} 个`],
              ["数据源", data.source],
            ].map(([label, value]) => (
              <div key={label} className="px-5 py-4" style={{ background: "var(--background)" }}>
                <div className="text-muted-foreground tracking-widest" style={{ fontSize: "0.58rem" }}>{label}</div>
                <div className="mt-1.5" style={{ fontSize: "0.78rem" }}>{value}</div>
              </div>
            ))}
          </div>

          {data.results.length === 0 ? (
            <div className="px-6 py-20 text-center text-sm text-muted-foreground">
              {mode === "bottom" ? "当前参数下没有符合底部箱体条件的标的" : "当前参数下没有符合盘整条件的标的"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground" style={{ fontSize: "0.62rem", borderBottom: "1px solid var(--panel-border)" }}>
                    <th className="px-5 py-3 font-normal">排名</th>
                    <th className="px-4 py-3 font-normal">标的</th>
                    <th className="px-4 py-3 text-right font-normal">最新价</th>
                    <th className="px-4 py-3 text-right font-normal">箱体宽度</th>
                    {mode === "bottom" && <>
                      <th className="px-4 py-3 text-right font-normal">距250日高点回撤</th>
                      <th className="px-4 py-3 text-right font-normal">250日区间位置</th>
                    </>}
                    <th className="px-4 py-3 text-right font-normal">箱底</th>
                    <th className="px-4 py-3 text-right font-normal">箱顶</th>
                    <th className="px-4 py-3 text-right font-normal">当日涨跌</th>
                    <th className="px-5 py-3 text-right font-normal">{market === "stocks" ? "平均成交量" : "平均成交额（U）"}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((item, index) => (
                    <tr key={item.symbol} style={{ borderBottom: "1px solid var(--panel-border)" }}>
                      <td className="px-5 py-3 text-muted-foreground num-display" style={{ fontSize: "0.68rem" }}>{index + 1}</td>
                      <td className="px-4 py-3">
                        <a href={item.chartUrl} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1.5 hover:text-foreground">
                          <span>
                            <span className="block font-medium" style={{ fontSize: "0.75rem" }}>{item.symbol}</span>
                            <span className="block max-w-[220px] truncate text-muted-foreground/60" style={{ fontSize: "0.6rem" }}>{item.name}</span>
                          </span>
                          <ExternalLink size={11} className="text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right num-display" style={{ fontSize: "0.72rem" }}>{formatPrice(item.lastPrice)}</td>
                      <td className="px-4 py-3 text-right num-display" style={{ color: "oklch(68% 0.15 145)", fontSize: "0.72rem" }}>{item.rangePct.toFixed(1)}%</td>
                      {mode === "bottom" && <>
                        <td className="px-4 py-3 text-right num-display" style={{ color: "oklch(68% 0.15 145)", fontSize: "0.72rem" }}>{item.drawdownPct?.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-right num-display" style={{ fontSize: "0.72rem" }}>{item.longTermPositionPct?.toFixed(1)}%</td>
                      </>}
                      <td className="px-4 py-3 text-right num-display" style={{ fontSize: "0.72rem" }}>{formatPrice(item.lowClose)}</td>
                      <td className="px-4 py-3 text-right num-display" style={{ fontSize: "0.72rem" }}>{formatPrice(item.highClose)}</td>
                      <td className="px-4 py-3 text-right num-display" style={{ color: (item.priceChangePct ?? 0) >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)", fontSize: "0.72rem" }}>
                        {item.priceChangePct == null ? "—" : `${item.priceChangePct >= 0 ? "+" : ""}${item.priceChangePct.toFixed(2)}%`}
                      </td>
                      <td className="px-5 py-3 text-right num-display text-muted-foreground" style={{ fontSize: "0.7rem" }}>{formatNumber(item.averageVolume, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-muted-foreground/60" style={{ fontSize: "0.6rem" }}>
            <span>{mode === "bottom" ? "按回撤幅度从大到小排序" : "按箱体宽度从窄到宽排序"} · {data.failedCount > 0 ? `${data.failedCount} 个标的读取失败` : "全部读取成功"}</span>
            <span>{new Date(data.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
          </div>
        </div>
      ) : null}

      <div className="px-2 text-center text-muted-foreground/50" style={{ fontSize: "0.6rem" }}>
        算法来源：PKScreener validateConsolidation（MIT）· 扫描结果仅供研究，不构成投资建议
      </div>
    </div>
  );
}
