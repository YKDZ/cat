# CAT Project Module Overview

## Apps

* **@cat/app** — apps/app — Main app (Vue 3 SSR + Vike)

* **@cat/app-api** — apps/app-api — API layer (Hono + oRPC)

* **@cat/docs** — apps/docs — Documentation site (VitePress)

## Core Packages

* [**@cat/domain**](./packages/domain.md) — Domain layer: CQRS Commands and Queries, core business logic (254 functions, 343 types)

* [**@cat/operations**](./packages/operations.md) — Operations layer: business workflows composing domain operations (46 functions, 79 types)

* [**@cat/shared**](./packages/shared.md) — Shared Zod schemas, type definitions, and utility functions (23 functions, 126 types)

* [**@cat/db**](./packages/db.md) — Database layer: Drizzle ORM schemas and Redis client (8 functions, 6 types)

* [**@cat/permissions**](./packages/permissions.md) — Permission system: ReBAC-based access control (9 functions, 11 types)

* [**@cat/workflow**](./packages/workflow.md) — DAG-based workflow graph executor (27 functions, 65 types)

* [**@cat/server-shared**](./packages/server-shared.md) — Shared server utilities (18 functions, 2 types)

* [**@cat/plugin-core**](./packages/plugin-core.md) — Plugin system core: service registry, component registry, discovery (15 functions, 75 types)

* [**@cat/auth**](./packages/auth.md) — DAG-based authentication flow engine (10 functions, 23 types)

* [**@cat/core**](./packages/core.md) — Core infrastructure: generic event bus, typed pub/sub (1 functions, 7 types)

* [**@cat/message**](./packages/message.md) — Unified message gateway: in-app notifications and email dispatch (1 functions, 5 types)

* [**@cat/graph**](./packages/graph.md) — Storage-agnostic graph core: types, blackboard, condition evaluation (7 functions, 13 types)

## Core Package Dependencies

```
operations → domain → db → shared
permissions → db → shared
agent → operations → domain
```
