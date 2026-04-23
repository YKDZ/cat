# CAT Project Module Overview

## Apps

* **@cat/app** — apps/app — Main app (Vue 3 SSR + Vike)

* **@cat/app-api** — apps/app-api — API layer (Hono + oRPC)

* **@cat/docs** — apps/docs — Documentation site (VitePress)

## Core Packages

* [**@cat/domain**](./packages/domain.md) — Domain layer: CQRS Commands and Queries, core business logic (331 functions, 429 types)

* [**@cat/operations**](./packages/operations.md) — Operations layer: business workflows composing domain operations (78 functions, 108 types)

* [**@cat/shared**](./packages/shared.md) — Shared Zod schemas, type definitions, and utility functions (25 functions, 193 types)

* [**@cat/db**](./packages/db.md) — Database layer: Drizzle ORM schemas and Redis client (9 functions, 6 types)

* [**@cat/permissions**](./packages/permissions.md) — Permission system: ReBAC-based access control (10 functions, 11 types)

* [**@cat/workflow**](./packages/workflow.md) — DAG-based workflow graph executor (25 functions, 66 types)

* [**@cat/server-shared**](./packages/server-shared.md) — Shared server utilities (21 functions, 4 types)

* [**@cat/plugin-core**](./packages/plugin-core.md) — Plugin system core: service registry, component registry, discovery (15 functions, 71 types)

* [**@cat/auth**](./packages/auth.md) — DAG-based authentication flow engine (10 functions, 23 types)

* [**@cat/core**](./packages/core.md) — Core infrastructure: generic event bus, typed pub/sub (1 functions, 9 types)

* [**@cat/message**](./packages/message.md) — Unified message gateway: in-app notifications and email dispatch (1 functions, 5 types)

* [**@cat/graph**](./packages/graph.md) — Storage-agnostic graph core: types, blackboard, condition evaluation (7 functions, 13 types)

* [**@cat/agent**](./packages/agent.md) — Agent runtime: DAG loop controller, prompt engine, LLM gateway, definition parser (13 functions, 36 types)

* [**@cat/agent-tools**](./packages/agent-tools.md) — Built-in agent tools: kanban, translation, session management (3 functions, 0 types)

* [**@cat/vcs**](./packages/vcs.md) — VCS engine: changeset management, branch merge/rebase, overlay reads, diff strategies (13 functions, 18 types)

* [**@cat/file-parsers**](./packages/file-parsers.md) (0 functions, 4 types)

* [**@cat/seed**](./packages/seed.md) (6 functions, 15 types)

* [**@cat/source-collector**](./packages/source-collector.md) (5 functions, 5 types)

* [**@cat/screenshot-collector**](./packages/screenshot-collector.md) (10 functions, 6 types)

* [**@cat/eval**](./packages/eval.md) (9 functions, 29 types)

## Core Package Dependencies

```
operations → domain → db → shared
permissions → db → shared
agent → operations → domain
```
