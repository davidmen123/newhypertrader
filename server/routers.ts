import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, router } from "./_core/trpc.js";
import { deribitRouter } from "./routers/deribit.js";
import { calendarRouter } from "./routers/calendar.js";
import { bitgetRouter } from "./routers/bitget.js";
import { hyperliquidRouter } from "./routers/hyperliquid.js";
import { feedbackRouter } from "./routers/feedback.js";
import { incrementPageViews, getPageViews, logVisitor, updateVisitorDuration, getVisitorSummary, getVisitorLogCount, getDailyVisitorStats, getVisitorDeviceStats, getVisitorOsStats, getVisitorBrowserStats, getVisitorHourlyStats, getVisitorGeoStats, getRecentVisitors } from "./db.js";
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

// Drop the last group of the address before storing so we keep an anonymized
// visitor identifier (good enough for de-duping) without persisting a full,
// re-identifiable IP. Geo lookup is done on the full IP first, then discarded.
function maskIp(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  if (ip.includes(":")) {
    const groups = ip.split(":");
    return groups.slice(0, 4).join(":") + "::";
  }
  const octets = ip.split(".");
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  return ip;
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
  feedback: feedbackRouter,

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
        if (!process.env.DATABASE_URL) {
          console.error("[Analytics] Track API failed: DATABASE_URL environment variable is not set");
          return { success: false, error: "Database configuration error" };
        }

        try {
          const { deviceType, os, browser } = parseUserAgent(input.userAgent);
          const fullIp = getClientIp(ctx.req);

          let region: string | undefined;
          let city: string | undefined;
          try {
            const geo = await getIpGeo(fullIp);
            region = geo.region || undefined;
            city = geo.city || undefined;
          } catch (e) {
            console.warn("[Analytics] IP geo lookup failed, skipping:", e);
          }

          const id = await logVisitor({
            ip: maskIp(fullIp),
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

          return { success: true, id };
        } catch (error) {
          console.error("[Analytics] Track API error:", error);
          return { success: false, error: String(error) };
        }
      }),

    // Updates the dwell time onto an existing visit row (from track) rather
    // than inserting a new one, so a single visit stays a single row.
    updateDuration: publicProcedure
      .input(z.object({ id: z.number(), duration: z.number() }))
      .mutation(async ({ input }) => {
        await updateVisitorDuration(input.id, input.duration);
        return { success: true };
      }),

    // One aggregate round trip for the whole dashboard: all stat slices run in
    // parallel server-side and come back in a single payload. The 5s/10s per-widget
    // polling of the old per-section endpoints is replaced by one 30s refetch.
    overview: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const range = { startDate: input?.startDate, endDate: input?.endDate };
        const [summary, daily, device, os, browser, hourly, geo, recent, totalRecords] = await Promise.all([
          getVisitorSummary(range),
          getDailyVisitorStats(range),
          getVisitorDeviceStats(range),
          getVisitorOsStats(range),
          getVisitorBrowserStats(range),
          getVisitorHourlyStats(range),
          getVisitorGeoStats(range),
          getRecentVisitors(15),
          getVisitorLogCount(),
        ]);
        return { summary, daily, device, os, browser, hourly, geo, recent, totalRecords };
      }),
  }),
});

export type AppRouter = typeof appRouter;
