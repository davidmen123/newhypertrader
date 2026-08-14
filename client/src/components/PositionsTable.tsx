import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type HyperliquidPosition = {
  category: string;
  symbol: string;
  marginCoin: string;
  posSide: string;
  marginMode: string;
  total: string;
  available: string;
  positionValue: string;
  marginUsed: string;
  leverage: string;
  avgPrice: string;
  markPrice: string;
  unrealisedPnl: string;
  fundingFee: string;
  liquidationPrice: string;
  takeProfitPrice: string;
  stopLossPrice: string;
  profitRate: string;
  updatedTime: string;
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

function signed(value: string | number | null | undefined, decimals = 2) {
  const n = num(value);
  return `${n > 0 ? "+" : ""}${fmt(n, decimals)}`;
}

function leverageLabel(value: string | number | null | undefined) {
  const leverage = num(value);
  if (leverage <= 0) return "";
  return `${leverage.toLocaleString("en-US", { maximumFractionDigits: 2 })}×`;
}

function pnlColor(value: string | number | null | undefined) {
  const n = num(value);
  if (n > 0) return "text-profit";
  if (n < 0) return "text-loss";
  return "text-muted-foreground";
}

export default function PositionsTable({ accountId }: { accountId?: string } = {}) {
  const { tr, lang } = useLang();
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const { data, isLoading, error, refetch, isFetching } = trpc.hyperliquid.positions.useQuery(
    { accountId },
    { refetchInterval: 15_000 }
  );

  const positions = ((data ?? []) as HyperliquidPosition[]).filter((p) => Math.abs(num(p.total)) > 0);
  const totalUnrealized = positions.reduce((sum, p) => sum + num(p.unrealisedPnl), 0);
  const totalFundingFee = positions.reduce((sum, p) => sum + num(p.fundingFee), 0);

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
            style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
          >
            <div>
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
                {t("未实现盈亏", "Unrealized PnL")}
              </span>
              <div className={`num-display ${pnlColor(totalUnrealized)}`} style={{ fontSize: "0.9rem" }}>
                {signed(totalUnrealized, 2)}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>
                {t("资金费", "Funding Fee")}
              </span>
              <div className={`num-display ${pnlColor(totalFundingFee)}`} style={{ fontSize: "0.9rem" }}>
                {signed(totalFundingFee, 2)}
              </div>
            </div>
          </div>

          <div className="positions-table-scrollbar hidden sm:block overflow-x-scroll">
            <table className="minimal-table min-w-[1320px] [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_td]:align-middle">
              <thead>
                <tr>
                  <th>{t("市场", "Market")}</th>
                  <th>
                    <span className="inline-flex items-center gap-1">
                      {t("方向", "Side")}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="text-muted-foreground/60 cursor-help" style={{ width: "12px", height: "12px" }} />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64 text-xs" style={{ fontSize: "0.7rem" }}>
                          {t(
                            "显示持仓方向及交易所设置的杠杆倍数；杠杆倍数不代表实际单笔风险。",
                            "Shows position side and configured leverage. Leverage does not equal the actual risk per trade."
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </th>
                  <th>{t("数量", "Size")}</th>
                  <th>
                    <span className="inline-flex items-center gap-1">
                      {t("仓位价值", "Position Value")}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="text-muted-foreground/60 cursor-help" style={{ width: "12px", height: "12px" }} />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs" style={{ fontSize: "0.7rem" }}>
                          {t("显示当前的持仓市值（数量*标记价）", "Position value at current mark price")}
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </th>
                  <th>{t("均价", "Avg Price")}</th>
                  <th>{t("标记价", "Mark")}</th>
                  <th>{t("止盈 / 止损", "Take Profit / Stop Loss")}</th>
                  <th>
                    <span className="inline-flex items-center gap-1">
                      {t("保证金", "Margin")}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="text-muted-foreground/60 cursor-help" style={{ width: "12px", height: "12px" }} />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64 text-xs" style={{ fontSize: "0.7rem" }}>
                          {t(
                            "显示保证金金额及全仓/逐仓模式。",
                            "Shows margin and cross/isolated mode."
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </th>
                  <th>{t("盈亏（ROE）", "PnL (ROE)")}</th>
                  <th>{t("资金费", "Funding")}</th>
                  <th>{t("强平价", "Liq.")}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const isLong = p.posSide === "long";
                  return (
                    <tr key={`${p.category}-${p.symbol}-${p.posSide}`}>
                      <td className="text-foreground font-medium">{p.symbol}</td>
                      <td>
                        <span className={`${isLong ? "text-profit" : "text-loss"} whitespace-nowrap`}>
                          {isLong ? t("多", "Long") : t("空", "Short")}
                          {leverageLabel(p.leverage) ? ` · ${leverageLabel(p.leverage)}` : ""}
                        </span>
                      </td>
                      <td>{fmt(p.total, 2)}</td>
                      <td>{fmt(p.positionValue, 2)}</td>
                      <td>{fmt(p.avgPrice, 2)}</td>
                      <td>{fmt(p.markPrice, 2)}</td>
                      <td>{p.takeProfitPrice || "—"} / {p.stopLossPrice || "—"}</td>
                      <td>
                        {fmt(p.marginUsed, 2)}{" "}
                        <span className="text-muted-foreground whitespace-nowrap" style={{ fontSize: "0.58rem" }}>
                          {p.marginMode === "isolated" ? t("逐仓", "Isolated") : t("全仓", "Cross")}
                        </span>
                      </td>
                      <td className={pnlColor(p.unrealisedPnl)}>
                        <span className="whitespace-nowrap">{signed(p.unrealisedPnl, 2)}</span>
                        <span className="ml-1 whitespace-nowrap" style={{ fontSize: "0.68rem" }}>
                          ({signed(num(p.profitRate) * 100, 2)}%)
                        </span>
                      </td>
                      <td className={pnlColor(p.fundingFee)}>{signed(p.fundingFee, 2)}</td>
                      <td>{num(p.liquidationPrice) > 0 ? fmt(p.liquidationPrice, 2) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden flex flex-col gap-2">
            {positions.map((p) => {
              const isLong = p.posSide === "long";
              const leverage = leverageLabel(p.leverage);
              const marginMode = p.marginMode === "isolated" ? t("逐仓", "Isolated") : t("全仓", "Cross");
              return (
                <div
                  key={`${p.category}-${p.symbol}-${p.posSide}`}
                  className="rounded-xl px-4 py-4"
                  style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
                >
                  <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                    <div className="min-w-0">
                      <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("市场", "Market")}</div>
                      <div className="mt-1 truncate font-medium text-foreground" style={{ fontSize: "0.9rem" }}>{p.symbol}</div>
                      <div className={`mt-0.5 ${isLong ? "text-profit" : "text-loss"}`} style={{ fontSize: "0.68rem" }}>
                        {isLong ? t("多", "Long") : t("空", "Short")}{leverage ? ` · ${leverage}` : ""}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("数量", "Size")}</div>
                      <div className="num-display mt-1 truncate" style={{ fontSize: "0.9rem" }}>{fmt(p.total, 2)}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("盈亏（ROE）", "PnL (ROE)")}</div>
                      <div className={`num-display mt-1 leading-tight ${pnlColor(p.unrealisedPnl)}`} style={{ fontSize: "0.84rem" }}>
                        {signed(p.unrealisedPnl, 2)}
                      </div>
                      <div className={`num-display mt-0.5 ${pnlColor(p.profitRate)}`} style={{ fontSize: "0.68rem" }}>
                        ({signed(num(p.profitRate) * 100, 2)}%)
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("开仓价格", "Entry Price")}</div>
                      <div className="num-display mt-1" style={{ fontSize: "0.84rem" }}>{fmt(p.avgPrice, 2)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("标记价格", "Mark Price")}</div>
                      <div className="num-display mt-1" style={{ fontSize: "0.84rem" }}>{fmt(p.markPrice, 2)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("强平价格", "Liq. Price")}</div>
                      <div className="num-display mt-1" style={{ fontSize: "0.84rem" }}>
                        {num(p.liquidationPrice) > 0 ? fmt(p.liquidationPrice, 2) : "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("仓位价值", "Position Value")}</div>
                      <div className="num-display mt-1" style={{ fontSize: "0.84rem" }}>{fmt(p.positionValue, 2)}</div>
                      <div className="text-muted-foreground" style={{ fontSize: "0.62rem" }}>USDC</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("保证金", "Margin")}</div>
                      <div className="num-display mt-1" style={{ fontSize: "0.84rem" }}>{fmt(p.marginUsed, 2)}</div>
                      <div className="text-muted-foreground" style={{ fontSize: "0.62rem" }}>{marginMode}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("止盈 / 止损", "TP / SL")}</div>
                      <div className="num-display mt-1 leading-tight" style={{ fontSize: "0.78rem" }}>
                        {p.takeProfitPrice || "—"} / {p.stopLossPrice || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--panel-border)" }}>
                    <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{t("资金费", "Funding")}</div>
                    <div className={`num-display mt-1 ${pnlColor(p.fundingFee)}`} style={{ fontSize: "0.82rem" }}>
                      {signed(p.fundingFee, 2)}
                    </div>
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
