import { Hono } from "hono";
import { trpcHandler } from "./handler/trpc.ts";
import { healthHandler } from "./handler/health.ts";
import { pinoLoggerMiddleware } from "./middleware/logger.ts";

const app = new Hono();

app.use("*", pinoLoggerMiddleware);

app.route("/api/trpc", trpcHandler);

// app.route("/doc/openapi", openapiHandler);
app.route("/api/__health", healthHandler);

export default app;
