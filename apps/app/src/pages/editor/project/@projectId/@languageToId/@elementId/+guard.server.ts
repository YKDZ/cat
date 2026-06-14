import type { PageContextServer } from "vike/types";

import { redirect, render } from "vike/abort";

import { ssc } from "@/server/ssc";

import {
  parseEditorScopeFromRoute,
  toEditorSearchParams,
} from "../../../../scope-url";

const getSearch = (ctx: PageContextServer) =>
  ctx.urlParsed.searchOriginal ?? "";

/**
 * Route guard for the canonical project editor route.
 *
 * @param ctx - Server page context
 * @returns - Never returns; interrupts via redirect or render
 */
export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw render("/auth", "You must login to access");

  const { projectId, languageToId, elementId } = ctx.routeParams;
  if (!projectId || !languageToId || !elementId) {
    throw render("/", "Invalid editor route params");
  }

  if (elementId !== "auto") return;

  const searchParams = new URLSearchParams(getSearch(ctx));
  const scope = parseEditorScopeFromRoute({
    projectId,
    languageToId,
    searchParams,
  });
  const normalizedSearch = toEditorSearchParams(scope).toString();
  const suffix = normalizedSearch ? `?${normalizedSearch}` : "";

  const target = await ssc(ctx).editor.getFirstElement(scope);

  if (!target) {
    throw redirect(
      `/editor/project/${projectId}/${languageToId}/empty${suffix}`,
    );
  }

  throw redirect(
    `/editor/project/${projectId}/${languageToId}/${target.id}${suffix}`,
  );
};
