import "dotenv/config";
import { RedisDB } from "./redis.ts";
import { DrizzleDB } from "@/drizzle/db.ts";

declare global {
  // oxlint-disable-next-line no-var
  var __DRIZZLE_DB__: DrizzleDB | undefined;
  // oxlint-disable-next-line no-var
  var __REDIS_DB__: RedisDB | undefined;
}

export const getDrizzleDB = async (): Promise<DrizzleDB> => {
  if (process.env.NODE_ENV === "test" && !globalThis["__DRIZZLE_DB__"]) {
    // 在测试环境中，如果 DB 尚未初始化，等待一段时间
    // 这防止了 Worker 在 setupTestDB 完成之前抢跑导致的连接错误
    for (let i = 0; i < 100; i += 1) {
      if (globalThis["__DRIZZLE_DB__"]) break;
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (!globalThis["__DRIZZLE_DB__"]) {
    const db = new DrizzleDB();
    await db.connect();
    globalThis["__DRIZZLE_DB__"] = db;
  }

  return globalThis["__DRIZZLE_DB__"];
};

export const getRedisDB = async (): Promise<RedisDB> => {
  if (!globalThis["__REDIS_DB__"]) {
    const db = new RedisDB();
    await db.connect();
    globalThis["__REDIS_DB__"] = db;
  }
  return globalThis["__REDIS_DB__"];
};
