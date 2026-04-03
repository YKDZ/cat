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

import { generateCsrfToken } from "@/middleware/csrf.ts";

import { resolveApiKey, updateApiKeyLastUsedAsync } from "./api-key.ts";

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

  // ====== 双通道认证 ======
  let user: User | null = null;
  let sessionId: string | null = null;
  let apiKeyScopes: string[] | null = null;

  // 通道 1: Cookie Session
  sessionId = helpers.getCookie("sessionId") ?? null;
  if (sessionId) {
    user = await userFromSessionId(drizzleDB.client, sessionId);
    if (!user) sessionId = null;
  }

  // 通道 2: Bearer Token (API Key) — 仅在无 Cookie Session 用户时尝试
  if (!user) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const rawKey = authHeader.slice(7);
      const resolved = await resolveApiKey(drizzleDB.client, rawKey);
      if (resolved) {
        user = resolved.user;
        apiKeyScopes = resolved.scopes;
        // 异步更新 lastUsedAt（不阻塞请求）
        updateApiKeyLastUsedAsync(drizzleDB.client, resolved.apiKeyId);
      }
    }
  }

  let auth: AuthContext | null = null;
  if (user) {
    const systemRoles = await loadUserSystemRoles(drizzleDB.client, user.id);
    auth = {
      subjectType: "user",
      subjectId: user.id,
      systemRoles,
      scopes: apiKeyScopes,
      traceId: req.headers.get("x-trace-id") ?? undefined,
      ip:
        req.headers.get("x-forwarded-for") ??
        req.headers.get("x-real-ip") ??
        undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    };

    // 从 Cookie Session 读取 AAL 等认证增强字段
    if (sessionId) {
      const rawSession = await sessionStore.getAll(`user:session:${sessionId}`);
      if (rawSession) {
        const rawAal = rawSession["aal"];
        const rawFactors = rawSession["completedFactors"];
        const rawTraceId = rawSession["flowTraceId"];
        auth = {
          ...auth,
          aal: rawAal !== undefined ? Number(rawAal) : undefined,
          completedFactors:
            rawFactors !== undefined
              ? // oxlint-disable-next-line no-unsafe-type-assertion
                (JSON.parse(
                  rawFactors,
                ) as unknown as AuthContext["completedFactors"])
              : undefined,
          flowTraceId: rawTraceId ?? undefined,
        };
      }
    }
  }

  // ====== CSRF Token ======
  // 如果 csrfToken cookie 不存在，生成一个新的（不带 HttpOnly 以便前端 JS 读取）
  if (!helpers.getCookie("csrfToken")) {
    const csrfToken = generateCsrfToken();
    const flags = ["Path=/", "SameSite=Lax"];
    if (process.env["NODE_ENV"] === "production") flags.push("Secure");
    resHeaders.append(
      "Set-Cookie",
      `csrfToken=${csrfToken}; ${flags.join("; ")}`,
    );
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
    isSSR: false,
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
  isSSR: boolean;
};
