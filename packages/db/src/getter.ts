import { logger } from "@cat/shared";
import { ESDB } from "./es";
import { PrismaDB } from "./prisma";
import { RedisDB } from "./redis";

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __PRISMA_DB__: PrismaDB | undefined;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __REDIS_DB__: RedisDB | undefined;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __ES_DB__: ESDB | undefined;
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

export const getEsDB = async (): Promise<ESDB> => {
  if (!globalThis["__ES_DB__"]) {
    logger.debug("DB", { msg: "new EsDB instance" });
    const db = new ESDB();
    await db.connect();
    await db.ping();
    globalThis["__ES_DB__"] = db;
  }
  return globalThis["__ES_DB__"]!;
};
