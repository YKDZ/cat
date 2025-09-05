import { Hono } from "hono";
import { trpcHandler } from "./handler/trpc";
import { healthHandler } from "./handler/health";
import { PluginRegistry } from "@cat/plugin-core";
import { pinoLoggerMiddleware } from "./middleware/logger";

type Variables = {
  pluginRegistry: PluginRegistry;
};

const app = new Hono<{ Variables: Variables }>();

app.use("*", pinoLoggerMiddleware);

app.use("*", async (c, next) => {
  c.set("pluginRegistry", PluginRegistry.get());
  await next();
});

app.route("/api/trpc", trpcHandler);

// app.route("/doc/openapi", openapiHandler);
app.route("/api/__health", healthHandler);

export default app;
