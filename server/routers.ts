import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, router } from "./_core/trpc.js";
import { deribitRouter } from "./routers/deribit.js";
import { calendarRouter } from "./routers/calendar.js";
import { bitgetRouter } from "./routers/bitget.js";
import { hyperliquidRouter } from "./routers/hyperliquid.js";
import { incrementPageViews, getPageViews, logVisitor, getDailyVisitorStats, getVisitorDeviceStats, getVisitorOsStats, getVisitorIpList, getVisitorBrowserStats, getVisitorHourlyStats, getVisitorGeoStats, getRecentVisitors } from "./db.js";
import { getIpGeo } from "./_core/ipGeo.js";

function parseUserAgent(userAgent?: string) {
  if (!userAgent) return { deviceType: undefined as "desktop" | "mobile" | "tablet" | undefined, os: undefined as string | undefined, browser: undefined as string | undefined };

  const ua = userAgent.toLowerCase();

  let deviceType: "desktop" | "mobile" | "tablet" | undefined;
  if (ua.includes("mobile") || ua.includes("android") && !ua.includes("tablet")) {
    deviceType = "mobile";
  } else if (ua.includes("tablet") || (ua.includes("ipad") && !ua.includes("mobile"))) {
    deviceType = "tablet";
  } else {
    deviceType = "desktop";
  }

  let os: string | undefined;
  if (ua.includes("windows")) {
    os = "Windows";
  } else if (ua.includes("mac os") || ua.includes("macos")) {
    os = "MacOS";
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
    os = "iOS";
  } else if (ua.includes("android")) {
    os = "Android";
  } else if (ua.includes("linux")) {
    os = "Linux";
  }

  let browser: string | undefined;
  if (ua.includes("chrome") && !ua.includes("edg")) {
    browser = "Chrome";
  } else if (ua.includes("safari") && !ua.includes("chrome")) {
    browser = "Safari";
  } else if (ua.includes("firefox")) {
    browser = "Firefox";
  } else if (ua.includes("edg")) {
    browser = "Edge";
  } else if (ua.includes("opera") || ua.includes("opr")) {
    browser = "Opera";
  }

  return { deviceType, os, browser };
}

function getClientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.headers["remote-addr"];
  if (Array.isArray(ip)) return ip[0] || "unknown";
  if (typeof ip === "string") {
    const parts = ip.split(",");
    return parts[0].trim() || "unknown";
  }
  return "unknown";
}

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

  analytics: router({
    track: publicProcedure
      .input(
        z.object({
          page: z.string().optional(),
          duration: z.number().optional(),
          userAgent: z.string().optional(),
          referrer: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        console.log("[Analytics] Track API called with input:", { page: input.page, duration: input.duration });
        const { deviceType, os, browser } = parseUserAgent(input.userAgent);
        const ip = getClientIp(ctx.req);
        console.log("[Analytics] Parsed data:", { ip, deviceType, os, browser });

        let region: string | undefined;
        let city: string | undefined;
        try {
          const geo = await getIpGeo(ip);
          region = geo.region || undefined;
          city = geo.city || undefined;
          console.log("[Analytics] Geo lookup result:", { region, city });
        } catch (e) {
          console.warn("[Analytics] IP geo lookup failed, skipping:", e);
        }

        await logVisitor({
          ip,
          userAgent: input.userAgent ?? undefined,
          deviceType,
          os,
          browser,
          page: input.page ?? undefined,
          referrer: input.referrer ?? undefined,
          duration: input.duration ?? undefined,
          region,
          city,
        });

        return { success: true };
      }),

    dailyStats: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const stats = await getDailyVisitorStats(input);
        return { stats };
      }),

    deviceStats: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const stats = await getVisitorDeviceStats(input);
        return { stats };
      }),

    osStats: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const stats = await getVisitorOsStats(input);
        return { stats };
      }),

    ipList: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          limit: z.number().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const ips = await getVisitorIpList(input);
        return { ips };
      }),

    browserStats: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const stats = await getVisitorBrowserStats(input);
        return { stats };
      }),

    hourlyStats: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const stats = await getVisitorHourlyStats(input);
        return { stats };
      }),

    geoStats: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const stats = await getVisitorGeoStats(input);
        return { stats };
      }),

    recentVisitors: publicProcedure
      .input(
        z.object({
          limit: z.number().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const visitors = await getRecentVisitors(input?.limit);
        return { visitors };
      }),
  }),
});

export type AppRouter = typeof appRouter;
