import { initTRPC, TRPCError } from "@trpc/server";
import type { HttpContext } from "./context.ts";
import { logger } from "@cat/shared/utils";

const t = initTRPC.context<HttpContext>().create({
  errorFormatter: ({ shape }) => {
    logger.debug("RPC", { stack: JSON.stringify(shape.data.stack) });
    return {
      ...shape,
    };
  },
});

export const { createCallerFactory, router } = t;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { user } = ctx;
  if (!user)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to login to access this procedure",
    });
  return await next({
    ctx: {
      user,
    },
  });
});
