import { setting, syncSettings } from "@cat/db";
import { createHTTPHelpers, logger } from "@cat/shared";
import "dotenv/config";
import type { Server } from "http";
import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import app from "./app";
import { getEsDB, getPrismaDB, getRedisDB } from "@cat/db";
import getPluginRegistry from "./pluginRegistry";
import { closeAllProcessors } from "./processor";
import { parsePreferredLanguage } from "./utils/i18n";
import { scanLocalPlugins } from "./utils/server";
import { useStorage } from "./utils/storage/useStorage";
import { userFromSessionId } from "./utils/user";

const prismaDB = await getPrismaDB();
const redisDB = await getRedisDB();
// 也应该作为抽象层后的具体实现
const esDB = await getEsDB();

await syncSettings(prismaDB.client);

const pluginRegistry = await getPluginRegistry(prismaDB.client);

await scanLocalPlugins();

let server: Server | null = null;

const shutdownServer = async () => {
  logger.info("SERVER", "About to shutdown server gracefully...");

  await new Promise<void>((resolve, reject) => {
    server!.close(async (err) => {
      if (err) reject(err);
      else resolve();

      await closeAllProcessors();
      await (await useStorage()).storage.disconnect();
      await esDB.disconnect();
      await redisDB.disconnect();
      await prismaDB.disconnect();
    });
  });

  logger.info("SERVER", "Successfully shutdown gracefully. Goodbye");
};

const startServer = () => {
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
        esDB,
        helpers,
      };
    },
  });

  return serve(app, {
    port,
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
