---
subject: infra/shared
---

`@cat/shared` 是整个 CAT 系统共用的基础类型与工具库，同时运行于前端（Vite/Vue）和后端（Node.js），不且不能依赖任何 Node.js 专属 API。

## Zod Schema 集合

`@cat/shared` 定义了覆盖所有主要业务实体的 Zod Schema，是命令/查询输入验证与前后端接口契约的唯一真相来源：

- **实体 Schema**：`ProjectSchema`、`DocumentSchema`、`ElementSchema`、`TranslationSchema`、`TermSchema`、`TMRecordSchema`、`PRSchema`、`BranchSchema` 等。
- **枚举 Schema**：`TranslationStatusSchema`（`pending` / `draft` / `submitted` / `approved` / `rejected`）、`PRStatusSchema`、`LanguageCodeSchema`（BCP-47）等。
- **请求 Schema**：各 API 请求的输入结构，通过 `z.infer<typeof Schema>` 在运行时和编译时保持一致。

## JSON 工具类型

`JsonValue`、`JsonObject`、`JsonArray` 等类型提供对 JSON 值的精确 TypeScript 描述，避免使用 `any`，被黑板数据（`@cat/graph`）、领域事件载荷（`@cat/domain`）等处广泛引用。

## 通用工具函数

- `deepMerge(a, b)`：递归合并两个对象，用于黑板 Patch 应用。
- `setByPath(obj, "a.b.c", value)` / `getByPath(obj, path)`：按点分隔路径读写嵌套字段。
- `groupBy(arr, keyFn)`：数组分组工具，减少业务代码中的重复模式。
- `uniqueBy(arr, keyFn)`：基于键函数去重。
- `isNonNullable(val)`：TypeScript 类型谓词，过滤 `null`/`undefined`。
- `createId()`：基于 `nanoid` 生成 URL 安全的短 ID，用于所有实体的主键生成。
