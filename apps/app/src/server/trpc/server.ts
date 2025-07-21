import { initTRPC, TRPCError } from "@trpc/server";
import type { HttpContext } from "./context";
import { z, ZodError } from "zod";

const t = initTRPC.context<HttpContext>().create({
  errorFormatter({ error, shape }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === "BAD_REQUEST" && error.cause instanceof ZodError
            ? z.treeifyError(error.cause)
            : null,
      },
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
