import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Calculator as CalculatorIcon, Info, ShieldCheck } from "lucide-react";
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

const ACCOUNT_CAPITAL_KEY = "pnlnote-position-calculator-capital-v2";
const RISK_OPTIONS = [0.5, 1, 2] as const;
type RiskSelection = (typeof RISK_OPTIONS)[number] | "custom";

function initialAccountCapital(): string {
  if (typeof window === "undefined") return "5000";
  try {
    return window.localStorage.getItem(ACCOUNT_CAPITAL_KEY) ?? "5000";
  } catch {
    return "5000";
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
  const [riskSelection, setRiskSelection] = useState<RiskSelection>(1);
  const [customRiskPercent, setCustomRiskPercent] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [riskCheckOpen, setRiskCheckOpen] = useState(false);
  const [maintenanceMarginPercent, setMaintenanceMarginPercent] = useState("1.25");
  const parsedCustomRisk = parsePositiveNumber(customRiskPercent);
  const riskPercent = riskSelection === "custom"
    ? parsedCustomRisk <= 100 ? parsedCustomRisk : 0
    : riskSelection;

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
  const availableMargin = parsePositiveNumber(accountCapital);
  const maintenanceMarginRate = parsePositiveNumber(maintenanceMarginPercent) / 100;
  const effectiveLeverage = result && availableMargin > 0 ? result.notionalValue / availableMargin : 0;
  const estimatedLiquidationPrice = useMemo(() => {
    if (!result || !availableMargin || !maintenanceMarginRate || result.quantity <= 0) return null;
    const maintenanceMargin = result.notionalValue * maintenanceMarginRate;
    const marginAvailable = availableMargin - maintenanceMargin;
    if (marginAvailable <= 0) return null;
    const denominator = result.direction === "long" ? 1 - maintenanceMarginRate : 1 + maintenanceMarginRate;
    const priceDistance = marginAvailable / result.quantity / denominator;
    const price = result.direction === "long"
      ? parsePositiveNumber(entryPrice) - priceDistance
      : parsePositiveNumber(entryPrice) + priceDistance;
    return price > 0 && Number.isFinite(price) ? price : null;
  }, [availableMargin, entryPrice, maintenanceMarginRate, result]);
  const stopTriggersBeforeLiquidation = result && estimatedLiquidationPrice != null
    ? result.direction === "long"
      ? parsePositiveNumber(stopPrice) > estimatedLiquidationPrice
      : parsePositiveNumber(stopPrice) < estimatedLiquidationPrice
    : null;

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
            <CalculatorIcon className="h-5 w-5" aria-hidden="true" />
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
          <div className="space-y-4">
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
                  const selected = riskSelection === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRiskSelection(option)}
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
                <button
                  type="button"
                  onClick={() => setRiskSelection("custom")}
                  aria-pressed={riskSelection === "custom"}
                  className={`h-8 flex-1 rounded px-3 text-xs transition-colors ${
                    riskSelection === "custom"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {zh ? "自定义" : "Custom"}
                </button>
              </div>
              {riskSelection === "custom" && (
                <div>
                  <div className="relative">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="any"
                      value={customRiskPercent}
                      onChange={(event) => setCustomRiskPercent(event.target.value)}
                      placeholder={zh ? "输入风险比例" : "Enter risk percentage"}
                      className="pr-10 num-display"
                      aria-label={zh ? "自定义单笔风险比例" : "Custom risk percentage"}
                      aria-invalid={customRiskPercent !== "" && riskPercent === 0}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                  {customRiskPercent !== "" && riskPercent === 0 && (
                    <p className="mt-1 text-xs text-destructive">
                      {zh ? "请输入大于 0 且不超过 100 的比例。" : "Enter a percentage greater than 0 and no more than 100."}
                    </p>
                  )}
                </div>
              )}
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
              <Label htmlFor="position-entry-price">{zh ? "入场价" : "Entry price"}</Label>
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
                {zh ? "填入入场价与止损价后显示结果" : "Enter an entry and stop price to see the result"}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/80">
            <button
              type="button"
              onClick={() => setRiskCheckOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
              aria-expanded={riskCheckOpen}
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {zh ? "风险检查" : "Risk Check"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {zh ? "可选：查看预估清算价" : "Optional: estimate liquidation price"}
                  </span>
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${riskCheckOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>

            {riskCheckOpen && (
              <div className="space-y-4 border-t border-border/70 px-4 py-4">
                {result ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md bg-muted/35 px-3 py-2">
                        <div className="text-xs text-muted-foreground">{zh ? "可用保证金（按账户资金）" : "Available margin (account capital)"}</div>
                        <div className="num-display mt-1 text-sm text-foreground">{formatNumber(availableMargin)} USDC</div>
                      </div>
                      <div className="rounded-md bg-muted/35 px-3 py-2">
                        <div className="text-xs text-muted-foreground">{zh ? "名义仓位" : "Notional value"}</div>
                        <div className="num-display mt-1 text-sm text-foreground">{formatNumber(result.notionalValue)} USDC</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                        <div className="text-xs text-muted-foreground">{zh ? "有效杠杆" : "Effective leverage"}</div>
                        <div className="num-display mt-1 text-base text-foreground">
                          {effectiveLeverage > 0 ? `${formatNumber(effectiveLeverage, 2)}x` : "—"}
                          <span className="ml-1 text-xs text-muted-foreground">{zh ? "自动计算" : "Auto"}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="position-maintenance-margin" className="text-xs text-muted-foreground">
                          {zh ? "维护保证金率（估算）" : "Maintenance margin (estimate)"}
                        </Label>
                        <div className="relative">
                          <Input
                            id="position-maintenance-margin"
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            step="0.01"
                            value={maintenanceMarginPercent}
                            onChange={(event) => setMaintenanceMarginPercent(event.target.value)}
                            className="h-8 pr-7 num-display text-sm"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background px-3 py-3">
                      <div className="text-xs text-muted-foreground">{zh ? "预估清算价" : "Estimated liquidation price"}</div>
                      <div className="num-display mt-1 text-xl text-foreground">
                        {estimatedLiquidationPrice != null ? `${formatNumber(estimatedLiquidationPrice)} USDC` : "—"}
                      </div>
                      {stopTriggersBeforeLiquidation != null && (
                        <div className={`mt-2 text-xs ${stopTriggersBeforeLiquidation ? "text-primary" : "text-amber-600"}`}>
                          {stopTriggersBeforeLiquidation
                            ? (zh ? "止损价预计早于清算价触发" : "Stop is expected to trigger before liquidation")
                            : (zh ? "清算价预计早于止损价触发" : "Liquidation is expected before the stop")}
                        </div>
                      )}
                    </div>

                    <div className="flex items-start gap-2 text-[0.68rem] leading-relaxed text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{zh ? "这是基于当前名义仓位、可用保证金和维护保证金率的简化估算，不含资金费、手续费、滑点及其他仓位影响；实际清算结果以 Hyperliquid 为准。" : "Simplified estimate based on notional value, available margin and maintenance margin; excludes funding, fees, slippage and other positions. Hyperliquid's actual result prevails."}</span>
                    </div>
                  </>
                ) : (
                  <div className="py-2 text-center text-xs text-muted-foreground">
                    {zh ? "先填入入场价与止损价，生成名义仓位后查看风险检查。" : "Enter entry and stop prices to generate a notional position first."}
                  </div>
                )}
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
