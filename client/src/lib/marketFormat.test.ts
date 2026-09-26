import { describe, expect, it } from "vitest";
import { marketPriceDecimals } from "./marketFormat";

describe("marketPriceDecimals", () => {
  it("shows prices above 500 as integers", () => {
    expect(marketPriceDecimals(500.01)).toBe(0);
    expect(marketPriceDecimals(63_000)).toBe(0);
  });

  it("keeps two decimals from 1 through 500", () => {
    expect(marketPriceDecimals(500)).toBe(2);
    expect(marketPriceDecimals(1)).toBe(2);
  });

  it("keeps three decimals below 1", () => {
    expect(marketPriceDecimals(0.9999)).toBe(3);
  });
});
