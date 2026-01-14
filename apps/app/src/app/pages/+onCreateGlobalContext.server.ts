import {
  initAllVectorStorage,
  installDefaultPlugins,
} from "@cat/app-server-shared/utils";
import {
  ensureDB,
  getDrizzleDB,
  getRedisDB,
  getSetting,
  ensureRootUser,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { assertPromise, logger } from "@cat/shared/utils";
import { access } from "fs/promises";
import { join } from "path";
import type { GlobalContextServer } from "vike/types";

export const onCreateGlobalContext = async (ctx: GlobalContextServer) => {
  try {
    const drizzleDB = await getDrizzleDB();
    await drizzleDB.ping();

    if (import.meta.env.PROD) {
      const migrations = join(process.cwd(), "drizzle");
      await assertPromise(
        async () => access(migrations),
        "Does not found drizzle migration folder.",
      );
      logger.info("SERVER", { msg: "Start to migrate database..." });
      await drizzleDB.migrate(migrations);
    }

    await ensureDB();

    const redisDB = await getRedisDB();
    await redisDB.ping();

    const pluginManager = PluginManager.get("GLOBAL", "");

    await pluginManager.getDiscovery().syncDefinitions(drizzleDB.client);

    await drizzleDB.client.transaction(async (tx) => {
      await installDefaultPlugins(tx, pluginManager);

      await pluginManager.restore(tx, globalThis.app);

      await ensureRootUser(tx);
    });

    await initAllVectorStorage(pluginManager);

    ctx.drizzleDB = drizzleDB;
    ctx.redisDB = redisDB;
    ctx.pluginManager = pluginManager;

    ctx.name = await getSetting(drizzleDB.client, "server.name", "CAT");
    ctx.baseURL = await getSetting(
      drizzleDB.client,
      "server.url",
      "http://localhost:3000/",
    );

    globalThis.inited = true;
  } catch (err) {
    logger.error(
      "SERVER",
      {
        msg: "Failed to initialize server. Process will exit with code 1",
      },
      err,
    );
    process.exit(1);
  }
};
