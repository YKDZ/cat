import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@/server/trpc/sscClient.ts";

export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw render("/auth", `You must login to access`);

  const { elementId, documentId, languageFromTo } = ctx.routeParams;

  if (!documentId || !languageFromTo || !elementId)
    throw render("/", `Invalid route params`);

  if (elementId !== "auto" || !isNaN(parseInt(elementId))) return;

  let target = await useSSCTRPC(ctx).document.queryFirstElement({
    documentId: documentId,
    isTranslated: false,
  });

  if (!target) {
    const first = await useSSCTRPC(ctx).document.queryElements({
      documentId: documentId,
      page: 0,
      pageSize: 1,
    });
    if (!first[0])
      throw render(`/editor/${documentId}/${languageFromTo}/empty`);
    target = first[0];
  }

  throw render(`/editor/${documentId}/${languageFromTo}/${target.id}`);
};
