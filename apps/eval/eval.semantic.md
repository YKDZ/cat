---
subject: infra/eval
---

`@cat/eval` 是 CAT 的 Agent 与翻译质量评测框架，通过标准化的 Suite 配置、场景策略与评分指标，对 Agent 行为和翻译记忆/术语召回效果进行可重复、可比较的评测。

## Suite 配置

每个评测 Suite 对应一个 YAML 文件（`SuiteConfig`），声明：

- **`name`**：Suite 标识。
- **`dataset`**：由 `@cat/seed` 提供的播种配置引用，用于在评测前初始化隔离数据库环境。
- **`scenarios`**：场景列表，每个场景指定 `strategy`（策略类型）、`input`（输入参数）和 `expected`（期望输出）。
- **`scorers`**：本 Suite 启用的评分器列表。

## 场景策略

| 策略             | 评测目标                                                                   |
| ---------------- | -------------------------------------------------------------------------- |
| `TermRecall`     | 术语库召回：给定源文本，检查 `search_termbase` 工具能否召回所有期望术语    |
| `MemoryRecall`   | 翻译记忆召回：检查 `search_tm` 五条候选通道（精确 / trigram / variant / bm25 / 语义）以及所需 evidence channel 能否命中历史译文 |
| `AgentTranslate` | 端到端 Agent 翻译：运行完整 ReAct 循环，评测最终提交的译文质量             |

## 评分器

| 评分器                        | 说明                                              |
| ----------------------------- | ------------------------------------------------- |
| `precision` / `recall` / `f1` | 集合匹配精准率、召回率与调和均值                  |
| `mrr`（Mean Reciprocal Rank） | 召回结果排名质量                                  |
| `latency`                     | 端到端执行时间（毫秒）                            |
| `chrF`                        | 字符 n-gram 级别译文相似度（用于 AgentTranslate） |
| `bleu`                        | BLEU 分数（可选，需提供参考译文）                 |

## Harness 执行引擎

`EvalHarness.run(suite)` 依次：

1. 调用 `@cat/seed` 的 `runSeed` 初始化环境。
2. 遍历所有场景，按策略执行（翻译记忆查询 / 术语搜索 / 完整 Agent 运行）。
3. 对每个场景的输出调用所有配置的评分器，收集 `ScoreResult`。
4. 汇总为 `SuiteReport`，包含每个场景的得分详情和整体聚合指标。
5. 输出 JSON 报告文件，供 CI 阶段性能回归检测使用。对于 MemoryRecall 场景，还可以通过 `channel-coverage` 评分器强制 `requiredChannels`（例如 BM25）真正出现在 evidence 中。
