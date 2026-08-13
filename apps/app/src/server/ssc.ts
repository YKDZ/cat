import type { Context } from "@cat/app-api/context";
import router, { type AppRouter } from "@cat/app-api/orpc/router";
import { createRouterClient, type RouterClient } from "@orpc/server";
import type { PageContextServer } from "vike/types";

import { getRuntimeCapabilities } from "./runtime-capabilities.ts";

export const ssc = (ctx: PageContextServer): RouterClient<AppRouter> => {
  const runtime = getRuntimeCapabilities();
  return createRouterClient(router, {
    context: () => {
      return {
        ...ctx,
        drizzleDB: runtime.drizzleDB,
        redis: runtime.redis,
        pluginManager: runtime.pluginManager,
        cacheStore: runtime.cacheStore,
        sessionStore: runtime.sessionStore,
        isSSR: true,
        isWebSocket: false,
      } satisfies Context;
    },
  });
};
