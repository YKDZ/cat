---
name: autodoc-lookup
description: 使用 autodoc CLI 查找符号的实现细节。当需要查找特定函数、类型或接口的源码位置、签名或实现时使用此 skill。
---

# 通过 Autodoc 查询符号

使用 `pnpm autodoc lookup` CLI 查找符号的源码位置和详细信息。

## 何时使用

- 知道函数/类型名称，需要找到其源文件和行号
- 需要阅读某个符号的具体实现
- 想查找匹配某个名称模式的所有符号

## 工作流程

1. 运行查询命令（支持多个查询）：

   ```bash
   pnpm autodoc lookup <symbol-name-or-id> [...]
   ```

2. 输出包含：
   - 符号 ID（格式：`@cat/pkg:module/path:symbolName`）
   - **stableKey** — 稳定的查询键；对于重载符号包含参数类型，例如 `fn(string,number)`
   - 文件路径和行范围（含可选的列信息）
   - 类型（function / interface / type / enum / const）
   - 包名
   - 描述（如果有）

3. 使用文件路径和行号阅读实际实现。

## 示例

```bash
# 按名称查找
pnpm autodoc lookup createProject

# 按部分名称查找
pnpm autodoc lookup translateOp

# 按完整 ID 查找
pnpm autodoc lookup @cat/domain:packages/domain/src/commands/project/create-project.cmd:createProject

# 按 stableKey 查找（用于重载符号）
pnpm autodoc lookup "@cat/domain:src/index:createProject(string)"

# 列出包中的所有符号
pnpm autodoc lookup @cat/domain

# 列出包内特定目录下的符号
pnpm autodoc lookup @cat/domain:packages/domain/src/commands

# 同时查找多个符号
pnpm autodoc lookup createProject vectorTermAlignOp
```

## 注意事项

- 索引由 `pnpm moon run autodoc:generate` 生成并提交到仓库。
- 如果查询返回空结果，索引可能已过时——使用 `pnpm moon run autodoc:generate` 重新生成。
- 建议先阅读 `apps/docs/src/autodoc/overview.md` 或某个分区索引进行高层次了解。
- 对于机器可读的符号数据，请参阅 `apps/docs/src/autodoc/agent/references.json`（按 stableKey 排序）。
