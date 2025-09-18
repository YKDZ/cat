// @ts-expect-error zod ts(2742) workaround
// eslint-disable-next-line
import * as z from "zod";
import type { PageContextServer } from "vike/types";
import { appRouter } from "./_app.ts";
import type { HttpContext } from "./context.ts";
import { EMPTY_CONTEXT } from "./context.ts";

export const useSSCTRPC = (
  ctx: PageContextServer,
  extraCtx?: Partial<HttpContext>,
) =>
  appRouter.createCaller({
    ...EMPTY_CONTEXT,
    ...ctx,
    ...(extraCtx ?? {}),
  });
