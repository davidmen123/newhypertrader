// Pure technical-indicator math for the market ticker. No I/O — callers pass in
// an ascending (oldest → newest) array of closing prices.

export function computeEmaLast(closes: number[], period = 20): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  // Seed with the SMA of the first `period` closes, then roll forward.
  let ema = closes.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// Wilder's RSI.
export function computeRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface TimeframeIndicator {
  emaAbove: boolean;
  rsi: number;
}

// EMA20 position (last close vs EMA20) + RSI14 for one close series.
export function seriesIndicators(closes: number[]): TimeframeIndicator | null {
  const clean = closes.filter((v) => Number.isFinite(v) && v > 0);
  const ema = computeEmaLast(clean, 20);
  const rsi = computeRsi(clean, 14);
  const last = clean[clean.length - 1];
  if (ema == null || rsi == null || last == null) return null;
  return { emaAbove: last >= ema, rsi: Math.round(rsi * 10) / 10 };
}
