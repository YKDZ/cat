import { appRouter } from "./_app";
import { HttpContext, EMPTY_CONTEXT } from "./context";
import { createCallerFactory } from "./server";

export const useSSCTRPC = (extraCtx?: Partial<HttpContext>) =>
  createCallerFactory(appRouter)({
    ...EMPTY_CONTEXT,
    ...(extraCtx ?? {}),
  });
