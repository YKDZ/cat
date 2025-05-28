import { EMPTY_CONTEXT } from "@/server/trpc/context";
import { authRouter } from "@/server/trpc/routers/auth";
import { createCallerFactory } from "@/server/trpc/server";
import { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const createCaller = createCallerFactory(authRouter);
  const caller = createCaller({
    ...EMPTY_CONTEXT,
    user: ctx.user,
  });

  const methods = await caller.misc.availableAuthMethod();

  return { methods };
};

export type Data = Awaited<ReturnType<typeof data>>;
