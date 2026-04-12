---
description: Constraints for the @cat/shared package — isomorphic-only, no server APIs, and auto-generated code zones.
paths: ["packages/shared/**/*.{ts,vue,js}"]
---

# @cat/shared 包规范

## 正面限制

1. **`@cat/shared` 只放 isomorphic 内容。** 它会同时被浏览器和服务端消费，因此应只包含可跨环境运行的 schema、类型和纯工具函数。
2. **需要运行时环境能力的逻辑应移出 shared。** 一旦代码依赖 Node API 或服务端运行时，应放进 `@cat/server-shared` 或其他服务端包。
3. **`packages/shared/src/schema/drizzle/` 是派生生成区。** 想修改这里的内容，必须回到 `packages/db` 的 schema / generator 源头修改后，再执行 codegen。

## 负面限制

1. **不要**在 `@cat/shared` 中导入环境绑定模块：
   - `node:*` built-in（如 `node:fs`、`node:path`）
   - 仅适用于 Node.js 的 npm 包（如 `fs-extra`、`better-sqlite3`）
   - 未做守卫的浏览器专有全局对象（如 `window`、`document`）
2. **不要**手动编辑 `packages/shared/src/schema/drizzle/` 下的生成文件。
3. **不要**在生成区手工创建新文件；生成结果有问题时，应回源修正 `packages/db`。

## 例子

```ts
// ❌ Breaks in browser
import { readFileSync } from "node:fs";

// ❌ Node-only package
import pg from "pg";

// ✅ Isomorphic
import { z } from "zod";
```

### 生成区重新生成命令

```bash
pnpm moon run db:codegen-schemas
```
