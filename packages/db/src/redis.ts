import { createClient, RedisClientType } from "redis";
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
      socket: {
        reconnectStrategy: (retries) => {
          const jitter = Math.floor(Math.random() * 100);

          const delay = Math.min(Math.pow(2, retries) * 50, 3000);

          return delay + jitter;
        },
      },
    });
    this.redisPub = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          const jitter = Math.floor(Math.random() * 100);

          const delay = Math.min(Math.pow(2, retries) * 50, 3000);

          return delay + jitter;
        },
      },
    });
    this.redisSub = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          const jitter = Math.floor(Math.random() * 100);

          const delay = Math.min(Math.pow(2, retries) * 50, 3000);

          return delay + jitter;
        },
      },
    });
  }

  static async connect() {
    await RedisDB.instance.redis.connect();
    await RedisDB.instance.redisPub.connect();
    await RedisDB.instance.redisSub.connect();
  }

  static async disconnect() {
    RedisDB.instance.redis.destroy();
    RedisDB.instance.redisPub.destroy();
    RedisDB.instance.redisSub.destroy();
  }
}

new RedisDB();

export const redis: RedisClientType = RedisDB.instance.redis;

export const redisPub: RedisClientType = RedisDB.instance.redisPub;

export const redisSub: RedisClientType = RedisDB.instance.redisSub;
