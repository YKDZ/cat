import { Hono } from "hono";
import { trpcHandler } from "./handler/trpc";
import { healthHandler } from "./handler/health";
import { pluginComponentHandler } from "./handler/plugin-component";

const app = new Hono();

app.route("/api/trpc", trpcHandler);

// app.route("/doc/openapi", openapiHander);
app.route("/api/__health", healthHandler);
app.route("/api/__plugin/component", pluginComponentHandler);

export default app;
