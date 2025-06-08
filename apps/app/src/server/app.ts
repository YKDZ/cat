import { Hono } from "hono";
import { trpcHandler } from "./handler/trpc";
import { internalPluginComponentsHandler } from "./handler/plugin/components";
import { healthHandler } from "./handler/health";

const app = new Hono();

app.route("/api/trpc", trpcHandler);

// app.route("/doc/openapi", openapiHander);
app.route("/api/__health", healthHandler);
app.route("/__internal/plugin/components", internalPluginComponentsHandler);

export default app;
