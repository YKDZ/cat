import { render, redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw render("/auth", `You must login to access`);

  const { elementId, documentId, languageToId } = ctx.routeParams;

  if (!documentId || !languageToId) throw render("/", `Invalid route params`);

  if (elementId !== "auto" || !isNaN(parseInt(elementId))) return;

  let target = await ssc(ctx).document.getFirstElement({
    documentId: documentId,
    isTranslated: false,
    languageId: languageToId,
  });

  if (!target) {
    const first = await ssc(ctx).document.getElements({
      documentId: documentId,
      page: 0,
      pageSize: 1,
    });
    if (!first[0])
      throw redirect(`/editor/${documentId}/${languageToId}/empty`);
    target = first[0];
  }

  throw redirect(`/editor/${documentId}/${languageToId}/${target.id}`);
};
