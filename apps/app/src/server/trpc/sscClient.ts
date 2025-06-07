import type { PageContextServer } from "vike/types";
import { appRouter } from "./_app";
import type { HttpContext } from "./context";
import { EMPTY_CONTEXT } from "./context";
import { createCallerFactory } from "./server";

export const useSSCTRPC = (
  ctx: PageContextServer,
  extraCtx?: Partial<HttpContext>,
) =>
  createCallerFactory(appRouter)({
    ...EMPTY_CONTEXT,
    ...ctx,
    ...(extraCtx ?? {}),
  });
