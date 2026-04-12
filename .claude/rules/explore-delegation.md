---
description: Guides agents to use autodoc skills for efficient codebase exploration.
paths: ["**/*"]
---

# 基于 autodoc 的代码探索规范

## 正面限制

1. **在做代码库探索时，优先走 autodoc。** 只要目标是理解 monorepo 结构、查找包职责或发现已有 API，先使用 autodoc 相关资料，而不是盲目全仓库搜索。
2. **先看总览，再看分包。**
   - monorepo 总览：`apps/docs/src/autodoc/overview.md`
   - 分包文档：`apps/docs/src/autodoc/packages/<name>.md`
3. **查具体符号时使用 lookup。** 需要定位函数、类型、接口、操作名时，使用 `pnpm autodoc lookup <symbol>` 获取源码位置。
4. **lookup 结果只负责定位，不代替源码阅读。** 拿到 symbol ID、文件路径和行号后，回到真实文件读取实现。

## 负面限制

1. **不要在已知准确路径时绕路走 autodoc。** 已经知道要改哪个文件，就直接读文件。
2. **不要把 targeted edit 变成全仓库考古。** 对已知文件做定点修改时，不需要额外引入 autodoc 仪式感。
3. **不要把当前上下文里已经明确的信息再重复查一遍。** 聊天上下文已经给出文件和符号时，先利用现有上下文。

## 例子

```bash
pnpm autodoc lookup "createProject"
pnpm autodoc lookup createProject vectorTermAlignOp
```

拿到 lookup 结果后，再去读取对应源码文件，而不是把 lookup 输出本身当成最终实现说明。
