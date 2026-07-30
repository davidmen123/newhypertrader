import { describe, expect, it } from "vitest";

import {
  classifyHyperliquidLedgerFlow,
  getHyperliquidCumulativePnlUsdc,
  getHyperliquidPerformanceStats,
  getHyperliquidPortfolioSeries,
  getHyperliquidTimeWeightedReturnPct,
  type HyperliquidPortfolio,
} from "./hyperliquid";

const DAY = 24 * 60 * 60 * 1000;

/** Builds an allTime portfolio window from [time, equity, cumulativePnl] rows. */
function portfolio(rows: Array<[number, number, number]>): HyperliquidPortfolio {
  return [
    ["day", { accountValueHistory: [], pnlHistory: [] }],
    [
      "allTime",
      {
        accountValueHistory: rows.map(([time, equity]) => [time, String(equity)] as [number, string]),
        pnlHistory: rows.map(([time, , pnl]) => [time, String(pnl)] as [number, string]),
      },
    ],
  ];
}

describe("getHyperliquidPortfolioSeries", () => {
  it("pairs the equity and PnL series by timestamp", () => {
    expect(getHyperliquidPortfolioSeries(portfolio([[1, 100, 0], [2, 110, 10]]))).toEqual([
      { time: 1, equity: 100, pnl: 0 },
      { time: 2, equity: 110, pnl: 10 },
    ]);
  });

  it("carries the previous PnL forward when a sample is missing", () => {
    const data: HyperliquidPortfolio = [
      [
        "allTime",
        {
          accountValueHistory: [[1, "100"], [2, "105"], [3, "120"]],
          // No PnL sample at t=2.
          pnlHistory: [[1, "0"], [3, "20"]],
        },
      ],
    ];

    expect(getHyperliquidPortfolioSeries(data).map((point) => point.pnl)).toEqual([0, 0, 20]);
  });

  it("returns an empty series when the portfolio has no history", () => {
    expect(getHyperliquidPortfolioSeries([])).toEqual([]);
  });
});

describe("getHyperliquidCumulativePnlUsdc", () => {
  it("reports Hyperliquid's own latest cumulative PnL", () => {
    expect(getHyperliquidCumulativePnlUsdc(portfolio([[1, 100, 0], [2, 110, 10], [3, 108, 8]]))).toBe(8);
  });

  it("keeps a losing account negative", () => {
    expect(getHyperliquidCumulativePnlUsdc(portfolio([[1, 1000, 0], [2, 820, -180]]))).toBe(-180);
  });

  it("returns null when there is no history to read", () => {
    expect(getHyperliquidCumulativePnlUsdc([])).toBeNull();
  });
});

describe("getHyperliquidTimeWeightedReturnPct", () => {
  it("matches the simple return when there are no cash flows", () => {
    expect(getHyperliquidTimeWeightedReturnPct(portfolio([[1, 100, 0], [2, 110, 10]]))).toBeCloseTo(10, 6);
  });

  it("ignores a mid-way deposit", () => {
    // +10%, then 1000 arrives (no PnL change), then +10% on the larger base.
    const withDeposit = portfolio([
      [1, 100, 0],
      [2, 110, 10],
      [3, 1110, 10],
      [4, 1221, 121],
    ]);

    expect(getHyperliquidTimeWeightedReturnPct(withDeposit)).toBeCloseTo(21, 6);
  });

  it("ignores a mid-way withdrawal", () => {
    // +10%, then 55 leaves, then +10% on what is left.
    const withWithdrawal = portfolio([
      [1, 100, 0],
      [2, 110, 10],
      [3, 55, 10],
      [4, 60.5, 15.5],
    ]);

    expect(getHyperliquidTimeWeightedReturnPct(withWithdrawal)).toBeCloseTo(21, 6);
  });

  it("gives the same answer as the naive formula only when nothing is deposited", () => {
    const flows = portfolio([[1, 100, 0], [2, 110, 10], [3, 1110, 10], [4, 1221, 121]]);
    const naiveEquityRatio = (1221 / 100 - 1) * 100;
    const naiveNetDeposits = ((1221 - 1100) / 1100) * 100;

    const twr = getHyperliquidTimeWeightedReturnPct(flows)!;
    expect(twr).not.toBeCloseTo(naiveEquityRatio, 2);
    expect(twr).not.toBeCloseTo(naiveNetDeposits, 2);
  });

  it("skips samples taken before the account was funded", () => {
    // The first two points are the zero-equity samples Hyperliquid reports before
    // the first deposit lands; they must not count as an infinite return.
    const funded = portfolio([
      [1, 0, 0],
      [2, 0, 0],
      [3, 100, 0],
      [4, 110, 10],
    ]);

    expect(getHyperliquidTimeWeightedReturnPct(funded)).toBeCloseTo(10, 6);
  });

  it("floors a wiped-out account at -100%", () => {
    expect(getHyperliquidTimeWeightedReturnPct(portfolio([[1, 100, 0], [2, 0, -100]]))).toBe(-100);
  });

  it("returns null when there is only one sample", () => {
    expect(getHyperliquidTimeWeightedReturnPct(portfolio([[1, 100, 0]]))).toBeNull();
  });
});

describe("classifyHyperliquidLedgerFlow", () => {
  // The shapes below are taken verbatim from a real account's ledger.
  const address = "0x7a1a9907922dde40b03dfa59b864a78c0ec5a3e8";
  const other = "0x6b9e773128f453f5c2c60935ee2de2cbc5390a24";

  it("counts an on-chain deposit as capital in", () => {
    expect(classifyHyperliquidLedgerFlow({ delta: { type: "deposit", usdc: "1000.56" } }, address)).toBe(1);
  });

  it("counts a withdrawal as capital out", () => {
    expect(classifyHyperliquidLedgerFlow({ delta: { type: "withdraw", usdc: "500" } }, address)).toBe(-1);
  });

  it("counts a send from another address as capital in", () => {
    const update = {
      delta: { type: "send", user: other, destination: address, token: "USDC", amount: "336.77", usdcValue: "336.77" },
    };

    expect(classifyHyperliquidLedgerFlow(update, address)).toBe(1);
  });

  it("counts a send to another address as capital out", () => {
    const update = {
      delta: { type: "send", user: address, destination: other, token: "USDC", amount: "100", usdcValue: "100" },
    };

    expect(classifyHyperliquidLedgerFlow(update, address)).toBe(-1);
  });

  it("ignores an address sending USDC to itself across perp dexes", () => {
    const update = {
      delta: {
        type: "send",
        user: address,
        destination: address,
        sourceDex: "",
        destinationDex: "xyz",
        token: "USDC",
        amount: "170.26",
        usdcValue: "170.26",
      },
    };

    expect(classifyHyperliquidLedgerFlow(update, address)).toBe(0);
  });

  it("ignores a spot ↔ perp transfer inside the account", () => {
    const update = { delta: { type: "accountClassTransfer", usdc: "240.41", toPerp: false } };

    expect(classifyHyperliquidLedgerFlow(update, address)).toBe(0);
  });

  it("matches the address regardless of case", () => {
    const update = { delta: { type: "send", user: other, destination: address.toUpperCase(), usdcValue: "10" } };

    expect(classifyHyperliquidLedgerFlow(update, address)).toBe(1);
  });

  it("reports an unrecognised type instead of guessing at it", () => {
    expect(classifyHyperliquidLedgerFlow({ delta: { type: "vaultDeposit", usdc: "50" } }, address)).toBeNull();
    expect(classifyHyperliquidLedgerFlow({ delta: {} }, address)).toBeNull();
  });
});

describe("getHyperliquidPerformanceStats", () => {
  it("annualizes the time-weighted return rather than the equity ratio", () => {
    const start = Date.now() - 365 * DAY;
    const stats = getHyperliquidPerformanceStats(
      portfolio([
        [start, 100, 0],
        [start + 180 * DAY, 110, 10],
        // A 1000 deposit lands but earns nothing more.
        [Date.now(), 1110, 10],
      ])
    );

    expect(stats.runningDays).toBeGreaterThanOrEqual(365);
    // 10% over roughly a year, not the 1010% the equity ratio would suggest.
    expect(stats.annualizedReturnPct).toBeGreaterThan(9);
    expect(stats.annualizedReturnPct).toBeLessThan(11);
  });

  it("does not let a deposit day distort volatility", () => {
    const start = Date.now() - 5 * DAY;
    const pnlPath: Array<[number, number]> = [[0, 0], [1, 2], [2, 4], [3, 6], [4, 8]];

    // Same PnL path, but the second account receives 1000 on day 2.
    const flat = portfolio(pnlPath.map(([day, pnl]) => [start + day * DAY, 100 + pnl, pnl]));
    const withDeposit = portfolio(
      pnlPath.map(([day, pnl]) => [start + day * DAY, 100 + pnl + (day >= 2 ? 1000 : 0), pnl])
    );

    const flatSharpe = getHyperliquidPerformanceStats(flat).sharpeRatio;
    const depositSharpe = getHyperliquidPerformanceStats(withDeposit).sharpeRatio;

    expect(flatSharpe).not.toBeNull();
    expect(depositSharpe).not.toBeNull();
    // The deposit changes the base for later days, so the ratio may shift, but it
    // must stay in the same order of magnitude instead of exploding.
    expect(Math.abs(depositSharpe!)).toBeLessThan(Math.abs(flatSharpe!) * 3);
  });

  it("returns nulls when there is not enough history", () => {
    expect(getHyperliquidPerformanceStats(portfolio([[1, 100, 0]]))).toEqual({
      sharpeRatio: null,
      annualizedReturnPct: null,
      runningDays: null,
    });
  });
});
