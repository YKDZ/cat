import { PluginRegistry } from "@cat/plugin-core";
import "dotenv/config";
import type { Server } from "http";
import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import app from "./app";
import { getCookieFunc } from "./utils/cookie";
import { initDB, initSettings, shutdownServer } from "./utils/server";
import { userFromSessionId } from "./utils/user";
import { setting } from "@cat/db";

let server: Server | null = null;

function startServer() {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  apply(app, {
    pageContext: async (runtime) => {
      const cookie = runtime.req?.headers["cookie"] ?? "";
      const sessionId = getCookieFunc(cookie)("sessionId");
      const user = await userFromSessionId(sessionId ?? "");
      const name = (await setting("server.name", "CAT")) as string;

      return {
        name,
        user,
        sessionId,
        pluginRegistry: PluginRegistry.getInstance(),
      };
    },
  });

  return serve(app, {
    port,
    onCreate: async (nodeServer) => {
      server = nodeServer as Server;
      await initDB();
      await initSettings();
      await PluginRegistry.getInstance().loadPlugins();

      if (process.env.NODE_ENV === "production") {
        process.on("SIGTERM", () => shutdownServer(server!));
        process.on("SIGQUIT", () => shutdownServer(server!));
        process.on("SIGINT", () => shutdownServer(server!));
      }
    },
  });
}

export default startServer();
