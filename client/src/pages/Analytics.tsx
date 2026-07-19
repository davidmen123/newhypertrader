import { useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Clock, Globe, Info, Laptop, MapPin, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

// ─── Dashboard ─────────────────────────────────────────────────────────────
type Period = "today" | "week" | "month" | "custom";

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "today", label: "今日" },
  { key: "week", label: "近 7 天" },
  { key: "month", label: "近 30 天" },
  { key: "custom", label: "自定义" },
];

function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>("week");
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
                访问统计
              </h2>
              <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
              <p className="text-muted-foreground/70 mt-2" style={{ fontSize: "0.72rem" }}>
                网站访问数据 · 时间均为 UTC+8 · 不含本页访问
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => setPeriod(p.key)} className={`pill-tab ${period === p.key ? "active" : ""}`}>
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => refetch()}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                title="刷新"
              >
                <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
              </button>
              <a
                href="/"
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                title="返回主页"
              >
                <ArrowLeft size={14} />
              </a>
            </div>
          </div>
          {period === "custom" && (
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

        {isLoading ? (
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
                      // Dot-matrix: one column per hour, one lit dot per visit.
                      const DOT_CAP = 8;
                      const maxVisits = hourly.reduce((m, h) => Math.max(m, h.visits), 0);
                      const rows = Math.min(Math.max(maxVisits, 1), DOT_CAP);
                      return (
                        <div>
                          <div className="flex gap-[3px]">
                            {hourly.map((h) => {
                              const filled = Math.min(h.visits, rows);
                              const overflow = h.visits - filled;
                              const isPeak = h.hour === peakHour?.hour && h.visits > 0;
                              return (
                                <div
                                  key={h.hour}
                                  className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
                                  style={{ minHeight: "7.5rem" }}
                                  title={`${String(h.hour).padStart(2, "0")}:00 · ${h.visits} 次访问`}
                                >
                                  {overflow > 0 && (
                                    <span className="num-display" style={{ fontSize: "0.55rem", lineHeight: 1, color: isPeak ? GOLD : GREEN }}>
                                      +{overflow}
                                    </span>
                                  )}
                                  <div className="flex flex-col-reverse items-center gap-[4px]">
                                    {Array.from({ length: rows }, (_, i) => (
                                      <span
                                        key={i}
                                        className="rounded-full transition-all duration-500"
                                        style={{
                                          width: 7,
                                          height: 7,
                                          background: i < filled ? (isPeak ? GOLD : GREEN) : "transparent",
                                          boxShadow: i < filled ? "none" : "inset 0 0 0 1px var(--panel-border)",
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex gap-[3px] mt-2">
                            {hourly.map((h) => (
                              <div key={h.hour} className="flex-1 text-center text-muted-foreground/55" style={{ fontSize: "0.58rem" }}>
                                {h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : ""}
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 mt-3 text-muted-foreground/55" style={{ fontSize: "0.62rem" }}>
                            <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: GREEN }} />
                            一个圆点 = 1 次访问，单小时超过 {DOT_CAP} 次以 +N 折叠
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

export default AnalyticsDashboard;
