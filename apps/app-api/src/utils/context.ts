import { DrizzleDB, getDrizzleDB, getRedisDB, RedisDB } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { createHTTPHelpers, HTTPHelpers } from "@cat/shared/utils";
import { userFromSessionId } from "@cat/app-server-shared/utils";
import { User } from "@cat/shared/schema/drizzle/user";

export const getHttpContext = async (
  req: Request,
  resHeaders: Headers,
): Promise<{
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
