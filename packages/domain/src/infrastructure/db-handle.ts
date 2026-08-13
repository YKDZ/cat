import {
  DrizzleDB,
  RedisConnection,
  type RedisConnectionOptions,
} from "@cat/db";

declare global {
  // oxlint-disable-next-line no-underscore-dangle
  var __DRIZZLE_DB__: DrizzleDB | undefined;
  // oxlint-disable-next-line no-underscore-dangle
  var __REDIS__: RedisConnection | undefined;
}

export const getDbHandle = async (): Promise<DrizzleDB> => {
  if (process.env.NODE_ENV === "test" && !globalThis["__DRIZZLE_DB__"]) {
    // 在测试环境中，如果 DB 尚未初始化，等待一段时间
    // 这防止了 Worker 在 setupTestDB 完成之前抢跑导致的连接错误
    for (let i = 0; i < 100; i += 1) {
      if (globalThis["__DRIZZLE_DB__"]) break;
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
 * Get the global Redis handle, creating and caching it when needed.
 *
 * @param options - Connection lifecycle and diagnostic policy
 * @returns - Connected Redis handle
 */
export const getRedisHandle = async (
  options: RedisConnectionOptions,
): Promise<RedisConnection> => {
  if (!globalThis["__REDIS__"]) {
    const db = new RedisConnection(options);
    await db.connect();
    globalThis["__REDIS__"] = db;
  }
  return globalThis["__REDIS__"];
};

/**
 * Read the current Redis handle without creating a new connection.
 *
 * @returns - Current Redis handle, or `undefined` when not initialized
 */
export const getCurrentRedisHandle = (): RedisConnection | undefined => {
  return globalThis["__REDIS__"];
};
