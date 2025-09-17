import { Hono } from "hono";
import { PluginRegistry } from "@cat/plugin-core";
import { trpcHandler } from "./handler/trpc.ts";
import { healthHandler } from "./handler/health.ts";
import { pinoLoggerMiddleware } from "./middleware/logger.ts";

type Variables = {
  pluginRegistry: PluginRegistry;
};

const app = new Hono<{ Variables: Variables }>();

app.use("*", pinoLoggerMiddleware);

app.route("/api/trpc", trpcHandler);

// app.route("/doc/openapi", openapiHandler);
app.route("/api/__health", healthHandler);

export default app;
