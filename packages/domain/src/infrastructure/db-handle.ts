import { DrizzleDB, RedisConnection } from "@cat/db";

declare global {
  // oxlint-disable-next-line no-var
  var __DRIZZLE_DB__: DrizzleDB | undefined;
  // oxlint-disable-next-line no-var
  var __REDIS__: RedisConnection | undefined;
}

export const getDbHandle = async (): Promise<DrizzleDB> => {
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

export const getRedisHandle = async (): Promise<RedisConnection> => {
  if (!globalThis["__REDIS__"]) {
    const db = new RedisConnection();
    await db.connect();
    globalThis["__REDIS__"] = db;
  }
  return globalThis["__REDIS__"];
};
