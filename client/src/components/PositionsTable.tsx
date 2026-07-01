import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw } from "lucide-react";

type HyperliquidPosition = {
  category: string;
  symbol: string;
  marginCoin: string;
  posSide: string;
  marginMode: string;
  total: string;
  available: string;
  leverage: string;
  avgPrice: string;
  markPrice: string;
  unrealisedPnl: string;
  curRealisedPnl: string;
  liquidationPrice: string;
  profitRate: string;
  updatedTime: string;
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
  if (n > 0) return "text-profit";
  if (n < 0) return "text-loss";
  return "text-muted-foreground";
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

export default function PositionsTable() {
  const { tr, lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const { data, isLoading, error, refetch, isFetching } = trpc.hyperliquid.positions.useQuery(
    undefined,
    { refetchInterval: 15_000 }
  );

  const positions = ((data ?? []) as HyperliquidPosition[]).filter((p) => Math.abs(num(p.total)) > 0);
  const totalUnrealized = positions.reduce((sum, p) => sum + num(p.unrealisedPnl), 0);
  const totalRealized = positions.reduce((sum, p) => sum + num(p.curRealisedPnl), 0);

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      <div className="flex items-center justify-between mb-5 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {tr.positions}
            {positions.length > 0 && <span className="ml-2 text-muted-foreground text-lg">({positions.length})</span>}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
        </div>
        <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground transition-colors p-1">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm animate-pulse py-4">{tr.loading}</div>}
      {error && <div className="text-loss text-sm py-2">{error.message}</div>}

      {!isLoading && !error && positions.length === 0 && (
        <div className="text-muted-foreground text-center py-10 tracking-widest uppercase" style={{ fontSize: "0.75rem" }}>
          {tr.noPositions}
        </div>
      )}

      {positions.length > 0 && (
        <>
          <div
            className="flex flex-wrap gap-x-6 gap-y-2 mb-4 px-4 py-2.5 rounded-lg"
            style={{ background: "rgb(255 255 255 / 5%)", border: "1px solid rgb(255 255 255 / 9%)" }}
          >
            <div>
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
                {t("未实现盈亏", "Unrealized PnL")}
              </span>
              <div className={`num-display ${pnlColor(totalUnrealized)}`} style={{ fontSize: "0.9rem" }}>
                {signed(totalUnrealized, 4)}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
                {t("已实现盈亏", "Realized PnL")}
              </span>
              <div className={`num-display ${pnlColor(totalRealized)}`} style={{ fontSize: "0.9rem" }}>
                {signed(totalRealized, 4)}
              </div>
            </div>
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="minimal-table">
              <thead>
                <tr>
                  <th>{t("合约", "Symbol")}</th>
                  <th>{t("方向", "Side")}</th>
                  <th>{t("数量", "Size")}</th>
                  <th>{t("可平", "Available")}</th>
                  <th>{t("均价", "Avg Price")}</th>
                  <th>{t("标记价", "Mark")}</th>
                  <th>{t("杠杆", "Lev.")}</th>
                  <th>{t("未实现盈亏", "Unrealized")}</th>
                  <th>{t("收益率", "ROI")}</th>
                  <th>{t("强平价", "Liq.")}</th>
                  <th>{t("更新", "Updated")}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const isLong = p.posSide === "long";
                  return (
                    <tr key={`${p.category}-${p.symbol}-${p.posSide}`}>
                      <td className="text-foreground font-medium">{p.symbol}</td>
                      <td>
                        <span className={isLong ? "text-profit" : "text-loss"}>
                          {isLong ? t("多", "Long") : t("空", "Short")}
                        </span>
                      </td>
                      <td>{fmt(p.total, 6)}</td>
                      <td>{fmt(p.available, 6)}</td>
                      <td>{fmt(p.avgPrice, 2)}</td>
                      <td>{fmt(p.markPrice, 2)}</td>
                      <td>{fmt(p.leverage, 0)}x</td>
                      <td className={pnlColor(p.unrealisedPnl)}>{signed(p.unrealisedPnl, 4)}</td>
                      <td className={pnlColor(p.profitRate)}>{signed(num(p.profitRate) * 100, 2)}%</td>
                      <td>{num(p.liquidationPrice) > 0 ? fmt(p.liquidationPrice, 2) : "—"}</td>
                      <td className="text-muted-foreground">{formatTime(p.updatedTime, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden flex flex-col gap-2">
            {positions.map((p) => {
              const isLong = p.posSide === "long";
              return (
                <div
                  key={`${p.category}-${p.symbol}-${p.posSide}`}
                  className="rounded-lg px-4 py-3"
                  style={{ background: "rgb(255 255 255 / 5%)", border: "1px solid rgb(255 255 255 / 9%)" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{p.symbol}</span>
                    <span className={isLong ? "text-profit" : "text-loss"}>{isLong ? t("多", "Long") : t("空", "Short")}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span>{t("数量", "Size")}: {fmt(p.total, 6)}</span>
                    <span>{t("均价", "Avg")}: {fmt(p.avgPrice, 2)}</span>
                    <span>{t("标记价", "Mark")}: {fmt(p.markPrice, 2)}</span>
                    <span className={pnlColor(p.unrealisedPnl)}>{t("盈亏", "PnL")}: {signed(p.unrealisedPnl, 4)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
