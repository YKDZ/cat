# @cat/auth

DAG-based authentication flow engine

## Overview

* **Modules**: 11

* **Exported functions**: 10

* **Exported types**: 23

## Function Index

### packages/auth/src

### `createAuthBlackboard`

```ts
export const createAuthBlackboard = (args: {
  flowId: string;
  flowDefId: string;
  entryNode: string;
  security: AuthBlackboardSnapshot["security"];
}): AuthBlackboardSnapshot
```

### `applyBlackboardUpdate`

```ts
export const applyBlackboardUpdate = (snapshot: AuthBlackboardSnapshot, updates: Record<string, unknown>): AuthBlackboardSnapshot
```

### `validateAuthFlow`

```ts
export const validateAuthFlow = (flow: AuthFlowDefinition)
```

### `createAuthEventBus`

```ts
export const createAuthEventBus = (): AuthEventBus
```

### packages/auth/src/executors

### `challengeVerifierExecutor`

```ts
/**
 * challenge_verifier — verify a user-provided challenge (TOTP code, OTP, etc.)
 * Delegates to the registered AUTH_FACTOR plugin for verification.
 * The factorId on the node definition selects which factor to use.
 */
export const challengeVerifierExecutor: AuthNodeExecutor = async (ctx: AuthNodeExecutorContext, nodeDef: { id: string; type: "credential_collector" | "challenge_verifier" | "decision_router" | "identity_resolver" | "session_finalizer" | "plugin_custom"; clientHint: { componentType: "identifier_input" | "password_input" | "otp_input" | "totp_input" | "webauthn_prompt" | "qrcode_display" | "json_form" | "none"; formSchema?: Record<string, unknown> | undefined; displayInfo?: { title?: string | undefined; description?: string | undefined; icon?: string | undefined; } | undefined; passToClient?: Record<string, unknown> | undefined; }; factorId?: string | undefined; config?: Record<string, unknown> | undefined; retry?: { maxAttempts: number; } | undefined; timeoutSeconds?: number | undefined; }) => {...}
```

### `credentialCollectorExecutor`

```ts
/**
 * credential_collector — collect identifier/username input from user.
 * Stores provided input into `nodeOutputs.<nodeId>` on the blackboard.
 */
export const credentialCollectorExecutor: AuthNodeExecutor = async (ctx: AuthNodeExecutorContext, nodeDef: { id: string; type: "credential_collector" | "challenge_verifier" | "decision_router" | "identity_resolver" | "session_finalizer" | "plugin_custom"; clientHint: { componentType: "identifier_input" | "password_input" | "otp_input" | "totp_input" | "webauthn_prompt" | "qrcode_display" | "json_form" | "none"; formSchema?: Record<string, unknown> | undefined; displayInfo?: { title?: string | undefined; description?: string | undefined; icon?: string | undefined; } | undefined; passToClient?: Record<string, unknown> | undefined; }; factorId?: string | undefined; config?: Record<string, unknown> | undefined; retry?: { maxAttempts: number; } | undefined; timeoutSeconds?: number | undefined; }) => {...}
```

### `decisionRouterExecutor`

```ts
/**
 * decision_router — a no-op executor node that simply lets the scheduler
 * evaluate outgoing edge conditions.
 * The `resolveNextNode` logic in the scheduler handles all routing.
 */
export const decisionRouterExecutor: AuthNodeExecutor = async (_ctx: AuthNodeExecutorContext, _nodeDef: { id: string; type: "credential_collector" | "challenge_verifier" | "decision_router" | "identity_resolver" | "session_finalizer" | "plugin_custom"; clientHint: { componentType: "identifier_input" | "password_input" | "otp_input" | "totp_input" | "webauthn_prompt" | "qrcode_display" | "json_form" | "none"; formSchema?: Record<string, unknown> | undefined; displayInfo?: { title?: string | undefined; description?: string | undefined; icon?: string | undefined; } | undefined; passToClient?: Record<string, unknown> | undefined; }; factorId?: string | undefined; config?: Record<string, unknown> | undefined; retry?: { maxAttempts: number; } | undefined; timeoutSeconds?: number | undefined; }) => {...}
```

### `identityResolverExecutor`

```ts
/**
 * identity_resolver — look up user identity from the identifier stored on
 * the blackboard. Sets `identity` and `nodeOutputs.<nodeId>.userFound`.
 * Delegates to the database via `ctx.services.db`.
 *
 * This executor is a structural placeholder. Actual DB lookup is wired in
 * the app layer when the scheduler is configured.
 */
export const identityResolverExecutor: AuthNodeExecutor = async (ctx: AuthNodeExecutorContext, nodeDef: { id: string; type: "credential_collector" | "challenge_verifier" | "decision_router" | "identity_resolver" | "session_finalizer" | "plugin_custom"; clientHint: { componentType: "identifier_input" | "password_input" | "otp_input" | "totp_input" | "webauthn_prompt" | "qrcode_display" | "json_form" | "none"; formSchema?: Record<string, unknown> | undefined; displayInfo?: { title?: string | undefined; description?: string | undefined; icon?: string | undefined; } | undefined; passToClient?: Record<string, unknown> | undefined; }; factorId?: string | undefined; config?: Record<string, unknown> | undefined; retry?: { maxAttempts: number; } | undefined; timeoutSeconds?: number | undefined; }) => {...}
```

### `pluginCustomExecutor`

```ts
/**
 * plugin_custom — delegate execution to a plugin-provided executor.
 * The `factorId` on the node definition selects which AUTH_FACTOR plugin to call.
 * If no plugin is registered for the factorId, returns a failed result.
 */
export const pluginCustomExecutor: AuthNodeExecutor = async (ctx: AuthNodeExecutorContext, nodeDef: { id: string; type: "credential_collector" | "challenge_verifier" | "decision_router" | "identity_resolver" | "session_finalizer" | "plugin_custom"; clientHint: { componentType: "identifier_input" | "password_input" | "otp_input" | "totp_input" | "webauthn_prompt" | "qrcode_display" | "json_form" | "none"; formSchema?: Record<string, unknown> | undefined; displayInfo?: { title?: string | undefined; description?: string | undefined; icon?: string | undefined; } | undefined; passToClient?: Record<string, unknown> | undefined; }; factorId?: string | undefined; config?: Record<string, unknown> | undefined; retry?: { maxAttempts: number; } | undefined; timeoutSeconds?: number | undefined; }) => {...}
```

### `sessionFinalizerExecutor`

```ts
/**
 * session_finalizer — create a session for the authenticated user.
 * Marks the flow as completed and records the final AAL.
 *
 * Actual session creation (cookie, session store write) is performed by
 * the app-layer executor override via `ctx.services.sessionStore`.
 */
export const sessionFinalizerExecutor: AuthNodeExecutor = async (ctx: AuthNodeExecutorContext, _nodeDef: { id: string; type: "credential_collector" | "challenge_verifier" | "decision_router" | "identity_resolver" | "session_finalizer" | "plugin_custom"; clientHint: { componentType: "identifier_input" | "password_input" | "otp_input" | "totp_input" | "webauthn_prompt" | "qrcode_display" | "json_form" | "none"; formSchema?: Record<string, unknown> | undefined; displayInfo?: { title?: string | undefined; description?: string | undefined; icon?: string | undefined; } | undefined; passToClient?: Record<string, unknown> | undefined; }; factorId?: string | undefined; config?: Record<string, unknown> | undefined; retry?: { maxAttempts: number; } | undefined; timeoutSeconds?: number | undefined; }) => {...}
```

## Type Index

* `AuthBlackboardSnapshot` (interface)

* `AuthEventMap` (type)

* `AuthEvent` (type)

* `AuthEventType` (type)

* `AuthEventBus` (type)

* `FlowStorage` (interface)

* `SchedulerDeps` (interface)

* `HttpContext` (interface)

* `InitFlowArgs` (interface)

* `AdvanceFlowArgs` (interface)

* `AuthEdge` (interface)

* `AuthFlowDefinition` (interface)

* `CompletedFactor` (interface)

* `FlowState` (interface)

* `AuthNodeExecutorContext` (interface)

* `AuthNodeExecutionResult` (interface)

* `AuthNodeType` (type)

* `ClientComponentType` (type)

* `AAL` (type)

* `ClientNodeHint` (type)

* `AuthNodeDefinition` (type)

* `AuthBlackboardData` (type)

* `AuthNodeExecutor` (type)
