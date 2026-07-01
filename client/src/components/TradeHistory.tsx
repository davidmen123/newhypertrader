import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw, Search } from "lucide-react";

type Category = "ALL" | "PERP";

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
};

function num(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: string | number | null | undefined, decimals = 4) {
  const n = num(value);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function signed(value: string | number | null | undefined, decimals = 4) {
  const n = num(value);
  return `${n > 0 ? "+" : ""}${fmt(n, decimals)}`;
}

function pnlColor(value: string | number | null | undefined) {
  const n = num(value);
  if (n > 0) return "oklch(68% 0.15 145)";
  if (n < 0) return "oklch(62% 0.15 25)";
  return "rgb(190 190 186 / 78%)";
}

const PAGE_SIZE = 20;

export default function TradeHistory() {
  const { lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [category, setCategory] = useState<Category>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const { data, isLoading, isFetching, refetch, error } = trpc.hyperliquid.tradeHistory.useQuery(
    {
      category,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: 100,
    },
    { refetchInterval: 120_000 }
  );

  const trades = (data?.trades ?? []) as HyperliquidFill[];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trades;
    return trades.filter((trade) =>
      [trade.symbol, trade.category, trade.side, trade.tradeSide, trade.orderType]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q))
    );
  }, [trades, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageTrades = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalFees = filtered.reduce((sum, trade) => {
    return sum + (trade.feeDetail ?? []).reduce((feeSum, item) => feeSum + Math.abs(num(item.fee)), 0);
  }, 0);
  const totalPnl = filtered.reduce((sum, trade) => sum + num(trade.execPnl), 0);

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
          {(["ALL", "PERP"] as Category[]).map((item) => (
            <button
              key={item}
              onClick={() => changeCategory(item)}
              className={`pill-tab ${category === item ? "active" : ""}`}
            >
              {item === "ALL" ? t("全部", "All") : item}
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
      </div>

      {filtered.length > 0 && (
        <div
          className="flex flex-wrap gap-x-6 gap-y-1.5 mb-4 px-4 py-2.5 rounded-lg"
          style={{ background: "rgb(255 255 255 / 5%)", border: "1px solid rgb(255 255 255 / 9%)" }}
        >
          <div>
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("成交数", "Fills")}
            </span>
            <div className="num-display" style={{ fontSize: "0.78rem" }}>{filtered.length}</div>
          </div>
          <div>
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("手续费", "Fees")}
            </span>
            <div className="num-display" style={{ fontSize: "0.78rem" }}>{fmt(totalFees, 4)}</div>
          </div>
          <div>
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("已平仓盈亏", "Closed PnL")}
            </span>
            <div className="num-display" style={{ fontSize: "0.78rem", color: pnlColor(totalPnl) }}>
              {signed(totalPnl, 4)}
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
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgb(255 255 255 / 10%)" }}>
                  {[t("时间", "Time"), t("交易对", "Symbol"), t("市场", "Market"), t("方向", "Side"), t("开平", "Open/Close"), t("数量", "Qty"), t("成交价", "Price"), t("成交额", "Value"), t("手续费", "Fee"), t("盈亏", "PnL")].map((h) => (
                    <th
                      key={h}
                      className="text-left pb-2 pr-4"
                      style={{ fontSize: "0.6rem", color: "rgb(190 190 186 / 76%)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}
                    >
                      {h}
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
                        borderBottom: "1px solid rgb(255 255 255 / 8%)",
                        background: index % 2 === 0 ? "transparent" : "rgb(255 255 255 / 3%)",
                      }}
                    >
                      <td className="py-2 pr-4" style={{ fontSize: "0.68rem", color: "rgb(190 190 186 / 78%)", fontFamily: "DM Mono, monospace", whiteSpace: "nowrap" }}>{fmtTime(trade.createdTime)}</td>
                      <td className="py-2 pr-4 text-foreground font-medium" style={{ fontSize: "0.72rem" }}>{trade.symbol}</td>
                      <td className="py-2 pr-4" style={{ fontSize: "0.68rem", color: "rgb(190 190 186 / 78%)" }}>{trade.category}</td>
                      <td className="py-2 pr-4" style={{ color: isBuy ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)", fontSize: "0.7rem", fontWeight: 600 }}>{isBuy ? t("买入", "Buy") : t("卖出", "Sell")}</td>
                      <td className="py-2 pr-4" style={{ fontSize: "0.68rem", color: "rgb(190 190 186 / 78%)" }}>{trade.tradeSide || "—"}</td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.72rem" }}>{fmt(trade.execQty, 6)}</td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.72rem" }}>{fmt(trade.execPrice, 4)}</td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.72rem" }}>{fmt(trade.execValue, 4)}</td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.68rem", color: "rgb(190 190 186 / 78%)" }}>{fee ? `${fmt(fee.fee, 4)} ${fee.feeCoin}` : "—"}</td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.72rem", color: pnlColor(pnl) }}>{pnl !== 0 ? signed(pnl, 4) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden flex flex-col gap-2">
            {pageTrades.map((trade, index) => {
              const isBuy = trade.side === "buy";
              return (
                <div
                  key={`${trade.execId}-${index}`}
                  className="rounded-lg px-4 py-3"
                  style={{ background: "rgb(255 255 255 / 5%)", border: "1px solid rgb(255 255 255 / 9%)" }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium">{trade.symbol}</span>
                    <span style={{ fontSize: "0.62rem", color: "rgb(190 190 186 / 76%)", fontFamily: "DM Mono, monospace" }}>{fmtTime(trade.createdTime)}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span style={{ color: isBuy ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)", fontWeight: 600 }}>{isBuy ? t("买入", "Buy") : t("卖出", "Sell")}</span>
                    <span>{trade.category}</span>
                    <span>{t("价格", "Price")}: {fmt(trade.execPrice, 4)}</span>
                    <span>{t("数量", "Qty")}: {fmt(trade.execQty, 6)}</span>
                    {num(trade.execPnl) !== 0 && <span style={{ color: pnlColor(trade.execPnl) }}>PnL: {signed(trade.execPnl, 4)}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid rgb(255 255 255 / 10%)" }}>
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
