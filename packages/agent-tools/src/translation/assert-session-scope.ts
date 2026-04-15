import type { ToolExecutionContext } from "@cat/agent";

import {
  executeQuery,
  getDbHandle,
  getDocument,
  getElementWithChunkIds,
  type ElementWithChunkIds,
} from "@cat/domain";

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

  if (ctx.session.documentId && element.documentId !== ctx.session.documentId) {
    throw new Error(`Element ${elementId} belongs to a different document`);
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
  if (ctx.session.documentId && documentId !== ctx.session.documentId) {
    throw new Error(
      `Document ${documentId} does not match the session document`,
    );
  }

  const { client: db } = await getDbHandle();
  const doc = await executeQuery({ db }, getDocument, { documentId });

  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  if (doc.projectId !== ctx.session.projectId) {
    throw new Error(`Document ${documentId} belongs to a different project`);
  }
};
