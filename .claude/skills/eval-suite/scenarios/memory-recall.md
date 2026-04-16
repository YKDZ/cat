# Scenario: memory-recall

测试 CAT 的记忆库系统在给定输入文本时，是否能从翻译记忆库中正确召回相似的历史翻译。

---

## 种子数据：memory.json

```json
{
  "memory": {
    "name": "Domain Translation Memory",
    "items": [
      {
        "ref": "mem:adv:find_fortress",
        "source": "Find a Nether Fortress to obtain Blaze Rods",
        "translation": "找到下界要塞以获取烈焰棒",
        "sourceLanguage": "en",
        "translationLanguage": "zh-Hans"
      }
    ]
  }
}
```

- `ref` 推荐格式：`mem:<category>:<key>`，suite 内全局唯一
- `source`/`translation` 是完整句对

---

## 测试用例集格式

```yaml
name: my-memory-recall
cases:
  - id: mr-001
    inputText: "Locate a Nether Fortress and collect Blaze Rods from Blazes"
    sourceLanguage: en
    targetLanguage: zh-Hans
    expectedMemories:
      - memoryItemRef: "mem:adv:find_fortress"
        expectedSource: "Find a Nether Fortress to obtain Blaze Rods"
        expectedTranslation: "找到下界要塞以获取烈焰棒"
        # 可选:
        # minimumConfidence: 0.8
        # requiredChannels: []
        # requiredVariantTypes: []
        # expectedAdaptationMethod: "exact" | "token-replaced" | "llm-adapted"
    negativeMemories: []
```

- `memoryItemRef` 必须匹配 memory.json 中的 `ref`
- `expectedSource` / `expectedTranslation` 是记忆库中的原文与译文

---

## suite.yaml 配置片段

```yaml
seed:
  project: seed/project.json
  memory: seed/memory.json

scenarios:
  - type: memory-recall
    test-set: test-sets/memory-recall.yaml
    scorers: [precision, recall, f1, hit-rate, latency]
    params:
      maxAmount: 5
      minSimilarity: 0.72
      minVariantSimilarity: 0.7
      timeoutMs: 30000

thresholds:
  "recall@5": ">= 0.85"
  "hit-rate": ">= 0.90"
  "p95_latency_ms": "<= 500"
```

---

## Scorer 说明

| Scorer               | 含义                       |
| -------------------- | -------------------------- |
| `precision`          | 精确率@K                   |
| `recall`             | 召回率@K                   |
| `f1`                 | F1 分数@K                  |
| `hit-rate`           | 命中率                     |
| `negative-exclusion` | 负例排除率                 |
| `confidence`         | 平均置信度                 |
| `channel-coverage`   | 检索通道覆盖率             |
| `latency`            | 延迟百分位数 (p50/p95/p99) |

---

## Params 参数

| 参数                   | 默认值 | 说明                       |
| ---------------------- | ------ | -------------------------- |
| `maxAmount`            | 5      | 最大返回记忆数             |
| `minSimilarity`        | 0.72   | 最小整体相似度             |
| `minVariantSimilarity` | 0.7    | 最小变体相似度             |
| `timeoutMs`            | 30000  | 单个 case 超时时间（毫秒） |

---

## 常见问题

**召回率低**：检查 inputText 与 source 语义距离；尝试降低 `minSimilarity`；检查向量化模型是否匹配。

**adaptation 方法不符**：指定 `expectedAdaptationMethod` 约束后，若系统用了不同方式（如 llm-adapted vs token-replaced），该 case 会标记失败。
