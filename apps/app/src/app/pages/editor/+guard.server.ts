import { useSSCTRPC } from "@/server/trpc/sscClient";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw redirect("/auth");

  const { elementId, documentId, languageFromTo } = ctx.routeParams;
  if (elementId !== "auto" || !isNaN(parseInt(elementId))) return;

  let target = await useSSCTRPC(ctx).document.queryFirstUntranslatedElement({
    id: documentId,
  });

  if (!target) {
    const first = await useSSCTRPC(ctx).document.queryElements({
      documentId: documentId,
      page: 0,
      pageSize: 1,
    });
    target = first[0];
  }

  if (!target) {
    throw redirect(`/editor/${documentId}/${languageFromTo}/empty`);
  }

  throw redirect(`/editor/${documentId}/${languageFromTo}/${target.id}`);
};
