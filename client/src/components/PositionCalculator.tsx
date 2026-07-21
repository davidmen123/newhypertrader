import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Calculator, Info, ShieldCheck } from "lucide-react";
import { useLang } from "@/contexts/LangContext";
import { calculatePosition } from "@/lib/position-calculator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCOUNT_CAPITAL_KEY = "pnlnote-position-calculator-capital";
const RISK_OPTIONS = [0.5, 1, 2] as const;

function initialAccountCapital(): string {
  if (typeof window === "undefined") return "10000";
  try {
    return window.localStorage.getItem(ACCOUNT_CAPITAL_KEY) ?? "10000";
  } catch {
    return "10000";
  }
}

function parsePositiveNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

export default function PositionCalculator() {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [accountCapital, setAccountCapital] = useState(initialAccountCapital);
  const [riskPercent, setRiskPercent] = useState<(typeof RISK_OPTIONS)[number]>(1);
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");

  useEffect(() => {
    const capital = parsePositiveNumber(accountCapital);
    if (!capital) return;
    try {
      window.localStorage.setItem(ACCOUNT_CAPITAL_KEY, accountCapital);
    } catch {
      // The calculator still works when storage is unavailable.
    }
  }, [accountCapital]);

  const result = useMemo(
    () =>
      calculatePosition(
        parsePositiveNumber(accountCapital),
        riskPercent,
        parsePositiveNumber(entryPrice),
        parsePositiveNumber(stopPrice),
      ),
    [accountCapital, riskPercent, entryPrice, stopPrice],
  );
  const plannedRiskAmount = parsePositiveNumber(accountCapital) * (riskPercent / 100);

  const hasBothPrices = parsePositiveNumber(entryPrice) > 0 && parsePositiveNumber(stopPrice) > 0;
  const pricesAreEqual = hasBothPrices && Number(entryPrice) === Number(stopPrice);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="glass-card group flex w-full items-center gap-4 px-5 py-5 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-7 sm:py-6"
          aria-label={zh ? "打开仓位计算器" : "Open position calculator"}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60 text-foreground">
            <Calculator className="h-5 w-5" aria-hidden="true" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="mb-1 block text-base font-medium text-foreground">
              {zh ? "仓位计算器" : "Position Calculator"}
            </span>
            <span className="block text-sm leading-relaxed text-muted-foreground">
              {zh ? "先定风险，再定仓位" : "Set the risk before sizing the position"}
            </span>
          </span>

          <span className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-foreground sm:flex">
            {zh ? "开始计算" : "Calculate"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden="true" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="pr-6">
          <DialogTitle>{zh ? "仓位计算器" : "Position Calculator"}</DialogTitle>
          <DialogDescription>
            {zh
              ? "根据账户资金与止损距离，估算单笔交易的合理仓位。"
              : "Estimate position size from account capital and stop distance."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <div className="space-y-2">
              <Label htmlFor="position-account-capital">
                {zh ? "账户资金" : "Account capital"}
              </Label>
              <div className="relative">
                <Input
                  id="position-account-capital"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={accountCapital}
                  onChange={(event) => setAccountCapital(event.target.value)}
                  className="pr-16 num-display"
                  aria-invalid={accountCapital !== "" && !parsePositiveNumber(accountCapital)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                  USDC
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{zh ? "单笔风险" : "Risk per trade"}</Label>
              <div className="flex w-full rounded-md border border-input p-0.5" role="group" aria-label={zh ? "选择单笔风险比例" : "Choose risk percentage"}>
                {RISK_OPTIONS.map((option) => {
                  const selected = riskPercent === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRiskPercent(option)}
                      aria-pressed={selected}
                      className={`h-8 flex-1 rounded px-3 text-xs transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {option}%
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground" aria-live="polite">
                {zh ? "计划风险" : "Planned risk"}{" "}
                <span className="num-display text-foreground">
                  {plannedRiskAmount > 0 ? formatNumber(plannedRiskAmount) : "—"}
                </span>{" "}
                USDC
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="position-entry-price">{zh ? "计划入场价" : "Entry price"}</Label>
              <Input
                id="position-entry-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="100,000"
                value={entryPrice}
                onChange={(event) => setEntryPrice(event.target.value)}
                className="num-display"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position-stop-price">{zh ? "止损价" : "Stop price"}</Label>
              <Input
                id="position-stop-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="98,000"
                value={stopPrice}
                onChange={(event) => setStopPrice(event.target.value)}
                className="num-display"
                aria-invalid={pricesAreEqual}
              />
            </div>
          </div>

          {pricesAreEqual && (
            <p className="text-xs text-destructive">
              {zh ? "止损价不能与入场价相同。" : "Stop price must differ from entry price."}
            </p>
          )}

          <div className="rounded-lg border border-border bg-muted/35 p-4 sm:p-5" aria-live="polite">
            {result ? (
              <>
                <div className="mb-4 flex items-center justify-between border-b border-border/70 pb-3">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    {zh ? "自动判断" : "Detected"}
                  </span>
                  <span className="text-xs font-medium">
                    {result.direction === "long"
                      ? zh ? "做多" : "Long"
                      : zh ? "做空" : "Short"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <div className="mb-1 text-xs leading-relaxed text-muted-foreground">
                      {zh ? "建议仓位（名义价值）" : "Suggested position (notional value)"}
                    </div>
                    <div className="num-display text-xl text-foreground sm:text-2xl">
                      {formatNumber(result.notionalValue)} <span className="text-xs text-muted-foreground">USDC</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs leading-relaxed text-muted-foreground">
                      {zh ? "标的数量" : "Asset quantity"}
                    </div>
                    <div className="num-display text-xl text-foreground sm:text-2xl">
                      ≈ {formatNumber(result.quantity, 8)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                  <span>
                    {zh ? "止损距离 = |入场价 − 止损价|：" : "Stop distance = |entry − stop|: "}
                    {formatNumber(result.stopDistance, 8)}
                    {zh ? "（" : " ("}{formatNumber(result.stopDistancePercent)}%{zh ? "）" : ")"}
                  </span>
                </div>
              </>
            ) : (
              <div className="py-5 text-center text-sm text-muted-foreground">
                {zh ? "填入计划入场价与止损价后显示结果" : "Enter an entry and stop price to see the result"}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 border-t border-border pt-4 text-[0.7rem] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p>
                {zh
                  ? "结果基于止损价能够正常成交的理想情形，未计入手续费、滑点及资金费率，实际亏损可能高于计划风险。"
                  : "Results assume the stop fills at the specified price and exclude fees, slippage, and funding; actual loss may exceed planned risk."}
              </p>
              <p>
                {zh
                  ? "标的数量为估算值，请按交易所最小下单单位与数量精度调整。"
                  : "Asset quantity is an estimate; adjust it to the exchange's minimum order size and precision."}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
