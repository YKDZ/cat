# @cat/agent-tools

Built-in agent tools: kanban, translation, session management

## Overview

* **Modules**: 1

* **Exported functions**: 3

* **Exported types**: 0

## Function Index

### packages/agent-tools/src/translation

### `assertElementInSession`

```ts
/**
 * Verify the given element belongs to the current session's project (and document when session is document-scoped).
 *
 * @returns 解析后的元素数据（value, languageId, projectId, documentId, chunkIds）。 / Resolved element data.
 */
export const assertElementInSession = async (elementId: number, ctx: ToolExecutionContext): Promise<ElementWithChunkIds>
```

### `assertProjectInSession`

```ts
/**
 * Verify the given project belongs to the current session's project scope.
 */
export const assertProjectInSession = (projectId: string, ctx: ToolExecutionContext)
```

### `assertDocumentInSession`

```ts
/**
 * Verify the given documentId matches the session scope and belongs to the session's project.
 */
export const assertDocumentInSession = async (documentId: string, ctx: ToolExecutionContext): Promise<void>
```
