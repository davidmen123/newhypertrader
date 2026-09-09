export type ReviewObservationTrade = {
  execId: string;
  symbol: string;
  side: string;
  execPrice: string;
  execQty: string;
  createdTime: string;
  tradeSide?: string;
  observationNode?: boolean;
  observationConverted?: boolean;
};

export function classifyObservationTrades<T extends ReviewObservationTrade>(trades: T[]): T[] {
  const ordered = trades.slice().sort((a, b) => Number(a.createdTime) - Number(b.createdTime));
  const states = new Map<string, { quantity: number; observation: boolean; activated: boolean }>();
  const classified = new Map<string, T>();
  const epsilon = 1e-9;

  for (const trade of ordered) {
    const quantity = Math.abs(Number(trade.execQty));
    const price = Math.abs(Number(trade.execPrice));
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
      classified.set(trade.execId, trade);
      continue;
    }

    const direction = String(trade.tradeSide ?? "").toLowerCase();
    const isClose = direction.includes("close");
    const isLong = direction.includes("long");
    const isShort = direction.includes("short");
    const state = states.get(trade.symbol);

    // If the available history starts in the middle of a position, a closing
    // fill cannot establish whether the original entry was an observation
    // position. Keep it visible instead of guessing and hiding real history.
    if (!state && isClose) {
      classified.set(trade.execId, trade);
      continue;
    }

    const signedDelta = isLong
      ? (isClose ? -quantity : quantity)
      : isShort
        ? (isClose ? quantity : -quantity)
        : (trade.side === "buy" || trade.side === "B" ? quantity : -quantity);
    const beforeQuantity = state?.quantity ?? 0;
    const afterQuantity = Math.abs(beforeQuantity + signedDelta) < epsilon ? 0 : beforeQuantity + signedDelta;

    if (!state || Math.abs(beforeQuantity) < epsilon) {
      const observation = Math.abs(afterQuantity) * price < 50;
      states.set(trade.symbol, { quantity: afterQuantity, observation, activated: !observation });
      classified.set(trade.execId, observation ? { ...trade, observationNode: true } : trade);
      if (afterQuantity === 0) states.delete(trade.symbol);
      continue;
    }

    const increasedPosition = Math.abs(afterQuantity) > Math.abs(beforeQuantity) + epsilon;
    const crossedThreshold = state.observation
      && !state.activated
      && !isClose
      && increasedPosition
      && Math.abs(afterQuantity) * price >= 50;
    if (crossedThreshold) state.activated = true;
    state.quantity = afterQuantity;

    classified.set(
      trade.execId,
      crossedThreshold
        ? { ...trade, observationConverted: true }
        : state.observation && !state.activated
          ? { ...trade, observationNode: true }
          : trade,
    );
    if (afterQuantity === 0) states.delete(trade.symbol);
  }

  return trades.map((trade) => classified.get(trade.execId) ?? trade);
}
