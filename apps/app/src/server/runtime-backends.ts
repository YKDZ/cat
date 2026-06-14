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
 * Infrastructure backend set resolved from a runtime profile.
 */
export type RuntimeBackends = {
  /**
   * Cache store used by the current process.
   */
  cacheStore: CacheStore;
  /**
   * Session store used by the current process.
   */
  sessionStore: SessionStore;
  /**
   * Background task queue for vectorization.
   */
  vectorizationQueue: TaskQueue<VectorizationTask>;
  /**
   * Connected Redis handle when the current profile requires Redis.
   */
  redis?: RedisConnection;
};

/**
 * Create cache, session, queue, and optional Redis backends from the runtime profile.
 *
 * @param profile - Resolved runtime profile
 * @param db - Drizzle database client
 * @returns - Runtime backend collection
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
