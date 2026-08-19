import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw, Search, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Category = "ALL" | "PERP" | "SPOT";

type HyperliquidFill = {
  execId: string;
  orderId: string;
  category: string;
  symbol: string;
  orderType: string;
  side: string;
  execPrice: string;
  execQty: string;
  execValue: string;
  tradeScope: string;
  tradeSide: string;
  feeDetail?: Array<{ feeCoin: string; fee: string }>;
  createdTime: string;
  execPnl: string;
  fundingFee?: string;
  closeMethod?: string;
  trendContext?: {
    status: "ready" | "insufficient";
    reason?: "entry_history" | "four_hour_history";
    entryDirection?: "long" | "short";
    oneDayTrend?: "up" | "down" | "range";
    fourHourTrend?: "up" | "down" | "range";
    ema20DistanceAtr?: number;
    ema20DistancePct?: number;
    ema20SlopePct?: number;
    basis?: "multi_timeframe" | "one_day_ema20_fallback" | "four_hour" | "ema20_fallback";
    relation?: "strong_trend" | "trend" | "mixed" | "strong_counter" | "counter" | "unclear";
    entryStyle?: "pullback" | "chasing" | "normal" | "bottom_fishing" | "top_picking" | "unclear";
  };
};

function num(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function displayToken(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase() === "USDT0" ? "USDT" : (value ?? "");
}

function fmt(value: string | number | null | undefined, decimals = 2) {
  const n = num(value);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function signed(value: string | number | null | undefined, decimals = 2) {
  const n = num(value);
  return `${n > 0 ? "+" : ""}${fmt(n, decimals)}`;
}

function pnlColor(value: string | number | null | undefined) {
  const n = num(value);
  if (n > 0) return "oklch(68% 0.15 145)";
  if (n < 0) return "oklch(62% 0.15 25)";
  return "var(--text-soft)";
}

function closeMethodLabel(method: string | null | undefined, lang: string) {
  const labels: Record<string, { zh: string; en: string }> = {
    preset_stop_loss: { zh: "预设止损", en: "Preset Stop" },
    preset_take_profit: { zh: "预设止盈", en: "Preset Take Profit" },
    preset_trigger: { zh: "预设触发", en: "Preset Trigger" },
    active_close: { zh: "主动平仓", en: "Manual Close" },
    liquidation: { zh: "强制平仓", en: "Liquidated" },
  };
  const label = labels[String(method ?? "")];
  if (!label) return "—";
  return lang === "zh" ? label.zh : label.en;
}

function closeMethodColor(method: string | null | undefined) {
  const value = String(method ?? "");
  if (value === "liquidation") return "oklch(62% 0.18 25)";
  if (value.includes("take_profit")) return "oklch(68% 0.15 145)";
  if (value.includes("stop_loss")) return "oklch(62% 0.15 25)";
  return "var(--text-soft)";
}

const PAGE_SIZE = 15;

export default function TradeHistory({
  accountId,
  showTotalTurnover = false,
  showTrendContext = false,
}: {
  accountId?: string;
  showTotalTurnover?: boolean;
  showTrendContext?: boolean;
} = {}) {
  const { lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [category, setCategory] = useState<Category>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loadAllHistory, setLoadAllHistory] = useState(false);

  const { data, isLoading, isFetching, refetch, error } = trpc.hyperliquid.tradeHistory.useQuery(
    {
      category,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: loadAllHistory ? 10000 : 100,
      allHistory: loadAllHistory,
      includeTrendContext: showTrendContext,
      accountId,
    },
    { refetchInterval: 120_000 }
  );

  const trades = (data?.trades ?? []) as HyperliquidFill[];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trades;
    return trades.filter((trade) =>
      [trade.symbol, trade.category, trade.side, trade.tradeSide, trade.orderType, closeMethodLabel(trade.closeMethod, lang)]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q))
    );
  }, [trades, search, lang]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageTrades = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalFees = filtered.reduce((sum, trade) => {
    return sum + (trade.feeDetail ?? []).reduce((feeSum, item) => feeSum + Math.abs(num(item.fee)), 0);
  }, 0);
  const totalTurnover = filtered.reduce((sum, trade) => {
    const reportedValue = num(trade.execValue);
    const calculatedValue = Math.abs(num(trade.execPrice) * num(trade.execQty));
    return sum + Math.abs(reportedValue || calculatedValue);
  }, 0);
  const totalPnl = filtered.reduce((sum, trade) => sum + num(trade.execPnl), 0);
  const totalFunding = num((data as { totalFundingUsdc?: number } | undefined)?.totalFundingUsdc);

  const fmtTime = (ts: string) =>
    new Date(Number(ts)).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  const changeCategory = (value: Category) => {
    setCategory(value);
    setPage(0);
  };

  const changeDate = (type: "start" | "end", value: string) => {
    if (type === "start") setStartDate(value);
    else setEndDate(value);
    setPage(0);
  };

  const trendStateLabel = (state: "up" | "down" | "range" | undefined) => {
    if (state === "up") return t("上涨", "Uptrend");
    if (state === "down") return t("下跌", "Downtrend");
    if (state === "range") return t("震荡", "Range");
    return t("历史不足", "Unavailable");
  };

  const trendDisplay = (trade: HyperliquidFill) => {
    const context = trade.trendContext;
    if (!context) return null;
    if (context.status === "insufficient") {
      const conclusion = context.reason === "entry_history"
        ? t("交易所返回的历史成交不足以还原该轮持仓的首次开仓，不能可靠判断。", "The exchange fill history cannot reconstruct this position's first entry reliably.")
        : t("开仓前连最低要求的4H EMA20历史也不足，不能可靠判断。", "There are not enough completed 4H candles even for the minimum EMA20 fallback.");
      return { label: t("无法判断", "Unavailable"), color: "var(--text-soft)", conclusion };
    }
    const relationLabels = {
      strong_trend: t("强顺势", "Strong trend"),
      trend: t("顺势", "With trend"),
      mixed: t("4H逆势 · 日线顺势", "4H counter · 1D aligned"),
      strong_counter: t("强逆势", "Strong counter"),
      counter: t("逆势", "Countertrend"),
      unclear: t("震荡", "Range"),
    } as const;
    const styleLabels = {
      pullback: t("回踩", "Pullback"),
      chasing: context.entryDirection === "long" ? t("追涨", "Chasing long") : t("追空", "Chasing short"),
      normal: t("常规入场", "Regular entry"),
      bottom_fishing: t("抄底", "Bottom fishing"),
      top_picking: t("摸顶", "Top picking"),
      unclear: t("方向不明", "Unclear"),
    } as const;
    const relation = context.relation ?? "unclear";
    const style = context.entryStyle ?? "unclear";
    const label = relation === "mixed"
      ? relationLabels.mixed
      : `${relationLabels[relation]} · ${styleLabels[style]}`;
    const color = relation === "strong_trend" || relation === "trend"
      ? "oklch(62% 0.13 145)"
      : relation === "strong_counter" || relation === "counter"
        ? "oklch(62% 0.15 25)"
        : relation === "mixed"
          ? "oklch(68% 0.13 65)"
          : "var(--text-soft)";
    const conclusion = relation === "mixed"
      ? t("开仓方向与4H趋势相反，但与日线趋势一致。", "Entry opposed the 4H trend but aligned with the daily trend.")
      : (relation === "strong_trend" || relation === "trend") && style === "chasing"
        ? t("方向顺势，但入场位置距离4H EMA20较远。", "Direction aligned with trend, but entry was extended from the 4H EMA20.")
        : relation === "strong_trend" || relation === "trend"
          ? t("开仓方向与4H趋势一致。", "Entry direction aligned with the 4H trend.")
          : relation === "strong_counter" || relation === "counter"
            ? t("开仓方向与4H趋势相反。", "Entry direction opposed the 4H trend.")
            : t("开仓时4H趋势条件相互冲突，暂不判定顺逆势。", "The 4H trend conditions conflicted at entry, so no directional classification was made.");
    return { label, color, conclusion };
  };

  const TrendContextCell = ({ trade, mobile = false }: { trade: HyperliquidFill; mobile?: boolean }) => {
    const display = trendDisplay(trade);
    if (!display) return <span style={{ color: "var(--text-soft)" }}>—</span>;
    const context = trade.trendContext!;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help whitespace-nowrap" style={{ color: display.color, fontSize: mobile ? "0.68rem" : "0.66rem" }}>
            {display.label}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px] space-y-1.5 p-3" style={{ fontSize: "0.68rem" }}>
          {context.status === "ready" && (
            <>
              <div>{t("1D趋势", "1D trend")}：{trendStateLabel(context.oneDayTrend)}</div>
              <div>{t("4H趋势", "4H trend")}：{trendStateLabel(context.fourHourTrend)}</div>
              <div>{t("入场方向", "Entry side")}：{context.entryDirection === "long" ? t("做多", "Long") : t("做空", "Short")}</div>
              <div>
                {t("距4H EMA20", "Distance to 4H EMA20")}：
                {context.ema20DistanceAtr != null
                  ? `${signed(context.ema20DistanceAtr, 2)} ATR`
                  : `${signed(context.ema20DistancePct, 2)}%`}
              </div>
              <div>{t("EMA20斜率", "EMA20 slope")}：{signed(context.ema20SlopePct, 2)}%</div>
              <div>
                {t("判断口径", "Basis")}：
                {context.basis === "multi_timeframe"
                  ? t("1D＋4H完整判断", "Full 1D + 4H")
                  : context.basis === "one_day_ema20_fallback"
                    ? t("4H完整＋1D EMA20简化判断", "Full 4H + simplified 1D EMA20")
                    : context.basis === "four_hour"
                      ? t("1D不足，采用4H判断", "4H fallback; 1D unavailable")
                      : t("采用4H EMA20＋斜率简化判断", "Simplified 4H EMA20 + slope")}
              </div>
            </>
          )}
          <div className="pt-1" style={{ borderTop: "1px solid var(--panel-border)" }}>{t("结论", "Conclusion")}：{display.conclusion}</div>
          <div className="text-muted-foreground">{t("仅使用开仓前已完成K线，不使用未来数据。", "Uses only candles completed before entry; no future data.")}</div>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {t("历史成交", "Trade History")}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground" style={{ fontSize: "0.65rem" }}>
            {t(`共 ${filtered.length} 条`, `${filtered.length} total`)}
          </span>
          <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex gap-1">
          {(["ALL", "PERP", "SPOT"] as Category[]).map((item) => (
            <button
              key={item}
              onClick={() => changeCategory(item)}
              className={`pill-tab ${category === item ? "active" : ""}`}
            >
              {item === "ALL" ? t("全部", "All") : item === "PERP" ? t("合约", "Perp") : t("现货", "Spot")}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {t("开始", "From")}
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => changeDate("start", event.target.value)}
            className="bg-transparent border border-border/40 rounded px-2 py-0.5 text-foreground"
            style={{ fontSize: "0.72rem" }}
          />
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {t("结束", "To")}
          </span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => changeDate("end", event.target.value)}
            className="bg-transparent border border-border/40 rounded px-2 py-0.5 text-foreground"
            style={{ fontSize: "0.72rem" }}
          />
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setPage(0);
              }}
              className="text-muted-foreground hover:text-foreground text-xs px-2 py-0.5 border border-border/30 rounded"
            >
              {t("清除", "Clear")}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 border border-border/40 rounded px-2 py-0.5 ml-auto">
          <Search size={11} className="text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder={t("搜索交易对…", "Search symbol…")}
            className="bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
            style={{ fontSize: "0.72rem", width: 140 }}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setLoadAllHistory(true);
            setPage(0);
          }}
          disabled={loadAllHistory || isFetching}
          className="text-muted-foreground hover:text-foreground text-xs px-2 py-0.5 border border-border/30 rounded disabled:opacity-50"
        >
          {loadAllHistory ? t("已加载全部", "All loaded") : t("加载全部历史", "Load all history")}
        </button>
      </div>

      {filtered.length > 0 && (
        <div
          className="flex flex-wrap gap-x-6 gap-y-1.5 mb-4 px-4 py-2.5 rounded-lg"
          style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
        >
          <div>
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("成交数", "Trades")}
            </span>
            <div className="num-display" style={{ fontSize: "0.78rem" }}>{filtered.length}</div>
          </div>
          {showTotalTurnover && (
            <div>
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
                {t("总成交额", "Total Turnover")}
              </span>
              <div className="num-display" style={{ fontSize: "0.78rem" }}>{fmt(totalTurnover, 0)}</div>
            </div>
          )}
          <div>
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("手续费", "Fees")}
            </span>
            <div className="num-display" style={{ fontSize: "0.78rem" }}>{fmt(totalFees, 2)}</div>
          </div>
          {category !== "SPOT" && (
            <div>
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
                {t("累积资金费", "Net Funding")}
              </span>
              <div className="num-display" style={{ fontSize: "0.78rem", color: pnlColor(totalFunding) }}>
                {signed(totalFunding, 2)}
              </div>
            </div>
          )}
          <div>
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("已平仓盈亏", "Closed PnL")}
            </span>
            <div className="num-display" style={{ fontSize: "0.78rem", color: pnlColor(totalPnl) }}>
              {signed(totalPnl, 2)}
            </div>
          </div>
        </div>
      )}

      {error && <div className="text-loss text-sm py-2">{error.message}</div>}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground" style={{ fontSize: "0.78rem" }}>
          <RefreshCw size={14} className="animate-spin mr-2" />
          {t("加载中…", "Loading…")}
        </div>
      ) : pageTrades.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground" style={{ fontSize: "0.78rem" }}>
          {t("暂无成交记录", "No trades found")}
        </div>
      ) : (
        <>
          <div className="trade-history-table-scrollbar overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", minWidth: showTrendContext ? 1080 : 900 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--panel-border)" }}>
                  {[
                    { label: t("时间", "Time"), key: "time" },
                    { label: t("交易对", "Symbol"), key: "symbol" },
                    { label: t("方向", "Side"), key: "side" },
                    { label: t("开平", "Open/Close"), key: "openclose" },
                    ...(showTrendContext ? [{ label: t("趋势/入场", "Trend/Entry"), key: "trendentry", tooltip: t("优先依据首次开仓前已完成的1D与4H K线、EMA20/EMA50排列、EMA20斜率及ATR距离判断；长周期数据不足时自动降级为4H口径。仅用于复盘归因，不代表确定的亏损原因。", "Uses completed 1D/4H candles before the first entry, EMA20/EMA50 alignment, EMA20 slope and ATR distance; automatically falls back to a 4H basis when longer history is unavailable. Intended for review, not definitive causation.") }] : []),
                    { label: t("平仓方式", "Close Method"), key: "closemethod", tooltip: t("预设止损/止盈：提前设置的条件单/委托单;主动平仓：手动干预的方式进行市价止盈/止损", "Preset SL/TP: Pre-set conditional orders; Manual Close: Manual market exit") },
                    { label: t("数量", "Qty"), key: "qty" },
                    { label: t("成交价", "Price"), key: "price" },
                    { label: t("成交额", "Value"), key: "value" },
                    { label: t("手续费", "Fee"), key: "fee" },
                    { label: t("资金费", "Funding"), key: "funding" },
                    { label: t("盈亏", "PnL"), key: "pnl", tooltip: t("按成交产生的已实现盈亏统计；资金费单独统计，不计入该笔交易的胜负判断。", "Realized PnL from fills; funding is tracked separately and is not included in the trade win/loss result.") },
                  ].map((h) => (
                    <th
                      key={h.key}
                      className="text-left pb-2 pr-3 align-middle"
                      style={{ fontSize: "0.6rem", color: "var(--text-soft)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500, whiteSpace: "nowrap" }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {h.label}
                        {h.tooltip && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="text-muted-foreground/60 cursor-help shrink-0" style={{ width: "12px", height: "12px" }} />
                            </TooltipTrigger>
                            <TooltipContent className="text-xs" style={{ fontSize: "0.7rem" }}>
                              {h.tooltip}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageTrades.map((trade, index) => {
                  const fee = trade.feeDetail?.[0];
                  const pnl = num(trade.execPnl);
                  const isBuy = trade.side === "buy";
                  const rowKey = `${trade.execId}-${index}`;
                  return (
                    <tr
                      key={rowKey}
                      style={{
                        borderBottom: "1px solid var(--panel-border)",
                        background: index % 2 === 0 ? "transparent" : "var(--surface-hover)",
                      }}
                    >
                      <td className="py-2 pr-3" style={{ fontSize: "0.68rem", color: "var(--text-soft)", fontFamily: "DM Mono, monospace", whiteSpace: "nowrap" }}>{fmtTime(trade.createdTime)}</td>
                      <td className="py-2 pr-3 text-foreground font-medium whitespace-nowrap" style={{ fontSize: "0.7rem" }}>{trade.symbol}</td>
                      <td className="py-2 pr-3 whitespace-nowrap" style={{ color: isBuy ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)", fontSize: "0.68rem", fontWeight: 600 }}>{isBuy ? t("买入", "Buy") : t("卖出", "Sell")}</td>
                      <td className="py-2 pr-3 whitespace-nowrap" style={{ fontSize: "0.66rem", color: "var(--text-soft)" }}>{trade.tradeSide || "—"}</td>
                      {showTrendContext && <td className="py-2 pr-3"><TrendContextCell trade={trade} /></td>}
                      <td className="py-2 pr-3" style={{ fontSize: "0.66rem", color: closeMethodColor(trade.closeMethod), whiteSpace: "nowrap" }}>{closeMethodLabel(trade.closeMethod, lang)}</td>
                      <td className="py-2 pr-3 num-display whitespace-nowrap" style={{ fontSize: "0.7rem" }}>{fmt(trade.execQty, 2)}</td>
                      <td className="py-2 pr-3 num-display whitespace-nowrap" style={{ fontSize: "0.7rem" }}>{fmt(trade.execPrice, 2)}</td>
                      <td className="py-2 pr-3 num-display whitespace-nowrap" style={{ fontSize: "0.7rem" }}>{fmt(trade.execValue, 0)}</td>
                      <td className="py-2 pr-3 num-display whitespace-nowrap" style={{ fontSize: "0.66rem", color: "var(--text-soft)" }}>{fee ? `${fmt(fee.fee, 2)} ${displayToken(fee.feeCoin)}` : "—"}</td>
                      <td className="py-2 pr-3 num-display whitespace-nowrap" style={{ fontSize: "0.7rem", color: pnlColor(trade.fundingFee) }}>{num(trade.fundingFee) !== 0 ? signed(trade.fundingFee, 2) : "—"}</td>
                      <td className="py-2 num-display whitespace-nowrap" style={{ fontSize: "0.7rem", color: pnlColor(pnl) }}>{pnl !== 0 ? signed(pnl, 2) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--panel-border)" }}>
            <span className="text-muted-foreground" style={{ fontSize: "0.65rem" }}>
              {t(`第 ${page + 1} / ${totalPages} 页，共 ${filtered.length} 条`, `Page ${page + 1} of ${totalPages} · ${filtered.length} trades`)}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-0.5 rounded border border-border/30 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                {t("上一页", "Prev")}
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-0.5 rounded border border-border/30 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                {t("下一页", "Next")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
