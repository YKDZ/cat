import { initTRPC, TRPCError } from "@trpc/server";
import type { HttpContext } from "./context";

const t = initTRPC.context<HttpContext>().create();

export const { createCallerFactory, router } = t;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { user, isInited } = ctx;
  if (!user)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to login to access this procedure",
    });
  if (isInited === false)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Can not access this procedure before init",
    });
  return await next({
    ctx: {
      user,
      isInited: undefined,
    },
  });
});

export const initializationProcedure = t.procedure.use(
  async ({ ctx, next }) => {
    const { isInited } = ctx;
    if (isInited !== false)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This procedure can only be accessed when server boot firstly",
      });
    return await next();
  },
);
