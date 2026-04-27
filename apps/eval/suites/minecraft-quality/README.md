# minecraft-quality 评测套件

## 起因

CAT 平台的翻译记忆召回与术语匹配在 Minecraft 数据集上暴露了 8 类系统性质量问题。为量化验证修复效果，设计此评测套件覆盖所有问题类别。

### 8 类问题

| #   | 问题                         | 根因                                                                 | 对应组件                          |
| --- | ---------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| 1   | 语义向量匹配产生高置信度噪音 | 纯语义召回缺乏词法交叉验证，将语义相近但不相关的条目误判为高置信匹配 | Hard-Negative Filter (HNF)        |
| 2   | BM25 置信度被系统性低估      | BM25 原始分数未经批次内归一化，无法跨候选比较                        | Confidence Calibrator (CAL)       |
| 3   | 占位符模板匹配失效           | `1.20` → `1.21` 等版本号变体仅靠 pg_trgm 相似度，丢失结构性等价关系  | Template Structure Matcher (TMPL) |
| 4   | 短术语 trigram 假阳性        | 2-4 字符短术语的 word_similarity 阈值固定，对短字符串过于宽松        | Trigram Length Guard (TRGM_GUARD) |
| 5   | 自匹配噪音干扰               | 当前元素的自身记忆条目出现在召回结果中，稀释有效建议                 | Self-Exclusion Filter (SELF_EX)   |
| 6   | 相邻翻译上下文缺失           | LLM 翻译时缺少当前编辑会话中刚完成的相邻条目翻译                     | Session Translation Context       |
| 7   | 建议按到达时间排序           | LLM 建议因生成延迟晚于 advisor 到达，导致最佳建议沉底                | Quality Sorter (QUAL_SORT)        |
| 8   | 短术语 ILIKE 回退缺失        | 短术语通过 trigram 匹配后缺少完整词边界校验                          | TRGM_GUARD (ILIKE check)          |

## 测试集

| 名称                   | 类型            | 用例数 | 验证目标                                                          | 关键阈值                  |
| ---------------------- | --------------- | ------ | ----------------------------------------------------------------- | ------------------------- |
| semantic-noise         | memory-recall   | 3      | 语义噪音率，确认 HNF 正确排除不相关语义匹配                       | noise-rate ≤ 0.10         |
| bm25-confidence        | memory-recall   | 1      | BM25 置信度校准，确认 CAL 批次归一化有效                          | bm25-confidence ≥ 0.20    |
| template-matching      | memory-recall   | 3      | 模板结构匹配 — 基础语义匹配 + TOKEN_TEMPLATE 版本号占位符等价匹配 | template-match-rate ≥ 0.0 |
| trigram-false-positive | term-recall     | 3      | 短术语假阳性排除，确认 TRGM_GUARD 和 ILIKE 边界检查有效           | —（参考性）               |
| self-exclusion         | memory-recall   | 1      | 自匹配排除，确认 SELF_EX 过滤当前元素的自身条目                   | self-exclusion-rate ≥ 1.0 |
| neighbor-context       | agent-translate | 1      | LLM 翻译中相邻上下文是否影响保留率                                | —（需 LLM 环境）          |

> neighbor-context 场景需要配置 `agentDefinitionId`（seed 中增加 `agentDefinition`）和 LLM 服务方可运行，默认跳过。

## 种子数据

基于 Minecraft 真实 i18n 数据：

- **memory.json**: 107 条翻译记忆，覆盖 advancements、death messages、GUI、gamerule、update 五类
- **glossary.json**: 276 个术语概念（实体、物品、附魔、生态域等）
- **project.json**: en → zh-Hans 的单语言对项目

## 评分指标

| 指标                   | 含义                                      | 数据来源                                                 |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------- |
| noise-rate             | 语义通道命中中被标记为噪音的比例          | semantic-noise                                           |
| bm25-confidence        | BM25 通道最高置信度                       | bm25-confidence                                          |
| template-match-rate    | TOKEN_TEMPLATE 变体中置信度 ≥ 0.95 的比例 | template-matching                                        |
| self-exclusion-rate    | 自匹配排除是否成功                        | self-exclusion                                           |
| hit-rate               | 至少有一个预期结果被召回的比例            | 全部                                                     |
| negative-exclusion     | 负例未被错误召回的比例                    | semantic-noise / trigram-false-positive / self-exclusion |
| precision@5 / recall@5 | Top-5 精确率和召回率                      | 全部                                                     |
| p50/p95 latency        | 延迟百分位                                | 全部                                                     |

## 使用方法

### 启动依赖服务

```bash
cd apps/eval
pnpm eval env up --suite minecraft-quality
```

这会通过 Docker Compose `include:` 引用 `apps/app/docker-compose.yml`，启动 PostgreSQL（pgvector）、Redis、Ollama 和 spaCy 服务。

### 运行评测

```bash
# 运行所有场景（不含 agent-translate）
cd apps/eval && pnpm eval run suites/minecraft-quality

# 仅运行 memory-recall 场景
pnpm eval run suites/minecraft-quality --scenario memory-recall

# 仅运行 term-recall 场景
pnpm eval run suites/minecraft-quality --scenario term-recall

# 清空向量缓存后运行
pnpm eval run suites/minecraft-quality --clear-cache
```

## 性能基线

实测 P95 延迟 11-16ms，远低于预期上限（500-2000ms），新增组件的计算开销可忽略不计。

## 备注

- 测试集用例基于真实种子数据的可用 ref 编写，而非脱离数据的示例文本
- template-match-rate 阈值为 0.0（宽松值），因 3 个 case 中仅 1 个（`update-1.21-matches-update-1.20`）会触发 TOKEN_TEMPLATE 匹配，聚合后被摊平；单 case 级别的模板匹配由 `requiredChannels: ["template"]` + `minimumConfidence: 0.95` 验证
- TOKEN_TEMPLATE 变体生成依赖内置的 NumberTokenizer（纯规则，不需要 spaCy），因此本套件中模板匹配测试可以在无 NLP 服务的环境下正常工作
- 本套件使用 `loader: real`，需要 spaCy、embedding 和 pgvector 服务
