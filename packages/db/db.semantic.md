---
subject: infra/db
---

`@cat/db` 包含项目使用的 drizzle orm 的 schema 定义和一些工具函数，以及用于在 @cat/shared 包内使用 codegen 生成所有数据库实体的 Zod Schema 的工具。

除了 @cat/app、@cat/app-e2e、@cat/eval、@cat/domain 等特殊情况外，其他包都不应该直接依赖 @cat/db 并使用 drizzle 实例构建查询，而是应该通过 @cat/domain 包的 CQRS 系统进行桥接。

若要扩展 schema 或修改代码等，应该参考：

- .claude/rules/db-\*
- .claude/rules/pkg-db.md

以免偏离项目规范。
