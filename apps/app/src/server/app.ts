import { Hono } from "hono";
import { trpcHandler } from "./handler/trpc.ts";
import { healthHandler } from "./handler/health.ts";
import { pinoLoggerMiddleware } from "./middleware/logger.ts";
import { pluginHandler } from "@/server/handler/plugin.ts";

const app = new Hono();

app.use("*", pinoLoggerMiddleware);

app.route("/api/trpc", trpcHandler);

app.route("/api/__health", healthHandler);

app.route("/_plugin/", pluginHandler);

export default app;
