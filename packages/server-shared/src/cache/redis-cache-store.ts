import type { CacheStore } from "@cat/domain";
import type { RedisClientType } from "redis";

export class RedisCacheStore implements CacheStore {
  private keyPrefix: string;
  private redis: RedisClientType;

  constructor(redis: RedisClientType, keyPrefix = "cache") {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(`${this.keyPrefix}:${key}`);
    if (raw === null) return null;
    // oxlint-disable-next-line no-unsafe-type-assertion -- generic deserialization from JSON
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    await this.redis.set(fullKey, JSON.stringify(value));
    if (ttl) await this.redis.expire(fullKey, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(`${this.keyPrefix}:${key}`);
  }

  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(`${this.keyPrefix}:${key}`)) === 1;
  }
}
