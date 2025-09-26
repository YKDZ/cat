import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { getDrizzleDB, getRedisDB } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { createHTTPHelpers, getCookieFunc } from "@cat/shared/utils";
import { userFromSessionId } from "@cat/app-server-shared/utils";

export const createHttpContext = async ({
  req,
  resHeaders,
}: Pick<FetchCreateContextFnOptions, "req" | "resHeaders">) => {
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
    ...helpers,
  };
};

export const createWSContext = async ({
  req,
}: Pick<CreateWSSContextFnOptions, "req">) => {
  const getCookie = getCookieFunc(req.headers.cookie || "");

  return {
    getCookie,
  };
};

export type WSContext = Awaited<ReturnType<typeof createWSContext>>;
export type HttpContext = Awaited<ReturnType<typeof createHttpContext>>;

export const EMPTY_CONTEXT = {
  user: null,
  sessionId: "sessionId not exists in EMPTY_CONTEXT",
  setCookie: (): string => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  getCookie: (): string => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  getQueryParam: (): string => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  setResHeader: (): string => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  delCookie: (): string => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  getReqHeader: (): string => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
};
