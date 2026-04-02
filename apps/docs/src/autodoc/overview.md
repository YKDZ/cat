# CAT Project Module Overview

## Apps

* **@cat/app** — apps/app — Main app (Vue 3 SSR + Vike)

* **@cat/app-api** — apps/app-api — API layer (Hono + oRPC)

* **@cat/docs** — apps/docs — Documentation site (VitePress)

## Core Packages

* [**@cat/domain**](./packages/domain.md) — Domain layer: CQRS Commands and Queries, core business logic (242 functions, 337 types)

* [**@cat/operations**](./packages/operations.md) — Operations layer: business workflows composing domain operations (46 functions, 79 types)

* [**@cat/shared**](./packages/shared.md) — Shared Zod schemas, type definitions, and utility functions (23 functions, 123 types)

* [**@cat/db**](./packages/db.md) — Database layer: Drizzle ORM schemas and Redis client (8 functions, 6 types)

* [**@cat/permissions**](./packages/permissions.md) — Permission system: ReBAC-based access control (9 functions, 10 types)

* [**@cat/agent**](./packages/agent.md) — Agent and Workflow graph executor (56 functions, 99 types)

* [**@cat/server-shared**](./packages/server-shared.md) — Shared server utilities (18 functions, 2 types)

* [**@cat/plugin-core**](./packages/plugin-core.md) — Plugin system core: service registry, component registry, discovery (15 functions, 84 types)

## Core Package Dependencies

```
operations → domain → db → shared
permissions → db → shared
agent → operations → domain
```
