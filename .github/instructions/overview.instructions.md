---
description: Describe when these instructions should be loaded
applyTo: "**/*"
---

# CAT Project Overview

## Project Description

**CAT** is a secure, efficient, and easily extensible self-hosted **Computer-Assisted Translation** web application (similar to Crowdin).

**License**: GPL-3.0-only (main app), MIT (packages/plugins)

---

## Tech Stack

### Core Technologies

- **Runtime**: Node.js 24+
- **Language**: TypeScript 5.x (strict mode)
- **Package Manager**: pnpm 10.32+
- **Monorepo Tool**: Nx 22.5+

### Frontend

- **Framework**: Vue 3.5+ (Composition API)
- **SSR Framework**: Vike 0.4+ with vike-vue
- **UI Components**:
  - Reka UI 2.9+ (headless components)
  - shadcn-vue (via custom sync)
  - Tailwind CSS 4.2+
  - Lucide icons
- **State Management**: Pinia 3.0+ with Pinia Colada
- **i18n**: Vue I18n 11.3+
- **Forms**: VeeValidate 4.15+ with Zod validation
- **Utilities**: VueUse 14.2+

### Backend

- **HTTP Framework**: Hono 4.11+ (via @photonjs/hono)
- **RPC**: oRPC 1.13+
- **Telefunc**: 0.2.19+ (for server functions)
- **WebSocket**: @hono/node-ws
- **MCP**: @hono/mcp, @modelcontextprotocol/sdk

### Database & Storage

- **ORM**: Drizzle ORM 1.0.0-beta (PostgreSQL)
- **Database**: PostgreSQL 18+ with pgvector extension
- **Cache**: Redis 5.11+
- **Migrations**: Drizzle Kit

### Testing & Quality

- **Unit Testing**: Vitest 4.1+
- **E2E Testing**: Playwright 1.58+
- **Linting**: oxlint 1.56+ (with tsgolint)
- **Formatting**: oxfmt 0.41+
- **Type Checking**: TypeScript + vue-tsc

### Build Tools

- **Bundler**: Vite 8.0+
- **Vue Compiler**: @vitejs/plugin-vue
- **Type Generation**: unplugin-dts

---

## Project Structure

### Apps (`apps/`)

- **`@cat/app`**: Main application (Vue 3 SSR with Vike)
- **`@cat/app-api`**: API layer (Hono + oRPC routes)
- **`@cat/docs`**: Documentation (VitePress 2.0 alpha)
- **`@cat/app-e2e`**: Playwright E2E tests

### Core Packages (`packages/`)

- **`@cat/plugin-core`**: Plugin system core (service registry, component registry, plugin discovery)
- **`@cat/shared`**: Shared schemas (Zod), types, utilities
- **`@cat/domain`**: Domain layer with business logic
- **`@cat/db`**: Database layer (Drizzle ORM, Redis client)
- **`@cat/operations`**: Business operations and use cases
- **`@cat/permissions`**: Permission system (ReBAC)
- **`@cat/agent`**: Agent and Workflow graph
- **`@cat/server-shared`**: Shared server utilities
- **`@cat/ui`**: Shared UI component library (shadcn-vue based)
- **`@cat/test-utils`**: Testing utilities
- **`@cat/oxlint-plugin`**: Shared oxlint rules

### Plugins (`packages/@cat-plugin/`)

Plugin system supports these service types:

- **AUTH_PROVIDER**: Authentication (password, OIDC)
- **MFA_PROVIDER**: Multi-factor auth (TOTP)
- **STORAGE_PROVIDER**: File storage (local, S3)
- **FILE_IMPORTER/EXPORTER**: File format handlers (JSON, Markdown, YAML)
- **TERM_EXTRACTOR**: Terminology extraction
- **TERM_ALIGNER**: Terminology alignment
- **QA_CHECKER**: Quality assurance checks
- **TOKENIZER**: Text tokenization
- **NLP_WORD_SEGMENTER**: Word segmentation (spaCy)
- **TRANSLATION_ADVISOR**: Translation suggestions (LibreTranslate)
- **TEXT_VECTORIZER**: Text embedding
- **VECTOR_STORAGE**: Vector storage (pgvector)
- **LLM_PROVIDER**: LLM integration (OpenAI-compatible)
- **AGENT_TOOL_PROVIDER**: Agent tool extensions
- **AGENT_CONTEXT_PROVIDER**: Agent context extensions

---

## Architecture

### Plugin System

- **Manifest-based**: Each plugin has `manifest.json` defining services and components
- **Service-oriented**: Plugins provide typed services via `PluginContext`
- **Component injection**: Vue components can be injected into slots via registry
- **Dynamic discovery**: Plugins loaded from `/plugins` directory at runtime

### Server Architecture

- **SSR**: Vike handles server-side rendering with Vue
- **API Layer**: Hono routes handle RPC (oRPC), Telefunc, WebSocket, storage
- **MCP**: Model Context Protocol support for AI integrations
- **Database**: PostgreSQL (Drizzle ORM) + Redis (caching, queues)

### Frontend Architecture

- **File-based routing**: Vike filesystem routing
- **State**: Pinia stores with persisted state
- **Styling**: Tailwind CSS 4 + Reka UI components
- **i18n**: Vue I18n with locale files in `/locales`

## Configuration Files

- **`nx.json`**: Nx monorepo configuration
- **`pnpm-workspace.yaml`**: pnpm workspace definition
- **`tsconfig.base.json`**: Base TypeScript config (extends @tsconfig/node24)
- **`packages/plugin-core/manifest-schema.json`**: Plugin manifest JSON Schema

---

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)

---

## Docker

- Multi-stage build (base → deps → builder → deployer → runner)
- Health check via `/scripts/docker-health-check.js`
- Dependencies: PostgreSQL (pgvector), Redis, (optional: Ollama, LibreTranslate)
- Base image: Node 24 Alpine

---

## Design Principles

1. **Plugin-first**: All core functionality via plugin system
2. **Type-safe**: Strict TypeScript, Zod schemas, generated types
3. **Self-hosted**: Docker-first deployment, no external dependencies
4. **Extensible**: Service/component registry for easy extension
5. **Modern stack**: Latest stable versions, ESM-only

---

## Post-Modification QA

After modifying any code, you **must** run the `qa-check` skill to validate changes:

```
Skill: qa-check
```

This ensures all tests, linting, type checking, and formatting pass before considering the task complete.
