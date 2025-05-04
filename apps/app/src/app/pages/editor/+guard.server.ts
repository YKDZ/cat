import { EMPTY_CONTEXT } from "@/server/trpc/context";
import { documentRouter } from "@/server/trpc/routers/document";
import { createCallerFactory } from "@/server/trpc/server";
import { redirect } from "vike/abort";
import { PageContext } from "vike/types";

export const guard = async (ctx: PageContext) => {
  if (!ctx.user) throw redirect("/auth");

  const { elementId, documentId, languageFromTo } = ctx.routeParams;
  if (elementId !== "auto" || !isNaN(parseInt(elementId))) return;

  const createCaller = createCallerFactory(documentRouter);
  const caller = createCaller({
    ...EMPTY_CONTEXT,
    user: ctx.user,
  });

  let target = await caller.queryFirstUntranslatedElement({
    id: documentId,
  });

  if (!target) {
    const first = await caller.queryElements({
      documentId: documentId,
      page: 0,
      pageSize: 1,
    });
    target = first[0];
  }

  throw redirect(`/editor/${documentId}/${languageFromTo}/${target.id}`);
};
