# Recall 架构与回归测试说明

CAT 通过统一的 **Recall（召回）** 机制为术语库（Termbase）和翻译记忆（Translation Memory）提供检索能力。

本页的目标不是罗列所有底层实现细节，而是说明：

- 系统如何组织术语召回与记忆召回；
- 上层调用方应使用哪些稳定入口；
- 回归测试需要覆盖哪些能力；
- 哪些能力已经默认启用，哪些仍属于可选验证项。

## 核心术语

为避免不同模块重复发明术语，CAT 对 Recall 相关概念采用以下统一定义。

| 术语             | 含义                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **channel**      | 命中的召回通道，例如 `lexical`、`morphological`、`semantic`、`template`、`fragment`。                  |
| **evidence**     | 一条召回证据，说明候选项为何被命中，通常包含通道、命中文本、变体类型、置信度和说明信息。               |
| **variant**      | 为召回而持久化的可检索文本变体，例如 `SURFACE`、`CASE_FOLDED`、`LEMMA`、`TOKEN_TEMPLATE`、`FRAGMENT`。 |
| **query side**   | 记忆变体所属的查询方向，即 `SOURCE` 或 `TRANSLATION`。该字段用于支持反向召回。                         |
| **fusion**       | 将同一概念或同一记忆条目在多个通道中的命中结果合并为单条候选，并保留完整证据。                         |
| **rerank**       | 在召回结果生成后，根据编辑器上下文做可解释的确定性重排。                                               |
| **fixture lane** | 由固定输入与期望输出组成的回归测试通道，用于稳定验证召回行为。                                         |

## 入口分层

Recall 相关能力分为两层：

- **高层入口**：面向应用、工作流、Agent 工具和 API 路由，是推荐的集成方式。
- **底层原语**：面向实现内部，用于组合具体检索逻辑，一般不直接作为业务层入口。

### 推荐使用的高层入口

- `packages/operations/src/term-recall.ts`
- `packages/operations/src/collect-term-recall.ts`
- `packages/operations/src/collect-memory-recall.ts`
- `packages/operations/src/stream-search-memory.ts`
- `packages/operations/src/fetch-advise.ts`
- `packages/operations/src/auto-translate.ts`
- `apps/app-api/src/orpc/routers/glossary.ts`
- `apps/app-api/src/orpc/routers/memory.ts`
- `packages/agent-tools/src/translation/search-termbase.tool.ts`
- `packages/agent-tools/src/translation/search-tm.tool.ts`

### 底层原语

以下模块仍然保留，用于承载具体通道或查询逻辑，但通常不应直接作为应用集成面：

- `packages/domain/src/queries/glossary/list-lexical-term-suggestions.query.ts`
- `packages/domain/src/queries/glossary/list-morphological-term-suggestions.query.ts`
- `packages/domain/src/queries/glossary/list-term-concept-ids-by-recall-variants.query.ts`
- `packages/domain/src/queries/memory/list-lexical-memory-suggestions.query.ts`
- `packages/domain/src/queries/memory/list-variant-memory-suggestions.query.ts`
- `packages/operations/src/search-memory.ts`
- `packages/domain/src/queries/memory/list-memory-suggestions-by-chunk-ids.query.ts`
- `packages/domain/src/queries/memory/get-search-memory-chunk-range.query.ts`

## 术语召回

### 存储与重建

术语召回变体存储在 `termRecallVariant` 中。系统使用概念（concept）作为聚合单元，为术语召回建立统一的检索基础。

相关链路包括：

1. `getConceptRecallDetail`
2. `buildTermRecallVariantsOp`
3. `replaceTermRecallVariants`
4. `triggerTermRecallReindex`

在运行时，`registerDomainEventHandlers()` 会监听 `concept:updated` 事件，并在概念内容更新后触发：

- 术语概念的向量重建；
- 术语召回变体重建。

### 召回策略

`collectTermRecallOp()` 会按 `conceptId` 聚合同一概念在多个通道中的命中结果。当前术语召回主要包含以下通道：

1. **词法召回**：适合快速命中显式文本；
2. **形态召回**：用于处理大小写折叠、词形还原等变体；
3. **语义召回**：用于补充表达差异较大的语义近似结果。

聚合后的结果会保留：

- `conceptId`
- `glossaryId`
- 最优 `confidence`
- `matchedText`
- `evidences`

`termRecallOp()` 会在此基础上补充术语概念上下文，例如主题（subjects）和定义（definition），供编辑器、工作流与 Agent 使用。

### 编辑器中的使用方式

- `glossary.searchTerm`：用于项目级术语检索，不依赖上下文重排；
- `glossary.findTerm`：用于编辑器场景，会结合邻近元素上下文进行重排；
- 编辑器术语面板优先以 `conceptId` 去重，而不是简单按 `term + translation` 去重。

## 翻译记忆召回

### 存储与重建

翻译记忆召回变体存储在 `memoryRecallVariant` 中。

记忆变体用于补足向量召回之外的低成本命中能力，当前主要覆盖：

- `SURFACE`
- `CASE_FOLDED`
- `TOKEN_TEMPLATE`
- `FRAGMENT`

每条变体还会带有 `querySide = SOURCE | TRANSLATION`，用于表达该变体所属的查询方向，并为反向召回提供基础。

### 召回策略

`collectMemoryRecallOp()` 是翻译记忆的统一聚合入口。它会合并以下能力：

1. **精确命中**；
2. **trigram 相似度命中**；
3. **变体命中**（包括 template / fragment 等）；
4. **语义召回**；
5. **模板适配**（当输入与模板兼容时，生成 `token-replaced` 结果）。

聚合结果会保留：

- 最优 `confidence`
- `matchedText`
- `matchedVariantText`
- `matchedVariantType`
- `evidences`
- `adaptedTranslation`（如有）

`streamSearchMemoryOp()` 只是该聚合能力的流式包装，不再维护独立的业务分支。

### 上层调用方

以下模块应统一复用聚合后的记忆召回，而不是直接依赖 vector-only 原语：

- `fetchAdviseOp()`
- `autoTranslateOp()`
- workflow `auto-translate`
- `search_tm`
- `memory.onNew`

`searchMemoryOp()` 仍然保留，但它应被视为语义通道原语，而不是上层业务的默认入口。

## 上下文重排

`packages/operations/src/recall-context-rerank.ts` 提供确定性重排能力，主要利用编辑器附近的上下文信息提升结果可解释性。

当前重排信号包括：

- 邻近源文本重叠；
- 已批准译文重叠；
- 术语概念上下文重叠。

所有重排说明都应写回 evidence note，以便：

- 在 UI 中解释排序原因；
- 在回归测试中验证排序逻辑；
- 在调试时区分召回命中与上下文加权。

## Agent 工具

当前与翻译相关的 Agent 工具位于 `packages/agent-tools/src/translation/`，其中与 Recall 直接相关的工具包括：

- `search_termbase`
- `search_tm`
- `qa_check`

旧的 `packages/agent/src/tools/builtin/` 路径不应再作为 Recall 集成说明入口。

## 回归测试标准

### 默认应覆盖的能力

Recall 的默认回归矩阵应至少覆盖以下场景：

- 术语词形归一化召回；
- 术语多通道融合；
- 翻译记忆模板召回；
- 翻译记忆片段召回；
- 翻译记忆反向召回；
- 上下文重排解释；
- mock spaCy / mock NLP service 路径。

这些测试应在无需真实 Python / spaCy 环境的情况下可执行。

### Fixture 应包含的信息

当使用 fixture-driven 回归测试时，建议至少包含以下字段：

- 查询文本；
- 源语言与目标语言；
- 预期命中与预期未命中项；
- 必须出现的 `channel` 或 `variantType`；
- 最低可接受的顶部置信度；
- 上下文窗口（如测试重排）。

### 何时必须检查 evidence

对于融合召回，仅检查“第一条结果是否正确”通常不够。以下场景应显式断言 evidence：

- 多通道术语融合；
- template / fragment 命中；
- 反向召回；
- 上下文重排说明；
- 调试或解释型 UI 输出。

## 建议的测试启动方式

下面的命令可以分别验证不同层级的 Recall 回归能力。

### 1. Operations 层回归

适合验证 fixture 驱动的 term / memory recall，以及 NLP fallback / plugin 切换：

```bash
pnpm exec vitest run --config vitest.config.ts --project=operations \
	packages/operations/src/term-recall-regression.test.ts \
	packages/operations/src/memory-recall-regression.test.ts \
	packages/operations/src/statistical-term-extract.test.ts
```

### 2. Workflow 集成回归

适合验证工作流是否真的触达 recall 重建和消费面：

```bash
pnpm exec vitest run --config vitest.config.ts --project=workflow-integration \
	packages/workflow/src/workflow/tasks/__tests__/create-term.test.ts
```

### 3. API 路由回归

适合验证 richer recall payload 是否正确透传到接口层：

```bash
pnpm exec vitest run --config vitest.config.ts --project=app-api \
	apps/app-api/src/__tests__/recall-routes.spec.ts
```

### 4. spaCy 插件契约测试

默认使用 mock HTTP server：

```bash
pnpm --dir ./@cat-plugin/spacy-segmenter test -- src/segmenter.spec.ts
```

如需验证真实 spaCy 服务，可运行可选契约测试：

```bash
pnpm spacy:contract
```

## 可选验证项

以下能力属于可选或分层验证项，不属于默认快速回归矩阵的必需部分：

- 真实 `apps/spacy-server` 契约测试；
- 更深层的 `translatableElementContext` 信号；
- 覆盖更多语言或插件组合的扩展矩阵。

这些能力应在文档中明确标记为“可选验证”或“后续阶段”，而不应表述为默认始终启用的能力。
