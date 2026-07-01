import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

export default async function handler(req: any, res: any) {
  const rawPath = req.query?.trpc;
  const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath ?? "";

  await nodeHTTPRequestHandler({
    req,
    res,
    path,
    router: appRouter,
    createContext: (opts) => createContext(opts as any),
  });
}
