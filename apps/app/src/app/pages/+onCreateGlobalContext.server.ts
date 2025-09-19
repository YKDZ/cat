import { getPrismaDB, getRedisDB } from "@cat/db";
import type { GlobalContextServer } from "vike/types";

export const onCreateGlobalContext = async (ctx: GlobalContextServer) => {
  ctx.prismaDB = await getPrismaDB();
  ctx.redisDB = await getRedisDB();
};
