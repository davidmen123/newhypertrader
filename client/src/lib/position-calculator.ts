export interface PositionCalculation {
  direction: "long" | "short";
  riskAmount: number;
  stopDistance: number;
  stopDistancePercent: number;
  notionalValue: number;
  quantity: number;
}

export function calculatePosition(
  accountCapital: number,
  riskPercent: number,
  entryPrice: number,
  stopPrice: number,
): PositionCalculation | null {
  if (
    !Number.isFinite(accountCapital) ||
    !Number.isFinite(riskPercent) ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopPrice) ||
    accountCapital <= 0 ||
    riskPercent <= 0 ||
    entryPrice <= 0 ||
    stopPrice <= 0 ||
    entryPrice === stopPrice
  ) {
    return null;
  }

  const priceDistance = Math.abs(entryPrice - stopPrice);
  const stopDistancePercent = (priceDistance / entryPrice) * 100;
  const riskAmount = accountCapital * (riskPercent / 100);
  const quantity = riskAmount / priceDistance;
  const notionalValue = quantity * entryPrice;

  if (![priceDistance, stopDistancePercent, riskAmount, quantity, notionalValue].every(Number.isFinite)) {
    return null;
  }

  return {
    direction: stopPrice < entryPrice ? "long" : "short",
    riskAmount,
    stopDistance: priceDistance,
    stopDistancePercent,
    notionalValue,
    quantity,
  };
}
