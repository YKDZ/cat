import { render, redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw render("/auth", `You must login to access`);

  const { elementId, documentId, languageToId } = ctx.routeParams;

  if (!documentId || !languageToId) throw render("/", `Invalid route params`);

  if (elementId !== "auto" || !isNaN(parseInt(elementId))) return;

  let target = await useSSCTRPC(ctx).document.queryFirstElement({
    documentId: documentId,
    isTranslated: false,
    languageId: languageToId,
  });

  if (!target) {
    const first = await useSSCTRPC(ctx).document.queryElements({
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
