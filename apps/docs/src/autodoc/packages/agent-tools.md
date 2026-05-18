# @cat/agent-tools

Built-in agent tools: kanban, translation, session management

## Overview

* **Modules**: 1

* **Exported functions**: 5

* **Exported types**: 0

## Function Index

### packages/agent-tools/src/translation

### `assertContentNodesInSession`

```ts
/**
 * Verify content-node filters belong to the session project and obey the session content-node scope.
 *
 * @param contentNodeIds - Content-node IDs to validate
 * @param ctx - Tool execution context
 *
 * @returns No return value when validation passes
 */
export const assertContentNodesInSession = async (contentNodeIds: string[], ctx: ToolExecutionContext): Promise<void>
```

### `resolveEffectiveContentNodeIds`

```ts
/**
 * Resolve the effective content-node scope for a tool request in the current Agent session.
 *
 * @param requested - Explicitly requested content-node filters
 * @param ctx - Tool execution context
 *
 * @returns Effective content-node scope
 */
export const resolveEffectiveContentNodeIds = (requested: string[] | undefined, ctx: ToolExecutionContext): string[]
```

### `resolveSessionContentNodeContextId`

```ts
/**
 * Resolve the content-node context ID for the current session.
 *
 * @param ctx - Tool execution context
 *
 * @returns Context content-node ID for the current session
 */
export const resolveSessionContentNodeContextId = (ctx: ToolExecutionContext): string | undefined
```

### `assertElementInSession`

```ts
/**
 * Verify the given element belongs to the current session's project and editor scope.
 *
 * @returns 解析后的元素数据（value, languageId, projectId, primaryContentNodeId, chunkIds）。 / Resolved element data.
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
