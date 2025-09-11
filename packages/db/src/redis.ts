import "dotenv/config";
import type { RedisClientType } from "redis";
import { createClient } from "redis";

export class RedisDB {
  public redis: RedisClientType;
  public redisPub: RedisClientType;
  public redisSub: RedisClientType;

  constructor() {
    this.redis = createClient({
      url: process.env.REDIS_URL,
    });
    this.redisPub = createClient({
      url: process.env.REDIS_URL,
    });
    this.redisSub = createClient({
      url: process.env.REDIS_URL,
    });
  }

  async connect(): Promise<void> {
    if (!this.redis.isOpen) await this.redis.connect();
    if (!this.redisPub.isOpen) await this.redisPub.connect();
    if (!this.redisSub.isOpen) await this.redisSub.connect();
  }

  async disconnect(): Promise<void> {
    this.redis.destroy();
    this.redisPub.destroy();
    this.redisSub.destroy();
  }

  async ping(): Promise<void> {
    await this.redis.ping();
    await this.redisPub.ping();
    await this.redisSub.ping();
  }
}
