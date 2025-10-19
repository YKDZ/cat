import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { DrizzleDB, getDrizzleDB, getRedisDB, RedisDB } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import {
  createHTTPHelpers,
  getCookie,
  getCookieFunc,
  HTTPHelpers,
} from "@cat/shared/utils";
import { userFromSessionId } from "@cat/app-server-shared/utils";
import { User } from "@cat/shared/schema/drizzle/user";

export const createHttpContext = async ({
  req,
  resHeaders,
}: Pick<FetchCreateContextFnOptions, "req" | "resHeaders">): Promise<{
  user: User | null;
  sessionId: string | null;
  pluginRegistry: PluginRegistry;
  drizzleDB: DrizzleDB;
  redisDB: RedisDB;
  helpers: HTTPHelpers;
}> => {
  const helpers = createHTTPHelpers(req, resHeaders);

  const drizzleDB = await getDrizzleDB();
  const redisDB = await getRedisDB();
  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  const sessionId = helpers.getCookie("sessionId") ?? null;
  const user = await userFromSessionId(drizzleDB.client, sessionId);

  return {
    user,
    sessionId,
    pluginRegistry,
    drizzleDB,
    redisDB,
    helpers,
  };
};

export const createWSContext = async ({
  req,
}: Pick<CreateWSSContextFnOptions, "req">): Promise<{
  getCookie: getCookie;
}> => {
  const getCookie = getCookieFunc(req.headers.cookie || "");

  return {
    getCookie,
  };
};

export type WSContext = Awaited<ReturnType<typeof createWSContext>>;
export type HttpContext = Awaited<ReturnType<typeof createHttpContext>>;
