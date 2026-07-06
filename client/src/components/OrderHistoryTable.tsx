import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw } from "lucide-react";

type HyperliquidHistoricalOrder = {
  symbol: string;
  market: string;
  coin: string;
  side: string;
  orderType: string;
  limitPrice: string;
  size: string;
  originalSize: string;
  orderId: string;
  timestamp: string;
  reduceOnly: boolean;
  tif: string;
  triggerPrice: string;
  triggerCondition: string;
  isTrigger: boolean;
  status: string;
  statusTimestamp: string;
};

const PAGE_SIZE = 20;

function num(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: string | number | null | undefined, decimals = 2) {
  const n = num(value);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatTime(value: string | number | null | undefined, lang: string) {
  const ts = Number(value ?? 0);
  if (!ts) return "—";
  return new Date(ts).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function sideLabel(side: string, lang: string) {
  if (side === "B") return lang === "zh" ? "买入" : "Buy";
  if (side === "A") return lang === "zh" ? "卖出" : "Sell";
  return side || "—";
}

function sideClass(side: string) {
  if (side === "B") return "text-profit";
  if (side === "A") return "text-loss";
  return "text-muted-foreground";
}

function displayOrderType(order: HyperliquidHistoricalOrder, lang: string) {
  if (lang !== "zh") return order.orderType || "—";

  const type = order.orderType.toLowerCase();
  if (type.includes("take profit")) return "止盈";
  if (type.includes("stop")) return "止损";
  if (type.includes("limit")) return "限价";
  if (type.includes("market")) return "市价";
  return order.orderType || "—";
}

function localizeTriggerCondition(condition: string, lang: string) {
  if (!condition || lang !== "zh") return condition;
  return condition
    .replace(/price\s+above\s+/i, "价格≥")
    .replace(/price\s+below\s+/i, "价格≤");
}

function displayTriggerCondition(order: HyperliquidHistoricalOrder, lang: string) {
  if (order.triggerCondition && order.triggerCondition.toLowerCase() !== "n/a") {
    return localizeTriggerCondition(order.triggerCondition, lang);
  }
  return num(order.triggerPrice) > 0 ? fmt(order.triggerPrice, 2) : "—";
}

const STATUS_LABELS: Record<string, { zh: string; en: string; tone: "profit" | "loss" | "neutral" }> = {
  filled: { zh: "已成交", en: "Filled", tone: "profit" },
  open: { zh: "挂单中", en: "Open", tone: "neutral" },
  triggered: { zh: "已触发", en: "Triggered", tone: "profit" },
  canceled: { zh: "已撤销", en: "Canceled", tone: "neutral" },
  rejected: { zh: "已拒绝", en: "Rejected", tone: "loss" },
  marginCanceled: { zh: "保证金不足撤销", en: "Margin Canceled", tone: "loss" },
  reduceOnlyCanceled: { zh: "只减仓撤销", en: "Reduce-Only Canceled", tone: "neutral" },
  reduceOnlyRejected: { zh: "只减仓拒绝", en: "Reduce-Only Rejected", tone: "loss" },
  siblingFilledCanceled: { zh: "关联单成交撤销", en: "Sibling Filled Canceled", tone: "neutral" },
  selfTradeCanceled: { zh: "自成交撤销", en: "Self-Trade Canceled", tone: "neutral" },
  scheduledCancel: { zh: "定时撤销", en: "Scheduled Cancel", tone: "neutral" },
  liquidatedCanceled: { zh: "强平撤销", en: "Liquidation Canceled", tone: "loss" },
  delistedCanceled: { zh: "下架撤销", en: "Delisted Canceled", tone: "neutral" },
  openInterestCapCanceled: { zh: "持仓上限撤销", en: "OI Cap Canceled", tone: "neutral" },
  vaultWithdrawalCanceled: { zh: "金库提取撤销", en: "Vault Withdrawal Canceled", tone: "neutral" },
};

function statusLabel(status: string, lang: string) {
  const entry = STATUS_LABELS[status];
  if (entry) return lang === "zh" ? entry.zh : entry.en;
  return status || "—";
}

function statusClass(status: string) {
  const tone = STATUS_LABELS[status]?.tone ?? "neutral";
  if (tone === "profit") return "text-profit";
  if (tone === "loss") return "text-loss";
  return "text-muted-foreground";
}

function filledSize(order: HyperliquidHistoricalOrder) {
  const filled = num(order.originalSize) - num(order.size);
  return filled > 0 ? filled : 0;
}

function displayOrderValue(order: HyperliquidHistoricalOrder) {
  const price = num(order.limitPrice);
  const size = num(order.originalSize);
  if (price <= 0 || size <= 0) return "—";
  return fmt(price * size, 2);
}

export default function OrderHistoryTable() {
  const { lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [page, setPage] = useState(0);
  const { data, isLoading, error, refetch, isFetching } = trpc.hyperliquid.orderHistory.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );

  const orders = (data ?? []) as HyperliquidHistoricalOrder[];
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const pageOrders = orders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      <div className="flex items-center justify-between mb-5 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {t("委托历史", "Order History")}
            {orders.length > 0 && <span className="ml-2 text-muted-foreground text-lg">({orders.length})</span>}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground transition-colors p-1">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm animate-pulse py-4">{t("加载中…", "Loading…")}</div>}
      {error && (
        <div className="text-muted-foreground text-center py-10 tracking-widest uppercase" style={{ fontSize: "0.75rem" }}>
          {t("暂无委托历史", "No order history")}
        </div>
      )}

      {!isLoading && !error && orders.length === 0 && (
        <div className="text-muted-foreground text-center py-10 tracking-widest uppercase" style={{ fontSize: "0.75rem" }}>
          {t("暂无委托历史", "No order history")}
        </div>
      )}

      {!error && orders.length > 0 && (
        <>
          <div className="hidden sm:block overflow-x-auto">
            <table className="minimal-table">
              <thead>
                <tr>
                  <th>{t("时间", "Time")}</th>
                  <th>{t("市场", "Market")}</th>
                  <th>{t("方向", "Side")}</th>
                  <th>{t("类型", "Type")}</th>
                  <th>{t("价格", "Price")}</th>
                  <th>{t("数量", "Size")}</th>
                  <th>{t("已成交", "Filled")}</th>
                  <th>{t("委托价值", "Order Value")}</th>
                  <th>{t("触发条件", "Trigger Condition")}</th>
                  <th>{t("有效期", "TIF")}</th>
                  <th>{t("状态", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => (
                  <tr key={`${order.orderId}-${order.statusTimestamp}-${order.status}`}>
                    <td className="text-muted-foreground">{formatTime(order.statusTimestamp || order.timestamp, lang)}</td>
                    <td className="text-foreground font-medium">{order.symbol}</td>
                    <td className={sideClass(order.side)}>{sideLabel(order.side, lang)}</td>
                    <td>{displayOrderType(order, lang)}</td>
                    <td>{num(order.limitPrice) > 0 ? fmt(order.limitPrice, 2) : "—"}</td>
                    <td>{num(order.originalSize) > 0 ? fmt(order.originalSize, 2) : "—"}</td>
                    <td>{filledSize(order) > 0 ? fmt(filledSize(order), 2) : "—"}</td>
                    <td>{displayOrderValue(order)}</td>
                    <td>{displayTriggerCondition(order, lang)}</td>
                    <td>{order.tif || "—"}</td>
                    <td className={statusClass(order.status)}>{statusLabel(order.status, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden flex flex-col gap-2">
            {pageOrders.map((order) => (
              <div
                key={`${order.orderId}-${order.statusTimestamp}-${order.status}`}
                className="rounded-lg px-4 py-3"
                style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{order.symbol}</span>
                  <span className={statusClass(order.status)}>{statusLabel(order.status, lang)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className={sideClass(order.side)}>{sideLabel(order.side, lang)} · {displayOrderType(order, lang)}</span>
                  <span>{t("价格", "Price")}: {num(order.limitPrice) > 0 ? fmt(order.limitPrice, 2) : "—"}</span>
                  <span>{t("数量", "Size")}: {num(order.originalSize) > 0 ? fmt(order.originalSize, 2) : "—"}</span>
                  <span>{t("已成交", "Filled")}: {filledSize(order) > 0 ? fmt(filledSize(order), 2) : "—"}</span>
                  <span>{t("时间", "Time")}: {formatTime(order.statusTimestamp || order.timestamp, lang)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--panel-border)" }}>
            <span className="text-muted-foreground" style={{ fontSize: "0.65rem" }}>
              {t(`第 ${page + 1} / ${totalPages} 页，共 ${orders.length} 条`, `Page ${page + 1} of ${totalPages} · ${orders.length} orders`)}
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
