import { getPrismaDB, getRedisDB, setting } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import type { GlobalContextServer } from "vike/types";

export const onCreateGlobalContext = async (ctx: GlobalContextServer) => {
  ctx.prismaDB = await getPrismaDB();
  ctx.redisDB = await getRedisDB();
  ctx.pluginRegistry = PluginRegistry.get("GLOBAL", "");
  ctx.name = await setting("server.name", "CAT", ctx.prismaDB.client);
};
