import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { deribitRouter } from "./routers/deribit";
import { calendarRouter } from "./routers/calendar";
import { bitgetRouter } from "./routers/bitget";
import { hyperliquidRouter } from "./routers/hyperliquid";
import { incrementPageViews, getPageViews } from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
