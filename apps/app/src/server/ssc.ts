import type { HttpContext } from "@cat/app-api/context";
import router, { type AppRouter } from "@cat/app-api/orpc/router";
import { createRouterClient, type RouterClient } from "@orpc/server";
import type { PageContextServer } from "vike/types";

export const ssc = (ctx: PageContextServer): RouterClient<AppRouter> => {
  return createRouterClient(router, {
    context: () => {
      return {
        ...ctx,
        ...ctx.globalContext,
      } satisfies HttpContext;
    },
  });
};
