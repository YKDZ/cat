---
name: eval-suite
description: 使用 CAT eval 框架编写和运行评测 suite。当需要创建新的评测用例、设计测试集、理解 eval 体系结构、或排查 suite 运行问题时使用此 skill。
---

# CAT Eval 框架

`apps/eval/` 是 CAT 的离线评测框架，直接调用 `@cat/operations` 层（不经过 HTTP），在隔离的临时数据库中执行端到端评测。

```
suite.yaml → Loader → Seeder（建库 + 播种数据）→ Harness（执行策略）→ Scorer（评分）→ Reporter
```

---

## Scenario 类型

| 类型                                            | 用途                                    |
| ----------------------------------------------- | --------------------------------------- |
| [term-recall](scenarios/term-recall.md)         | 测试从术语表中召回正确术语的能力        |
| [memory-recall](scenarios/memory-recall.md)     | 测试从翻译记忆库中召回相似译文的能力    |
| [agent-translate](scenarios/agent-translate.md) | 驱动 agent 端到端翻译，评测覆盖率和质量 |

---

## Suite 目录结构

```
suites/<suite-name>/
├── suite.yaml              # 入口配置
├── seed/
│   ├── project.json        # 必须
│   ├── elements.json       # agent-translate 需要
│   ├── glossary.json       # term-recall / agent-translate 可选
│   └── memory.json         # memory-recall / agent-translate 可选
└── test-sets/
    └── <name>.yaml
```

---

## project.json

```json
{
  "name": "My Eval Project",
  "sourceLanguage": "en",
  "translationLanguages": ["zh-Hans"]
}
```

语言代码使用 IETF BCP 47（如 `en`, `zh-Hans`, `ja`）。

---

## Plugins 配置

`loader: real` 时通常需要以下三个插件；`agent-translate` 还需要第四个：

```yaml
plugins:
  loader: real # "test" 用 mock，"real" 用真实插件
  overrides:
    - plugin: openai-vectorizer
      scope: GLOBAL
      config:
        model-id: "<embedding-model>" # 如 qwen3-embedding:4b
        baseURL: "<ollama-url>/v1"
        apiKey: "ollama"
    - plugin: pgvector-storage
      scope: GLOBAL
      config: {} # 不可省略
    - plugin: spacy-segmenter
      scope: GLOBAL
      config:
        serverUrl: "<spacy-server-url>"
    # 仅 agent-translate 需要:
    - plugin: openai-llm-provider
      scope: GLOBAL
      config:
        model-id: "gpt-4o" # 注意：是 model-id 不是 model
        baseURL: "<openai-url>/v1"
        apiKey: "<api-key>"
```

服务地址参考 `apps/eval/docker-compose.yml`。在 devcontainer 中访问宿主机 Docker 服务通常使用 Docker 网桥 IP（如 `172.17.0.1`）。

---

## Thresholds（阈值门控）

```yaml
thresholds:
  "recall@5": ">= 0.9"
  "hit-rate": ">= 0.95"
  "p95_latency_ms": "<= 500"
```

- `✅ PASS` / `❌ FAIL` / `ℹ️ INFO`（未设阈值时）
- 任意阈值失败 → 整个 suite 返回非零退出码

---

## Ref 系统

Ref 连接种子数据与测试用例，由 `RefResolver` 映射到数据库真实 ID。

| 类型     | 推荐格式                                       | 示例                     |
| -------- | ---------------------------------------------- | ------------------------ |
| 元素     | `el:<三位数字>`                                | `el:001`                 |
| 术语概念 | `concept:<category>:<name>`                    | `concept:entity:creeper` |
| 翻译记忆 | `mem:<category>:<key>`                         | `mem:adv:find_fortress`  |
| 内置     | `project` / `glossary` / `memory`/ `user:eval` | —                        |

**同一 suite 内所有 ref 必须唯一**，重复会抛 `Duplicate ref` 异常。

---

## 运行命令

```bash
# 推荐方式（moon task）
pnpm moon run eval:run -- suites/<suite-name>

# 直接调用 CLI（调试）
cd apps/eval
pnpm exec tsx src/cli.ts run suites/<suite-name>
pnpm exec tsx src/cli.ts run suites/<suite-name> --clear-cache   # 清除向量缓存
pnpm exec tsx src/cli.ts run suites/<suite-name> -o /tmp/result.json
pnpm exec tsx src/cli.ts seed suites/<suite-name>                # 仅播种，不测试
```

### 前置条件

```bash
cd apps/eval && docker compose up -d   # postgresql, redis, ollama, spacy
docker exec eval_ollama ollama pull <model-name>
```

---

## 向量缓存

框架内置 SQLite 缓存（`.vector-cache/`），首次运行写入，后续读取缓存。修改种子数据后使用 `--clear-cache` 重新向量化。

---

## OTel 可观测性

```bash
pnpm exec tsx src/cli.ts run suites/<suite-name> \
  --otlp <otlp-http-endpoint> \
  --otlp-headers "Authorization=Bearer <token>"
```

Span 层级：`eval.run → eval.seed / eval.scenario → eval.case`。

---

## 常见问题

**`No vectorizer or storage service available`**：插件未构建（`moon run :build`），或 `loader: test` 缺少向量化服务。

**`Duplicate ref`**：种子数据中存在重复 ref，确保全局唯一。

**YAML 多行字符串错误**：使用 `|` block scalar，不要在双引号中包含换行。

**冒烟测试**：用 `loader: test`、少量种子数据和 3-5 个 case，参考 `suites/smoke/`。
