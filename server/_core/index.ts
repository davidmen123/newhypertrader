import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.js";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { serveStatic, setupVite } from "./vite.js";
import { runMigrations } from "./migrate.js";

async function startServer() {
  await runMigrations();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Preview environments (e.g. Kimi Work) launch the dev script as
  // `npm run dev -- --port <p> --host <h>` and probe that exact port.
  // Honor CLI args first, then env vars, then the local default.
  function resolveListenTarget(): { port: number; host: string } {
    const args = process.argv.slice(2);
    let cliPort: number | undefined;
    let cliHost: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if ((arg === "--port" || arg === "-p") && args[i + 1]) {
        cliPort = parseInt(args[++i], 10);
      } else if (arg.startsWith("--port=")) {
        cliPort = parseInt(arg.slice("--port=".length), 10);
      } else if (arg === "--host" && args[i + 1]) {
        cliHost = args[++i];
      } else if (arg.startsWith("--host=")) {
        cliHost = arg.slice("--host=".length);
      }
    }
    const envPort = parseInt(process.env.PORT || "", 10);
    return {
      port: Number.isFinite(cliPort) ? (cliPort as number) : Number.isFinite(envPort) ? envPort : 3000,
      host: cliHost ?? process.env.HOST ?? "127.0.0.1",
    };
  }

  const { port, host } = resolveListenTarget();

  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });
}

startServer().catch(console.error);
