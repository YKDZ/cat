### 3.5 Skills 系统

Skills 用于定义 agent 定义中放不下的长流程工作流，同样基于 MD：

```markdown
---
id: full-document-translation
name: 全文档翻译流程
description: 端到端翻译一个完整文档
trigger:
  event: document.imported
  filter:
    status: PENDING
---

# 全文档翻译流程

## 前置条件

- 文档已导入且分段完成
- 项目术语库已初始化

## 步骤

### 1. 检索项目规范

使用 search_norms 查询规范板，了解项目翻译标准和质量要求。将关键规范记入 Scratchpad 避免重复检索。

### 2. 确认验收标准

使用 run_acceptance_check 阅读当前任务的验收标准，明确质量阈值和完成条件。

### 3. 检索相关经验

使用 search_memory 回顾类似翻译任务的历史经验，特别是高权重记忆。

### 4. 分析文档结构

读取文档所有 segment，分析上下文关系和段落逻辑。

### 5. 批量 TM 查询

对所有 segment 执行 TM 匹配，标记高匹配度段落。

### 6. 逐段翻译

按顺序翻译，优先处理有 TM 高匹配的段落，再处理无参考翻译。

### 7. 验收自检

使用 run_acceptance_check 执行程序化验收检查，修复不达标项。

### 8. 收尾操作 (可合并为单次调用)

在单次响应中同时执行以下操作以减少推理轮次:
- 将已翻译段落状态更新为 TRANSLATED
- 提交 PR 并更新状态 (pr_update)
- 将有价值的翻译经验记录为记忆 (create_memory)

## 回退策略

如遇 LLM 错误，重试 3 次后标记为失败并通知人工。
```

> **v0.14 变更**: Skill 步骤 1/2/3 显式使用按需获取工具 (search_norms / run_acceptance_check / search_memory) 而非隐式依赖自动注入。

Skill 在运行时被动态注入到 agent 的静态提示层中。一个 agent 在同一时刻可激活多个 skill。

> **设计澄清**: Skill 中的"步骤"是对 LLM 的**指引性建议**，不是硬编码的执行管道。LLM 在通用 DAG 的 Reasoning Node 中读取 Skill 步骤并自主决定执行顺序和策略。系统不强制"步骤 1 完成才能执行步骤 2"——这种顺序约束应由 Issue 依赖（§3.7.2）在任务级别表达，而非在 Agent 内部管道中硬编码。

