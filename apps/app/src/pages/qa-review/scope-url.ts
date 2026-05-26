import type { EditorScope } from "@cat/shared";

import {
  parseEditorScopeFromRoute,
  toEditorSearchParams,
} from "@/pages/editor/scope-url";

/**
 * @zh QA 审校路由中的元素目标标识。
 * @en Element target token used in QA review routes.
 */
export type QaReviewElementRouteTarget = number | "auto" | "empty";

export { parseEditorScopeFromRoute as parseQaReviewScopeFromRoute };

/**
 * @zh 为 QA 审校工作台构建链接，复用编辑器作用域查询参数。
 * @en Build a QA review workbench href while reusing editor-scope query params.
 *
 * @param scope - {@zh 编辑器作用域} {@en Editor scope}
 * @param target - {@zh 元素目标标识} {@en Element target token}
 * @returns - {@zh 可导航的 QA 审校链接} {@en Navigable QA review href}
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
