export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  newsLlmBaseUrl: process.env.NEWS_LLM_BASE_URL ?? "",
  newsLlmApiKey: process.env.NEWS_LLM_API_KEY ?? "",
  newsLlmModel: process.env.NEWS_LLM_MODEL ?? "deepseek-v4-flash",
  // Site feedback email delivery via Resend (HTTPS API; register at resend.com).
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  feedbackTo: process.env.FEEDBACK_TO ?? "pnlnotes@gmail.com",
};
