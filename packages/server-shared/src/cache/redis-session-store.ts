import type { SessionStore } from "@cat/domain";
import type { RedisClientType } from "redis";

export class RedisSessionStore implements SessionStore {
  private redis: RedisClientType;

  constructor(redis: RedisClientType) {
    this.redis = redis;
  }

  async create(
    key: string,
    fields: Record<string, string | number>,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.hSet(key, fields);
    await this.redis.expire(key, ttlSeconds);
  }

  async getField(key: string, field: string): Promise<string | null> {
    return (await this.redis.hGet(key, field)) ?? null;
  }

  async getAll(key: string): Promise<Record<string, string> | null> {
    const data = await this.redis.hGetAll(key);
    if (Object.keys(data).length === 0) return null;
    return data;
  }

  async destroy(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
