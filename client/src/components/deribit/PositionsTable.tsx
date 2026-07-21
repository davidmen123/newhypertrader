import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw, AlertTriangle } from "lucide-react";

function fmt(val: number | undefined | null, d = 4): string {
  if (val == null) return "—";
  return val.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtSigned(val: number | null, d = 4): string {
  if (val == null) return "—";
  return (val > 0 ? "+" : "") + val.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function pnlColor(v: number | null | undefined) {
  if (v == null) return "text-muted-foreground";
  return v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-neutral";
}

function PnlCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <span className={pnlColor(value)}>{fmtSigned(value)}</span>;
}

function RoiCell({ pnlUsd, avgPriceUsd, size }: { pnlUsd: number | null | undefined; avgPriceUsd: number | null | undefined; size: number | null | undefined }) {
  if (pnlUsd == null || !avgPriceUsd || !size) return <span className="text-muted-foreground">—</span>;
  const cost = avgPriceUsd * Math.abs(size);
  if (!cost) return <span className="text-muted-foreground">—</span>;
  const roi = (pnlUsd / cost) * 100;
  return <span className={pnlColor(roi)}>{roi > 0 ? "+" : ""}{roi.toFixed(2)}%</span>;
}

function TotalCell({ value, decimals = 4 }: { value: number; decimals?: number }) {
  return <span className={`num-display font-medium ${pnlColor(value)}`} style={{ fontSize: "0.8rem" }}>{fmtSigned(value, decimals)}</span>;
}

function sum(arr: (number | null | undefined)[]): number {
  return arr.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function parseDTE(instrumentName: string): number | null {
  const match = instrumentName.match(/-(\d{1,2})([A-Z]{3})(\d{2})-/);
  if (!match) return null;
  const [, dayStr, mon, yr] = match;
  const monthMap: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const monthIdx = monthMap[mon];
  if (monthIdx === undefined) return null;
  const expiry = new Date(Date.UTC(2000 + parseInt(yr, 10), monthIdx, parseInt(dayStr, 10), 8, 0, 0));
  return Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86_400_000));
}

function DteCell({ instrumentName }: { instrumentName: string }) {
  const dte = parseDTE(instrumentName);
  if (dte === null) return <span className="text-muted-foreground">—</span>;
  const cls = dte <= 7 ? "text-loss font-semibold" : dte <= 30 ? "text-amber-400" : "text-neutral";
  return <span className={cls}>{dte}d</span>;
}

function parseOptionType(instrumentName: string): "C" | "P" | null {
  const parts = instrumentName.split("-");
  const last = parts[parts.length - 1]?.toUpperCase();
  if (last === "C" || last === "P") return last;
  return null;
}

function OptionTypeCell({ instrumentName }: { instrumentName: string }) {
  const type = parseOptionType(instrumentName);
  if (!type) return <span className="text-muted-foreground">—</span>;
  const isCall = type === "C";
  return <span className={`${isCall ? "text-profit" : "text-loss"} font-semibold`} style={{ fontSize: "0.75rem" }}>{isCall ? "Call" : "Put"}</span>;
}

// ─── Mobile card for a single position ───────────────────────────────────────
function PositionCard({ p, lang, isOption }: { p: ReturnType<typeof trpc.deribit.positions.useQuery>["data"] extends (infer T)[] | undefined ? T : never; lang: string; isOption: boolean }) {
  const pnlUsd = (p as Record<string, unknown>).floating_profit_loss_usd as number | null ?? (p as Record<string, unknown>).floating_profit_loss as number | null;
  const avgPriceUsd = (p as Record<string, unknown>).average_price_usd as number | null ?? (p as Record<string, unknown>).average_price as number | null;
  const size = (p as Record<string, unknown>).size as number;
  const direction = (p as Record<string, unknown>).direction as string;
  const instrument = (p as Record<string, unknown>).instrument_name as string;
  const markPrice = (p as Record<string, unknown>).mark_price as number;
  const avgPrice = (p as Record<string, unknown>).average_price as number;
  const delta = (p as Record<string, unknown>).delta as number;
  const theta = (p as Record<string, unknown>).theta as number | null;
  const vega = (p as Record<string, unknown>).vega as number | null;
  const totalPnl = (p as Record<string, unknown>).total_profit_loss as number | null;

  const isLong = direction === "buy";

  // Loss warning: unrealized loss > 50% of initial premium
  const initialPremium = avgPriceUsd != null && size != null ? Math.abs(avgPriceUsd * size) : null;
  const showLossWarning = isOption && pnlUsd != null && initialPremium != null && initialPremium > 0 && pnlUsd < -0.5 * initialPremium;

  return (
    <div
      className="rounded-xl px-4 py-3 mb-2"
      style={{ background: "oklch(20% 0.022 205 / 70%)", border: "1px solid oklch(35% 0.02 200 / 30%)" }}
    >
      {/* Top row: instrument + type + DTE */}
      <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-foreground font-medium" style={{ fontSize: "0.78rem", fontFamily: "DM Mono, monospace" }}>{instrument}</span>
            {isOption && <OptionTypeCell instrumentName={instrument} />}
            {isOption && <DteCell instrumentName={instrument} />}
            {showLossWarning && (
              <span title={lang === "zh" ? "亏损超过初始权利金 50%" : "Loss > 50% of initial premium"} className="text-amber-400">
                <AlertTriangle size={12} />
              </span>
            )}
          </div>
        <span className={`text-xs font-semibold ${isLong ? "text-profit" : "text-loss"}`}>
          {isLong ? (lang === "zh" ? "多" : "Long") : (lang === "zh" ? "空" : "Short")}
        </span>
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-2">
        <div>
          <div className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{lang === "zh" ? "数量" : "Size"}</div>
          <div className="num-display" style={{ fontSize: "0.8rem" }}>{fmt(size, 2)}</div>
        </div>
        <div>
          <div className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{lang === "zh" ? "均价" : "Avg"}</div>
          <div className="num-display" style={{ fontSize: "0.8rem" }}>
            {fmt(avgPrice, isOption ? 5 : 0)}
            {isOption && avgPriceUsd != null && avgPriceUsd > 0 && (
              <span className="text-muted-foreground" style={{ fontSize: "0.62rem", marginLeft: "0.2em" }}>
                ≈{avgPriceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{lang === "zh" ? "标记价" : "Mark"}</div>
          <div className="num-display" style={{ fontSize: "0.8rem" }}>{fmt(markPrice, isOption ? 5 : 0)}</div>
        </div>
        <div>
          <div className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{lang === "zh" ? "未实现" : "Unreal."}</div>
          <div className="num-display" style={{ fontSize: "0.8rem" }}><PnlCell value={pnlUsd} /></div>
        </div>
        <div>
          <div className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>ROI</div>
          <div className="num-display" style={{ fontSize: "0.8rem" }}><RoiCell pnlUsd={pnlUsd} avgPriceUsd={avgPriceUsd} size={size} /></div>
        </div>
        <div>
          <div className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Delta</div>
          <div className="num-display text-neutral" style={{ fontSize: "0.8rem" }}>{fmt(delta, 5)}</div>
        </div>
        {isOption && theta != null && (
          <div>
            <div className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Theta</div>
            <div className="num-display text-neutral" style={{ fontSize: "0.8rem" }}>{fmt(theta, 5)}</div>
          </div>
        )}
        {isOption && vega != null && (
          <div>
            <div className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Vega</div>
            <div className="num-display text-neutral" style={{ fontSize: "0.8rem" }}>{fmt(vega, 5)}</div>
          </div>
        )}
        {!isOption && totalPnl != null && (
          <div>
            <div className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{lang === "zh" ? "总盈亏" : "Total PnL"}</div>
            <div className="num-display" style={{ fontSize: "0.8rem" }}><PnlCell value={totalPnl} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PositionsTable() {
  const { tr, lang } = useLang();
  const { data, isLoading, error, refetch, isFetching } = trpc.deribit.positions.useQuery(
    undefined,
    { refetchInterval: 15_000 }
  );

  const positions = (data || []).filter(
    (p) => p.instrument_name.startsWith("BTC") || p.instrument_name.startsWith("ETH")
  );
  const futures = positions.filter((p) => p.kind === "future");
  const options = positions.filter((p) => p.kind === "option");

  const futUnrealizedPnl = sum(futures.map((p) => p.floating_profit_loss_usd ?? p.floating_profit_loss));
  const futTotalPnl = sum(futures.map((p) => p.total_profit_loss));
  const futDelta = sum(futures.map((p) => p.delta));

  const optUnrealizedPnl = sum(options.map((p) => p.floating_profit_loss_usd ?? p.floating_profit_loss));
  const optDelta = sum(options.map((p) => p.delta));
  const optGamma = sum(options.map((p) => p.gamma));
  const optVega = sum(options.map((p) => p.vega));
  const optTheta = sum(options.map((p) => p.theta));

  const totalDelta = futDelta + optDelta;
  const totalUnrealizedPnl = futUnrealizedPnl + optUnrealizedPnl;

  const totalRowStyle: React.CSSProperties = {
    borderTop: "1px solid oklch(40% 0.02 200 / 50%)",
    background: "oklch(22% 0.025 200 / 60%)",
  };

  const totalLabelStyle: React.CSSProperties = {
    fontSize: "0.65rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "oklch(52% 0.015 200)",
    fontFamily: "Inter, sans-serif",
  };

  const roiLabel = lang === "zh" ? "收益率" : "ROI";
  const unrealizedLabel = lang === "zh" ? "未实现盈亏" : "Unreal. PnL";

  return (
    <div className="glass-card px-4 sm:px-8 py-5 sm:py-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {tr.positions}
            {positions.length > 0 && (
              <span className="ml-2 text-muted-foreground text-lg">({positions.length})</span>
            )}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "oklch(58% 0.015 200 / 60%)" }} />
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

      {/* ── Futures ── */}
      {futures.length > 0 && (
        <div className="mb-6 sm:mb-8">
          <div className="text-muted-foreground tracking-widest uppercase mb-3" style={{ fontSize: "0.65rem" }}>
            {tr.futures} ({futures.length})
          </div>

          {/* Mobile: cards */}
          <div className="sm:hidden">
            {futures.map((p) => (
              <PositionCard key={p.instrument_name} p={p as never} lang={lang} isOption={false} />
            ))}
            {/* Futures total */}
            <div className="flex justify-between items-center px-4 py-2 rounded-lg mt-1" style={{ background: "oklch(22% 0.025 200 / 60%)", border: "1px solid oklch(40% 0.02 200 / 40%)" }}>
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>{lang === "zh" ? "期货合计" : "Futures Total"}</span>
              <div className="flex gap-4">
                <div className="text-right">
                  <div className="text-muted-foreground" style={{ fontSize: "0.55rem" }}>Delta</div>
                  <TotalCell value={futDelta} decimals={2} />
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground" style={{ fontSize: "0.55rem" }}>{lang === "zh" ? "未实现" : "Unreal."}</div>
                  <TotalCell value={futUnrealizedPnl} decimals={2} />
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="minimal-table">
              <thead>
                <tr>
                  <th>{tr.instrument}</th>
                  <th>{tr.direction}</th>
                  <th>{tr.size}</th>
                  <th>{tr.avgPrice}</th>
                  <th>{tr.markPrice}</th>
                  <th>{tr.delta}</th>
                  <th>{unrealizedLabel}</th>
                  <th>{roiLabel}</th>
                  <th>{tr.totalPnl}</th>
                  <th>{tr.liqPrice}</th>
                </tr>
              </thead>
              <tbody>
                {futures.map((p) => {
                  const pnlUsd = p.floating_profit_loss_usd ?? p.floating_profit_loss;
                  return (
                    <tr key={p.instrument_name}>
                      <td className="text-foreground font-medium">{p.instrument_name}</td>
                      <td>
                        <span className={p.direction === "buy" ? "text-profit" : "text-loss"}>
                          {p.direction === "buy" ? tr.long : tr.short}
                        </span>
                      </td>
                      <td>{fmt(p.size, 2)}</td>
                      <td>{fmt(p.average_price, 0)}</td>
                      <td>{fmt(p.mark_price, 0)}</td>
                      <td className="text-neutral">{fmt(p.delta, 5)}</td>
                      <td><PnlCell value={pnlUsd} /></td>
                      <td><RoiCell pnlUsd={pnlUsd} avgPriceUsd={p.average_price_usd ?? p.average_price} size={p.size} /></td>
                      <td><PnlCell value={p.total_profit_loss} /></td>
                      <td className="text-muted-foreground">{p.estimated_liquidation_price ? fmt(p.estimated_liquidation_price, 2) : "—"}</td>
                    </tr>
                  );
                })}
                <tr style={totalRowStyle}>
                  <td colSpan={5} style={totalLabelStyle}>{lang === "zh" ? "期货合计" : "Futures Total"}</td>
                  <td><TotalCell value={futDelta} decimals={2} /></td>
                  <td><TotalCell value={futUnrealizedPnl} decimals={2} /></td>
                  <td />
                  <td><TotalCell value={futTotalPnl} decimals={2} /></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Options ── */}
      {options.length > 0 && (
        <div>
          <div className="text-muted-foreground tracking-widest uppercase mb-3" style={{ fontSize: "0.65rem" }}>
            {tr.options} ({options.length})
          </div>

          {/* Mobile: cards */}
          <div className="sm:hidden">
            {options.map((p) => (
              <PositionCard key={p.instrument_name} p={p as never} lang={lang} isOption={true} />
            ))}
            {/* Options total */}
            <div className="flex justify-between items-center px-4 py-2 rounded-lg mt-1" style={{ background: "oklch(22% 0.025 200 / 60%)", border: "1px solid oklch(40% 0.02 200 / 40%)" }}>
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>{lang === "zh" ? "期权合计" : "Options Total"}</span>
              <div className="flex gap-3">
                {[
                  { label: "Delta", val: optDelta },
                  { label: "Vega", val: optVega },
                  { label: "Theta", val: optTheta },
                  { label: lang === "zh" ? "未实现" : "Unreal.", val: optUnrealizedPnl },
                ].map(({ label, val }) => (
                  <div key={label} className="text-right">
                    <div className="text-muted-foreground" style={{ fontSize: "0.55rem" }}>{label}</div>
                    <TotalCell value={val} decimals={2} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="minimal-table">
              <thead>
                <tr>
                  <th>{tr.instrument}</th>
                  <th>{lang === "zh" ? "类型" : "Type"}</th>
                  <th>{lang === "zh" ? "剩余天数" : "DTE"}</th>
                  <th>{tr.direction}</th>
                  <th>{tr.size}</th>
                  <th>{tr.avgPrice}</th>
                  <th>{tr.markPrice}</th>
                  <th>{tr.delta}</th>
                  <th>{tr.gamma}</th>
                  <th>{tr.vega}</th>
                  <th>{tr.theta}</th>
                  <th>{unrealizedLabel}</th>
                  <th>{roiLabel}</th>
                </tr>
              </thead>
              <tbody>
                {options.map((p) => {
                  const pnlUsd = p.floating_profit_loss_usd ?? p.floating_profit_loss;
                  const initialPremium = p.average_price_usd != null && p.size != null ? Math.abs(p.average_price_usd * p.size) : null;
                  const showLossWarning = initialPremium != null && initialPremium > 0 && pnlUsd != null && pnlUsd < -0.5 * initialPremium;
                  return (
                    <tr key={p.instrument_name}>
                      <td className="text-foreground" style={{ fontSize: "0.75rem" }}>
                        <span className="flex items-center gap-1">
                          {p.instrument_name}
                          {showLossWarning && (
                            <span title={"Loss > 50% of initial premium"} className="text-amber-400 flex-shrink-0">
                              <AlertTriangle size={11} />
                            </span>
                          )}
                        </span>
                      </td>
                      <td><OptionTypeCell instrumentName={p.instrument_name} /></td>
                      <td><DteCell instrumentName={p.instrument_name} /></td>
                      <td>
                        <span className={p.direction === "buy" ? "text-profit" : "text-loss"}>
                          {p.direction === "buy" ? tr.long : tr.short}
                        </span>
                      </td>
                      <td>{fmt(p.size, 2)}</td>
                      <td>
                        <span className="flex flex-col">
                          <span>{fmt(p.average_price, 5)}</span>
                          {p.average_price_usd != null && p.average_price_usd > 0 && (
                            <span className="text-muted-foreground" style={{ fontSize: "0.62rem" }}>
                              ≈{p.average_price_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                            </span>
                          )}
                        </span>
                      </td>
                      <td>{fmt(p.mark_price, 5)}</td>
                      <td className="text-neutral">{fmt(p.delta, 5)}</td>
                      <td className="text-neutral">{fmt(p.gamma, 5)}</td>
                      <td className="text-neutral">{fmt(p.vega, 5)}</td>
                      <td className="text-neutral">{fmt(p.theta, 5)}</td>
                      <td><PnlCell value={pnlUsd} /></td>
                      <td><RoiCell pnlUsd={pnlUsd} avgPriceUsd={p.average_price_usd ?? p.average_price} size={p.size} /></td>
                    </tr>
                  );
                })}
                <tr style={totalRowStyle}>
                  <td colSpan={7} style={totalLabelStyle}>{lang === "zh" ? "期权合计" : "Options Total"}</td>
                  <td><TotalCell value={optDelta} decimals={5} /></td>
                  <td><TotalCell value={optGamma} decimals={5} /></td>
                  <td><TotalCell value={optVega} decimals={5} /></td>
                  <td><TotalCell value={optTheta} decimals={5} /></td>
                  <td><TotalCell value={optUnrealizedPnl} decimals={2} /></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Portfolio Grand Total ── */}
      {positions.length > 0 && (
        <div
          className="mt-5 sm:mt-6 pt-4 sm:pt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4"
          style={{ borderTop: "1px solid oklch(40% 0.02 200 / 35%)" }}
        >
          {[
            { label: lang === "zh" ? "组合 Delta 合计" : "Portfolio Delta", value: totalDelta, decimals: 5 },
            { label: lang === "zh" ? "未实现盈亏合计" : "Total Unrealized PnL", value: totalUnrealizedPnl, decimals: 2 },
            { label: lang === "zh" ? "期权 Vega 合计" : "Options Vega", value: optVega, decimals: 5 },
            { label: lang === "zh" ? "期权 Theta 合计" : "Options Theta", value: optTheta, decimals: 5 },
          ].map(({ label, value, decimals }) => (
            <div
              key={label}
              className="flex flex-col gap-1.5 p-3 rounded-lg"
              style={{ background: "oklch(20% 0.02 200 / 50%)", border: "1px solid oklch(35% 0.02 200 / 30%)" }}
            >
              <span className="text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>{label}</span>
              <TotalCell value={value} decimals={decimals} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
