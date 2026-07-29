import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Calculator as CalculatorIcon, Info, ShieldCheck } from "lucide-react";
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
const LIQUIDATION_ASSETS = [
  { value: "BTC-PERP", label: "BTC-PERP", maintenanceMarginPercent: "1.25" },
  { value: "ETH-PERP", label: "ETH-PERP", maintenanceMarginPercent: "2" },
  { value: "SOL-PERP", label: "SOL-PERP", maintenanceMarginPercent: "2.5" },
  { value: "XRP-PERP", label: "XRP-PERP", maintenanceMarginPercent: "2.5" },
  { value: "OTHER", label: "其他标的", maintenanceMarginPercent: "5" },
] as const;
type RiskSelection = (typeof RISK_OPTIONS)[number] | "custom";
type CalculatorMode = "position" | "liquidation";

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
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>("position");
  const [liquidationAsset, setLiquidationAsset] = useState("BTC-PERP");
  const [liquidationDirection, setLiquidationDirection] = useState<"long" | "short">("long");
  const [liquidationEntryPrice, setLiquidationEntryPrice] = useState("");
  const [liquidationMargin, setLiquidationMargin] = useState("");
  const [liquidationNotional, setLiquidationNotional] = useState("");
  const [maintenanceMarginPercent, setMaintenanceMarginPercent] = useState("1.25");
  const parsedCustomRisk = parsePositiveNumber(customRiskPercent);
  const riskPercent = riskSelection === "custom"
    ? parsedCustomRisk <= 100 ? parsedCustomRisk : 0
    : riskSelection;

  const selectedLiquidationAsset = LIQUIDATION_ASSETS.find((asset) => asset.value === liquidationAsset) ?? LIQUIDATION_ASSETS[0];

  const handleLiquidationAssetChange = (value: string) => {
    const asset = LIQUIDATION_ASSETS.find((option) => option.value === value) ?? LIQUIDATION_ASSETS[0];
    setLiquidationAsset(asset.value);
    setMaintenanceMarginPercent(asset.maintenanceMarginPercent);
  };

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
  const liquidationResult = useMemo(() => {
    const entry = parsePositiveNumber(liquidationEntryPrice);
    const margin = parsePositiveNumber(liquidationMargin);
    const notional = parsePositiveNumber(liquidationNotional);
    const maintenanceRate = parsePositiveNumber(maintenanceMarginPercent) / 100;
    if (!entry || !margin || !notional || !maintenanceRate) return null;

    const quantity = notional / entry;
    const marginAvailable = margin - notional * maintenanceRate;
    if (quantity <= 0 || marginAvailable <= 0) return null;

    const denominator = liquidationDirection === "long" ? 1 - maintenanceRate : 1 + maintenanceRate;
    const distance = marginAvailable / quantity / denominator;
    const price = liquidationDirection === "long" ? entry - distance : entry + distance;
    if (!Number.isFinite(price) || price <= 0) return null;

    return {
      effectiveLeverage: notional / margin,
      maintenanceRate,
      price,
    };
  }, [liquidationDirection, liquidationEntryPrice, liquidationMargin, liquidationNotional, maintenanceMarginPercent]);

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
            {calculatorMode === "position"
              ? zh
                ? "根据账户资金与止损距离，估算单笔交易的合理仓位。"
                : "Estimate position size from account capital and stop distance."
              : zh
                ? "根据进场价、保证金与名义仓位，估算价格清算线。"
                : "Estimate the liquidation line from entry price, margin, and notional value."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label={zh ? "计算器类型" : "Calculator type"}>
          {(["position", "liquidation"] as const).map((mode) => {
            const selected = calculatorMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setCalculatorMode(mode)}
                className={`h-9 flex-1 rounded px-3 text-sm transition-colors ${
                  selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {mode === "position" ? (zh ? "仓位计算" : "Position sizing") : (zh ? "清算价估算" : "Liquidation estimate")}
              </button>
            );
          })}
        </div>

        <div className="space-y-5">
          {calculatorMode === "position" && (
            <>
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

            </>
          )}

          {calculatorMode === "liquidation" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="liquidation-asset">{zh ? "标的" : "Asset"}</Label>
                <select
                  id="liquidation-asset"
                  value={liquidationAsset}
                  onChange={(event) => handleLiquidationAssetChange(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {LIQUIDATION_ASSETS.map((asset) => (
                    <option key={asset.value} value={asset.value}>{asset.label}</option>
                  ))}
                </select>
                <p className="text-[0.68rem] text-muted-foreground">
                  {zh
                    ? `${selectedLiquidationAsset.label} 默认维护保证金率：${selectedLiquidationAsset.maintenanceMarginPercent}%`
                    : `${selectedLiquidationAsset.label} default maintenance margin: ${selectedLiquidationAsset.maintenanceMarginPercent}%`}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{zh ? "方向" : "Direction"}</Label>
                <div className="flex w-full rounded-md border border-input p-0.5" role="group" aria-label={zh ? "选择持仓方向" : "Choose position direction"}>
                  {(["long", "short"] as const).map((direction) => {
                    const selected = liquidationDirection === direction;
                    return (
                      <button
                        key={direction}
                        type="button"
                        onClick={() => setLiquidationDirection(direction)}
                        aria-pressed={selected}
                        className={`h-8 flex-1 rounded px-3 text-xs transition-colors ${selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        {direction === "long" ? (zh ? "做多" : "Long") : (zh ? "做空" : "Short")}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="liquidation-entry-price">{zh ? "进场价格" : "Entry price"}</Label>
                  <Input
                    id="liquidation-entry-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="100,000"
                    value={liquidationEntryPrice}
                    onChange={(event) => setLiquidationEntryPrice(event.target.value)}
                    className="num-display"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="liquidation-maintenance-margin">{zh ? "维护保证金率（估算）" : "Maintenance margin (estimate)"}</Label>
                  <div className="relative">
                    <Input
                      id="liquidation-maintenance-margin"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      value={maintenanceMarginPercent}
                      onChange={(event) => setMaintenanceMarginPercent(event.target.value)}
                      className="pr-8 num-display"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="liquidation-margin">{zh ? "可用保证金" : "Available margin"}</Label>
                  <div className="relative">
                    <Input
                      id="liquidation-margin"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder="1,000"
                      value={liquidationMargin}
                      onChange={(event) => setLiquidationMargin(event.target.value)}
                      className="pr-16 num-display"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">USDC</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="liquidation-notional">{zh ? "名义仓位" : "Notional value"}</Label>
                  <div className="relative">
                    <Input
                      id="liquidation-notional"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder="10,000"
                      value={liquidationNotional}
                      onChange={(event) => setLiquidationNotional(event.target.value)}
                      className="pr-16 num-display"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">USDC</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/35 p-4" aria-live="polite">
                {liquidationResult ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">{zh ? "预估清算价" : "Estimated liquidation price"}</div>
                      <div className="num-display text-xl text-foreground">{formatNumber(liquidationResult.price)} <span className="text-xs text-muted-foreground">USDC</span></div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">{zh ? "有效杠杆" : "Effective leverage"}</div>
                      <div className="num-display text-xl text-foreground">{formatNumber(liquidationResult.effectiveLeverage, 2)}x</div>
                    </div>
                  </div>
                ) : (
                  <div className="py-3 text-center text-sm text-muted-foreground">
                    {zh ? "填入进场价格、可用保证金和名义仓位后显示结果" : "Enter entry price, available margin, and notional value to see the result"}
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 text-[0.68rem] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{zh ? "这是基于维护保证金率的简化估算，不含资金费、手续费、滑点、分层保证金及其他仓位影响；实际清算结果以 Hyperliquid 为准。" : "Simplified estimate based on maintenance margin; excludes funding, fees, slippage, tiered margin and other positions. Hyperliquid's actual result prevails."}</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
