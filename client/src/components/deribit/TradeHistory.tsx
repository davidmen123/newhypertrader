import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw, ChevronLeft, ChevronRight, Search, ChevronsLeft, ChevronsRight } from "lucide-react";

type Currency = "ALL" | "BTC" | "USDC";

type Trade = {
  tradeId: string;
  orderId: string | null;
  instrument: string;
  direction: string;
  amount: number;
  price: number;
  fee: number;
  feeCurrency: string;
  indexPrice: number | null;
  markPrice: number | null;
  profitLoss: number;
  orderType: string;
  liquidity: string | null;
  timestamp: number;
  label: string;
};

// Parse instrument type from name: BTC-13MAR26-67500-P → option, BTC-PERPETUAL → future
function parseInstrumentType(name: string): "option" | "future" | "spot" {
  const parts = name.split("-");
  if (parts.length >= 4) return "option";
  if (name.includes("PERPETUAL") || parts.length === 2) return "future";
  return "spot";
}

function parseOptionType(name: string): "C" | "P" | null {
  const last = name.split("-").pop();
  if (last === "C") return "C";
  if (last === "P") return "P";
  return null;
}

function formatInstrument(name: string): { short: string; full: string } {
  const parts = name.split("-");
  if (parts.length >= 4) {
    const [, expiry, strike, optType] = parts;
    return {
      short: `${expiry} ${Number(strike).toLocaleString()} ${optType}`,
      full: name,
    };
  }
  return { short: name, full: name };
}

const PAGE_SIZE = 20;

export default function TradeHistory() {
  const { lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  const [currency, setCurrency] = useState<Currency>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  // Reset page when filters change
  const handleCurrencyChange = (c: Currency) => { setCurrency(c); setPage(0); };
  const handleDateChange = (type: "start" | "end", val: string) => {
    if (type === "start") setStartDate(val);
    else setEndDate(val);
    setPage(0);
  };
  const handleSearchChange = (val: string) => { setSearch(val); setPage(0); };

  // Server-side paginated query
  const { data, isLoading, isFetching, refetch } = trpc.deribit.tradeHistory.useQuery(
    {
      currency,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    { refetchInterval: 120_000 }
  );

  const trades: Trade[] = data?.trades ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Client-side search filter (only on current page for instrument name)
  const filtered = useMemo(() => {
    if (!search.trim()) return trades;
    const q = search.toLowerCase();
    return trades.filter(
      (tr) =>
        tr.instrument.toLowerCase().includes(q) ||
        tr.direction.toLowerCase().includes(q)
    );
  }, [trades, search]);

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  const fmtNum = (v: number | null | undefined, decimals = 4) => {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {t("历史成交", "Trade History")}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "oklch(58% 0.015 200 / 60%)" }} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground" style={{ fontSize: "0.65rem" }}>
            {t(`共 ${totalCount} 条`, `${totalCount} total`)}
          </span>
          <button
            onClick={() => refetch()}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Currency tabs */}
        <div className="flex gap-1">
          {(["ALL", "BTC", "USDC"] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => handleCurrencyChange(c)}
              className={`pill-tab ${currency === c ? "active" : ""}`}
            >
              {c === "ALL" ? t("全部", "All") : c}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {t("开始", "From")}
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleDateChange("start", e.target.value)}
            className="bg-transparent border border-border/40 rounded px-2 py-0.5 text-foreground"
            style={{ fontSize: "0.72rem" }}
          />
          <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.62rem" }}>
            {t("结束", "To")}
          </span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleDateChange("end", e.target.value)}
            className="bg-transparent border border-border/40 rounded px-2 py-0.5 text-foreground"
            style={{ fontSize: "0.72rem" }}
          />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(""); setEndDate(""); setPage(0); }}
              className="text-muted-foreground hover:text-foreground text-xs px-2 py-0.5 border border-border/30 rounded"
            >
              {t("清除", "Clear")}
            </button>
          )}
        </div>

        {/* Search (client-side, within current page) */}
        <div className="flex items-center gap-1.5 border border-border/40 rounded px-2 py-0.5 ml-auto">
          <Search size={11} className="text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("搜索合约…", "Search instrument…")}
            className="bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
            style={{ fontSize: "0.72rem", width: 140 }}
          />
        </div>
      </div>

      {/* Summary bar — shows page-level stats */}
      {data && filtered.length > 0 && (
        <div
          className="flex flex-wrap gap-x-6 gap-y-1.5 mb-4 px-4 py-2.5 rounded-lg"
          style={{ background: "oklch(20% 0.02 200 / 50%)", border: "1px solid oklch(35% 0.02 200 / 30%)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("本页", "Page")}
            </span>
            <span className="num-display" style={{ fontSize: "0.78rem" }}>{filtered.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("买入", "Buys")}
            </span>
            <span className="num-display text-profit" style={{ fontSize: "0.78rem" }}>
              {filtered.filter((tr) => tr.direction === "buy").length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("卖出", "Sells")}
            </span>
            <span className="num-display text-loss" style={{ fontSize: "0.78rem" }}>
              {filtered.filter((tr) => tr.direction === "sell").length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("本页手续费", "Page Fees")}
            </span>
            <span className="num-display" style={{ fontSize: "0.78rem" }}>
              {fmtNum(filtered.reduce((s, tr) => s + (tr.fee ?? 0), 0), 4)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
              {t("本页盈亏", "Page PnL")}
            </span>
            {(() => {
              const total = filtered.reduce((s, tr) => s + (tr.profitLoss ?? 0), 0);
              return (
                <span
                  className="num-display"
                  style={{ fontSize: "0.78rem", color: total >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }}
                >
                  {total >= 0 ? "+" : ""}{fmtNum(total, 4)}
                </span>
              );
            })()}
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground" style={{ fontSize: "0.78rem" }}>
          <RefreshCw size={14} className="animate-spin mr-2" />
          {t("加载中…", "Loading…")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground" style={{ fontSize: "0.78rem" }}>
          {t("暂无成交记录", "No trades found")}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid oklch(35% 0.02 200 / 30%)" }}>
                  {[
                    t("时间", "Time"),
                    t("合约", "Instrument"),
                    t("类型", "Type"),
                    t("方向", "Side"),
                    t("数量", "Amount"),
                    t("成交价", "Price"),
                    t("标记价", "Mark"),
                    t("手续费", "Fee"),
                    t("盈亏", "PnL"),
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left pb-2 pr-4"
                      style={{ fontSize: "0.6rem", color: "oklch(48% 0.015 200)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tr: Trade, i: number) => {
                  const instType = parseInstrumentType(tr.instrument);
                  const optType = parseOptionType(tr.instrument);
                  const { short, full } = formatInstrument(tr.instrument);
                  const isBuy = tr.direction === "buy";
                  const pnl = tr.profitLoss ?? 0;
                  return (
                    <tr
                      key={tr.tradeId}
                      style={{
                        borderBottom: "1px solid oklch(30% 0.015 200 / 20%)",
                        background: i % 2 === 0 ? "transparent" : "oklch(22% 0.02 200 / 20%)",
                      }}
                    >
                      <td className="py-2 pr-4" style={{ fontSize: "0.68rem", color: "oklch(55% 0.015 200)", fontFamily: "DM Mono, monospace", whiteSpace: "nowrap" }}>
                        {fmtTime(tr.timestamp)}
                      </td>
                      <td className="py-2 pr-4" title={full} style={{ fontSize: "0.7rem", color: "oklch(80% 0.02 200)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {short}
                      </td>
                      <td className="py-2 pr-4">
                        {instType === "option" ? (
                          <span style={{ fontSize: "0.6rem", padding: "1px 6px", borderRadius: 4, background: optType === "C" ? "oklch(68% 0.15 145 / 20%)" : "oklch(62% 0.15 25 / 20%)", color: optType === "C" ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)", letterSpacing: "0.06em" }}>
                            {optType === "C" ? "Call" : "Put"}
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.6rem", color: "oklch(55% 0.015 200)", letterSpacing: "0.06em" }}>
                            {instType === "future" ? t("期货", "Future") : t("现货", "Spot")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.06em", color: isBuy ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }}>
                          {isBuy ? t("买入", "Buy") : t("卖出", "Sell")}
                        </span>
                      </td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.72rem" }}>
                        {tr.amount?.toLocaleString("en-US") ?? "—"}
                      </td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.72rem" }}>
                        {fmtNum(tr.price, 4)}
                      </td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.68rem", color: "oklch(55% 0.015 200)" }}>
                        {fmtNum(tr.markPrice, 4)}
                      </td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.68rem", color: "oklch(55% 0.015 200)" }}>
                        {tr.fee != null ? `${fmtNum(tr.fee, 4)} ${tr.feeCurrency ?? ""}` : "—"}
                      </td>
                      <td className="py-2 pr-4 num-display" style={{ fontSize: "0.72rem", color: pnl >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }}>
                        {pnl !== 0 ? `${pnl >= 0 ? "+" : ""}${fmtNum(pnl, 4)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden flex flex-col gap-2">
            {filtered.map((tr: Trade) => {
              const isBuy = tr.direction === "buy";
              const pnl = tr.profitLoss ?? 0;
              const optType = parseOptionType(tr.instrument);
              const instType = parseInstrumentType(tr.instrument);
              const { short } = formatInstrument(tr.instrument);
              return (
                <div
                  key={tr.tradeId}
                  className="rounded-lg px-4 py-3"
                  style={{ background: "oklch(22% 0.02 200 / 40%)", border: "1px solid oklch(35% 0.02 200 / 25%)" }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span style={{ fontSize: "0.72rem", color: "oklch(80% 0.02 200)" }}>{short}</span>
                    <span style={{ fontSize: "0.62rem", color: "oklch(48% 0.015 200)", fontFamily: "DM Mono, monospace" }}>
                      {fmtTime(tr.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span style={{ fontSize: "0.65rem", fontWeight: 600, color: isBuy ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }}>
                      {isBuy ? t("买入", "Buy") : t("卖出", "Sell")}
                    </span>
                    {instType === "option" && optType && (
                      <span style={{ fontSize: "0.6rem", padding: "1px 5px", borderRadius: 3, background: optType === "C" ? "oklch(68% 0.15 145 / 20%)" : "oklch(62% 0.15 25 / 20%)", color: optType === "C" ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }}>
                        {optType === "C" ? "Call" : "Put"}
                      </span>
                    )}
                    <span className="num-display" style={{ fontSize: "0.7rem" }}>{t("价格", "Price")}: {fmtNum(tr.price, 4)}</span>
                    <span className="num-display" style={{ fontSize: "0.7rem" }}>{t("数量", "Qty")}: {tr.amount?.toLocaleString("en-US")}</span>
                    {pnl !== 0 && (
                      <span className="num-display" style={{ fontSize: "0.7rem", color: pnl >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }}>
                        PnL: {pnl >= 0 ? "+" : ""}{fmtNum(pnl, 4)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Server-side Pagination */}
          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid oklch(35% 0.02 200 / 25%)" }}>
            <span className="text-muted-foreground" style={{ fontSize: "0.65rem" }}>
              {t(
                `第 ${page + 1} / ${totalPages} 页，共 ${totalCount} 条`,
                `Page ${page + 1} of ${totalPages} · ${totalCount} trades`
              )}
            </span>
            <div className="flex items-center gap-1">
              {/* First page */}
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="p-1 rounded border border-border/30 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                title={t("第一页", "First page")}
              >
                <ChevronsLeft size={13} />
              </button>
              {/* Prev */}
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded border border-border/30 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              {/* Page number pills */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) {
                  p = i;
                } else if (page < 3) {
                  p = i;
                } else if (page > totalPages - 4) {
                  p = totalPages - 5 + i;
                } else {
                  p = page - 2 + i;
                }
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-2 py-0.5 rounded border transition-colors ${p === page ? "border-foreground/40 text-foreground" : "border-border/30 text-muted-foreground hover:text-foreground"}`}
                    style={{ fontSize: "0.68rem", minWidth: 28 }}
                  >
                    {p + 1}
                  </button>
                );
              })}
              {/* Next */}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded border border-border/30 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
              {/* Last page */}
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="p-1 rounded border border-border/30 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                title={t("最后一页", "Last page")}
              >
                <ChevronsRight size={13} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
