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

/**
 * @zh 获取全局 Redis 句柄；若尚未创建则建立连接并缓存。
 * @en Get the global Redis handle, creating and caching it when needed.
 *
 * @returns - {@zh 已连接的 Redis 句柄} {@en Connected Redis handle}
 */
export const getRedisHandle = async (): Promise<RedisConnection> => {
  if (!globalThis["__REDIS__"]) {
    const db = new RedisConnection();
    await db.connect();
    globalThis["__REDIS__"] = db;
  }
  return globalThis["__REDIS__"];
};

/**
 * @zh 读取当前已存在的 Redis 句柄；不会主动创建连接。
 * @en Read the current Redis handle without creating a new connection.
 *
 * @returns - {@zh 当前 Redis 句柄；若未初始化则为 `undefined`} {@en Current Redis handle, or `undefined` when not initialized}
 */
export const getCurrentRedisHandle = (): RedisConnection | undefined => {
  return globalThis["__REDIS__"];
};
