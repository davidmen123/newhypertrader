import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getCurrentHyperliquidAccount,
  isDefaultHyperliquidAccount,
  listHyperliquidAccounts,
  maskHyperliquidAddress,
  requireCurrentHyperliquidAddress,
  resolveHyperliquidAccount,
  runWithHyperliquidAccount,
} from "./accounts";

const MAIN = "0x1111111111111111111111111111111111111111";
const ALT = "0x2222222222222222222222222222222222222222";

const ENV_KEYS = ["HYPERLIQUID_USER_ADDRESS", "HYPERLIQUID_ADDRESS", "HYPERLIQUID_ACCOUNT_LABEL", "HYPERLIQUID_ACCOUNTS"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("listHyperliquidAccounts", () => {
  it("returns the default account first, then the extras", () => {
    process.env.HYPERLIQUID_USER_ADDRESS = MAIN;
    process.env.HYPERLIQUID_ACCOUNTS = `alt:${ALT}:第二账户`;

    expect(listHyperliquidAccounts()).toEqual([
      { id: "main", label: "主账户", address: MAIN },
      { id: "alt", label: "第二账户", address: ALT },
    ]);
  });

  it("uses the id as the label when none is given, and lowercases the address", () => {
    process.env.HYPERLIQUID_ACCOUNTS = `alt:${ALT.toUpperCase().replace("0X", "0x")}`;

    expect(listHyperliquidAccounts()).toEqual([{ id: "alt", label: "alt", address: ALT }]);
  });

  it("drops entries with a malformed address instead of guessing", () => {
    process.env.HYPERLIQUID_USER_ADDRESS = MAIN;
    process.env.HYPERLIQUID_ACCOUNTS = "broken:0xnope,alt:";

    expect(listHyperliquidAccounts()).toEqual([{ id: "main", label: "主账户", address: MAIN }]);
  });

  it("ignores a second account reusing an address that is already configured", () => {
    process.env.HYPERLIQUID_USER_ADDRESS = MAIN;
    process.env.HYPERLIQUID_ACCOUNTS = `dupe:${MAIN}:副本`;

    expect(listHyperliquidAccounts()).toEqual([{ id: "main", label: "主账户", address: MAIN }]);
  });

  it("lets an explicit main entry override HYPERLIQUID_USER_ADDRESS", () => {
    process.env.HYPERLIQUID_USER_ADDRESS = MAIN;
    process.env.HYPERLIQUID_ACCOUNTS = `main:${ALT}:实盘`;

    expect(listHyperliquidAccounts()).toEqual([{ id: "main", label: "实盘", address: ALT }]);
  });

  it("is empty when nothing is configured", () => {
    expect(listHyperliquidAccounts()).toEqual([]);
  });
});

describe("resolveHyperliquidAccount", () => {
  beforeEach(() => {
    process.env.HYPERLIQUID_USER_ADDRESS = MAIN;
    process.env.HYPERLIQUID_ACCOUNTS = `alt:${ALT}:第二账户`;
  });

  it("falls back to the default account when no id is given", () => {
    expect(resolveHyperliquidAccount()?.address).toBe(MAIN);
  });

  it("matches ids case-insensitively", () => {
    expect(resolveHyperliquidAccount("ALT")?.address).toBe(ALT);
  });

  it("returns null for an unknown id rather than another account", () => {
    expect(resolveHyperliquidAccount("nope")).toBeNull();
  });
});

describe("runWithHyperliquidAccount", () => {
  beforeEach(() => {
    process.env.HYPERLIQUID_USER_ADDRESS = MAIN;
    process.env.HYPERLIQUID_ACCOUNTS = `alt:${ALT}:第二账户`;
  });

  it("scopes the address every read inside it will use", async () => {
    const seen = await runWithHyperliquidAccount("alt", async () => {
      // A nested async read still sees the scoped account.
      await Promise.resolve();
      return requireCurrentHyperliquidAddress();
    });

    expect(seen).toBe(ALT);
    // Outside the scope the default account applies again.
    expect(requireCurrentHyperliquidAddress()).toBe(MAIN);
  });

  it("keeps concurrent scopes separate", async () => {
    const [first, second] = await Promise.all([
      runWithHyperliquidAccount("main", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return requireCurrentHyperliquidAddress();
      }),
      runWithHyperliquidAccount("alt", async () => requireCurrentHyperliquidAddress()),
    ]);

    expect(first).toBe(MAIN);
    expect(second).toBe(ALT);
  });

  it("throws before making a request when the id is unknown", () => {
    expect(() => runWithHyperliquidAccount("nope", async () => "unreachable")).toThrow(/Unknown Hyperliquid account/);
  });

  it("throws a setup hint when no account is configured at all", () => {
    delete process.env.HYPERLIQUID_USER_ADDRESS;
    delete process.env.HYPERLIQUID_ACCOUNTS;

    expect(() => runWithHyperliquidAccount(undefined, async () => "unreachable")).toThrow(/HYPERLIQUID_USER_ADDRESS/);
  });

  it("reports whether the scoped account is the default one", async () => {
    expect(await runWithHyperliquidAccount("main", async () => isDefaultHyperliquidAccount())).toBe(true);
    expect(await runWithHyperliquidAccount("alt", async () => isDefaultHyperliquidAccount())).toBe(false);
  });
});

describe("account helpers", () => {
  it("masks addresses for display", () => {
    expect(maskHyperliquidAddress(MAIN)).toBe("0x1111...1111");
    expect(maskHyperliquidAddress("0xnope")).toBeNull();
  });

  it("returns no current account when nothing is configured", () => {
    expect(getCurrentHyperliquidAccount()).toBeNull();
  });
});
