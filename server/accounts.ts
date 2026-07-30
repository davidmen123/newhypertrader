/**
 * Hyperliquid account registry.
 *
 * The site used to read one hard-coded address from HYPERLIQUID_USER_ADDRESS.
 * It can now read several read-only addresses so /analytics can switch between
 * them, while the public home page keeps showing the default account only.
 *
 * Accounts are declared in the environment:
 *
 *   HYPERLIQUID_USER_ADDRESS=0x...              default account, id "main"
 *   HYPERLIQUID_ACCOUNT_LABEL=主账户             optional label for the default
 *   HYPERLIQUID_ACCOUNTS=alt:0x...:第二账户       extra accounts, "id:address:label"
 *                                               comma-separated, label optional
 *
 * The selected account travels per request through an AsyncLocalStorage scope
 * rather than being threaded through every fetch helper. Every Hyperliquid read
 * funnels through one address lookup, so scoping the request guarantees a single
 * response can never mix two accounts' numbers together.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface HyperliquidAccount {
  id: string;
  label: string;
  address: string;
}

export const DEFAULT_HYPERLIQUID_ACCOUNT_ID = "main";

const ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;
const ACCOUNT_ID_PATTERN = /^[a-z0-9_-]{1,32}$/i;

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

export function isHyperliquidAddress(address: string) {
  return ADDRESS_PATTERN.test(normalizeAddress(address));
}

export function maskHyperliquidAddress(address: string) {
  const value = normalizeAddress(address);
  if (!isHyperliquidAddress(value)) return null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function readAccountEnv() {
  return {
    defaultAddress: process.env.HYPERLIQUID_USER_ADDRESS || process.env.HYPERLIQUID_ADDRESS || "",
    defaultLabel: process.env.HYPERLIQUID_ACCOUNT_LABEL || "",
    extra: process.env.HYPERLIQUID_ACCOUNTS || "",
  };
}

function parseExtraAccounts(spec: string): HyperliquidAccount[] {
  return spec
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [id, address, ...labelParts] = entry.split(":").map((part) => part.trim());
      if (!ACCOUNT_ID_PATTERN.test(id ?? "")) {
        console.warn(`[Hyperliquid] Ignoring HYPERLIQUID_ACCOUNTS entry with an invalid id: ${entry}`);
        return [];
      }
      if (!isHyperliquidAddress(address ?? "")) {
        console.warn(`[Hyperliquid] Ignoring HYPERLIQUID_ACCOUNTS entry "${id}": address must be 0x + 40 hex chars`);
        return [];
      }
      const label = labelParts.join(":").trim();
      return [{ id: id.toLowerCase(), label: label || id, address: normalizeAddress(address) }];
    });
}

// Env is re-parsed whenever it changes so tests can swap addresses without
// reloading the module, but a steady-state request pays only a string compare.
let accountCache: { key: string; accounts: HyperliquidAccount[] } | null = null;

export function listHyperliquidAccounts(): HyperliquidAccount[] {
  const env = readAccountEnv();
  const key = `${env.defaultAddress}|${env.defaultLabel}|${env.extra}`;
  if (accountCache?.key === key) return accountCache.accounts;

  const accounts: HyperliquidAccount[] = [];
  if (isHyperliquidAddress(env.defaultAddress)) {
    accounts.push({
      id: DEFAULT_HYPERLIQUID_ACCOUNT_ID,
      label: env.defaultLabel || "主账户",
      address: normalizeAddress(env.defaultAddress),
    });
  }

  for (const account of parseExtraAccounts(env.extra)) {
    // An explicit "main" entry overrides the one built from HYPERLIQUID_USER_ADDRESS.
    const existing = accounts.findIndex((item) => item.id === account.id);
    if (existing >= 0) {
      accounts[existing] = account;
      continue;
    }
    if (accounts.some((item) => item.address === account.address)) {
      console.warn(`[Hyperliquid] Ignoring duplicate account "${account.id}": address is already configured`);
      continue;
    }
    accounts.push(account);
  }

  accountCache = { key, accounts };
  return accounts;
}

export function resolveHyperliquidAccount(accountId?: string | null): HyperliquidAccount | null {
  const accounts = listHyperliquidAccounts();
  if (!accountId) return accounts[0] ?? null;
  const wanted = accountId.trim().toLowerCase();
  return accounts.find((account) => account.id === wanted) ?? null;
}

const accountScope = new AsyncLocalStorage<HyperliquidAccount>();

/**
 * Runs `fn` with `accountId` as the account every Hyperliquid read inside it
 * will use. Throws before any request is made when the id is unknown, so a bad
 * id can never silently fall back to another account's data.
 */
export function runWithHyperliquidAccount<T>(accountId: string | undefined | null, fn: () => T): T {
  const account = resolveHyperliquidAccount(accountId);
  if (!account) {
    if (accountId) throw new Error(`Unknown Hyperliquid account: ${accountId}`);
    throw new Error("Hyperliquid account address is not configured. Please set HYPERLIQUID_USER_ADDRESS=0x...");
  }
  return accountScope.run(account, fn);
}

/** The account for the current request, falling back to the default account. */
export function getCurrentHyperliquidAccount(): HyperliquidAccount | null {
  return accountScope.getStore() ?? resolveHyperliquidAccount();
}

export function requireCurrentHyperliquidAddress(): string {
  const account = getCurrentHyperliquidAccount();
  if (!account) {
    throw new Error("Hyperliquid account address is not configured. Please set HYPERLIQUID_USER_ADDRESS=0x...");
  }
  return account.address;
}

export function isDefaultHyperliquidAccount(): boolean {
  return getCurrentHyperliquidAccount()?.id === DEFAULT_HYPERLIQUID_ACCOUNT_ID;
}
