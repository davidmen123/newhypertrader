import { describe, expect, it } from "vitest";
import { calculatePosition } from "../client/src/lib/position-calculator";

describe("calculatePosition", () => {
  it("calculates a long position from planned risk and stop distance", () => {
    expect(calculatePosition(10_000, 1, 100_000, 98_000)).toEqual({
      direction: "long",
      riskAmount: 100,
      stopDistancePercent: 2,
      notionalValue: 5_000,
      quantity: 0.05,
    });
  });

  it("detects a short position", () => {
    const result = calculatePosition(20_000, 0.5, 2_000, 2_050);

    expect(result?.direction).toBe("short");
    expect(result?.riskAmount).toBe(100);
    expect(result?.quantity).toBe(2);
    expect(result?.notionalValue).toBe(4_000);
  });

  it("rejects invalid or equal prices", () => {
    expect(calculatePosition(10_000, 1, 0, 98_000)).toBeNull();
    expect(calculatePosition(10_000, 1, 100_000, 100_000)).toBeNull();
    expect(calculatePosition(-1, 1, 100_000, 98_000)).toBeNull();
  });
});
