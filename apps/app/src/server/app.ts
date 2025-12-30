import { Hono } from "hono";
import { trpcHandler } from "./handler/trpc.ts";
import { healthHandler } from "./handler/health.ts";
import { pinoLoggerMiddleware } from "./middleware/logger.ts";
import { pluginHandler } from "@/server/handler/plugin.ts";
import { telefuncHandler } from "@/server/handler/telefunc.ts";

const app = new Hono();
globalThis.app = app;

// @ts-expect-error This style is semantically correct
app.use(async (c, next) => {
  if (!globalThis.inited) {
    return c.text("Server is initializing", 503);
  }
  await next();
});

app.use("*", pinoLoggerMiddleware);

app.route("/_telefunc", telefuncHandler);
app.route("/api/trpc", trpcHandler);

app.route("/api/__health", healthHandler);

app.route("/_plugin/", pluginHandler);

export default app;
