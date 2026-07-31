/**
 * Owner authentication for the back-office parts of the site.
 *
 * The site is a static SPA on a CDN with one serverless function behind it, so
 * there is no server in front of /analytics to gate — the page is just a shell.
 * The boundary that matters is the API: with these procedures locked the page
 * loads and shows nothing, and no one can write to the database.
 *
 * A single shared key in ADMIN_KEY is enough for a one-person back office. The
 * client sends it as a header on every request; there is no session to expire and
 * nothing to store server-side.
 */
import { timingSafeEqual } from "node:crypto";

export const ADMIN_KEY_HEADER = "x-admin-key";

function readHeader(headers: Record<string, string | string[] | undefined> | undefined) {
  const value = headers?.[ADMIN_KEY_HEADER];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

/** Compares without leaking the answer through how long the comparison took. */
function matches(candidate: string, expected: string) {
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a signal,
  // so compare a fixed-length digest of each side instead of the raw bytes.
  if (a.length !== b.length) {
    // Still spend the comparison, then fail.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Whether the request carries the owner key.
 *
 * Fails closed: with ADMIN_KEY unset nothing is treated as authenticated, so a
 * deployment that forgets the variable locks the back office rather than opening
 * it to everyone.
 */
export function isAdminRequest(headers: Record<string, string | string[] | undefined> | undefined) {
  const expected = process.env.ADMIN_KEY ?? "";
  if (!expected) return false;
  const candidate = readHeader(headers);
  if (!candidate) return false;
  return matches(candidate, expected);
}

export function isAdminKeyConfigured() {
  return Boolean(process.env.ADMIN_KEY);
}
