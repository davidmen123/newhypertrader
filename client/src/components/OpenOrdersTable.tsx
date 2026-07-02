import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw } from "lucide-react";

type HyperliquidOpenOrder = {
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
  cloid: string;
};

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

export default function OpenOrdersTable() {
  const { lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const { data, isLoading, error, refetch, isFetching } = trpc.hyperliquid.openOrders.useQuery(
    undefined,
    { refetchInterval: 10_000 }
  );

  const orders = (data ?? []) as HyperliquidOpenOrder[];

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      <div className="flex items-center justify-between mb-5 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {t("当前委托", "Open Orders")}
            {orders.length > 0 && <span className="ml-2 text-muted-foreground text-lg">({orders.length})</span>}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground transition-colors p-1">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm animate-pulse py-4">{t("加载中…", "Loading…")}</div>}
      {error && <div className="text-loss text-sm py-2">{error.message}</div>}

      {!isLoading && !error && orders.length === 0 && (
        <div className="text-muted-foreground text-center py-10 tracking-widest uppercase" style={{ fontSize: "0.75rem" }}>
          {t("暂无当前委托", "No open orders")}
        </div>
      )}

      {orders.length > 0 && (
        <>
          <div className="hidden sm:block overflow-x-auto">
            <table className="minimal-table">
              <thead>
                <tr>
                  <th>{t("合约", "Symbol")}</th>
                  <th>{t("市场", "Market")}</th>
                  <th>{t("方向", "Side")}</th>
                  <th>{t("类型", "Type")}</th>
                  <th>{t("价格", "Price")}</th>
                  <th>{t("数量", "Size")}</th>
                  <th>{t("原始数量", "Orig. Size")}</th>
                  <th>{t("只减仓", "Reduce Only")}</th>
                  <th>{t("有效期", "TIF")}</th>
                  <th>{t("触发价", "Trigger")}</th>
                  <th>{t("订单ID", "Order ID")}</th>
                  <th>{t("时间", "Time")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={`${order.orderId}-${order.symbol}`}>
                    <td className="text-foreground font-medium">{order.symbol}</td>
                    <td>{order.market === "default" ? "PERP" : order.market}</td>
                    <td className={sideClass(order.side)}>{sideLabel(order.side, lang)}</td>
                    <td>{order.orderType || "—"}</td>
                    <td>{num(order.limitPrice) > 0 ? fmt(order.limitPrice, 2) : "—"}</td>
                    <td>{fmt(order.size, 2)}</td>
                    <td>{fmt(order.originalSize, 2)}</td>
                    <td>{order.reduceOnly ? t("是", "Yes") : t("否", "No")}</td>
                    <td>{order.tif || "—"}</td>
                    <td>{num(order.triggerPrice) > 0 ? fmt(order.triggerPrice, 2) : (order.triggerCondition || "—")}</td>
                    <td className="text-muted-foreground">{order.orderId || "—"}</td>
                    <td className="text-muted-foreground">{formatTime(order.timestamp, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden flex flex-col gap-2">
            {orders.map((order) => (
              <div
                key={`${order.orderId}-${order.symbol}`}
                className="rounded-lg px-4 py-3"
                style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{order.symbol}</span>
                  <span className={sideClass(order.side)}>{sideLabel(order.side, lang)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span>{t("市场", "Market")}: {order.market === "default" ? "PERP" : order.market}</span>
                  <span>{t("类型", "Type")}: {order.orderType || "—"}</span>
                  <span>{t("价格", "Price")}: {num(order.limitPrice) > 0 ? fmt(order.limitPrice, 2) : "—"}</span>
                  <span>{t("数量", "Size")}: {fmt(order.size, 2)}</span>
                  <span>{t("只减仓", "Reduce")}: {order.reduceOnly ? t("是", "Yes") : t("否", "No")}</span>
                  <span>{t("有效期", "TIF")}: {order.tif || "—"}</span>
                  <span>{t("时间", "Time")}: {formatTime(order.timestamp, lang)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
