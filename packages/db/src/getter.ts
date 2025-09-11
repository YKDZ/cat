import { logger } from "@cat/shared/utils";
import { PrismaDB } from "./prisma.ts";
import { RedisDB } from "./redis.ts";

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __PRISMA_DB__: PrismaDB | undefined;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __REDIS_DB__: RedisDB | undefined;
}

export const getPrismaDB = async (): Promise<PrismaDB> => {
  if (!globalThis["__PRISMA_DB__"]) {
    logger.debug("DB", { msg: "new PrismaDB instance" });
    const db = new PrismaDB();
    await db.connect();
    await db.ping();
    globalThis["__PRISMA_DB__"] = db;
  }
  return globalThis["__PRISMA_DB__"]!;
};

export const getRedisDB = async (): Promise<RedisDB> => {
  if (!globalThis["__REDIS_DB__"]) {
    logger.debug("DB", { msg: "new RedisDB instance" });
    const db = new RedisDB();
    await db.connect();
    await db.ping();
    globalThis["__REDIS_DB__"] = db;
  }
  return globalThis["__REDIS_DB__"]!;
};
