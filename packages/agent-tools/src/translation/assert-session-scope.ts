import type { ToolExecutionContext } from "@cat/agent";

import {
  executeQuery,
  getDbHandle,
  getEditorScopeElementPageIndex,
  getElementWithChunkIds,
  type ElementWithChunkIds,
  listProjectContentNodes,
  type ProjectContentNodeRow,
} from "@cat/domain";

const buildScopedContentNodeSet = (
  rows: ProjectContentNodeRow[],
  sessionContentNodeIds: string[],
): Set<string> => {
  const allNodeIds = new Set(rows.map((row) => row.id));
  if (sessionContentNodeIds.length === 0) {
    return allNodeIds;
  }

  const childrenByParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const children = childrenByParent.get(row.parentId) ?? [];
    children.push(row.id);
    childrenByParent.set(row.parentId, children);
  }

  const allowed = new Set<string>();
  const stack = [...sessionContentNodeIds];

  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || allowed.has(nodeId) || !allNodeIds.has(nodeId)) continue;

    allowed.add(nodeId);
    for (const childId of childrenByParent.get(nodeId) ?? []) {
      stack.push(childId);
    }
  }

  return allowed;
};

/**
 * Verify content-node filters belong to the session project and obey the session content-node scope.
 *
 * @param contentNodeIds - Content-node IDs to validate
 * @param ctx - Tool execution context
 * @returns - No return value when validation passes
 */
export const assertContentNodesInSession = async (
  contentNodeIds: string[],
  ctx: ToolExecutionContext,
): Promise<void> => {
  const sessionContentNodeIds = ctx.session.contentNodeIds ?? [];
  if (contentNodeIds.length === 0 && sessionContentNodeIds.length === 0) {
    return;
  }

  const { client: db } = await getDbHandle();
  const rows = await executeQuery({ db }, listProjectContentNodes, {
    projectId: ctx.session.projectId,
  });
  const allowedNodeIds = buildScopedContentNodeSet(rows, sessionContentNodeIds);

  for (const contentNodeId of contentNodeIds) {
    if (!allowedNodeIds.has(contentNodeId)) {
      throw new Error(
        `Content node ${contentNodeId} is outside the session editor scope`,
      );
    }
  }
};

/**
 * Resolve the effective content-node scope for a tool request in the current Agent session.
 *
 * @param requested - Explicitly requested content-node filters
 * @param ctx - Tool execution context
 * @returns - Effective content-node scope
 */
export const resolveEffectiveContentNodeIds = (
  requested: string[] | undefined,
  ctx: ToolExecutionContext,
): string[] => {
  const sessionScope = ctx.session.contentNodeIds;

  if (requested === undefined) {
    return sessionScope ?? [];
  }

  if (requested.length === 0) {
    if (sessionScope !== undefined && sessionScope.length > 0)
      return sessionScope;
  }

  return requested;
};

/**
 * Resolve the content-node context ID for the current session.
 *
 * @param ctx - Tool execution context
 * @returns - Context content-node ID for the current session
 */
export const resolveSessionContentNodeContextId = (
  ctx: ToolExecutionContext,
): string | undefined => {
  return (
    ctx.session.currentElementContentNodeId ??
    (ctx.session.contentNodeIds?.length === 1
      ? ctx.session.contentNodeIds[0]
      : undefined)
  );
};

/**
 * Verify the given element belongs to the current session's project and editor scope.
 *
 * @throws 若元素不存在或不在会话作用域内。 / If element not found or out of scope.
 * @returns 解析后的元素数据（value, languageId, projectId, primaryContentNodeId, chunkIds）。 / Resolved element data.
 */
export const assertElementInSession = async (
  elementId: number,
  ctx: ToolExecutionContext,
): Promise<ElementWithChunkIds> => {
  const { client: db } = await getDbHandle();
  const element = await executeQuery({ db }, getElementWithChunkIds, {
    elementId,
  });

  if (!element) {
    throw new Error(`Element ${elementId} not found`);
  }

  if (element.projectId !== ctx.session.projectId) {
    throw new Error(`Element ${elementId} belongs to a different project`);
  }

  if (ctx.session.contentNodeIds !== undefined) {
    if (!ctx.session.projectId) {
      throw new Error(
        "Agent session projectId is required for editor-scope element checks",
      );
    }
    if (!ctx.session.languageId) {
      throw new Error(
        "Agent session languageId is required for editor-scope element checks",
      );
    }

    const pageIndex = await executeQuery(
      { db },
      getEditorScopeElementPageIndex,
      {
        projectId: ctx.session.projectId,
        languageToId: ctx.session.languageId,
        branchId: ctx.session.branchId,
        contentNodeIds: ctx.session.contentNodeIds,
        searchQuery: "",
        statusFilter: "all",
        sortMode: "structure",
        pageSize: 1,
        elementId,
      },
    );

    if (pageIndex === null) {
      throw new Error(
        `Element ${elementId} is outside the session editor scope (primary content node: ${element.primaryContentNodeId ?? "unknown"})`,
      );
    }
  }

  return element;
};

/**
 * Verify the given project belongs to the current session's project scope.
 *
 * @throws 若项目不在会话作用域内。 / If the project is outside the current session scope.
 */
export const assertProjectInSession = (
  projectId: string,
  ctx: ToolExecutionContext,
): void => {
  if (projectId !== ctx.session.projectId) {
    throw new Error(`Project ${projectId} does not match the session project`);
  }
};
