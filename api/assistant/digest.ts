import { runAssistantDailyDigest } from "../../server/routers/assistant.js";

export default async function handler(req: any, res: any) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = String(req.headers?.authorization ?? "");
  if (configuredSecret && authorization !== `Bearer ${configuredSecret}`) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  try {
    await runAssistantDailyDigest(new Date());
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[AssistantCron] Digest failed:", error);
    res.status(500).json({ ok: false });
  }
}
