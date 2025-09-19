// @ts-expect-error zod ts(2742) workaround
// eslint-disable-next-line
import * as z from "zod";
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
    ...ctx.globalContext,
    ...(extraCtx ?? {}),
  });
