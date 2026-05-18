import type { ToolExecutionContext } from "@cat/agent";

import {
  executeQuery,
  getContentNode,
  getDbHandle,
  getEditorScopeElementPageIndex,
  getElementWithChunkIds,
  type ElementWithChunkIds,
  listProjectContentNodes,
  type ProjectContentNodeRow,
} from "@cat/domain";

const getLegacySessionDocumentId = (
  ctx: ToolExecutionContext,
): string | undefined => {
  // oxlint-disable-next-line typescript/no-deprecated -- legacy sessions may still only carry documentId
  return ctx.session.documentId;
};

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
 * @zh 验证内容节点过滤器属于当前会话项目，并符合会话限定的内容节点范围。
 * @en Verify content-node filters belong to the session project and obey the session content-node scope.
 *
 * @param contentNodeIds - {@zh 待校验的内容节点 ID 列表} {@en Content-node IDs to validate}
 * @param ctx - {@zh 工具执行上下文} {@en Tool execution context}
 * @returns - {@zh 校验通过时无返回} {@en No return value when validation passes}
 */
export const assertContentNodesInSession = async (
  contentNodeIds: string[],
  ctx: ToolExecutionContext,
): Promise<void> => {
  const legacyDocumentId = getLegacySessionDocumentId(ctx);
  if (ctx.session.contentNodeIds === undefined && legacyDocumentId) {
    for (const contentNodeId of contentNodeIds) {
      if (contentNodeId !== legacyDocumentId) {
        throw new Error(
          `Content node ${contentNodeId} is outside the session editor scope`,
        );
      }
    }
    await assertDocumentInSession(legacyDocumentId, ctx);
    return;
  }

  const sessionContentNodeIds = ctx.session.contentNodeIds ?? [];
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
 * @zh 解析工具请求在当前 Agent 会话中的有效内容节点范围。
 * @en Resolve the effective content-node scope for a tool request in the current Agent session.
 *
 * @param requested - {@zh 工具显式请求的内容节点过滤器} {@en Explicitly requested content-node filters}
 * @param ctx - {@zh 工具执行上下文} {@en Tool execution context}
 * @returns - {@zh 生效的内容节点范围} {@en Effective content-node scope}
 */
export const resolveEffectiveContentNodeIds = (
  requested: string[] | undefined,
  ctx: ToolExecutionContext,
): string[] => {
  const sessionScope = ctx.session.contentNodeIds;
  const legacyDocumentId = getLegacySessionDocumentId(ctx);

  if (requested === undefined) {
    if (sessionScope !== undefined) return sessionScope;
    return legacyDocumentId ? [legacyDocumentId] : [];
  }

  if (requested.length === 0) {
    if (sessionScope !== undefined && sessionScope.length > 0)
      return sessionScope;
    if (sessionScope === undefined && legacyDocumentId)
      return [legacyDocumentId];
  }

  return requested;
};

/**
 * @zh 解析当前会话中应传给翻译写入链路的内容节点 ID。
 * @en Resolve the content-node ID that should be attached to translation writes for the current session.
 *
 * @param ctx - {@zh 工具执行上下文} {@en Tool execution context}
 * @returns - {@zh 当前会话的上下文内容节点 ID} {@en Context content-node ID for the current session}
 */
export const resolveSessionDocumentId = (
  ctx: ToolExecutionContext,
): string | undefined => {
  return (
    ctx.session.currentElementContentNodeId ??
    (ctx.session.contentNodeIds?.length === 1
      ? ctx.session.contentNodeIds[0]
      : undefined) ??
    getLegacySessionDocumentId(ctx)
  );
};

/**
 * @zh 验证指定元素属于当前会话的项目（以及文档，若会话绑定了文档）。
 * @en Verify the given element belongs to the current session's project (and document when session is document-scoped).
 *
 * @throws 若元素不存在或不在会话作用域内。 / If element not found or out of scope.
 * @returns 解析后的元素数据（value, languageId, projectId, documentId, chunkIds）。 / Resolved element data.
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
        pageSize: 1,
        elementId,
      },
    );

    if (pageIndex === null) {
      throw new Error(
        `Element ${elementId} is outside the session editor scope`,
      );
    }
  } else {
    const legacyDocumentId = getLegacySessionDocumentId(ctx);
    if (
      legacyDocumentId &&
      element.documentId &&
      element.documentId !== legacyDocumentId
    ) {
      throw new Error(`Element ${elementId} belongs to a different document`);
    }
  }

  return element;
};

/**
 * @zh 验证指定项目属于当前会话的项目作用域。
 * @en Verify the given project belongs to the current session's project scope.
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

/**
 * @zh 验证指定文档属于当前会话的项目（以及匹配会话的 documentId，若存在）。
 * @en Verify the given documentId matches the session scope and belongs to the session's project.
 *
 * @throws 若文档不存在或不在会话作用域内。 / If document not found or out of scope.
 */
export const assertDocumentInSession = async (
  documentId: string,
  ctx: ToolExecutionContext,
): Promise<void> => {
  if (ctx.session.contentNodeIds !== undefined) {
    await assertContentNodesInSession([documentId], ctx);
  }

  const legacyDocumentId = getLegacySessionDocumentId(ctx);
  if (legacyDocumentId && documentId !== legacyDocumentId) {
    throw new Error(
      `Document ${documentId} does not match the session document`,
    );
  }

  const { client: db } = await getDbHandle();
  const doc = await executeQuery({ db }, getContentNode, { id: documentId });

  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  if (doc.projectId !== ctx.session.projectId) {
    throw new Error(`Document ${documentId} belongs to a different project`);
  }
};
