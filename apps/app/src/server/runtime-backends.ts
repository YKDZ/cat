import type { TaskQueue } from "@cat/core";
import type { DrizzleClient, RedisConnection } from "@cat/db";
import type { CacheStore, RuntimeProfile, SessionStore } from "@cat/domain";
import type { VectorizationTask } from "@cat/server-shared";

import { InMemoryTaskQueue } from "@cat/core";
import {
  getRedisHandle,
  MemoryCacheStore,
  MemorySessionStore,
  PostgresCacheStore,
  PostgresSessionStore,
  PostgresTaskQueue,
} from "@cat/domain";
import {
  RedisCacheStore,
  RedisSessionStore,
  RedisTaskQueue,
} from "@cat/server-shared";

/**
 * @zh 按运行时 profile 解析后的基础设施后端集合。
 * @en Infrastructure backend set resolved from a runtime profile.
 */
export type RuntimeBackends = {
  /**
   * @zh 当前进程使用的缓存存储。
   * @en Cache store used by the current process.
   */
  cacheStore: CacheStore;
  /**
   * @zh 当前进程使用的会话存储。
   * @en Session store used by the current process.
   */
  sessionStore: SessionStore;
  /**
   * @zh 向量化后台任务队列。
   * @en Background task queue for vectorization.
   */
  vectorizationQueue: TaskQueue<VectorizationTask>;
  /**
   * @zh 若当前 profile 需要 Redis，则返回已连接的 Redis 句柄。
   * @en Connected Redis handle when the current profile requires Redis.
   */
  redis?: RedisConnection;
};

/**
 * @zh 根据运行时 profile 创建缓存、会话、队列与可选 Redis 后端。
 * @en Create cache, session, queue, and optional Redis backends from the runtime profile.
 *
 * @param profile - {@zh 已解析的运行时 profile} {@en Resolved runtime profile}
 * @param db - {@zh Drizzle 数据库客户端} {@en Drizzle database client}
 * @returns - {@zh 运行时后端集合} {@en Runtime backend collection}
 */
export const createRuntimeBackends = async (
  profile: RuntimeProfile,
  db: DrizzleClient,
): Promise<RuntimeBackends> => {
  const redis = profile.requireRedis ? await getRedisHandle() : undefined;
  if (redis) {
    await redis.ping();
  }

  const cacheStore =
    profile.cache.backend === "redis"
      ? new RedisCacheStore(redis!.redis)
      : profile.cache.backend === "postgres"
        ? new PostgresCacheStore(db)
        : new MemoryCacheStore();

  const sessionStore =
    profile.session.backend === "redis"
      ? new RedisSessionStore(redis!.redis)
      : profile.session.backend === "postgres"
        ? new PostgresSessionStore(db)
        : new MemorySessionStore();

  const vectorizationQueue =
    profile.queue.backend === "redis"
      ? new RedisTaskQueue<VectorizationTask>(redis!.redis, "vectorization")
      : profile.queue.backend === "postgres"
        ? new PostgresTaskQueue<VectorizationTask>(db, "vectorization")
        : new InMemoryTaskQueue<VectorizationTask>();

  return {
    cacheStore,
    sessionStore,
    vectorizationQueue,
    redis,
  };
};
