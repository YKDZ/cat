import "dotenv/config";
import { setting, syncSettings } from "@cat/db";
import { createHTTPHelpers, logger } from "@cat/shared";
import type { Server } from "http";
import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import { getPrismaDB, getRedisDB } from "@cat/db";
import { closeAllProcessors } from "./processor";
import { parsePreferredLanguage } from "./utils/i18n";
import { scanLocalPlugins } from "./utils/server";
import { useStorage } from "./utils/storage/useStorage";
import { userFromSessionId } from "./utils/user";
import app from "./app";
import { initTermService } from "./utils/term";
import { PluginRegistry } from "@cat/plugin-core";

let server: Server | null = null;

const shutdownServer = async () => {
  logger.info("SERVER", { msg: "About to shutdown server gracefully..." });

  await new Promise<void>((resolve, reject) => {
    server!.close(async (err) => {
      if (err) reject(err);
      else resolve();

      await closeAllProcessors();
      await (await useStorage()).storage.disconnect();
      await (await getRedisDB()).disconnect();
      await (await getPrismaDB()).disconnect();
    });
  });

  logger.info("SERVER", { msg: "Successfully shutdown gracefully. Goodbye" });
};

const startServer = async () => {
  try {
    const prismaDB = await getPrismaDB();
    const redisDB = await getRedisDB();

    await syncSettings(prismaDB.client);

    const pluginRegistry = PluginRegistry.get();
    await pluginRegistry.loadPlugins(prismaDB.client);

    await scanLocalPlugins();
    (await useStorage()).storage.connect();
    (await useStorage()).storage.ping();
    await initTermService(prismaDB.client, pluginRegistry);

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
          (await setting("server.default-language", "zh_cn", prismaDB.client));
        const user = await userFromSessionId(sessionId ?? "");
        const name = await setting("server.name", "CAT", prismaDB.client);

        return {
          name,
          user,
          sessionId,
          displayLanguage,
          pluginRegistry,
          prismaDB,
          redisDB,
          helpers,
        };
      },
    });
  } catch (e) {
    logger.error(
      "SERVER",
      { msg: "Failed to start server. Process will exit with code 1" },
      e,
    );
    process.exit(1);
  }

  return serve(app, {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    onCreate: async (nodeServer) => {
      server = nodeServer as Server;

      if (process.env.NODE_ENV === "production") {
        process.on("SIGTERM", shutdownServer);
        process.on("SIGQUIT", shutdownServer);
        process.on("SIGINT", shutdownServer);
      }
    },
  });
};

export default startServer();
