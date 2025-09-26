import type { PageContextServer } from "vike/types";
import { appRouter } from "@cat/app-api/trpc";
import type { HttpContext } from "@cat/app-api/trpc";
import { EMPTY_CONTEXT } from "@cat/app-api/trpc";

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
