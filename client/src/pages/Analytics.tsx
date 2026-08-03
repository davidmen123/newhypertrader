import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { writeAdminKey } from "@/lib/adminKey";
import { ArrowLeft, Clock, Globe, Info, Laptop, MapPin, Monitor, Plus, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AccountOverview from "@/components/AccountOverview";
import PnlChart from "@/components/PnlChart";
import PositionsTable from "@/components/PositionsTable";
import TradeHistory from "@/components/TradeHistory";

// ─── UTC+8 date helpers ────────────────────────────────────────────────────
// All dates on this page are UTC+8 calendar days (Asia/Shanghai).
function utc8DateStr(time: number): string {
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Formatters ────────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
  return `${Math.floor(seconds / 3600)} 小时 ${Math.round((seconds % 3600) / 60)} 分`;
}

function formatDayLabel(dateStr: string): string {
  const [, month, day] = dateStr.slice(0, 10).split("-");
  return `${Number(month)}/${Number(day)}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" });
}

function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Design tokens (aligned with the main site) ────────────────────────────
const GREEN = "oklch(68% 0.15 145)";
const GOLD = "rgb(215 187 114)";
const BLUE = "oklch(72% 0.08 230)";
const NEUTRAL = "var(--metric-neutral)";

// ─── Building blocks ───────────────────────────────────────────────────────
function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`glass-card px-5 py-5 sm:px-6 ${className}`}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
          {title}
        </h3>
        {sub && <span className="text-muted-foreground/55" style={{ fontSize: "0.66rem" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function KpiTile({ label, value, sub, tooltip }: { label: string; value: string; sub?: string; tooltip?: string }) {
  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
    >
      <div className="flex items-center gap-1 text-muted-foreground tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="text-muted-foreground/60 cursor-help" style={{ width: "12px", height: "12px" }} />
            </TooltipTrigger>
            <TooltipContent className="text-xs" style={{ fontSize: "0.7rem" }}>
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="num-display mt-2" style={{ color: NEUTRAL, fontSize: "1.4rem", lineHeight: 1.05 }}>
        {value}
      </div>
      {sub && (
        <div className="text-muted-foreground/55 mt-1" style={{ fontSize: "0.66rem" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return <div className="text-center py-10 text-muted-foreground/60 text-sm">暂无数据</div>;
}

function HBarRow({ label, value, pct, widthPct, color }: { label: string; value: string; pct: string; widthPct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-muted-foreground" style={{ fontSize: "0.72rem" }}>
        {label}
      </span>
      <div className="flex-1">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--panel-border)" }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${widthPct}%`, background: color }} />
        </div>
      </div>
      <span className="num-display w-12 text-right shrink-0" style={{ fontSize: "0.72rem" }}>{value}</span>
      <span className="num-display w-10 text-right shrink-0 text-muted-foreground/60" style={{ fontSize: "0.66rem" }}>{pct}</span>
    </div>
  );
}

const DEVICE_META: Record<string, { label: string; color: string }> = {
  desktop: { label: "桌面端", color: BLUE },
  mobile: { label: "移动端", color: GREEN },
  tablet: { label: "平板", color: GOLD },
};

function deviceLabel(deviceType: string | null): string {
  return DEVICE_META[deviceType ?? ""]?.label ?? "未知";
}

function deviceIcon(deviceType: string | null) {
  const style = { width: "12px", height: "12px" };
  if (deviceType === "desktop") return <Laptop style={style} />;
  if (deviceType === "mobile") return <Smartphone style={style} />;
  if (deviceType === "tablet") return <Smartphone style={style} />;
  return <Globe style={style} />;
}

type ReviewDraft = {
  entryPrice: string;
  stopLossPrice: string;
  takeProfitTarget: string;
  entryIntent: "" | "continuation" | "reversal" | "range";
  entryTrigger: "" | "pullback" | "engulfing" | "pin_bar" | "ema20" | "key_level_breakout" | "range_boundary";
  entryTimeframe: "" | "1h" | "4h" | "1d" | "1w";
  entryReason: string;
  exitReason: string;
  reviewSummary: string;
  improvementPoint: string;
};

const EMPTY_REVIEW_DRAFT: ReviewDraft = {
  entryPrice: "",
  stopLossPrice: "",
  takeProfitTarget: "",
  entryIntent: "",
  entryTrigger: "",
  entryTimeframe: "",
  entryReason: "",
  exitReason: "",
  reviewSummary: "",
  improvementPoint: "",
};

const REVIEW_AUTO_READ_FROM = Date.parse("2026-07-25T16:00:00.000Z");

function TradeReviewManager() {
  const [selectedExecId, setSelectedExecId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft>(EMPTY_REVIEW_DRAFT);
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [savedMessage, setSavedMessage] = useState("");
  const { data: history, isLoading, refetch: refetchHistory } = trpc.hyperliquid.tradeHistory.useQuery(
    { startDate: "2026-06-27", limit: 1000 },
    { refetchInterval: 120_000 }
  );
  const trades = history?.trades ?? [];
  const selectedTrade = trades.find((trade) => trade.execId === selectedExecId);
  const { data: review, isFetching: isReviewFetching } = trpc.hyperliquid.tradeReview.useQuery(
    { tradeExecId: selectedExecId ?? "none" },
    { enabled: selectedExecId != null }
  );
  const { refetch: refetchOpenOrders } = trpc.hyperliquid.openOrders.useQuery(
    undefined,
    { enabled: selectedTrade != null && !selectedTrade.closeMethod, refetchInterval: 10_000 }
  );
  const { data: accountOverview } = trpc.hyperliquid.accountOverview.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );
  const saveMutation = trpc.hyperliquid.saveTradeReview.useMutation();
  const utils = trpc.useUtils();
  const canAutoRead = selectedTrade != null && Number(selectedTrade.createdTime) >= REVIEW_AUTO_READ_FROM;

  useEffect(() => {
    setDraft({
      entryPrice: review?.entryPrice ?? (canAutoRead ? selectedTrade?.execPrice ?? "" : ""),
      stopLossPrice: review?.stopLossPrice ?? (canAutoRead ? selectedTrade?.triggerPrice ?? "" : ""),
      takeProfitTarget: review?.takeProfitTarget ?? "",
      entryIntent: review?.entryIntent ?? "",
      entryTrigger: review?.entryTrigger ?? "",
      entryTimeframe: review?.entryTimeframe ?? "",
      entryReason: review?.entryReason ?? "",
      exitReason: review?.exitReason ?? "",
      reviewSummary: review?.reviewSummary ?? "",
      improvementPoint: review?.improvementPoint ?? "",
    });
    setStatus(review?.status === "draft" ? "draft" : "published");
    setSavedMessage("");
  }, [review, selectedTrade, canAutoRead]);

  const saveReview = async () => {
    if (!selectedTrade) return;
    try {
      const result = await saveMutation.mutateAsync({
        tradeExecId: selectedTrade.execId,
        symbol: selectedTrade.symbol,
        ...draft,
        entryIntent: draft.entryIntent || undefined,
        entryTrigger: draft.entryTrigger || undefined,
        entryTimeframe: draft.entryTimeframe || undefined,
        execQty: selectedTrade.execQty,
        status,
      });
      utils.hyperliquid.tradeReview.setData({ tradeExecId: selectedTrade.execId }, result.review);
      await utils.hyperliquid.tradeReview.invalidate({ tradeExecId: selectedTrade.execId });
      setStatus(result.review.status === "published" ? "published" : "draft");
      setSavedMessage(result.review.status === "published" ? "已保存并展示给学员" : "草稿已保存");
    } catch (error) {
      setSavedMessage(error instanceof Error ? error.message : "保存失败，请稍后重试");
    }
  };

  const autoReadEntryFields = async () => {
    if (!selectedTrade || !canAutoRead || selectedTrade.closeMethod) return;
    const [latest, latestOpenOrders] = await Promise.all([refetchHistory(), refetchOpenOrders()]);
    const latestTrade = latest.data?.trades.find((trade) => trade.execId === selectedTrade.execId) ?? selectedTrade;
    const stopOrder = latestOpenOrders.data?.find((order) => {
      const orderType = String(order.orderType ?? "").toLowerCase();
      const isStopOrder = orderType.includes("stop") || (
        Boolean(order.isTrigger) && Boolean(order.reduceOnly) && !orderType.includes("take profit")
      );
      return order.symbol === latestTrade.symbol && isStopOrder && Number(order.triggerPrice) > 0;
    });
    const stopPrice = stopOrder?.triggerPrice || latestTrade.triggerPrice || "";
    const hasTriggerPrice = Number(stopPrice) > 0;
    const nextDraft = {
      ...draft,
      entryPrice: latestTrade.execPrice,
      stopLossPrice: hasTriggerPrice ? stopPrice : draft.stopLossPrice,
    };
    setDraft(nextDraft);
    try {
      const result = await saveMutation.mutateAsync({
        tradeExecId: selectedTrade.execId,
        symbol: selectedTrade.symbol,
        ...nextDraft,
        entryIntent: nextDraft.entryIntent || undefined,
        entryTrigger: nextDraft.entryTrigger || undefined,
        entryTimeframe: nextDraft.entryTimeframe || undefined,
        execQty: selectedTrade.execQty,
        status,
      });
      utils.hyperliquid.tradeReview.setData({ tradeExecId: selectedTrade.execId }, result.review);
      await utils.hyperliquid.tradeReview.invalidate({ tradeExecId: selectedTrade.execId });
      setStatus(result.review.status === "published" ? "published" : "draft");
      setSavedMessage(hasTriggerPrice ? "已读取并保存进场价、止损价和风险" : "已读取并保存进场价，止损价请手动填写后保存");
    } catch (error) {
      setSavedMessage(error instanceof Error ? error.message : "自动读取后保存失败，请稍后重试");
    }
  };

  return (
    <Panel title="交易复盘管理" sub="编辑后保存，前台复盘页自动呈现">
      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">加载交易记录中…</div>
          ) : trades.length === 0 ? (
            <EmptyState />
          ) : (
            trades.map((trade) => {
              const isSelected = trade.execId === selectedExecId;
              const isBuy = trade.side === "buy" || trade.side === "B";
              return (
                <button
                  key={trade.execId}
                  onClick={() => setSelectedExecId(trade.execId)}
                  className="w-full text-left rounded-lg px-3 py-3 transition-colors"
                  style={{
                    background: isSelected ? "rgb(92 211 184 / 10%)" : "var(--surface-subtle)",
                    border: `1px solid ${isSelected ? "rgb(92 211 184 / 42%)" : "var(--panel-border)"}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground" style={{ fontSize: "0.76rem" }}>{trade.symbol}</span>
                    <span style={{ color: isBuy ? GREEN : "oklch(62% 0.15 25)", fontSize: "0.68rem" }}>{isBuy ? "买入" : "卖出"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1 text-muted-foreground/65" style={{ fontSize: "0.64rem" }}>
                    <span>{new Date(Number(trade.createdTime)).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="num-display">盈亏 {Number(trade.execPnl) >= 0 ? "+" : ""}{Number(trade.execPnl).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {selectedTrade ? (
          <div className="rounded-lg p-4" style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-foreground font-medium">{selectedTrade.symbol} · 交易复盘</div>
                <div className="text-muted-foreground/60 mt-1" style={{ fontSize: "0.66rem" }}>成交编号：{selectedTrade.execId}</div>
              </div>
              <span className="text-muted-foreground" style={{ fontSize: "0.66rem" }}>{isReviewFetching ? "读取中…" : review?.status === "published" ? "已发布" : "未发布"}</span>
            </div>
            <div className="grid gap-3">
              {!selectedTrade.closeMethod ? (
                <>
                  {canAutoRead && (
                    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "rgb(92 211 184 / 7%)", border: "1px solid rgb(92 211 184 / 26%)" }}>
                      <span className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>2026-07-26 00:00 后的订单支持自动读取</span>
                      <button
                        type="button"
                        onClick={autoReadEntryFields}
                        disabled={isReviewFetching || isLoading}
                        className="rounded-full px-3 py-1 text-xs disabled:opacity-50"
                        style={{ border: "1px solid rgb(92 211 184 / 42%)", color: "rgb(92 211 184 / 92%)" }}
                      >
                        自动读取
                      </button>
                    </div>
                  )}
                  {([
                    ["进场价格", "entryPrice"],
                    ["止损价格", "stopLossPrice"],
                  ] as const).map(([label, key]) => (
                    <label key={key} className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                      {label}
                      <input
                        value={draft[key]}
                        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                        className="w-full rounded-lg px-3 py-2 bg-transparent text-foreground outline-none"
                        style={{ border: "1px solid var(--panel-border)" }}
                        placeholder={key === "stopLossPrice" ? "Hyperliquid 未提供时手动填写" : `填写${label}…`}
                      />
                    </label>
                  ))}
                  <div className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                    单笔风险
                    <div className="rounded-lg px-3 py-2 text-foreground" style={{ border: "1px solid var(--panel-border)", background: "var(--background)" }}>
                      {(() => {
                        const entry = Number(draft.entryPrice);
                        const stop = Number(draft.stopLossPrice);
                        const qty = Number(selectedTrade.execQty);
                        const risk = Number.isFinite(entry) && Number.isFinite(stop) && Number.isFinite(qty) && entry > 0 && stop > 0 && qty > 0
                          ? Math.abs(entry - stop) * qty
                          : Number(review?.riskAmount);
                        const equity = Number(accountOverview?.totalEquityUsdc);
                        const riskPercent = Number.isFinite(risk) && risk > 0 && equity > 0 ? (risk / equity) * 100 : null;
                        return Number.isFinite(risk) && risk > 0 ? (
                          <span>{risk.toLocaleString("en-US", { maximumFractionDigits: 8 })} USDC（{riskPercent != null ? `${riskPercent.toFixed(2)}%` : "—"}）</span>
                        ) : "保存后自动计算";
                      })()}
                    </div>
                  </div>
                  <label className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                    止盈目标（可选）
                    <input
                      value={draft.takeProfitTarget}
                      onChange={(event) => setDraft((current) => ({ ...current, takeProfitTarget: event.target.value }))}
                      className="w-full rounded-lg px-3 py-2 bg-transparent text-foreground outline-none"
                      style={{ border: "1px solid var(--panel-border)" }}
                      placeholder="可留空，按后台填写为准"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                    进场标签
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select
                        value={draft.entryIntent}
                        onChange={(event) => setDraft((current) => ({ ...current, entryIntent: event.target.value as ReviewDraft["entryIntent"] }))}
                        className="rounded-lg px-3 py-2 bg-transparent text-foreground outline-none"
                        style={{ border: "1px solid var(--panel-border)" }}
                      >
                        <option value="">交易意图（可选）</option>
                        <option value="continuation">趋势延续</option>
                        <option value="reversal">趋势反转</option>
                        <option value="range">区间交易</option>
                      </select>
                      <select
                        value={draft.entryTrigger}
                        onChange={(event) => setDraft((current) => ({ ...current, entryTrigger: event.target.value as ReviewDraft["entryTrigger"] }))}
                        className="rounded-lg px-3 py-2 bg-transparent text-foreground outline-none"
                        style={{ border: "1px solid var(--panel-border)" }}
                      >
                        <option value="">触发方式（可选）</option>
                        <option value="pullback">回踩确认</option>
                        <option value="engulfing">吞没形态</option>
                        <option value="pin_bar">Pin Bar形态</option>
                        <option value="ema20">EMA20突破/站稳</option>
                        <option value="key_level_breakout">关键位突破</option>
                        <option value="range_boundary">区间边界反应</option>
                      </select>
                      <select
                        value={draft.entryTimeframe}
                        onChange={(event) => setDraft((current) => ({ ...current, entryTimeframe: event.target.value as ReviewDraft["entryTimeframe"] }))}
                        className="rounded-lg px-3 py-2 bg-transparent text-foreground outline-none"
                        style={{ border: "1px solid var(--panel-border)" }}
                      >
                        <option value="">周期（可选）</option>
                        <option value="1h">1H</option>
                        <option value="4h">4H</option>
                        <option value="1d">1D</option>
                        <option value="1w">1W</option>
                      </select>
                    </div>
                  </label>
                  <label className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                    {selectedTrade.side === "buy" || selectedTrade.side === "B" ? "买入/做多理由" : "卖出/做空理由"}
                    <textarea
                      rows={3}
                      value={draft[selectedTrade.side === "buy" || selectedTrade.side === "B" ? "entryReason" : "exitReason"]}
                      onChange={(event) => setDraft((current) => ({ ...current, [selectedTrade.side === "buy" || selectedTrade.side === "B" ? "entryReason" : "exitReason"]: event.target.value }))}
                      className="w-full rounded-lg px-3 py-2 bg-transparent text-foreground outline-none resize-y"
                      style={{ border: "1px solid var(--panel-border)" }}
                      placeholder={`填写${selectedTrade.side === "buy" || selectedTrade.side === "B" ? "买入/做多理由" : "卖出/做空理由"}…`}
                    />
                  </label>
                  </div>
                </>
              ) : (
                <>
                  <label className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                    {selectedTrade.side === "buy" || selectedTrade.side === "B" ? "买入/做多理由" : "卖出/做空理由"}
                    <textarea
                      rows={3}
                      value={draft[selectedTrade.side === "buy" || selectedTrade.side === "B" ? "entryReason" : "exitReason"]}
                      onChange={(event) => setDraft((current) => ({ ...current, [selectedTrade.side === "buy" || selectedTrade.side === "B" ? "entryReason" : "exitReason"]: event.target.value }))}
                      className="w-full rounded-lg px-3 py-2 bg-transparent text-foreground outline-none resize-y"
                      style={{ border: "1px solid var(--panel-border)" }}
                      placeholder={`填写${selectedTrade.side === "buy" || selectedTrade.side === "B" ? "买入/做多理由" : "卖出/做空理由"}…`}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                      复盘总结
                      <textarea
                        rows={5}
                        value={draft.reviewSummary}
                        onChange={(event) => setDraft((current) => ({ ...current, reviewSummary: event.target.value }))}
                        className="w-full rounded-lg px-3 py-2 bg-transparent text-foreground outline-none resize-y"
                        style={{ border: "1px solid var(--panel-border)" }}
                        placeholder="填写复盘总结…"
                      />
                    </label>
                    <label className="grid gap-1.5 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                      改进点
                      <textarea
                        rows={5}
                        value={draft.improvementPoint}
                        onChange={(event) => setDraft((current) => ({ ...current, improvementPoint: event.target.value }))}
                        className="w-full rounded-lg px-3 py-2 bg-transparent text-foreground outline-none resize-y"
                        style={{ border: "1px solid var(--panel-border)" }}
                        placeholder="填写下次可改进的地方…"
                      />
                    </label>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <div className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                <span>状态</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as "draft" | "published")} className="rounded-md px-2 py-1 bg-transparent text-foreground" style={{ border: "1px solid var(--panel-border)" }}>
                  <option value="draft">草稿</option>
                  <option value="published">展示给学员</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                {savedMessage && <span className="text-profit" style={{ fontSize: "0.68rem" }}>{savedMessage}</span>}
                <button onClick={saveReview} disabled={saveMutation.isPending || isReviewFetching} className="rounded-full px-4 py-1.5 text-xs disabled:opacity-50" style={{ background: "rgb(92 211 184 / 14%)", border: "1px solid rgb(92 211 184 / 40%)", color: "rgb(92 211 184 / 92%)" }}>
                  {saveMutation.isPending ? "保存中…" : "保存复盘"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-52 flex items-center justify-center rounded-lg text-muted-foreground/60 text-sm" style={{ background: "var(--surface-subtle)", border: "1px dashed var(--panel-border)" }}>
            从左侧选择一笔交易开始编辑
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
// ─── Account PnL ───────────────────────────────────────────────────────────
// Reads any of the Hyperliquid addresses configured in HYPERLIQUID_ACCOUNTS /
// HYPERLIQUID_USER_ADDRESS. The public home page always shows the default
// account; switching between accounts lives here.
const ACCOUNT_STORAGE_KEY = "analytics.hyperliquidAccountId";

function AccountPnlManager() {
  const { data: accounts, isLoading, error } = trpc.hyperliquid.accounts.useQuery();
  const [storedId, setStoredId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACCOUNT_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const list = accounts ?? [];
  // Fall back to the first account whenever the remembered id is gone from the
  // config, so a removed address can't leave the page reading nothing.
  const activeId = list.some((account) => account.id === storedId) ? storedId! : list[0]?.id;

  const selectAccount = (id: string) => {
    setStoredId(id);
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, id);
    } catch {
      // Private-mode browsers reject writes; the in-memory choice still applies.
    }
  };

  if (isLoading) {
    return <Panel title="账户盈亏"><div className="py-8 text-center text-muted-foreground text-sm animate-pulse">加载账户列表中…</div></Panel>;
  }

  if (error || list.length === 0) {
    return (
      <Panel title="账户盈亏" sub="未配置账户">
        <div className="py-6 text-center text-muted-foreground text-sm leading-relaxed">
          还没有可读取的地址。在服务端环境变量里设置 <code className="num-display">HYPERLIQUID_USER_ADDRESS</code>（主账户），
          <br />
          再用 <code className="num-display">HYPERLIQUID_ACCOUNTS=别名:0x地址:显示名</code> 添加其他账户，逗号分隔。
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel title="账户切换" sub={`${list.length} 个只读地址 · 仅本页可切换`}>
        <div className="flex flex-wrap items-center gap-2">
          {list.map((account) => (
            <button
              key={account.id}
              onClick={() => selectAccount(account.id)}
              className={`pill-tab ${activeId === account.id ? "active" : ""}`}
              title={account.address ?? undefined}
            >
              {account.label}
              {/* pill-tab uppercases its text, which would mangle the hex address. */}
              <span className="num-display ml-1.5 opacity-55" style={{ fontSize: "0.6rem", textTransform: "none" }}>
                {account.address}
              </span>
            </button>
          ))}
        </div>
      </Panel>

      {/* Keyed on the account so a switch remounts instead of showing the
          previous account's numbers while the new ones load. */}
      <div key={activeId} className="space-y-5">
        <AccountOverview accountId={activeId} />
        <PnlChart accountId={activeId} />
        <PositionsTable accountId={activeId} />
        <TradeHistory accountId={activeId} />
      </div>
    </div>
  );
}

function PersonalAssistant() {
  const { data: rawItems, isLoading } = trpc.assistant.list.useQuery();
  const items = (rawItems ?? []) as Array<{ id: number; symbol: string; companyName: string | null; exchange: string | null; assetType: string | null; priority: string; note: string | null }>;
  const { data: monitorItems = [], isFetching: isMonitoring, refetch: refetchMonitor } = trpc.assistant.monitor.useQuery(undefined, { refetchInterval: 30 * 60 * 1000 });
  const addMutation = trpc.assistant.add.useMutation();
  const removeMutation = trpc.assistant.remove.useMutation();
  const sendNowMutation = trpc.assistant.sendNow.useMutation();
  const utils = trpc.useUtils();
  const [symbol, setSymbol] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState<{ symbol: string; companyName: string; exchange: string; assetType: string } | null>(null);
  const [priority, setPriority] = useState<"高" | "中" | "低">("中");
  const [note, setNote] = useState("");
  const { data: rawSearchResults, isFetching: isSearching } = trpc.assistant.search.useQuery(
    { query: symbol.trim() },
    { enabled: symbol.trim().length > 0 && !selectedInstrument, staleTime: 60_000 },
  );
  const searchResults = (rawSearchResults ?? []) as Array<{ symbol: string; companyName: string; exchange: string; assetType: string }>;

  const addItem = async () => {
    if (!selectedInstrument || addMutation.isPending) return;
    await addMutation.mutateAsync({ ...selectedInstrument, priority, note: note.trim() || undefined });
    await utils.assistant.list.invalidate();
    await utils.assistant.monitor.invalidate();
    setSymbol("");
    setSelectedInstrument(null);
    setNote("");
    setPriority("中");
  };

  const daysUntil = (date: string) => Math.round((new Date(`${date}T00:00:00+08:00`).getTime() - new Date(`${utc8DateStr(Date.now())}T00:00:00+08:00`).getTime()) / DAY_MS);

  return (
    <div className="space-y-5">
      <Panel title="个人助手" sub="关注标的 · 财报 · 新闻 · 邮件提醒">
        <div className="mb-5 rounded-lg px-4 py-3 text-sm leading-relaxed" style={{ background: "var(--surface-subtle)", color: "var(--muted-foreground)" }}>
          后台每天北京时间 09:00 检查关注标的，并向站点配置的收件地址发送摘要；财报在未来 3 天内时会标记为提醒。
        </div>
        <div className="grid gap-3 sm:grid-cols-[1.4fr_110px_1.4fr_auto] sm:items-end">
          <label className="text-xs text-muted-foreground">
            搜索公司或代码
            <input value={symbol} onChange={(event) => { setSymbol(event.target.value); setSelectedInstrument(null); }} onKeyDown={(event) => { if (event.key === "Enter" && selectedInstrument) addItem(); }} placeholder="例如 CBRS / Cerebras" className="mt-2 w-full rounded-lg bg-transparent px-3 py-2.5 text-sm focus:outline-none" style={{ border: "1px solid var(--panel-border)" }} />
            {!selectedInstrument && symbol.trim() && (
              <div className="mt-2 overflow-hidden rounded-lg" style={{ border: "1px solid var(--panel-border)", background: "var(--background)" }}>
                {isSearching ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">正在查找公司…</div>
                ) : searchResults.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">未找到对应公司，请检查代码或名称</div>
                ) : (
                  <div className="max-h-56 overflow-y-auto">
                    {searchResults.map((match) => (
                      <button key={`${match.exchange}-${match.symbol}`} type="button" onClick={() => { setSymbol(match.symbol); setSelectedInstrument(match); }} className="block w-full px-3 py-2.5 text-left text-xs hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
                        <span className="font-medium">{match.symbol}</span><span className="ml-2">{match.companyName}</span><span className="ml-2 text-muted-foreground">{match.exchange}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selectedInstrument && <div className="mt-2 text-xs" style={{ color: "var(--accent)" }}>已确认：{selectedInstrument.companyName}（{selectedInstrument.symbol}） · {selectedInstrument.exchange}</div>}
          </label>
          <label className="text-xs text-muted-foreground">
            优先级
            <select value={priority} onChange={(event) => setPriority(event.target.value as "高" | "中" | "低")} className="mt-2 w-full rounded-lg bg-transparent px-3 py-2.5 text-sm focus:outline-none" style={{ border: "1px solid var(--panel-border)", color: "var(--foreground)" }}>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            备注
            <input value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addItem(); }} placeholder="例如：等待财报验证" className="mt-2 w-full rounded-lg bg-transparent px-3 py-2.5 text-sm focus:outline-none" style={{ border: "1px solid var(--panel-border)" }} />
          </label>
          <button type="button" onClick={addItem} disabled={!selectedInstrument || addMutation.isPending} className="inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-sm disabled:opacity-50" style={{ background: "var(--foreground)", color: "var(--background)" }}><Plus size={15} />{addMutation.isPending ? "保存中" : "添加"}</button>
        </div>
      </Panel>

      <Panel title="关注清单" sub={`${items.length} 个标的 · ${isMonitoring ? "更新中" : "已更新"}`}>
        <div className="mb-4 flex justify-end gap-2">
          <button type="button" onClick={() => refetchMonitor()} className="rounded-lg px-3 py-2 text-xs" style={{ border: "1px solid var(--panel-border)", color: "var(--muted-foreground)" }}>刷新监控</button>
          <button type="button" onClick={() => sendNowMutation.mutate()} disabled={sendNowMutation.isPending || items.length === 0} className="rounded-lg px-3 py-2 text-xs disabled:opacity-50" style={{ border: "1px solid var(--panel-border)", color: "var(--muted-foreground)" }}>{sendNowMutation.isPending ? "发送中" : "立即发摘要"}</button>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground/60">加载关注清单中…</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground/60">暂无关注标的，请先添加一个。</div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg px-4 py-4" style={{ background: "var(--surface-subtle)" }}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                  <span className="num-display font-medium">{item.symbol}</span>
                    {item.companyName && <span className="truncate text-xs text-muted-foreground">{item.companyName}</span>}
                    {item.exchange && <span className="text-[11px] text-muted-foreground">{item.exchange}</span>}
                    <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ color: item.priority === "高" ? "var(--destructive)" : "var(--muted-foreground)", border: "1px solid var(--panel-border)" }}>{item.priority}优先</span>
                    {item.note && <span className="truncate text-xs text-muted-foreground">{item.note}</span>}
                  </div>
                  <button type="button" onClick={async () => { await removeMutation.mutateAsync({ id: item.id }); await utils.assistant.list.invalidate(); await utils.assistant.monitor.invalidate(); }} className="self-end rounded-md p-1.5 text-muted-foreground hover:text-destructive" aria-label={`删除 ${item.symbol}`}><Trash2 size={15} /></button>
                </div>
                {(() => {
                  const monitored = monitorItems.find((entry) => entry.symbol === item.symbol);
                  return (
                    <div className="mt-4 grid gap-3 border-t pt-3 text-xs sm:grid-cols-2" style={{ borderColor: "var(--panel-border)" }}>
                      <div>
                        <div className="text-muted-foreground">财报</div>
                        <div className="mt-1">{monitored?.earnings ? `${monitored.earnings.reportDate} · ${monitored.earnings.timeOfDayUtc8 ?? "时间待确认"}${daysUntil(monitored.earnings.reportDate) <= 3 ? ` · 还有 ${Math.max(0, daysUntil(monitored.earnings.reportDate))} 天` : ""}` : "未来 31 天未找到财报安排"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">最新新闻</div>
                        {monitored?.news?.[0] ? <div className="mt-1"><div className="truncate">{monitored.news[0].summaryZh}</div><a href={monitored.news[0].link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-muted-foreground underline-offset-2 hover:underline">查看原文 · {monitored.news[0].source}</a></div> : <div className="mt-1">暂无新闻摘要</div>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

type Period = "today" | "week" | "month" | "custom";

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "today", label: "今日" },
  { key: "week", label: "近 7 天" },
  { key: "month", label: "近 30 天" },
  { key: "custom", label: "自定义" },
];

function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>("week");
  const [view, setView] = useState<"traffic" | "reviews" | "accounts" | "assistant">("traffic");
  const [customStart, setCustomStart] = useState(() => utc8DateStr(Date.now() - 6 * DAY_MS));
  const [customEnd, setCustomEnd] = useState(() => utc8DateStr(Date.now()));

  const now = Date.now();
  const dateRange = (() => {
    if (period === "today") return { startDate: utc8DateStr(now), endDate: utc8DateStr(now) };
    if (period === "week") return { startDate: utc8DateStr(now - 6 * DAY_MS), endDate: utc8DateStr(now) };
    if (period === "month") return { startDate: utc8DateStr(now - 29 * DAY_MS), endDate: utc8DateStr(now) };
    return { startDate: customStart, endDate: customEnd };
  })();

  const { data, isLoading, isFetching, refetch } = trpc.analytics.overview.useQuery(dateRange, {
    refetchInterval: 30_000,
  });

  const summary = data?.summary ?? { visits: 0, uniqueIps: 0, avgDuration: 0 };
  const daily = data?.daily ?? [];
  const dailyHourly = data?.dailyHourly ?? [];
  const device = data?.device ?? [];
  const os = data?.os ?? [];
  const browser = data?.browser ?? [];
  const hourly = data?.hourly ?? [];
  const geo = data?.geo ?? [];
  const recent = data?.recent ?? [];

  // Pad days without data inside the selected range so the trend chart always
  // shows the full period — a single day of data otherwise renders as one
  // lonely bar that looks like an empty/broken chart.
  const paddedDaily = (() => {
    if (daily.length === 0) return daily;
    const byDate = new Map(daily.map((d) => [d.date, d]));
    const out: Array<(typeof daily)[number]> = [];
    const start = new Date(`${dateRange.startDate}T00:00:00.000+08:00`).getTime();
    const end = new Date(`${dateRange.endDate}T00:00:00.000+08:00`).getTime();
    for (let t = start; t <= end; t += DAY_MS) {
      const key = utc8DateStr(t);
      out.push(byDate.get(key) ?? { date: key, visits: 0, uniqueIps: 0, avgDuration: 0 });
    }
    return out;
  })();

  const deviceTotal = device.reduce((sum, d) => sum + d.count, 0);
  const mobileCount = device.filter((d) => d.deviceType === "mobile" || d.deviceType === "tablet").reduce((sum, d) => sum + d.count, 0);
  const mobilePct = deviceTotal > 0 ? Math.round((mobileCount / deviceTotal) * 100) : 0;

  const maxDailyVisits = paddedDaily.reduce((m, d) => Math.max(m, d.visits), 0) || 1;
  const peakHour = hourly.reduce((best, h) => (h.visits > (best?.visits ?? -1) ? h : best), hourly[0]);
  const maxGeoCount = geo.reduce((m, g) => Math.max(m, g.count), 0) || 1;
  const maxBrowserCount = browser.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  const maxOsCount = os.reduce((m, o) => Math.max(m, o.count), 0) || 1;
  const labelEvery = Math.max(1, Math.ceil(paddedDaily.length / 15));

  return (
    <div className="min-h-screen px-4 sm:px-8 py-6 sm:py-8" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="glass-card px-5 sm:px-8 py-5 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
                {view === "traffic" ? "访问统计" : view === "reviews" ? "交易复盘" : view === "accounts" ? "账户盈亏" : "个人助手"}
              </h2>
              <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
              <p className="text-muted-foreground/70 mt-2" style={{ fontSize: "0.72rem" }}>
                {view === "traffic"
                  ? "网站访问数据 · 时间均为 UTC+8 · 不含本页访问"
                  : view === "reviews"
                  ? "编辑交易复盘内容 · 保存后前台自动呈现"
                  : view === "accounts"
                  ? "切换查看各个 Hyperliquid 只读地址 · 首页始终只展示主账户"
                  : "管理关注标的 · 后续接入财报、新闻与提醒"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {view === "traffic" && PERIODS.map((p) => (
                <button key={p.key} onClick={() => setPeriod(p.key)} className={`pill-tab ${period === p.key ? "active" : ""}`}>
                  {p.label}
                </button>
              ))}
              {view === "traffic" && (
                <button
                  onClick={() => refetch()}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title="刷新"
                >
                  <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
                </button>
              )}
              <a
                href="/"
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                title="返回主页"
              >
                <ArrowLeft size={14} />
              </a>
            </div>
          </div>
          {view === "traffic" && period === "custom" && (
            <div className="mt-4 flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg bg-transparent focus:outline-none"
                style={{ border: "1px solid var(--panel-border)", color: "var(--foreground)" }}
              />
              <span className="text-muted-foreground/50">—</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg bg-transparent focus:outline-none"
                style={{ border: "1px solid var(--panel-border)", color: "var(--foreground)" }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}>
          {([
            ["traffic", "访问统计"],
            ["reviews", "交易复盘"],
            ["accounts", "账户盈亏"],
            ["assistant", "个人助手"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className="flex-1 rounded-md px-4 py-2 transition-colors"
              style={{
                fontSize: "0.72rem",
                color: view === key ? "var(--foreground)" : "var(--text-soft)",
                background: view === key ? "var(--background)" : "transparent",
                boxShadow: view === key ? "0 2px 10px rgb(0 0 0 / 18%)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "assistant" ? (
          <PersonalAssistant />
        ) : view === "reviews" ? (
          <TradeReviewManager />
        ) : view === "accounts" ? (
          <AccountPnlManager />
        ) : isLoading ? (
          <div className="glass-card px-8 py-16 text-center text-muted-foreground text-sm animate-pulse">加载访问数据...</div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="总访问量" value={summary.visits.toLocaleString()} sub="页面访问次数（PV）" />
              <KpiTile
                label="独立访客"
                value={summary.uniqueIps.toLocaleString()}
                sub="按 IP 区间去重"
                tooltip="整个时间范围内按 IP 去重的访客数，同一访客多次访问只计一次"
              />
              <KpiTile
                label="平均停留"
                value={formatDuration(summary.avgDuration)}
                sub="按访问加权的平均时长"
              />
              <KpiTile
                label="移动端占比"
                value={`${mobilePct}%`}
                sub={`${mobileCount.toLocaleString()} / ${deviceTotal.toLocaleString()} 次访问`}
              />
            </div>

            {/* Daily trend */}
            <Panel title="访问趋势" sub="按天（UTC+8）">
              {daily.length === 0 ? (
                <EmptyState />
              ) : (
                <div>
                  <div className="flex items-end gap-[3px]" style={{ height: "10rem" }}>
                    {paddedDaily.map((d) => (
                      <div key={d.date} className="flex-1 flex items-end justify-center gap-[2px] min-w-0" title={`${d.date} · 访问 ${d.visits} · 访客 ${d.uniqueIps}`}>
                        <div
                          className="flex-1 rounded-t-sm transition-all duration-500"
                          style={{ height: `${(d.visits / maxDailyVisits) * 100}%`, background: GREEN, minHeight: d.visits > 0 ? "3px" : "0" }}
                        />
                        <div
                          className="rounded-t-sm transition-all duration-500"
                          style={{ width: "35%", height: `${(d.uniqueIps / maxDailyVisits) * 100}%`, background: GOLD, minHeight: d.uniqueIps > 0 ? "3px" : "0" }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-[3px] mt-2">
                    {paddedDaily.map((d, i) => (
                      <div key={d.date} className="flex-1 text-center text-muted-foreground/55 truncate" style={{ fontSize: "0.58rem" }}>
                        {i % labelEvery === 0 || i === paddedDaily.length - 1 ? formatDayLabel(d.date) : ""}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground/70" style={{ fontSize: "0.66rem" }}>
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: GREEN }} />
                      访问量
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground/70" style={{ fontSize: "0.66rem" }}>
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: GOLD }} />
                      独立访客
                    </span>
                  </div>
                </div>
              )}
            </Panel>

            {/* Hourly + Device */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="访问时段" sub={peakHour && peakHour.visits > 0 ? `高峰 ${String(peakHour.hour).padStart(2, "0")}:00（UTC+8）` : "UTC+8"}>
                {hourly.every((h) => h.visits === 0) ? (
                  <EmptyState />
                ) : (
                  <div>
                    {(() => {
                      // GitHub-contributions-style heatmap:
                      // rows = days in range, columns = hours (UTC+8),
                      // cell color intensity = visit count.
                      const visitsByDayHour = new Map<string, number>();
                      let maxCell = 0;
                      for (const c of dailyHourly) {
                        visitsByDayHour.set(`${c.date}|${c.hour}`, c.visits);
                        if (c.visits > maxCell) maxCell = c.visits;
                      }
                      const days = paddedDaily.map((d) => d.date);
                      const hours = Array.from({ length: 24 }, (_, h) => h);
                      const alphaFor = (v: number) => 0.25 + 0.75 * (v / (maxCell || 1));
                      return (
                        <div>
                          <div className="flex gap-[3px] mb-[3px]" style={{ paddingLeft: 40 }}>
                            {hours.map((h) => (
                              <div key={h} className="flex-1 text-center text-muted-foreground/55" style={{ fontSize: "0.52rem" }}>
                                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                              </div>
                            ))}
                          </div>
                          {days.map((day) => (
                            <div key={day} className="flex gap-[3px] mb-[3px] items-center">
                              <div className="shrink-0 text-right text-muted-foreground/55" style={{ width: 36, fontSize: "0.52rem" }}>
                                {formatDayLabel(day)}
                              </div>
                              {hours.map((h) => {
                                const v = visitsByDayHour.get(`${day}|${h}`) ?? 0;
                                return (
                                  <span
                                    key={h}
                                    className="flex-1 rounded-[2px] transition-all duration-300"
                                    style={{
                                      aspectRatio: "1",
                                      background: v === 0 ? "var(--surface-subtle)" : GREEN,
                                      opacity: v === 0 ? 1 : alphaFor(v),
                                      boxShadow: v === 0 ? "inset 0 0 0 1px var(--panel-border)" : "none",
                                    }}
                                    title={`${day} ${String(h).padStart(2, "0")}:00 · ${v} 次访问`}
                                  />
                                );
                              })}
                            </div>
                          ))}
                          <div className="flex items-center justify-end gap-1 mt-2 text-muted-foreground/55" style={{ fontSize: "0.6rem" }}>
                            少
                            {[0.25, 0.5, 0.75, 1].map((a) => (
                              <span key={a} className="rounded-[2px]" style={{ width: 10, height: 10, background: GREEN, opacity: a }} />
                            ))}
                            多
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </Panel>

              <Panel title="设备分布" sub={`共 ${deviceTotal.toLocaleString()} 次访问`}>
                {device.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-4">
                    <div className="flex h-3 rounded-full overflow-hidden" style={{ background: "var(--panel-border)" }}>
                      {device.map((d) => (
                        <div
                          key={d.deviceType ?? "unknown"}
                          style={{ width: `${d.percentage}%`, background: DEVICE_META[d.deviceType ?? ""]?.color ?? "var(--text-faint)" }}
                          title={`${deviceLabel(d.deviceType)} ${d.percentage}%`}
                        />
                      ))}
                    </div>
                    <div className="space-y-2.5">
                      {device.map((d) => (
                        <div key={d.deviceType ?? "unknown"} className="flex items-center gap-2.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: DEVICE_META[d.deviceType ?? ""]?.color ?? "var(--text-faint)" }} />
                          <span className="text-muted-foreground flex items-center gap-1.5" style={{ fontSize: "0.72rem" }}>
                            {deviceIcon(d.deviceType)}
                            {deviceLabel(d.deviceType)}
                          </span>
                          <span className="num-display ml-auto" style={{ fontSize: "0.72rem" }}>{d.count.toLocaleString()}</span>
                          <span className="num-display text-muted-foreground/60 w-10 text-right" style={{ fontSize: "0.66rem" }}>{d.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            {/* Geo + Environment */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="地理分布" sub="按访问次数 · Top 8">
                {geo.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-2.5">
                    {geo.slice(0, 8).map((g) => (
                      <HBarRow
                        key={`${g.region}-${g.city}`}
                        label={g.region || g.city || "未知地区"}
                        value={g.count.toLocaleString()}
                        pct={`${g.percentage}%`}
                        widthPct={(g.count / maxGeoCount) * 100}
                        color={GREEN}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="访问环境" sub="浏览器 / 操作系统 · Top 5">
                {browser.length === 0 && os.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground/70 tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
                        <Monitor style={{ width: "11px", height: "11px" }} />
                        浏览器
                      </div>
                      {browser.slice(0, 5).map((b) => (
                        <HBarRow
                          key={b.browser ?? "unknown"}
                          label={b.browser ?? "未知"}
                          value={b.count.toLocaleString()}
                          pct={`${b.percentage}%`}
                          widthPct={(b.count / maxBrowserCount) * 100}
                          color={BLUE}
                        />
                      ))}
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground/70 tracking-widest uppercase" style={{ fontSize: "0.58rem" }}>
                        <Laptop style={{ width: "11px", height: "11px" }} />
                        操作系统
                      </div>
                      {os.slice(0, 5).map((o) => (
                        <HBarRow
                          key={o.os ?? "unknown"}
                          label={o.os ?? "未知"}
                          value={o.count.toLocaleString()}
                          pct={`${o.percentage}%`}
                          widthPct={(o.count / maxOsCount) * 100}
                          color={GOLD}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            {/* Real-time visitors */}
            <Panel
              title="实时访客"
              sub={`最近 ${recent.length} 条 · 30 秒自动刷新`}
            >
              {recent.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-2">
                  {recent.map((v, i) => {
                    const isLive = Date.now() - new Date(v.createdAt).getTime() < 60_000;
                    return (
                      <div
                        key={`${v.createdAt}-${i}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                        style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}
                      >
                        <span className="relative flex shrink-0" style={{ width: 8, height: 8 }}>
                          <span
                            className={`absolute inline-flex h-full w-full rounded-full ${isLive ? "animate-ping opacity-60" : "opacity-0"}`}
                            style={{ background: GREEN }}
                          />
                          <span className="relative inline-flex rounded-full" style={{ width: 8, height: 8, background: isLive ? GREEN : "var(--text-faint)" }} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1" style={{ fontSize: "0.75rem" }}>
                              <MapPin style={{ width: "11px", height: "11px" }} className="text-muted-foreground/60" />
                              {v.region || v.city || "未知地区"}
                              {v.city && v.region && <span className="text-muted-foreground/55" style={{ fontSize: "0.66rem" }}>({v.city})</span>}
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground/70" style={{ fontSize: "0.68rem" }}>
                              {deviceIcon(v.deviceType)}
                              {deviceLabel(v.deviceType)}
                            </span>
                            {v.isProxy ? (
                              <span
                                className="shrink-0"
                                title="浏览器时区与 IP 归属地不符，或该 IP 是代理/机房地址——显示的位置可能不真实"
                                style={{ fontSize: "0.62rem", lineHeight: 1.5, padding: "0 6px", borderRadius: 999, color: "oklch(52% 0.13 60)", background: "oklch(82% 0.11 85 / 0.2)", border: "1px solid oklch(72% 0.12 75 / 0.4)" }}
                              >
                                疑似代理
                              </span>
                            ) : null}
                          </div>
                          <div className="text-muted-foreground/55 mt-0.5 truncate" style={{ fontSize: "0.66rem" }}>
                            {v.page || "/"} · {v.os || "未知系统"} · {v.browser || "未知浏览器"}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1" style={{ fontSize: "0.7rem", color: isLive ? GREEN : NEUTRAL }}>
                            {!isLive && <Clock style={{ width: "10px", height: "10px" }} className="text-muted-foreground/50" />}
                            {relativeTime(v.createdAt)}
                          </div>
                          <div className="text-muted-foreground/50 num-display" style={{ fontSize: "0.62rem" }}>
                            {absoluteTime(v.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* Footer status */}
            <div className="flex items-center justify-center gap-2 text-muted-foreground/55 pb-4" style={{ fontSize: "0.66rem" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: data ? GREEN : "oklch(62% 0.15 25)" }} />
              {data ? `数据库正常 · 共 ${data.totalRecords.toLocaleString()} 条记录` : "数据库连接异常"}
              <span>·</span>
              <span>每 30 秒自动刷新</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Owner gate ────────────────────────────────────────────────────────────
// The page is a static file on a CDN, so nothing here can keep anyone out — the
// server refuses the data without the key. This only decides what to render, and
// stops the dashboard's queries from firing (and failing) before there is a key.
function AdminGate({ children }: { children: ReactNode }) {
  const [keyInput, setKeyInput] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const utils = trpc.useUtils();

  const { data: status, isLoading, refetch } = trpc.auth.adminStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: config } = trpc.auth.adminKeyConfigured.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    const key = keyInput.trim();
    if (!key || submitting) return;
    setMessage("");
    setSubmitting(true);
    writeAdminKey(key);
    const result = await refetch();
    setSubmitting(false);
    if (result.data?.ok) {
      setKeyInput("");
      // Everything else on the page was fetched (or refused) without the key.
      await utils.invalidate();
      return;
    }
    writeAdminKey("");
    setMessage("口令错误");
  };

  const signOut = async () => {
    writeAdminKey("");
    // Invalidating alone would refetch and fail while React Query keeps serving the
    // last successful result, leaving the gate open. Reset drops that result so the
    // form comes back.
    await utils.auth.adminStatus.reset();
    await utils.invalidate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="text-muted-foreground text-sm animate-pulse">校验中…</div>
      </div>
    );
  }

  if (!status?.ok) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <div className="glass-card w-full max-w-sm px-6 py-8">
          <h2 className="text-xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            后台
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />

          {config && !config.configured ? (
            <p className="text-muted-foreground/70 mt-5 leading-relaxed" style={{ fontSize: "0.72rem" }}>
              服务端还没有设置管理口令。在部署环境变量里加上{" "}
              <code className="num-display">ADMIN_KEY</code>，重新部署后再来。
            </p>
          ) : (
            <form onSubmit={signIn} className="mt-5 space-y-3">
              <input
                type="password"
                value={keyInput}
                onChange={(event) => setKeyInput(event.target.value)}
                placeholder="管理口令"
                autoFocus
                autoComplete="current-password"
                className="w-full px-3 py-2 rounded-lg bg-transparent focus:outline-none"
                style={{ border: "1px solid var(--panel-border)", color: "var(--foreground)", fontSize: "0.82rem" }}
              />
              <button
                type="submit"
                disabled={submitting || keyInput.trim() === ""}
                className="w-full rounded-lg px-4 py-2 transition-colors disabled:opacity-40"
                style={{
                  fontSize: "0.75rem",
                  background: "var(--surface-subtle)",
                  border: "1px solid var(--panel-border)",
                  color: "var(--foreground)",
                }}
              >
                {submitting ? "校验中…" : "进入"}
              </button>
              {message && (
                <p style={{ fontSize: "0.7rem", color: "oklch(62% 0.15 25)" }}>{message}</p>
              )}
            </form>
          )}

          <a
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontSize: "0.7rem" }}
          >
            <ArrowLeft size={12} />
            返回主页
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <div className="flex justify-center pb-8" style={{ background: "var(--background)" }}>
        <button
          onClick={signOut}
          className="text-muted-foreground/60 hover:text-foreground transition-colors"
          style={{ fontSize: "0.66rem" }}
        >
          退出后台
        </button>
      </div>
    </>
  );
}

function AnalyticsPage() {
  return (
    <AdminGate>
      <AnalyticsDashboard />
    </AdminGate>
  );
}

export default AnalyticsPage;
