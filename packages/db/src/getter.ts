import { logger } from "@cat/shared/utils";
import { RedisDB } from "./redis.ts";
import { DrizzleDB } from "@/drizzle/db.ts";

declare global {
  const __DRIZZLE_DB__: DrizzleDB | undefined;
  const __REDIS_DB__: RedisDB | undefined;
}

export const getDrizzleDB = async (): Promise<DrizzleDB> => {
  if (!globalThis["__DRIZZLE_DB__"]) {
    logger.debug("DB", { msg: "new DrizzleDB instance" });
    const db = new DrizzleDB();
    await db.connect();
    await db.ping();
    globalThis["__DRIZZLE_DB__"] = db;
  }
  return globalThis["__DRIZZLE_DB__"]!;
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
