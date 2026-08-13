import { Hono } from "hono";

import orpcHandler from "#/handler/orpc.ts";
import pluginHandler from "#/handler/plugin.ts";
import { livenessHandler, readinessHandler } from "#/handler/readiness.ts";
import storageHandler from "#/handler/storage.ts";
import telefuncHandler from "#/handler/telefunc.ts";
import wsHandler, {
  injectApplicationWebSocket,
  wsHelper,
} from "#/handler/ws.ts";
import loggerMiddleware from "#/middleware/logger.ts";

const app = new Hono();
globalThis.app = app;

const isInitialized = (): boolean =>
  globalThis.inited === true ||
  Reflect.get(process, "__CAT_INITIALIZED__") === true;

// @ts-expect-error This style is semantically correct
app.use(async (c, next) => {
  if (c.req.path === "/_health/live" || c.req.path === "/_health/ready") {
    await next();
    return;
  }
  if (!isInitialized()) {
    return c.text("Server is starting...", 503);
  }
  await next();
});

app.use("*", loggerMiddleware);

app.route("/_health/live", livenessHandler);
app.route("/_health/ready", readinessHandler);

app.route("/_telefunc", telefuncHandler);

app.route("/api/rpc", orpcHandler);

app.route("/", wsHandler);

app.route("/api/storage", storageHandler);

app.route("/_plugin", pluginHandler);

export {
  configureReadinessReporter,
  createReadinessReporter,
  ReadinessProbeFailure,
} from "#/handler/readiness.ts";
export { injectApplicationWebSocket, wsHelper };

export default app;
