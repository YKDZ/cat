import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { DrizzleDB, RedisDB } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { getCookie, getCookieFunc, HTTPHelpers } from "@cat/shared/utils";
import { User } from "@cat/shared/schema/drizzle/user";
import { getHttpContext } from "@/utils/context";

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
  return getHttpContext(req, resHeaders);
};

// oxlint-disable-next-line require-await
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
