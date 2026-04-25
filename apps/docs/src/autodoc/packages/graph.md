# @cat/graph

Storage-agnostic graph core: types, blackboard, condition evaluation

## Overview

* **Modules**: 3

* **Exported functions**: 7

* **Exported types**: 13

## Function Index

### packages/graph/src

### `setByPath`

```ts
export const setByPath = (target: Record<string, unknown>, path: string, value: unknown)
```

### `deepMerge`

```ts
export const deepMerge = (target: Record<string, unknown>, updates: Record<string, unknown>): Record<string, unknown>
```

### `createPatchMetadata`

```ts
export const createPatchMetadata = (args: {
  actorId: NodeId;
  parentSnapshotVersion: number;
}): { patchId: string; parentSnapshotVersion: number; actorId: string; timestamp: string; }
```

### `buildPatch`

```ts
export const buildPatch = (args: {
  actorId: NodeId;
  parentSnapshotVersion: number;
  updates: Record<string, unknown>;
}): { metadata: { patchId: string; parentSnapshotVersion: number; actorId: string; timestamp: string; }; updates: import("@cat/shared").JSONObject; }
```

### `resolvePath`

```ts
/**
 * Resolve a dotted-path string against an arbitrary data object.
 *
 * 从任意数据对象中按点分隔路径解析值。
 * @example resolvePath({ a: { b: 42 } }, "a.b") // 42
 */
export const resolvePath = (data: unknown, path: string): unknown
```

### `parseExpectedValue`

```ts
/**
 * Parse a raw string value into a typed primitive (boolean, number, null, or string).
 *
 * 将原始字符串值解析为类型化的原始值（布尔值、数字、null 或字符串）。
 */
export const parseExpectedValue = (raw: string): string | number | boolean | null
```

### `evaluateCondition`

```ts
/**
 * Evaluate a structured `EdgeCondition` against a blackboard data snapshot.
 *
 * 对黑板数据快照求值结构化的 `EdgeCondition`。
 *
 * Supported operators:
 * - `eq` / `neq`: strict equality / inequality
 * - `exists` / `not_exists`: presence check (non-null/undefined)
 * - `in`: check whether the field value is included in the provided array
 * - `gt` / `lt`: numeric comparison (coerces field value to number)
 */
export const evaluateCondition = (condition: EdgeCondition, data: unknown): boolean
```

## Type Index

* `RunId` (type)

* `NodeId` (type)

* `EventId` (type)

* `RunStatus` (type)

* `BlackboardSnapshot` (type)

* `PatchMetadata` (type)

* `Patch` (type)

* `NodeType` (type)

* `RetryConfig` (type)

* `NodeDefinition` (type)

* `EdgeCondition` (type)

* `EdgeDefinition` (type)

* `GraphDefinition` (type)
