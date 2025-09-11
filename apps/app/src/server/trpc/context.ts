import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { userFromSessionId } from "@/server/utils/user.ts";
import { getPrismaDB, getRedisDB } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { createHTTPHelpers, getCookieFunc } from "@cat/shared/utils";

export const createHttpContext = async ({
  req,
  resHeaders,
}: Pick<FetchCreateContextFnOptions, "req" | "resHeaders">) => {
  const helpers = createHTTPHelpers(req, resHeaders);

  const sessionId = helpers.getCookie("sessionId") ?? null;
  const user = await userFromSessionId(sessionId);

  const prismaDB = await getPrismaDB();
  const redisDB = await getRedisDB();
  const pluginRegistry = PluginRegistry.get();

  return {
    user,
    sessionId,
    pluginRegistry,
    prismaDB,
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
  setCookie: (): void => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  getCookie: (): void => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  getQueryParam: (): void => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  setResHeader: (): void => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  delCookie: (): void => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  getReqHeader: (): void => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
};
