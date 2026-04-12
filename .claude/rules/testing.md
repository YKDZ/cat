---
description: Vitest testing conventions and checklist for introducing or maintaining unit/integration tests.
paths: ["**/*.{spec,test}.ts", "**/vitest.config.ts", "**/tsconfig.spec.json"]
---

# Vitest 测试规范

本仓库使用 **Vitest 4.x**。`packages/*`、`apps/*`、`tools/*` 统一走根 `vitest.config.ts` 的 workspace projects；`@cat-plugin/*` 走各自本地 `vitest.config.ts`。新增或修改测试时，请按以下规则处理。

## 正面限制

1. **按项目类别选择配置入口。**
   - `packages/*` / `apps/*` / `tools/*`：在根 `vitest.config.ts -> test.projects[]` 中注册
   - `@cat-plugin/*`：使用插件目录下的本地 `vitest.config.ts`
2. **按后缀区分测试类型。**
   - `*.spec.ts`：单元测试；纯逻辑、可大量 mock、不依赖数据库/真实服务
   - `*.test.ts`：集成测试；通常依赖 `setupTestDB()`、插件基础设施或真实运行链路
3. **为 packages / apps 新增测试能力时，配置链必须补齐。**
   - 在根 `vitest.config.ts` 注册 project
   - 新增或维护 `tsconfig.spec.json`
   - 在项目 `tsconfig.json` 中补 `tsconfig.spec.json` reference
   - 在 `package.json` 中暴露 `test` / `test:unit` / `test:integration`（按项目需要）
   - 在 `tsconfig.lib.json` 或 `tsconfig.app.json` 中排除测试文件，避免进入生产构建
4. **环境按运行场景选择。**
   - 默认使用 `node`
   - Vue 组件或浏览器 API 测试使用 `happy-dom`，并加 `vue()` plugin
5. **需要数据库或插件运行时的测试，统一使用 `@cat/test-utils`。** `setupTestDB()`、`TestPluginLoader`、`TestContext` 是首选入口，不要自己手搓一套测试基础设施。
6. **Nx 测试 target 依赖 package.json 脚本自动推断。** 一般不需要为测试再手改 `project.json`。

## 负面限制

1. **不要漏注册根 `vitest.config.ts`。** 对 `packages/*` / `apps/*` / `tools/*` 来说，漏掉 project entry 就等于工作区级测试根本跑不到它。
2. **不要混用 `.spec.ts` 与 `.test.ts`。** 纯单测请放在 `.spec.ts`；否则容易被错误地纳入集成测试矩阵。
3. **不要让测试文件进入生产构建。** `tsconfig.lib.json` / `tsconfig.app.json` 里必须排除 `*.spec.ts` / `*.test.ts`。
4. **不要在需要 DB 的测试里省略 `@cat/test-utils`。** 直接依赖裸数据库连接会让测试基建分叉。
5. **不要让插件测试引用根配置。** `@cat-plugin/*` 应使用本地 `vitest.config.ts`，而不是 `--config ../../vitest.config.ts`。
6. **不要写错 `--project` 名。** `package.json` 里的 `--project=<name>` 必须与根 `vitest.config.ts` 中的 `name` 完全一致。

## 例子

### `packages/*` / `apps/*` 项目：在根配置注册测试项目

```ts
// vitest.config.ts
{
  // Vue 组件测试时再启用 plugins: [vue()]
  test: {
    name: "unit-core",
    include: ["packages/core/src/**/*.{spec,test}.ts"],
    environment: "node",
  },
  resolve: { alias: alias(resolve(ROOT, "packages/core")) },
}
```

### `tsconfig.spec.json`

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/vitest",
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@/*": ["./src/*"],
    },
  },
  "include": [
    "vite.config.ts",
    "vitest.config.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.ts",
    "src/**/*.d.ts",
  ],
  "references": [{ "path": "./tsconfig.lib.json" }],
}
```

如果项目需要 Vitest 全局类型，可在 `compilerOptions.types` 中加入：

```jsonc
["vitest/globals", "vitest/importMeta", "vite/client", "node", "vitest"]
```

### `tsconfig.json` 必须引用 spec config

```jsonc
{
  "references": [
    { "path": "./tsconfig.lib.json" },
    { "path": "./tsconfig.spec.json" },
  ],
}
```

### `package.json` 脚本示例

```jsonc
{
  "scripts": {
    "test": "vitest run --config ../../vitest.config.ts --project=unit-core",
    "test:unit": "vitest run --config ../../vitest.config.ts --project=unit-core --include='**/*.spec.ts'",
    "test:integration": "vitest run --config ../../vitest.config.ts --project=unit-core --include='**/*.test.ts'",
  },
}
```

### 插件项目：使用本地 `vitest.config.ts`

```ts
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    retry: process.env.CI ? 3 : 0,
  },
});
```

```jsonc
{
  "scripts": {
    "test": "vitest run",
  },
}
```

### 集成测试：使用 `@cat/test-utils`

```ts
import { setupTestDB, type TestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: TestDB;

beforeAll(async () => {
  db = await setupTestDB();
});

afterAll(async () => {
  await db.cleanup();
});
```

## 环境矩阵

| 项目类型                                      | Environment | Vue plugin | `@cat/test-utils` |
| --------------------------------------------- | ----------- | ---------- | ----------------- |
| 后端库（如 `packages/core`、`packages/auth`） | `node`      | 否         | 少数场景          |
| `domain` / `operations` / `workflow`          | `node`      | 否         | 集成测试常用      |
| `packages/ui`                                 | `happy-dom` | 是         | 否                |
| `apps/app`                                    | `happy-dom` | 是         | 否                |
| `apps/app-api`                                | `node`      | 否         | 集成测试常用      |
| `@cat-plugin/*`                               | `node`      | 否         | 按需              |
| `tools/*`                                     | `node`      | 否         | 否                |

## 运行方式

```bash
pnpm vitest run
pnpm vitest run --project=unit-core
pnpm moon run core:test
pnpm moon run domain:test-unit
pnpm moon run domain:test-integration
pnpm moon ci :test
```
