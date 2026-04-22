# 数据库访问层

> **Section**: 基础设施  ·  **Subject ID**: `infra/db`

`@cat/db` 包含项目实际使用的 drizzle orm 的 schema 定义和一些工具函数，以及用于在 @cat/shared 包内使用 codegen 生成所有数据库实体的 Zod Schema 的工具。

若要扩展 schema 或修改代码等，应该参考：

- .claude/rules/db-\*
- .claude/rules/pkg-db.md

以免偏离项目规范。
