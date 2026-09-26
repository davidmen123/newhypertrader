export function marketPriceDecimals(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  const price = Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  if (price > 500) return 0;
  return price >= 1 ? 2 : 3;
}
