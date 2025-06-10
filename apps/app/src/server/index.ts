import { setting } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import "dotenv/config";
import type { Server } from "http";
import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import app from "./app";
import {
  initDB,
  initSettings,
  scanLocalPlugins,
  shutdownServer,
  isInited as checkInited,
} from "./utils/server";
import { userFromSessionId } from "./utils/user";
import { createHTTPHelpers } from "@cat/shared";

let server: Server | null = null;

export let isInited: false | undefined = undefined;

function startServer() {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  apply(app, {
    pageContext: async (runtime) => {
      const helpers = createHTTPHelpers(
        runtime.hono.req.raw,
        runtime.hono.res.headers,
      );

      const sessionId = helpers.getCookie("sessionId");
      const user = await userFromSessionId(sessionId ?? "");
      const name = await setting("server.name", "CAT");

      return {
        isInited,
        name,
        user,
        sessionId,
        pluginRegistry: PluginRegistry.getInstance(),
        helpers,
      };
    },
  });

  return serve(app, {
    port,
    onCreate: async (nodeServer) => {
      server = nodeServer as Server;
      await initDB();
      await initSettings();
      isInited = await checkInited();
      await PluginRegistry.getInstance().loadPlugins();
      await scanLocalPlugins();

      if (process.env.NODE_ENV === "production") {
        process.on("SIGTERM", () => shutdownServer(server!));
        process.on("SIGQUIT", () => shutdownServer(server!));
        process.on("SIGINT", () => shutdownServer(server!));
      }
    },
  });
}

export default startServer();
