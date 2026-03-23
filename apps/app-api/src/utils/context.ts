import {
  type CacheStore,
  getCacheStore,
  type SessionStore,
  getSessionStore,
  initCacheStore,
  initSessionStore,
  getDbHandle,
  getRedisHandle,
  type DrizzleDB,
  type RedisConnection,
} from "@cat/domain";
import { type AuthContext, loadUserSystemRoles } from "@cat/permissions";
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

  const drizzleDB = await getDbHandle();
  const redis = await getRedisHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  initCacheStore(new RedisCacheStore(redis.redis));
  initSessionStore(new RedisSessionStore(redis.redis));

  const cacheStore = getCacheStore();
  const sessionStore = getSessionStore();

  const sessionId = helpers.getCookie("sessionId") ?? null;
  const user = await userFromSessionId(drizzleDB.client, sessionId);

  let auth: AuthContext | null = null;
  if (user) {
    const systemRoles = await loadUserSystemRoles(drizzleDB.client, user.id);
    auth = {
      subjectType: "user",
      subjectId: user.id,
      systemRoles,
      traceId: req.headers.get("x-trace-id") ?? undefined,
      ip:
        req.headers.get("x-forwarded-for") ??
        req.headers.get("x-real-ip") ??
        undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    };
  }

  return {
    user,
    sessionId,
    auth,
    pluginManager,
    drizzleDB,
    redis,
    cacheStore,
    sessionStore,
    helpers,
  };
};

export type Context = {
  user: User | null;
  sessionId: string | null;
  auth: AuthContext | null;
  pluginManager: PluginManager;
  drizzleDB: DrizzleDB;
  redis: RedisConnection;
  cacheStore: CacheStore;
  sessionStore: SessionStore;
  helpers: HTTPHelpers;
};
