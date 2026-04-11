# @cat/agent-tools

Built-in agent tools: kanban, translation, session management

## Overview

* **Modules**: 1

* **Exported functions**: 3

* **Exported types**: 0

## Function Index

### packages/agent-tools/src/kanban

### `createAddCardDependencyTool`

```ts
/**
 * Create the tool for adding a kanban card dependency (with cycle detection).
 */
export const createAddCardDependencyTool = (): AgentToolDefinition
```

### `createRemoveCardDependencyTool`

```ts
/**
 * Create the tool for removing a kanban card dependency.
 */
export const createRemoveCardDependencyTool = (): AgentToolDefinition
```

### `createListCardDependenciesTool`

```ts
/**
 * Create the tool for listing kanban card dependencies.
 */
export const createListCardDependenciesTool = (): AgentToolDefinition
```
