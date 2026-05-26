import type { PageContextServer } from "vike/types";

import { redirect, render } from "vike/abort";

import { ssc } from "@/server/ssc";

import {
  buildQaReviewHref,
  parseQaReviewScopeFromRoute,
} from "../../../../scope-url";

export async function guard(ctx: PageContextServer) {
  if (!ctx.user) throw render("/auth", "You must login to access");

  const { projectId, languageToId } = ctx.routeParams;
  if (!projectId || !languageToId) {
    throw render("/", "Invalid QA review route params");
  }

  const elementId = String(ctx.routeParams.elementId ?? "auto");
  if (elementId !== "auto") return;

  const scope = parseQaReviewScopeFromRoute({
    projectId,
    languageToId,
    searchParams: new URLSearchParams(ctx.urlParsed.searchOriginal ?? ""),
  });

  const first = await ssc(ctx).qaReview.getFirstReviewableElement({
    ...scope,
    pageSize: scope.pageSize,
    queueFilters: {
      queueStatus: [],
      riskBucket: [],
      findingAction: [],
      includeResolved: false,
    },
  });

  throw redirect(buildQaReviewHref(scope, first?.elementId ?? "empty"));
}
