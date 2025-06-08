import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { userFromSessionId } from "../utils/user";
import { PluginRegistry } from "@cat/plugin-core";
import { createHTTPHelpers, getCookieFunc } from "@cat/shared";

export const createHttpContext = async ({
  req,
  resHeaders,
}: Pick<FetchCreateContextFnOptions, "req" | "resHeaders">) => {
  const helpers = createHTTPHelpers(req, resHeaders);

  const sessionId = helpers.getCookie("sessionId") ?? null;
  const user = await userFromSessionId(sessionId);

  return {
    user,
    sessionId,
    pluginRegistry: PluginRegistry.getInstance(),
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
  sessionId: "",
  setCookie: () => {},
  getCookie: () => "",
  getQueryParam: () => "",
  setResHeader: () => {},
  delCookie: () => {},
  getReqHeader: () => "",
};
