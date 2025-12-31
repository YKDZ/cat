import { Hono } from "hono";
import { loggerMiddleware } from "@/middleware/logger.ts";
import { pluginHandler } from "@/handler/plugin.ts";
import { telefuncHandler } from "@/handler/telefunc.ts";
import { orpcHandler } from "@/handler/orpc.ts";

const app = new Hono();
globalThis.app = app;

// @ts-expect-error This style is semantically correct
app.use(async (c, next) => {
  if (!globalThis.inited) {
    return c.text("Server is starting...", 503);
  }
  await next();
});

app.use("*", loggerMiddleware);

app.route("/_telefunc", telefuncHandler);

app.route("/api/rpc", orpcHandler);

app.route("/_plugin/", pluginHandler);

export default app;
