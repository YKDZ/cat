import { Hono } from "hono";
import { trpcHandler } from "./handler/trpc";
import { healthHandler } from "./handler/health";
import { pluginComponentHandler } from "./handler/plugin-component";
import type { PluginRegistry } from "@cat/plugin-core";
import getPluginRegistry from "./pluginRegistry";
import { getPrismaDB } from "@cat/db";

type Variables = {
  pluginRegistry: PluginRegistry;
};

const app = new Hono<{ Variables: Variables }>();

app.use("*", async (c, next) => {
  const { client: prisma } = await getPrismaDB();
  c.set("pluginRegistry", await getPluginRegistry(prisma));
  await next();
});

app.route("/api/trpc", trpcHandler);

// app.route("/doc/openapi", openapiHander);
app.route("/api/__health", healthHandler);
app.route("/api/__plugin/component", pluginComponentHandler);

export default app;
