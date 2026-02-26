import { ORPCError, os } from "@orpc/server";

import type { Context } from "@/utils/context";

export const base = os.$context<Context>();

export const authed = base.use(async ({ context, next }) => {
  const { user, sessionId } = context;

  if (!user || !sessionId) throw new ORPCError("UNAUTHORIZED");

  return await next({
    context: {
      user,
      sessionId,
    },
  });
});
