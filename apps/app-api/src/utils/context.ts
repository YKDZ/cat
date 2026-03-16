import { DrizzleDB, getDrizzleDB, getRedisDB, RedisDB } from "@cat/db";
import {
  type CacheStore,
  getCacheStore,
  type SessionStore,
  getSessionStore,
  initCacheStore,
  initSessionStore,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { userFromSessionId } from "@cat/server-shared";
import { RedisCacheStore, RedisSessionStore } from "@cat/server-shared";
import { User } from "@cat/shared/schema/drizzle/user";
import { createHTTPHelpers, HTTPHelpers } from "@cat/shared/utils";

export const getContext = async (
  req: Request,
  resHeaders: Headers,
): Promise<Context> => {
  const helpers = createHTTPHelpers(req, resHeaders);

  const drizzleDB = await getDrizzleDB();
  const redisDB = await getRedisDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  initCacheStore(new RedisCacheStore(redisDB.redis));
  initSessionStore(new RedisSessionStore(redisDB.redis));

  const cacheStore = getCacheStore();
  const sessionStore = getSessionStore();

  const sessionId = helpers.getCookie("sessionId") ?? null;
  const user = await userFromSessionId(drizzleDB.client, sessionId);

  return {
    user,
    sessionId,
    pluginManager,
    drizzleDB,
    redisDB,
    cacheStore,
    sessionStore,
    helpers,
  };
};

export type Context = {
  user: User | null;
  sessionId: string | null;
  pluginManager: PluginManager;
  drizzleDB: DrizzleDB;
  redisDB: RedisDB;
  cacheStore: CacheStore;
  sessionStore: SessionStore;
  helpers: HTTPHelpers;
};
