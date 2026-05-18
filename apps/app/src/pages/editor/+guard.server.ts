import type { PageContextServer } from "vike/types";

import { render, redirect } from "vike/abort";

import { ssc } from "@/server/ssc";

export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw render("/auth", "You must login to access");

  const { elementId, documentId, languageToId } = ctx.routeParams;
  if (!documentId || !languageToId || !elementId) {
    throw render("/", "Invalid route params");
  }

  const search = new URLSearchParams(ctx.urlParsed.searchOriginal ?? "");
  const branchIdRaw = search.get("branchId");
  const branchId = branchIdRaw ? Number.parseInt(branchIdRaw, 10) : undefined;
  const document = await ssc(ctx).document.get({
    documentId,
    branchId: Number.isInteger(branchId) ? branchId : undefined,
  });

  if (!document) {
    throw render("/", `Content node ${documentId} not found`);
  }

  search.set("nodes", documentId);
  const suffix = search.toString();
  const target = elementId === "empty" ? "empty" : elementId;

  throw redirect(
    `/editor/project/${document.projectId}/${languageToId}/${target}${suffix ? `?${suffix}` : ""}`,
  );
};
