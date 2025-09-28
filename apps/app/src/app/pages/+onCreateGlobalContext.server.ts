import {
  importLocalPlugins,
  installDefaultPlugins,
} from "@/server/utils/plugin";
import { initTermService } from "@/server/utils/term";
import { getDrizzleDB, getRedisDB, getSetting, syncSettings } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { assertPromise, logger } from "@cat/shared/utils";
import { access } from "fs/promises";
import { join } from "path";
import type { GlobalContextServer } from "vike/types";

export const onCreateGlobalContext = async (ctx: GlobalContextServer) => {
  try {
    const drizzleDB = await getDrizzleDB();
    await drizzleDB.ping();

    if (import.meta.env.PROD) {
      await assertPromise(
        () => access(join(process.cwd(), "drizzle")),
        "MIGRATION_NOT_FOUND",
      );
      logger.info("SERVER", { msg: "Start to migrate database..." });
      await drizzleDB.migrate();
    }

    await drizzleDB.init();

    const redisDB = await getRedisDB();
    await redisDB.ping();

    await syncSettings(drizzleDB.client);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    await importLocalPlugins(drizzleDB.client);

    await installDefaultPlugins(drizzleDB.client, pluginRegistry);

    await initTermService(drizzleDB.client, pluginRegistry);

    ctx.drizzleDB = drizzleDB;
    ctx.redisDB = redisDB;
    ctx.pluginRegistry = pluginRegistry;
    ctx.name = await getSetting(drizzleDB.client, "server.name", "CAT");
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
