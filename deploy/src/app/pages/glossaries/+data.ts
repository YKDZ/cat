import { EMPTY_CONTEXT } from "@/server/trpc/context";
import { glossaryRouter } from "@/server/trpc/routers/glossary";
import { createCallerFactory } from "@/server/trpc/server";
import { redirect } from "vike/abort";
import { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const { user } = ctx;

  if (!user) throw redirect("/");

  const createCaller = createCallerFactory(glossaryRouter);
  const caller = createCaller({
    ...EMPTY_CONTEXT,
    user: ctx.user,
    sessionId: ctx.sessionId,
  });

  const glossaries = await caller
    .listUserOwned({ userId: user.id })
    .catch(() => {
      throw redirect("/");
    });

  return { glossaries };
};

export type Data = Awaited<ReturnType<typeof data>>;
