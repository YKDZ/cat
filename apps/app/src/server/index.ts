import { setting } from "@cat/db";
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
} from "./utils/server";
import { userFromSessionId } from "./utils/user";
import { createHTTPHelpers } from "@cat/shared";
import getPluginRegistry from "./pluginRegistry";
import type { PluginRegistry } from "@cat/plugin-core";
import { parsePreferredLanguage } from "./utils/i18n";

(async () => {
  await initDB();
  await initSettings();
  await getPluginRegistry();
  await scanLocalPlugins();
})();

let server: Server | null = null;

function startServer() {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  apply(app, {
    pageContext: async (runtime) => {
      const helpers = createHTTPHelpers(
        runtime.hono.req.raw,
        runtime.hono.res.headers,
      );

      const sessionId = helpers.getCookie("sessionId");
      const displayLanguage =
        helpers.getCookie("displayLanguage") ??
        parsePreferredLanguage(helpers.getReqHeader("Accept-Language") ?? "")
          ?.toLocaleLowerCase()
          .replace("-", "_") ??
        (await setting("server.default-language", "zh_cn"));
      const user = await userFromSessionId(sessionId ?? "");
      const name = await setting("server.name", "CAT");

      return {
        name,
        user,
        sessionId,
        displayLanguage,
        pluginRegistry: runtime.hono.var.pluginRegistry as PluginRegistry,
        helpers,
      };
    },
  });

  return serve(app, {
    port,
    onCreate: async (nodeServer) => {
      server = nodeServer as Server;

      if (process.env.NODE_ENV === "production") {
        process.on("SIGTERM", () => shutdownServer(server!));
        process.on("SIGQUIT", () => shutdownServer(server!));
        process.on("SIGINT", () => shutdownServer(server!));
      }
    },
  });
}

export default startServer();
