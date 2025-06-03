import { EMPTY_CONTEXT } from "@/server/trpc/context";
import { glossaryRouter } from "@/server/trpc/routers/glossary";
import { createCallerFactory } from "@/server/trpc/server";
import { redirect } from "vike/abort";
import { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const { glossaryId } = ctx.routeParams;

  const createCaller = createCallerFactory(glossaryRouter);
  const caller = createCaller({
    ...EMPTY_CONTEXT,
    user: ctx.user,
  });

  const glossary = await caller.query({ id: glossaryId });

  if (!glossary) throw redirect("/project");

  return {
    glossary,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
