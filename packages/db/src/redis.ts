import type { RedisClientType } from "redis";

import { createClient } from "redis";

export class RedisConnection {
  public redis: RedisClientType;

  constructor() {
    this.redis = createClient({
      url: process.env.REDIS_URL,
    });
  }

  async connect(): Promise<void> {
    if (!this.redis.isOpen) await this.redis.connect();
  }

  disconnect(): void {
    this.redis.destroy();
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}
