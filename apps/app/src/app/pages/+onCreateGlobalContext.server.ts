import { getDrizzleDB, getRedisDB, getSetting } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import type { GlobalContextServer } from "vike/types";

export const onCreateGlobalContext = async (ctx: GlobalContextServer) => {
  ctx.drizzleDB = await getDrizzleDB();

  await ctx.drizzleDB.init();

  ctx.redisDB = await getRedisDB();
  ctx.pluginRegistry = PluginRegistry.get("GLOBAL", "");
  ctx.name = await getSetting(ctx.drizzleDB.client, "server.name", "CAT");
};
