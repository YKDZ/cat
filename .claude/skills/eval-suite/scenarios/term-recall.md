# Scenario: term-recall

测试 CAT 的术语库系统在给定输入文本时，是否能从术语表中正确召回匹配的术语。

---

## 种子数据：glossary.json

```json
{
  "glossary": {
    "name": "Domain Glossary",
    "sourceLanguage": "en",
    "translationLanguage": "zh-Hans",
    "concepts": [
      {
        "ref": "concept:entity:creeper",
        "definition": "A hostile mob in Minecraft that silently approaches players and explodes",
        "terms": [
          {
            "term": "Creeper",
            "termLanguageId": "en",
            "translation": "苦力怕",
            "translationLanguageId": "zh-Hans"
          }
        ]
      }
    ]
  }
}
```

- `ref` 推荐格式：`concept:<category>:<name>`，suite 内全局唯一
- `definition` 用于向量化语义匹配，写清楚概念含义
- 一个 concept 可以有多个 terms（同义词/变体）

---

## 测试用例集格式

```yaml
name: my-term-recall
cases:
  - id: tr-001
    inputText: "A Creeper silently approaches and explodes near the player"
    sourceLanguage: en
    targetLanguage: zh-Hans
    expectedTerms:
      - conceptRef: "concept:entity:creeper"
        term: "Creeper"
        translation: "苦力怕"
        # 可选:
        # mustBeTopK: 3           # 必须在 top-K 结果内
        # minimumConfidence: 0.8  # 最低置信度
        # requiredChannels: ["lexical", "semantic"]
    negativeTerms: [] # 不应出现的术语
```

- `conceptRef` 必须匹配 glossary.json 中的 `ref`
- 每个 case 建议覆盖不同难度：完全匹配、部分匹配、语义相似、负例

---

## suite.yaml 配置片段

```yaml
seed:
  project: seed/project.json
  glossary: seed/glossary.json

scenarios:
  - type: term-recall
    test-set: test-sets/term-recall.yaml
    scorers: [precision, recall, f1, mrr, hit-rate, latency]
    params:
      maxAmount: 10
      wordSimilarityThreshold: 0.3
      minMorphologySimilarity: 0.7
      minSemanticSimilarity: 0.6
      timeoutMs: 60000

thresholds:
  "recall@5": ">= 0.90"
  "hit-rate": ">= 0.95"
  "p95_latency_ms": "<= 500"
```

---

## Scorer 说明

| Scorer               | 含义                       |
| -------------------- | -------------------------- |
| `precision`          | 精确率@K                   |
| `recall`             | 召回率@K                   |
| `f1`                 | F1 分数@K                  |
| `mrr`                | 平均倒数排名               |
| `hit-rate`           | 命中率                     |
| `negative-exclusion` | 负例排除率                 |
| `confidence`         | 平均置信度                 |
| `channel-coverage`   | 检索通道覆盖率             |
| `latency`            | 延迟百分位数 (p50/p95/p99) |

建议至少包含 `[precision, recall, f1, hit-rate, latency]`。

---

## Params 参数

| 参数                      | 默认值 | 说明                       |
| ------------------------- | ------ | -------------------------- |
| `maxAmount`               | 10     | 最大返回术语数             |
| `wordSimilarityThreshold` | 0.3    | 词汇相似度阈值             |
| `minMorphologySimilarity` | 0.7    | 形态学相似度阈值           |
| `minSemanticSimilarity`   | 0.6    | 语义相似度阈值             |
| `timeoutMs`               | 30000  | 单个 case 超时时间（毫秒） |

---

## 常见问题

**命中率低**：检查 `definition` 是否足够描述概念；检查向量化模型是否与 inputText 语义接近；尝试降低 `minSemanticSimilarity`。

**Duplicate ref**：glossary.json 中存在重复 `ref`，确保全局唯一。

**向量化超时**：检查 Ollama 容器是否运行，模型是否已拉取；增大 `timeoutMs`。
