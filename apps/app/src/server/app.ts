import { Hono } from "hono";
import { trpcHandler } from "./handler/trpc";

const app = new Hono();

app.route("/api/trpc", trpcHandler);
// app.route("/doc/openapi", openapiHander);

export default app;
