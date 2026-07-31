/**
 * The owner key for the back office at /analytics.
 *
 * Kept in localStorage and sent as a header on every tRPC call, so the server is
 * the thing that decides what a visitor may read or write — the page itself is a
 * static file on a CDN and cannot gate anything.
 */
export const ADMIN_KEY_HEADER = "x-admin-key";
const STORAGE_KEY = "analytics.adminKey";

export function readAdminKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Private-mode browsers reject storage access.
    return "";
  }
}

export function writeAdminKey(key: string) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to fall back to; the request header below simply goes out empty.
  }
}

export function adminKeyHeaders(): Record<string, string> {
  const key = readAdminKey();
  return key ? { [ADMIN_KEY_HEADER]: key } : {};
}
