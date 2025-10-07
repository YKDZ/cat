import type { PageContextServer } from "vike/types";
import type { HttpContext } from "./context.ts";
import { appRouter } from "./_app.ts";

const EMPTY_CONTEXT = {
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

export const useSSCTRPC = (
  ctx: PageContextServer,
  extraCtx?: Partial<HttpContext>,
) =>
  appRouter.createCaller({
    ...EMPTY_CONTEXT,
    ...ctx,
    drizzleDB: ctx.globalContext.drizzleDB,
    redisDB: ctx.globalContext.redisDB,
    pluginRegistry: ctx.globalContext.pluginRegistry,
    ...(extraCtx ?? {}),
  });
