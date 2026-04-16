---
name: eval-suite
description: 使用 CAT eval 框架编写和运行评测 suite。当需要创建新的评测用例、设计测试集、理解 eval 体系结构、或排查 suite 运行问题时使用此 skill。
---

# CAT Eval 框架：编写与运行评测 Suite

## 框架总览

`apps/eval/` 是 CAT 的离线评测框架，直接调用 `@cat/operations` 层（不经过 HTTP），在隔离的临时数据库中执行端到端评测。

**核心流程：**

```
suite.yaml → Loader → Seeder（建库 + 插播种子数据）→ Harness（执行策略）→ Scorer（评分）→ Reporter（报告）
```

**目录结构（每个 suite）：**

```
suites/<suite-name>/
├── suite.yaml              # 入口配置
├── seed/
│   ├── project.json        # 必须
│   ├── glossary.json       # term-recall 场景需要
│   └── memory.json         # memory-recall 场景需要
└── test-sets/
    └── <name>.yaml         # 测试用例集
```

---

## 一、创建 suite 的完整步骤

### 1. 创建 project.json

每个 suite 必须有 `seed/project.json`，定义项目的源语言和目标语言。

```json
{
  "name": "My Eval Project",
  "sourceLanguage": "en",
  "translationLanguages": ["zh-Hans"]
}
```

语言代码使用 IETF BCP 47（如 `en`, `zh-Hans`, `ja`, `de`）。

### 2. 创建种子数据

#### 术语表 glossary.json（term-recall 场景）

```json
{
  "glossary": {
    "name": "Domain Glossary",
    "sourceLanguage": "en",
    "translationLanguage": "zh-Hans",
    "concepts": [
      {
        "ref": "concept:category:name",
        "definition": "A clear English definition of this concept",
        "terms": [
          {
            "term": "Source Term",
            "termLanguageId": "en",
            "translation": "目标翻译",
            "translationLanguageId": "zh-Hans"
          }
        ]
      }
    ]
  }
}
```

**关键约束：**

- 每个 `ref` 必须全局唯一（推荐格式：`concept:<category>:<name>`）
- `definition` 用于向量化匹配，写清楚概念含义
- 一个 concept 可以有多个 terms（同义词/变体）

#### 翻译记忆 memory.json（memory-recall 场景）

```json
{
  "memory": {
    "name": "Domain Translation Memory",
    "items": [
      {
        "ref": "mem:category:unique_key",
        "source": "Source language sentence",
        "translation": "目标语言翻译",
        "sourceLanguage": "en",
        "translationLanguage": "zh-Hans"
      }
    ]
  }
}
```

**关键约束：**

- 每个 `ref` 必须全局唯一（推荐格式：`mem:<category>:<key>`）
- source/translation 是完整的句对

### 3. 创建测试用例集

#### term-recall 测试集

```yaml
name: my-term-recall
cases:
  - id: tr-001
    inputText: "A sentence that should trigger term matching"
    sourceLanguage: en
    targetLanguage: zh-Hans
    expectedTerms:
      - conceptRef: "concept:category:name"
        term: "Source Term"
        translation: "目标翻译"
        # 可选字段:
        # mustBeTopK: 3          # 必须在 top-K 结果内
        # minimumConfidence: 0.8 # 最低置信度
        # requiredChannels: ["lexical", "semantic"]
    negativeTerms: [] # 不应该出现的术语
```

#### memory-recall 测试集

```yaml
name: my-memory-recall
cases:
  - id: mr-001
    inputText: "A sentence similar to a memory source"
    sourceLanguage: en
    targetLanguage: zh-Hans
    expectedMemories:
      - memoryItemRef: "mem:category:key"
        expectedSource: "Exact source text from memory"
        expectedTranslation: "记忆中的翻译"
        # 可选字段:
        # minimumConfidence: 0.8
        # requiredChannels: []
        # requiredVariantTypes: []
        # expectedAdaptationMethod: "exact" | "token-replaced" | "llm-adapted"
    negativeMemories: []
```

**测试用例设计原则：**

- `id` 使用统一前缀 + 递增编号（如 `tr-001`, `mr-001`）
- `inputText` 应该是自然语句，包含待匹配的术语/记忆
- `expectedTerms` 的 `conceptRef` 必须匹配 glossary.json 中的 `ref`
- `expectedMemories` 的 `memoryItemRef` 必须匹配 memory.json 中的 `ref`
- 建议按领域/类别分组编写用例，覆盖不同难度

### 4. 编写 suite.yaml

```yaml
name: my-suite-name
description: Brief description of what this suite evaluates

seed:
  project: seed/project.json
  glossary: seed/glossary.json # term-recall 需要
  # memory: seed/memory.json        # memory-recall 需要
  # elements: seed/elements.json    # 如需 element 种子

plugins:
  loader: real # "real" 用真实插件, "test" 用 mock
  overrides:
    - plugin: openai-vectorizer
      scope: GLOBAL
      config:
        model-id: "<embedding-model>" # 如 qwen3-embedding:4b
        baseURL: "<ollama-or-openai-url>" # 如 http://<host>:<port>/v1
        apiKey: "<api-key>" # Ollama 可填任意非空值
    - plugin: pgvector-storage
      scope: GLOBAL
      config: {}
    - plugin: spacy-segmenter
      scope: GLOBAL
      config:
        serverUrl: "<spacy-server-url>" # 如 http://<host>:8000

scenarios:
  - type: term-recall # 或 memory-recall
    test-set: test-sets/my-terms.yaml
    scorers: [precision, recall, f1, mrr, hit-rate, latency]
    params: # 可选，覆盖默认参数
      maxAmount: 10
      wordSimilarityThreshold: 0.3
      minMorphologySimilarity: 0.7
      minSemanticSimilarity: 0.6
      timeoutMs: 60000

# 可选：设置阈值（不设则仅显示 INFO）
# thresholds:
#   "recall@5": ">= 0.9"
#   "hit-rate": ">= 0.95"
#   "p95_latency_ms": "<= 500"
```

---

## 二、plugins 配置

### loader 选择

| 值     | 含义                          | 适用场景                 |
| ------ | ----------------------------- | ------------------------ |
| `test` | 使用 `TestPluginLoader`       | 冒烟测试、无需真实向量化 |
| `real` | 使用 `FileSystemPluginLoader` | 完整评测、需要向量化     |

### 常用插件 override

使用 `loader: real` 时，通常需要配置以下三个插件：

1. **openai-vectorizer** — 文本向量化（支持 Ollama、OpenAI 等兼容 API）
2. **pgvector-storage** — 向量存储（无配置参数，`config: {}` 即可）
3. **spacy-segmenter** — 文本分句（需要 spacy-server 运行）

> **注意：** `pgvector-storage` 没有配置 schema，`config: {}` 不可省略。

### 服务地址

插件配置中的服务地址取决于运行环境。参考 `apps/eval/docker-compose.yml` 中各服务的端口映射确定实际地址。

关键服务：Ollama（向量化）、spaCy（分句）、PostgreSQL、Redis。

> **提示：** 在 devcontainer 中，`localhost` 指向容器自身而非 Docker 宿主机。如需访问宿主机上的 Docker 服务，通常使用 Docker 宿主机网关地址（如 `host.docker.internal` 或网桥 IP）。

---

## 三、可用的 Scorer

| Scorer               | 含义                       | 适用场景      |
| -------------------- | -------------------------- | ------------- |
| `precision`          | 精确率@K                   | term / memory |
| `recall`             | 召回率@K                   | term / memory |
| `f1`                 | F1 分数@K                  | term / memory |
| `mrr`                | 平均倒数排名               | term          |
| `hit-rate`           | 命中率                     | term / memory |
| `negative-exclusion` | 负例排除率                 | term / memory |
| `confidence`         | 平均置信度                 | term / memory |
| `channel-coverage`   | 检索通道覆盖率             | term / memory |
| `latency`            | 延迟百分位数 (p50/p95/p99) | term / memory |

建议至少包含 `[precision, recall, f1, hit-rate, latency]`。

---

## 四、可用的 Scenario 参数

### term-recall params

| 参数                      | 默认值 | 说明                       |
| ------------------------- | ------ | -------------------------- |
| `maxAmount`               | 10     | 最大返回术语数             |
| `wordSimilarityThreshold` | 0.3    | 词汇相似度阈值             |
| `minMorphologySimilarity` | 0.7    | 形态学相似度阈值           |
| `minSemanticSimilarity`   | 0.6    | 语义相似度阈值             |
| `timeoutMs`               | 30000  | 单个 case 超时时间（毫秒） |

### memory-recall params

| 参数                   | 默认值 | 说明                       |
| ---------------------- | ------ | -------------------------- |
| `maxAmount`            | 5      | 最大返回记忆数             |
| `minSimilarity`        | 0.72   | 最小整体相似度             |
| `minVariantSimilarity` | 0.7    | 最小变体相似度             |
| `timeoutMs`            | 30000  | 单个 case 超时时间（毫秒） |

---

## 五、运行命令

### 前置条件

确保 Docker 服务已启动：

```bash
cd apps/eval && docker compose up -d
```

所需服务：`postgresql`、`redis`、`ollama`。  
如使用 spacy-segmenter 还需要 `spacy` 服务。  
如需 OTel 追踪还需 `jaeger` 服务。

确保 Ollama 已拉取所需的 embedding 模型：

```bash
docker exec eval_ollama ollama pull <model-name>
```

### 运行评测

```bash
cd apps/eval

# 运行整个 suite
pnpm exec tsx src/cli.ts run suites/<suite-name>

# 带 OTel 追踪（发送到任意 OTLP/HTTP 端点，如 Jaeger、Tempo 等）
pnpm exec tsx src/cli.ts run suites/<suite-name> --otlp <otlp-http-endpoint>

# 清除向量缓存后运行
pnpm exec tsx src/cli.ts run suites/<suite-name> --clear-cache

# 输出 JSON 结果
pnpm exec tsx src/cli.ts run suites/<suite-name> -o /tmp/results.json

# 只运行特定 scenario 类型
pnpm exec tsx src/cli.ts run suites/<suite-name> --scenario term-recall
```

### 仅播种（调试用）

```bash
pnpm exec tsx src/cli.ts seed suites/<suite-name>
```

此命令只播种数据库，不执行测试。可用于检查种子数据是否正确。按 Ctrl+C 清理退出。

### 管理 Docker 环境

```bash
pnpm exec tsx src/cli.ts env up    # 启动服务
pnpm exec tsx src/cli.ts env down  # 停止服务
```

---

## 六、Ref 系统

Ref 是连接种子数据和测试用例的桥梁。Seeder 播种时通过 `RefResolver` 将种子数据中的 `ref` 字符串映射到数据库生成的真实 ID。

**命名规范：**

- 术语概念：`concept:<category>:<name>`（如 `concept:entity:creeper`）
- 翻译记忆：`mem:<category>:<key>`（如 `mem:adv:find_fortress`）
- 内置引用：`project`, `glossary`, `memory`, `user:eval`, `document:root`

**唯一性要求：** 同一个 suite 中所有 ref 必须唯一。重复 ref 会导致 `Duplicate ref` 异常。

---

## 七、向量缓存

框架内置 SQLite 缓存（`.vector-cache/`），避免重复调用向量化 API：

- 首次运行时自动写入缓存
- 后续运行直接读取缓存，大幅加速
- 使用 `--clear-cache` 强制重新向量化
- 缓存按模型名分 SQLite 文件

**注意：** 修改种子数据后应使用 `--clear-cache` 以确保向量一致。

---

## 八、OTel 可观测性

框架集成 OpenTelemetry，`--otlp` 参数接受任意 OTLP/HTTP 端点（如 Jaeger、HyperDX、Grafana Tempo、Datadog 等）。

```bash
# docker-compose.yml 中包含 Jaeger 服务定义，启动后即可使用
cd apps/eval && docker compose up -d jaeger

# 运行带追踪的评测
pnpm exec tsx src/cli.ts run suites/<suite-name> --otlp <otlp-http-endpoint>

# 如果 collector 需要认证，使用 --otlp-headers 传递 headers
pnpm exec tsx src/cli.ts run suites/<suite-name> \
  --otlp <otlp-http-endpoint> \
  --otlp-headers "Authorization=Bearer <token>"

# 多个 headers 用逗号分隔
pnpm exec tsx src/cli.ts run suites/<suite-name> \
  --otlp <otlp-http-endpoint> \
  --otlp-headers "Authorization=Bearer <token>,X-Custom=value"
```

`--otlp` 的值会被拼接为 `<endpoint>/v1/traces` 和 `<endpoint>/v1/metrics`，因此只需提供 OTLP collector 的根地址。`--otlp-headers` 的值会被作为 HTTP headers 附加到所有 OTLP 请求中。

**Span 层级：**

```
eval.run (suite, runId, duration)
├── eval.seed (projectId)
├── eval.scenario (type, testSet, casesTotal, casesOk)
│   ├── eval.case (case_id, input_text, duration_ms, status, result_count)
│   ├── eval.case ...
│   └── ...
└── eval.scenario ...
```

Traces 在 collector 中持久化，评测结束后仍可查看。OTLP collector 可以部署在本机、docker-compose 内、或内网其他设备上。

---

## 九、Thresholds（阈值门控）

在 `suite.yaml` 中设置阈值可让评测自动判定通过/失败：

```yaml
thresholds:
  "recall@5": ">= 0.9"
  "hit-rate": ">= 0.95"
  "precision@5": ">= 0.2"
  "p95_latency_ms": "<= 500"
```

- 未设置阈值的指标显示为 `ℹ️ INFO`
- 通过阈值的指标显示为 `✅ PASS`
- 未通过的显示为 `❌ FAIL`，整个 suite 返回非零退出码

---

## 十、常见问题排查

### "No vectorizer or storage service available"

原因：`plugins.loader` 是 `test` 但没有注册向量化服务，或 `real` loader 找不到插件构建产物。

解决：

- 确保 `@cat-plugin/` 下的插件已构建（`moon run :build`）
- 检查 `--plugins-dir` 指向正确的目录

### Duplicate ref 异常

原因：glossary.json 或 memory.json 中有重复的 `ref` 值。

解决：确保所有 ref 字符串在 suite 内全局唯一。

### YAML 多行字符串解析错误

使用 block scalar 而非双引号多行字符串：

```yaml
# ✅ 正确
inputText: |
  This is a long sentence that
  spans multiple lines.

# ❌ 错误（双引号中包含换行）
inputText: "This is a long sentence that
  spans multiple lines."
```

### 向量化超时

- 检查 Ollama 容器是否运行：`docker compose ps ollama`
- 检查模型是否已拉取：`docker exec eval_ollama ollama list`
- 增大 `timeoutMs` 参数

### 冒烟测试怎么写

用 `loader: test`、少量种子数据和 3-5 个测试用例即可。参考 `suites/smoke/`。
