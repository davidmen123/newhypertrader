import { COOKIE_NAME } from "../shared/const.ts";
import { getSessionCookieOptions } from "./_core/cookies.ts";
import { systemRouter } from "./_core/systemRouter.ts";
import { publicProcedure, router } from "./_core/trpc.ts";
import { deribitRouter } from "./routers/deribit.ts";
import { calendarRouter } from "./routers/calendar.ts";
import { bitgetRouter } from "./routers/bitget.ts";
import { hyperliquidRouter } from "./routers/hyperliquid.ts";
import { incrementPageViews, getPageViews } from "./db.ts";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      const res = ctx.res as typeof ctx.res & {
        clearCookie?: (name: string, options?: unknown) => void;
      };
      if (typeof res.clearCookie === "function") {
        res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      } else {
        ctx.res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=None; Secure`);
      }
      return {
        success: true,
      } as const;
    }),
  }),

  deribit: deribitRouter,
  bitget: bitgetRouter,
  hyperliquid: hyperliquidRouter,
  calendar: calendarRouter,

  pageViews: router({
    // Called on each page load to increment counter and return total
    increment: publicProcedure.mutation(async () => {
      const count = await incrementPageViews();
      return { count };
    }),
    // Just read the current count without incrementing
    get: publicProcedure.query(async () => {
      const count = await getPageViews();
      return { count };
    }),
  }),
});

export type AppRouter = typeof appRouter;
