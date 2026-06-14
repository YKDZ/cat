import type { EditorScope } from "@cat/shared";

import {
  parseEditorScopeFromRoute,
  toEditorSearchParams,
} from "@/pages/editor/scope-url";

/**
 * Element target token used in QA review routes.
 */
export type QaReviewElementRouteTarget = number | "auto" | "empty";

export { parseEditorScopeFromRoute as parseQaReviewScopeFromRoute };

/**
 * Build a QA review workbench href while reusing editor-scope query params.
 *
 * @param scope - Editor scope
 * @param target - Element target token
 * @returns - Navigable QA review href
 */
export const buildQaReviewHref = (
  scope: EditorScope,
  target: QaReviewElementRouteTarget,
): string => {
  const params = toEditorSearchParams(scope);
  const suffix = params.toString();
  const path = `/qa-review/project/${scope.projectId}/${scope.languageToId}/${target}`;

  return suffix ? `${path}?${suffix}` : path;
};
