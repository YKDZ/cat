# Authentication & Authorization

> **Section**: Infra  ·  **Subject ID**: `infra/auth`

**Primary package**: `@cat/auth`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `createAuthBlackboard` | function |  |
| `applyBlackboardUpdate` | function |  |
| `AuthBlackboardSnapshot` | interface |  |
| `challengeVerifierExecutor` | function | challenge_verifier — verify a user-provided challenge (TOTP code, OTP, etc.)
Del |
| `credentialCollectorExecutor` | function | credential_collector — collect identifier/username input from user.
Stores provi |
| `decisionRouterExecutor` | function | decision_router — a no-op executor node that simply lets the scheduler
evaluate  |
| `identityResolverExecutor` | function | identity_resolver — look up user identity from the identifier stored on
the blac |
| `pluginCustomExecutor` | function | plugin_custom — delegate execution to a plugin-provided executor.
The `factorId` |
| `sessionFinalizerExecutor` | function | session_finalizer — create a session for the authenticated user.
Marks the flow  |
| `validateAuthFlow` | function |  |
| `createAuthEventBus` | function |  |
| `AuthEventMap` | type |  |
| `AuthEvent` | type |  |
| `AuthEventType` | type |  |
| `AuthEventBus` | type |  |
| `FlowStorage` | interface |  |
| `SchedulerDeps` | interface |  |
| `HttpContext` | interface |  |
| `InitFlowArgs` | interface |  |
| `AdvanceFlowArgs` | interface |  |
| `AuthEdge` | interface |  |
| `AuthFlowDefinition` | interface |  |
| `CompletedFactor` | interface |  |
| `FlowState` | interface |  |
| `AuthNodeExecutorContext` | interface |  |
| `AuthNodeExecutionResult` | interface |  |
| `AuthNodeType` | type |  |
| `ClientComponentType` | type |  |
| `AAL` | type |  |
| `ClientNodeHint` | type |  |
| `AuthNodeDefinition` | type |  |
| `AuthBlackboardData` | type |  |
| `AuthNodeExecutor` | type |  |
