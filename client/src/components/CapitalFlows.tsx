import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { RefreshCw } from "lucide-react";

type CapitalFlow = {
  time: number;
  hash: string | null;
  type: "deposit" | "withdraw";
  amount: number;
  sourceType: string;
};

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(time: number) {
  return new Date(time).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CapitalFlows({ accountId }: { accountId?: string }) {
  const { lang } = useLang();
  const { data = [], isLoading, isFetching, refetch } = trpc.hyperliquid.capitalFlows.useQuery(
    { accountId },
    { refetchInterval: 120_000 },
  );
  const flows = data as CapitalFlow[];
  const deposits = flows.filter((flow) => flow.type === "deposit").reduce((sum, flow) => sum + flow.amount, 0);
  const withdrawals = flows.filter((flow) => flow.type === "withdraw").reduce((sum, flow) => sum + flow.amount, 0);
  const net = deposits - withdrawals;
  const label = (zh: string, en: string) => lang === "zh" ? zh : en;

  return (
    <section className="glass-card px-4 py-5 sm:px-8 sm:py-7 fade-in">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-light sm:text-2xl" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            {label("资金流", "Capital Flows")}
          </h2>
          <div className="mt-2" style={{ width: 40, height: 1, background: "rgb(215 187 114 / 62%)" }} />
          <div className="mt-2 text-xs text-muted-foreground/60">
            {label("充值与提现记录 · 不计入交易盈亏", "Deposits and withdrawals · excluded from trading PnL")}
          </div>
        </div>
        <button type="button" onClick={() => refetch()} className="text-muted-foreground transition-colors hover:text-foreground" aria-label={label("刷新资金流", "Refresh capital flows")}>
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          [label("总充值", "Total Deposits"), deposits, "oklch(68% 0.15 145)"],
          [label("总提现", "Total Withdrawals"), withdrawals, "oklch(62% 0.15 25)"],
          [label("净入金", "Net Deposits"), net, net >= 0 ? "var(--metric-neutral)" : "oklch(62% 0.15 25)"],
        ].map(([title, value, color]) => (
          <div key={String(title)} className="rounded-lg px-4 py-3" style={{ background: "var(--surface-subtle)", border: "1px solid var(--panel-border)" }}>
            <div className="text-muted-foreground tracking-widest" style={{ fontSize: "0.58rem" }}>{title}</div>
            <div className="num-display mt-2" style={{ color: String(color), fontSize: "1.12rem" }}>{formatAmount(Number(value))} <span className="text-muted-foreground/55" style={{ fontSize: "0.68rem" }}>USDC</span></div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">{label("加载资金流中…", "Loading capital flows…")}</div>
      ) : flows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground/60">{label("暂无充值或提现记录", "No deposits or withdrawals found")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--panel-border)" }}>
          <table className="minimal-table w-full min-w-[520px]">
            <thead>
              <tr>
                <th>{label("时间", "Time")}</th>
                <th>{label("类型", "Type")}</th>
                <th className="text-right">{label("金额", "Amount")}</th>
                <th>{label("来源", "Source")}</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((flow, index) => (
                <tr key={`${flow.time}-${flow.hash ?? index}`}>
                  <td className="text-muted-foreground/75">{formatTime(flow.time)}</td>
                  <td>
                    <span style={{ color: flow.type === "deposit" ? "oklch(68% 0.15 145)" : "oklch(62% 0.15 25)" }}>
                      {flow.type === "deposit" ? label("充值", "Deposit") : label("提现", "Withdrawal")}
                    </span>
                  </td>
                  <td className="num-display text-right">{flow.type === "deposit" ? "+" : "-"}{formatAmount(flow.amount)} USDC</td>
                  <td className="text-muted-foreground/55">{flow.sourceType || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
