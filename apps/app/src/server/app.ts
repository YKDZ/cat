import { Hono } from "hono";
import { trpcHandler } from "./handler/trpc";
import { internalPluginComponentsHandler } from "./handler/plugin/components";
import { healthHandler } from "./handler/health";
import { logger } from "hono/logger";

const app = new Hono();

// if (process.env.NODE_ENV === "production") {
//   app.use(logger());
// }

app.route("/api/trpc", trpcHandler);

// app.route("/doc/openapi", openapiHander);
app.route("/api/__health", healthHandler);
app.route("/__internal/plugin/components", internalPluginComponentsHandler);

export default app;
