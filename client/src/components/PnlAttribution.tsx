import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = {
  theta:    "oklch(62% 0.14 145)",  // green — theta decay (time value)
  delta:    "oklch(60% 0.12 210)",  // blue  — delta (directional)
  vega:     "oklch(68% 0.13 55)",   // amber — vega (vol exposure)
  residual: "oklch(55% 0.08 280)",  // purple — residual / other
  negative: "oklch(58% 0.14 25)",   // red for negative bars
};

type TimeRange = "7D" | "30D" | "90D" | "MAX";

// ─── Tooltip ─────────────────────────────────────────────────────────────────
interface TooltipEntry {
  value: number;
  dataKey: string;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  labels: Record<string, string>;
}

function CustomTooltip({ active, payload, label, labels }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const fmt = (v: number) =>
    `${v >= 0 ? "+" : ""}${v.toFixed(2)} USDC`;

  return (
    <div
      style={{
        background: "rgb(12 12 14 / 94%)",
        border: "1px solid rgb(255 255 255 / 12%)",
        borderRadius: 8,
        padding: "10px 14px",
        backdropFilter: "blur(12px)",
        minWidth: 180,
      }}
    >
      <div
        style={{
          fontSize: "0.65rem",
          color: "rgb(201 220 208 / 76%)",
          letterSpacing: "0.1em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {payload.map((p) => (
        <div
          key={p.dataKey}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            fontSize: "0.72rem",
            marginBottom: 2,
          }}
        >
          <span
            style={{
              color: "rgb(201 220 208 / 76%)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {labels[p.dataKey] ?? p.dataKey}
          </span>
          <span
            style={{
              color:
                p.value >= 0
                  ? "oklch(68% 0.15 145)"
                  : "oklch(62% 0.15 25)",
              fontFamily: "DM Mono, monospace",
            }}
          >
            {fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PnlAttribution() {
  const { lang } = useLang();
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");

  const labels: Record<string, string> = {
    thetaPnl:  lang === "zh" ? "Theta 衰减" : "Theta Decay",
    deltaPnl:  lang === "zh" ? "Delta 变动" : "Delta Move",
    vegaPnl:   lang === "zh" ? "Vega 变动" : "Vega Change",
    residual:  lang === "zh" ? "其他/残差" : "Residual",
  };

  const timeRangeLabels: Record<TimeRange, string> = {
    "7D": "7D",
    "30D": "30D",
    "90D": "90D",
    "MAX": "MAX",
  };

  // Compute startDate from timeRange
  const startDate = useMemo(() => {
    if (timeRange === "MAX") return undefined;
    const days = timeRange === "7D" ? 7 : timeRange === "30D" ? 30 : 90;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }, [timeRange]);

  const limit = timeRange === "7D" ? 8 : timeRange === "30D" ? 31 : timeRange === "90D" ? 91 : 365;

  const { data, isLoading } = trpc.deribit.pnlAttribution.useQuery(
    { startDate, limit },
    { refetchInterval: 5 * 60 * 1000 }
  );

  // Chart data: sorted ascending by date
  const chartData = useMemo(() => {
    if (!data) return [];
    return [...data]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date.slice(5), // MM-DD
        fullDate: d.date,
        thetaPnl: parseFloat(d.thetaPnl.toFixed(4)),
        deltaPnl: parseFloat(d.deltaPnl.toFixed(4)),
        vegaPnl: parseFloat(d.vegaPnl.toFixed(4)),
        residual: parseFloat(d.residual.toFixed(4)),
        totalPnl: parseFloat(d.totalPnl.toFixed(4)),
        deltaTotal: d.deltaTotal,
        optionsTheta: d.optionsTheta,
        optionsVega: d.optionsVega,
        btcPrice: d.btcPrice,
      }));
  }, [data]);

  // Summary stats
  const summary = useMemo(() => {
    if (!chartData.length) return null;
    const sum = (key: keyof typeof chartData[0]) =>
      chartData.reduce((acc, d) => acc + (Number(d[key]) || 0), 0);
    return {
      totalPnl: sum("totalPnl"),
      thetaPnl: sum("thetaPnl"),
      deltaPnl: sum("deltaPnl"),
      vegaPnl: sum("vegaPnl"),
      residual: sum("residual"),
    };
  }, [chartData]);

  const fmtPnl = (v: number) =>
    `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

  const pnlColor = (v: number) =>
    v >= 0 ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)";

  const sectionLabel = {
    title: lang === "zh" ? "P&L 归因分析" : "P&L Attribution",
    subtitle: lang === "zh"
      ? "将每期盈亏拆解为 Theta 衰减 / Delta 变动 / Vega 变动 / 其他"
      : "Decompose each period's P&L into Theta / Delta / Vega / Residual",
    noData: lang === "zh"
      ? "暂无归因数据 — 需要至少两个快照才能计算差值"
      : "No attribution data yet — requires at least 2 snapshots to compute differences",
    loading: lang === "zh" ? "加载中..." : "Loading...",
    total: lang === "zh" ? "合计" : "Total",
  };

  return (
    <div
      style={{
        background: "rgb(255 255 255 / 5%)",
        border: "1px solid rgb(255 255 255 / 9%)",
        borderRadius: 12,
        padding: "20px 24px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "0.7rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "oklch(50% 0.015 200)",
              marginBottom: 4,
            }}
          >
            {sectionLabel.title}
          </div>
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "0.65rem",
              color: "oklch(42% 0.012 200)",
            }}
          >
            {sectionLabel.subtitle}
          </div>
        </div>

        {/* Time range selector */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["7D", "30D", "90D", "MAX"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className="pill-tab"
              style={{
                fontSize: "0.65rem",
                padding: "3px 10px",
                opacity: timeRange === r ? 1 : 0.5,
                fontWeight: timeRange === r ? 600 : 400,
              }}
            >
              {timeRangeLabels[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / empty state */}
      {isLoading && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 0",
            color: "rgb(176 198 185 / 68%)",
            fontSize: "0.75rem",
          }}
        >
          {sectionLabel.loading}
        </div>
      )}

      {!isLoading && chartData.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 0",
            color: "oklch(42% 0.015 200)",
            fontSize: "0.72rem",
            fontStyle: "italic",
          }}
        >
          {sectionLabel.noData}
        </div>
      )}

      {!isLoading && chartData.length > 0 && (
        <>
          {/* Summary cards */}
          {summary && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 8,
                marginBottom: 20,
              }}
              className="sm:grid-cols-5 grid-cols-2"
            >
              {[
                { key: "totalPnl", label: lang === "zh" ? "总盈亏" : "Total P&L", color: pnlColor(summary.totalPnl) },
                { key: "thetaPnl", label: lang === "zh" ? "Theta" : "Theta", color: COLORS.theta },
                { key: "deltaPnl", label: lang === "zh" ? "Delta" : "Delta", color: COLORS.delta },
                { key: "vegaPnl",  label: lang === "zh" ? "Vega" : "Vega", color: COLORS.vega },
                { key: "residual", label: lang === "zh" ? "其他" : "Residual", color: COLORS.residual },
              ].map(({ key, label, color }) => {
                const val = summary[key as keyof typeof summary];
                return (
                  <div
                    key={key}
                    style={{
                      background: "rgb(255 255 255 / 5%)",
                      border: "1px solid rgb(255 255 255 / 9%)",
                      borderRadius: 8,
                      padding: "10px 12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.58rem",
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: "oklch(45% 0.012 200)",
                        marginBottom: 4,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontFamily: "DM Mono, monospace",
                        fontSize: "0.85rem",
                        color,
                        fontWeight: 500,
                      }}
                    >
                      {fmtPnl(val)}
                    </div>
                    <div
                      style={{
                        fontSize: "0.55rem",
                        color: "rgb(190 190 186 / 62%)",
                        marginTop: 2,
                      }}
                    >
                      USDC
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Stacked bar chart */}
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="20%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgb(255 255 255 / 9%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{
                    fontSize: 9,
                    fill: "rgb(176 198 185 / 68%)",
                    fontFamily: "DM Mono, monospace",
                  }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{
                    fontSize: 9,
                    fill: "rgb(176 198 185 / 68%)",
                    fontFamily: "DM Mono, monospace",
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    Math.abs(v) >= 1000
                      ? `${(v / 1000).toFixed(1)}k`
                      : v.toFixed(1)
                  }
                  width={44}
                />
                <Tooltip
                  content={<CustomTooltip labels={labels} />}
                  cursor={{ fill: "oklch(50% 0.02 200 / 10%)" }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: "0.62rem",
                    color: "oklch(50% 0.015 200)",
                    paddingTop: 8,
                    fontFamily: "Inter, sans-serif",
                    letterSpacing: "0.05em",
                  }}
                  formatter={(value: string) => labels[value] ?? value}
                />
                <ReferenceLine y={0} stroke="rgb(255 255 255 / 12%)" strokeWidth={1} />

                {/* Stacked bars — positive and negative handled by recharts stackId */}
                <Bar dataKey="thetaPnl" name="thetaPnl" stackId="a" fill={COLORS.theta} radius={[0, 0, 0, 0]} />
                <Bar dataKey="deltaPnl" name="deltaPnl" stackId="a" fill={COLORS.delta} radius={[0, 0, 0, 0]} />
                <Bar dataKey="vegaPnl"  name="vegaPnl"  stackId="a" fill={COLORS.vega}  radius={[0, 0, 0, 0]} />
                <Bar dataKey="residual" name="residual" stackId="a" fill={COLORS.residual} radius={[2, 2, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

        </>
      )}
    </div>
  );
}
