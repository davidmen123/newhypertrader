import { describe, expect, it } from "vitest";
import { classifyObservationTrades, type ReviewObservationTrade } from "./reviewObservation";

function trade(
  execId: string,
  tradeSide: string,
  execQty: number,
  execPrice: number,
  createdTime: number,
): ReviewObservationTrade {
  return {
    execId,
    symbol: "BTC-PERP",
    side: tradeSide.toLowerCase().includes("long") ? "buy" : "sell",
    execPrice: String(execPrice),
    execQty: String(execQty),
    createdTime: String(createdTime),
    tradeSide,
  };
}

describe("classifyObservationTrades", () => {
  it("marks an entire sub-100 USDC position cycle as observation nodes", () => {
    const result = classifyObservationTrades([
      trade("open", "Open Long", 0.0004, 100_000, 1),
      trade("close", "Close Long", 0.0004, 101_000, 2),
    ]);

    expect(result.map((row) => row.observationNode)).toEqual([true, true]);
  });

  it("keeps an exactly 100 USDC position observational and shows nodes only above 100 USDC", () => {
    const result = classifyObservationTrades([
      trade("open", "Open Long", 0.0004, 100_000, 1),
      trade("boundary", "Open Long", 0.0006, 100_000, 2),
      trade("convert", "Open Long", 0.0001, 100_000, 3),
      trade("close", "Close Long", 0.0011, 101_000, 4),
    ]);

    expect(result[0].observationNode).toBe(true);
    expect(result[1].observationNode).toBe(true);
    expect(result[2].observationConverted).toBe(true);
    expect(result[3].observationNode).toBeUndefined();
  });

  it("does not convert an observation position because a later close has a higher price", () => {
    const result = classifyObservationTrades([
      trade("open", "Open Long", 0.0004, 100_000, 1),
      trade("close", "Close Long", 0.0004, 300_000, 2),
    ]);

    expect(result[1].observationNode).toBe(true);
    expect(result[1].observationConverted).toBeUndefined();
  });

  it("resets observation status after the position is fully closed", () => {
    const result = classifyObservationTrades([
      trade("small-open", "Open Short", 0.0004, 100_000, 1),
      trade("small-close", "Close Short", 0.0004, 99_000, 2),
      trade("regular-open", "Open Short", 0.0011, 100_000, 3),
    ]);

    expect(result[0].observationNode).toBe(true);
    expect(result[1].observationNode).toBe(true);
    expect(result[2].observationNode).toBeUndefined();
  });

  it("keeps an unmatched close visible when earlier history is unavailable", () => {
    const result = classifyObservationTrades([
      trade("close-only", "Close Long", 0.0001, 100_000, 1),
    ]);

    expect(result[0].observationNode).toBeUndefined();
  });
});
