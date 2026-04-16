# Scenario: agent-translate

驱动 CAT 翻译 agent 对一批元素执行端到端翻译，评估覆盖率、术语合规性和译文质量。

---

## 种子数据

### elements.json（必须）

```json
[
  { "ref": "el:001", "text": "Diamond Sword" },
  { "ref": "el:002", "text": "Crafting Table" }
]
```

- `ref` 推荐格式：`el:<三位数字>`，suite 内全局唯一
- **建议总元素数不超过 50**（见"Agent 容量限制"）

### glossary.json（可选，供 agent `search_termbase` 使用）

格式同 [term-recall](./term-recall.md) 的 glossary.json。

### memory.json（可选，供 agent `search_tm` 使用）

格式同 [memory-recall](./memory-recall.md) 的 memory.json。

> 注意：glossary/memory 在此场景中仅供 agent 查询使用，不会被独立评测检索质量。
> 如需测量检索准确性，需额外添加 term-recall 或 memory-recall scenario。

---

## 测试用例集格式

```yaml
name: agent-translate
cases:
  - id: agent-translate
    sourceLanguage: en
    targetLanguage: zh-Hans
    instruction: |
      你是一名专业的游戏本地化翻译员。请将以下元素从英文翻译成简体中文。
      翻译时请参考术语表确保专有名词一致，并参考翻译记忆库保持风格统一。
    elementRefs:
      - el:001
      - el:002
    referenceTranslations:
      - elementRef: el:001
        expectedText: 钻石剑
        requiredTerms: [钻石]    # 可选：目标语言中必须出现的术语文字
      - elementRef: el:002
        expectedText: 工作台
        requiredTerms: [工作台]
```

- `elementRefs` 中每个 ref 必须在 `seed/elements.json` 中存在
- `referenceTranslations` 与 `elementRefs` 一一对应
- `requiredTerms` 是目标语言中的术语**文字**（非 conceptRef），用于 term-compliance 评分

---

## suite.yaml 配置片段

```yaml
seed:
  project: seed/project.json
  elements: seed/elements.json
  glossary: seed/glossary.json   # 可选
  memory: seed/memory.json       # 可选
  agentDefinition: translator    # 使用内置 translator agent

plugins:
  loader: real
  overrides:
    - plugin: openai-vectorizer
      scope: GLOBAL
      config:
        model-id: "<embedding-model>"
        baseURL: "<ollama-url>/v1"
        apiKey: "ollama"
    - plugin: pgvector-storage
      scope: GLOBAL
      config: {}
    - plugin: spacy-segmenter
      scope: GLOBAL
      config:
        serverUrl: "<spacy-server-url>"
    - plugin: openai-llm-provider   # agent 调用的 LLM
      scope: GLOBAL
      config:
        model-id: "gpt-4o"          # 注意：字段名是 model-id，不是 model
        baseURL: "<openai-compatible-url>/v1"
        apiKey: "<api-key>"

scenarios:
  - type: agent-translate
    test-set: test-sets/agent-translate.yaml
    scorers:
      - instruction-adherence
      - term-compliance
      - chrf
      - token-cost
      - agent-latency
    params:
      timeoutMs: 2400000    # 40 分钟；根据元素数和 LLM 速度调整

thresholds:
  instruction-adherence: ">= 0.90"
  term-compliance: ">= 0.70"
  chrf: ">= 0.40"
```

---

## Scorer 说明

| Scorer                  | 含义                                                |
| ----------------------- | --------------------------------------------------- |
| `instruction-adherence` | 已翻译元素 / 总元素（覆盖率）                       |
| `term-compliance`       | 含 requiredTerms 的元素中，所有必要术语都出现的比例 |
| `chrf`                  | chrF 字符级 n-gram 相似度（对比参考译文）           |
| `token-cost`            | 总消耗 token 数（prompt + completion）              |
| `agent-latency`         | agent 端到端耗时                                    |

---

## Params 参数

| 参数        | 默认值  | 说明                                         |
| ----------- | ------- | -------------------------------------------- |
| `timeoutMs` | 1800000 | 整个 scenario 超时（含所有 batch 及重试时间）|

**内部 batch 常量**（在 `apps/eval/src/harness/strategies/agent-translate.ts` 中调整）：

| 常量                   | 当前值  | 说明                                                    |
| ---------------------- | ------- | ------------------------------------------------------- |
| `BATCH_SIZE`           | 5       | 每个 agent session 处理的元素数；不建议超过 10          |
| `PER_BATCH_TIMEOUT_MS` | 180000  | 单 batch 超时（3 分钟）                                 |
| `MAX_BATCH_RETRIES`    | 2       | 遇到 503/网络错误最多重试次数                           |
| `BATCH_RETRY_DELAY_MS` | 30000   | 每次重试前等待时间（30 秒，用于 auth 恢复）             |

---

## Agent 容量限制

| 单 session 元素数 | 结果                                                         |
| ----------------- | ------------------------------------------------------------ |
| 5                 | 稳定完成（finishReason=finish），约 20-50 次工具调用         |
| 10                | 部分情况超时（50-60 次工具调用，>120s），不稳定              |
| 50-100            | 约在第 30-63 个元素后出现纯文本 summary，触发 implicit completion，session 提前终止 |

**根本原因**：agent 的 `DecisionNode` 在 LLM 返回无工具调用的纯文本响应时立即终止 session（implicit completion）。任务量大时模型更容易产生"已完成"的幻觉。这与上下文窗口大小无关（128K 窗口内单 session 从未溢出）。

**结论**：通过 batch 策略（每 5 元素一个独立 session）可稳定处理 50 个元素。**不要在单 session 中分配超过 10 个元素**。

---

## 常见问题

**instruction-adherence < 0.9（覆盖率低）**
- 检查 `BATCH_SIZE` 是否超过 10
- 检查 `PER_BATCH_TIMEOUT_MS` 是否足够（慢代理每次调用可能需要 5-10s）
- 检查 `openai-llm-provider` 配置：字段名是 `model-id`（不是 `model`）
- 查看 eval 日志中 `finishReason` 字段，若出现 `undefined` 说明 batch 超时

**term-compliance 低但 instruction-adherence 正常**
- 检查 `requiredTerms` 拼写是否与 agent 实际翻译一致（大小写、繁简体）
- 考虑降低阈值，或在 glossary.json 中为相关术语添加更清晰的 definition

**chrf 低**
- 参考译文（`expectedText`）质量直接影响此分数；可适当调低阈值
- chrF 0.40 以上通常表示译文可用，0.60+ 表示高质量
