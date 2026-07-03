import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import { sdk } from "./sdk.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const headers = (
    opts.req as typeof opts.req & {
      headers?: Record<string, string | string[] | undefined>;
    }
  ).headers;
  const rawCookie = headers?.cookie;
  const hasSessionCookie = Array.isArray(rawCookie)
    ? rawCookie.some(value => value.includes("app_session_id="))
    : typeof rawCookie === "string" && rawCookie.includes("app_session_id=");

  if (hasSessionCookie) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
