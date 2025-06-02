import { PluginRegistry } from "@cat/plugin-core";
import "dotenv/config";
import { Server } from "http";
import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import app from "./app";
import { getCookieFunc } from "./utils/cookie";
import { initDB, shutdownServer } from "./utils/server";
import { userFromSessionId } from "./utils/user";

let server: Server | null = null;

process.on("SIGTERM", () => shutdownServer(server!));
process.on("SIGQUIT", () => shutdownServer(server!));
process.on("SIGINT", () => shutdownServer(server!));

function startServer() {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  apply(app, {
    pageContext: async (runtime) => {
      const cookie = runtime.req?.headers["cookie"] ?? "";
      const sessionId = getCookieFunc(cookie)("sessionId");
      const user = await userFromSessionId(sessionId ?? "");

      return {
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
      await PluginRegistry.getInstance().loadPlugins();
    },
  });
}

export default startServer();
