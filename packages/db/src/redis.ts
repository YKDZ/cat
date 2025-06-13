import type { RedisClientType } from "redis";
import { createClient } from "redis";
import "dotenv/config";

export class RedisDB {
  public static instance: RedisDB;
  public redis: RedisClientType;
  public redisPub: RedisClientType;
  public redisSub: RedisClientType;

  constructor() {
    if (RedisDB.instance)
      throw Error("RedisDB can only have a single instance");

    RedisDB.instance = this;
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

  static async connect() {
    if (!RedisDB.instance.redis.isOpen) await RedisDB.instance.redis.connect();
    if (!RedisDB.instance.redisPub.isOpen)
      await RedisDB.instance.redisPub.connect();
    if (!RedisDB.instance.redisSub.isOpen)
      await RedisDB.instance.redisSub.connect();
  }

  static async disconnect() {
    RedisDB.instance.redis.destroy();
    RedisDB.instance.redisPub.destroy();
    RedisDB.instance.redisSub.destroy();
  }

  static async ping() {
    await redis.ping();
  }
}

new RedisDB();

export const redis: RedisClientType = RedisDB.instance.redis;
export const redisPub: RedisClientType = RedisDB.instance.redisPub;
export const redisSub: RedisClientType = RedisDB.instance.redisSub;
