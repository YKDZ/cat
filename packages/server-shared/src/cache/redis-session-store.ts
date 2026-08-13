import type { SessionStore } from "@cat/domain";
import type { RedisClientType } from "redis";

export class RedisSessionStore implements SessionStore {
  private readonly keyPrefix: string;
  private redis: RedisClientType;

  constructor(redis: RedisClientType, keyPrefix = "") {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  private key = (value: string): string =>
    this.keyPrefix === "" ? value : `${this.keyPrefix}:${value}`;

  async create(
    key: string,
    fields: Record<string, string | number>,
    ttlSeconds: number,
  ): Promise<void> {
    const namespacedKey = this.key(key);
    await this.redis.hSet(namespacedKey, fields);
    await this.redis.expire(namespacedKey, ttlSeconds);
  }

  async getField(key: string, field: string): Promise<string | null> {
    return (await this.redis.hGet(this.key(key), field)) ?? null;
  }

  async getAll(key: string): Promise<Record<string, string> | null> {
    const data = await this.redis.hGetAll(this.key(key));
    if (Object.keys(data).length === 0) return null;
    return data;
  }

  async destroy(key: string): Promise<void> {
    await this.redis.del(this.key(key));
  }
}
