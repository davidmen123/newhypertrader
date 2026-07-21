/**
 * Feedback Router
 * - submit: anonymous site feedback and questions from public dialogs.
 *   No login required. Every submission is stored in the `feedback` table
 *   (backup copy) and emailed to the site owner (FEEDBACK_TO).
 *   Abuse control: honeypot field + per-IP rate limit (5 per hour).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc.js";
import { ENV } from "../_core/env.js";
import { getDb } from "../db.js";
import { feedback } from "../../drizzle/schema.js";

// ─── Per-IP rate limit (in-memory, 5 submissions / hour) ────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const submissions = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (submissions.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    submissions.set(ip, recent);
    return true;
  }
  recent.push(now);
  submissions.set(ip, recent);
  // Keep the map from growing unbounded on busy sites.
  if (submissions.size > 5000) submissions.clear();
  return false;
}

function getClientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"];
  if (Array.isArray(ip)) return ip[0] || "unknown";
  if (typeof ip === "string") return ip.split(",")[0].trim() || "unknown";
  return "unknown";
}

// ─── Email delivery (Resend HTTPS API — port 443, works where SMTP is blocked) ──
async function sendFeedbackEmail(fields: {
  kind: "feedback" | "question";
  content: string;
  contact?: string;
  page?: string;
}): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.warn("[Feedback] RESEND_API_KEY not configured, skipping email");
    return false;
  }
  try {
    const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: "网站反馈 <onboarding@resend.dev>",
        to: [ENV.feedbackTo],
        subject: `${fields.kind === "question" ? "【网站提问】" : "【网站反馈】"}${fields.content.slice(0, 40)}${fields.content.length > 40 ? "…" : ""}`,
        text: [
          `时间：${time}`,
          `页面：${fields.page || "未知"}`,
          `联系方式：${fields.contact || "（未填写）"}`,
          "",
          fields.kind === "question" ? "提问内容：" : "反馈内容：",
          fields.content,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[Feedback] Resend API error ${res.status}:`, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Feedback] Failed to send email:", error);
    return false;
  }
}

export const feedbackInputSchema = z.object({
  kind: z.enum(["feedback", "question"]).default("feedback"),
  content: z.string().trim().min(1).max(1000),
  contact: z.string().trim().max(200).optional(),
  page: z.string().max(256).optional(),
  // Honeypot: real users never see or fill this field; bots do.
  website: z.string().max(0).optional(),
}).superRefine((input, ctx) => {
  if (input.kind === "question" && !input.contact?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contact"],
      message: "Contact is required for questions.",
    });
  }
});

export const feedbackRouter = router({
  submit: publicProcedure
    .input(feedbackInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Silently accept bot submissions without storing or emailing anything.
      if (input.website) return { success: true };

      const ip = getClientIp(ctx.req);
      if (isRateLimited(ip)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many submissions, please try again later.",
        });
      }

      let stored = false;
      try {
        const db = await getDb();
        if (db) {
          await db.insert(feedback).values({
            content: input.kind === "question" ? `【向温格提问】\n${input.content}` : input.content,
            contact: input.contact || null,
            page: input.page || null,
          });
          stored = true;
        }
      } catch (error) {
        console.error("[Feedback] Failed to store submission:", error);
      }

      const emailed = await sendFeedbackEmail(input);

      if (!stored && !emailed) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Feedback could not be delivered. Please try again later.",
        });
      }
      return { success: true };
    }),
});
