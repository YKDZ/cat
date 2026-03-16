import type { Context } from "@cat/app-api/context";
import type { PageContextServer } from "vike/types";

import router, { type AppRouter } from "@cat/app-api/orpc/router";
import { getCacheStore, getSessionStore } from "@cat/domain";
import { createRouterClient, type RouterClient } from "@orpc/server";

export const ssc = (ctx: PageContextServer): RouterClient<AppRouter> => {
  return createRouterClient(router, {
    context: () => {
      return {
        ...ctx,
        drizzleDB: ctx.globalContext.drizzleDB,
        redis: ctx.globalContext.redis,
        pluginManager: ctx.globalContext.pluginManager,
        cacheStore: getCacheStore(),
        sessionStore: getSessionStore(),
      } satisfies Context;
    },
  });
};
