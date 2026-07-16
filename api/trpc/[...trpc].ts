import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "../../server/routers.js";
import { createContext } from "../../server/_core/context.js";
import { runMigrations } from "../../server/_core/migrate.js";

let migrationsRun = false;

function getTrpcPath(req: any) {
  const rawPath = req.query?.trpc;
  if (Array.isArray(rawPath)) return rawPath.join("/");
  if (typeof rawPath === "string" && rawPath.length > 0) return rawPath;

  const pathname = new URL(req.url ?? "", "https://local.vercel").pathname;
  const prefix = "/api/trpc/";
  if (pathname.startsWith(prefix)) {
    return decodeURIComponent(pathname.slice(prefix.length));
  }
  return "";
}

export default async function handler(req: any, res: any) {
  if (!migrationsRun) {
    await runMigrations();
    migrationsRun = true;
  }

  const path = getTrpcPath(req);

  await nodeHTTPRequestHandler({
    req,
    res,
    path,
    router: appRouter,
    createContext: (opts) => createContext(opts as any),
  });
}
