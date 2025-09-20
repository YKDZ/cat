import { getPrismaDB, getRedisDB } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import type { GlobalContextServer } from "vike/types";

export const onCreateGlobalContext = async (ctx: GlobalContextServer) => {
  ctx.prismaDB = await getPrismaDB();
  ctx.redisDB = await getRedisDB();
  ctx.pluginRegistry = PluginRegistry.get("GLOBAL", "");
};
