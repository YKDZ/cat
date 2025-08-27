import type { PageContextServer } from "vike/types";
import { appRouter } from "./_app";
import type { HttpContext } from "./context";
import { EMPTY_CONTEXT } from "./context";

export const useSSCTRPC = (
  ctx: PageContextServer,
  extraCtx?: Partial<HttpContext>,
) =>
  appRouter.createCaller({
    ...EMPTY_CONTEXT,
    ...ctx,
    ...(extraCtx ?? {}),
  });
