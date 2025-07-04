import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { userFromSessionId } from "../utils/user";
import { createHTTPHelpers, getCookieFunc } from "@cat/shared";
import getPluginRegistry from "../pluginRegistry";

export const createHttpContext = async ({
  req,
  resHeaders,
}: Pick<FetchCreateContextFnOptions, "req" | "resHeaders">) => {
  const helpers = createHTTPHelpers(req, resHeaders);

  const sessionId = helpers.getCookie("sessionId") ?? null;
  const user = await userFromSessionId(sessionId);

  const pluginRegistry = await getPluginRegistry();

  return {
    user,
    sessionId,
    pluginRegistry,
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
  setCookie: () => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  getCookie: () => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  getQueryParam: () => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  setResHeader: () => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  delCookie: () => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
  getReqHeader: () => {
    throw new Error("Not implemented in EMPTY_CONTEXT");
  },
};
