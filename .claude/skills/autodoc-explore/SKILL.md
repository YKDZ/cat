---
name: autodoc-explore
description: 通过自动生成的文档探索项目架构。当需要了解整体 monorepo 结构、查找相关包或发现可用 API 时使用此 skill。
---

# 通过 Autodoc 探索项目架构

使用自动生成的文档了解 CAT monorepo 结构。
AutoDoc 将输出组织为**分区**（domain / infra / services / ai ...），
每个分区包含以主题为中心的双语页面和分区索引。

## 第一步：阅读总览

阅读 `apps/docs/src/autodoc/overview.md`，了解：

- 所有 app 和核心包的列表
- 每个包的导出数量（函数/类型）
- 包的描述说明
- 核心包之间的依赖关系

## 第二步：按分区浏览

每个发现分区有一个列出其主题的 `index.md`：

- `apps/docs/src/autodoc/domain/index.md` — 领域模型主题
- `apps/docs/src/autodoc/infra/index.md` — 基础设施主题
- `apps/docs/src/autodoc/services/index.md` — 服务主题
- `apps/docs/src/autodoc/ai/index.md` — AI 系统主题

## 第三步：阅读主题页面

每个主题有双语配对页面：

- `<section>/<subject>.zh.md` — 中文语义描述 + 相关主题
- `<section>/<subject>.en.md` — API 参考表 + 英文标签

示例：`apps/docs/src/autodoc/domain/domain--core.zh.md`

## 第四步：深入包详情

对于兼容性/遗留用途，各包的参考文档仍位于：

- `apps/docs/src/autodoc/packages/<name>.md`

## 第五步：查询特定符号

当需要某个符号的实现细节时，使用 `autodoc-lookup` skill：

```bash
pnpm autodoc lookup <symbol-name> [...]
```

或浏览 agent 目录：

- `apps/docs/src/autodoc/agent/subjects.json` — 所有主题（机器可读）
- `apps/docs/src/autodoc/agent/references.json` — 所有符号引用（按 stableKey 排序）

## 包命名规范

- 核心包：`packages/<name>/` → 兼容文档位于 `packages/<name>.md`
- 简短名称：去掉 `@cat/` 前缀（例如 `@cat/domain` → `domain.md`）

## 何时重新生成

如果文档似乎过时或缺少某个包：

```bash
pnpm moon run autodoc:generate
```

仅验证而不写入（只显示结果）：

```bash
pnpm moon run autodoc:validate
```
