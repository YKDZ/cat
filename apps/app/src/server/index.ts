import "dotenv/config";
import type { Server } from "node:http";
import { syncSettings } from "@cat/db";
import { logger } from "@cat/shared/utils";
import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import { getDrizzleDB, getRedisDB } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { closeAllProcessors } from "@cat/app-workers/utils";
import {
  importLocalPlugins,
  installDefaultPlugins,
  initTermService,
} from "@cat/app-server-shared/utils";
import app from "./app.ts";

let server: Server | null = null;

const shutdownServer = async () => {
  logger.info("SERVER", { msg: "About to shutdown server gracefully..." });

  await new Promise<void>((resolve, reject) => {
    server!.close(async (err) => {
      if (err) reject(err);
      else resolve();

      await closeAllProcessors();
      await (await getRedisDB()).disconnect();
      await (await getDrizzleDB()).disconnect();
    });
  });

  logger.info("SERVER", { msg: "Successfully shutdown gracefully. Goodbye" });
};

const startServer = async () => {
  try {
    const drizzleDB = await getDrizzleDB();
    const redisDB = await getRedisDB();

    await drizzleDB.ping();
    await redisDB.ping();

    await syncSettings(drizzleDB.client);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    await importLocalPlugins(drizzleDB.client);

    await installDefaultPlugins(drizzleDB.client, pluginRegistry);

    await initTermService(drizzleDB.client, pluginRegistry);

    apply(app);
  } catch (e) {
    logger.error(
      "SERVER",
      { msg: "Failed to start server. Process will exit with code 1" },
      e,
    );
    process.exit(6);
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
