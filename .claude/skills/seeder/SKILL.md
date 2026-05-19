---
name: seeder
description: 使用 seed 工具搭建和重置开发测试环境。编写数据集、执行 seed 命令、排查 seed 失败问题。
user-invocable: true
---

# Seed 工具使用指南

seed 工具通过一条命令清空数据库并填充预定义数据，用于搭建确定性的开发测试环境。

## 运行命令

```bash
# 从仓库根目录执行
pnpm tsx tools/seeder/main.ts <dataset-dir>

# 跳过向量化（无外部服务时）
pnpm tsx tools/seeder/main.ts <dataset-dir> --skip-vectorization

# 输出 bindings 文件（供 eval 等工具使用）
pnpm tsx tools/seeder/main.ts <dataset-dir> --output-bindings /tmp/bindings.json

# 追加额外的本地插件覆盖文件
pnpm tsx tools/seeder/main.ts <dataset-dir> --local-overrides /path/to/extra.yaml

# 禁用自动本地插件覆盖发现
pnpm tsx tools/seeder/main.ts <dataset-dir> --no-local-overrides
```

### 前置条件

**核心必需**：

- 数据库可达（`DATABASE_URL` 在 `apps/app/.env` 中配置）
- 插件已构建（`pnpm moon run :build`）

**完整模式可选**：

- 外部服务可达（spacy、vectorizer）— 仅向量化阶段需要

---

## 本地插件覆盖

插件服务配置（模型地址、API key 等）在本地开发时通常是固定的，没有必要在每个数据集中重复配置，也不应该提交到版本控制。使用本地插件覆盖机制可以将这些配置放到被 gitignore 的文件里。

### 自动发现顺序

每次运行 seed 时，以下路径按序被自动加载（后加载的覆盖前加载的）：

1. `<dataset>/seed.yaml`（`plugins.overrides`）—— 数据集内配置，会提交
2. `tools/seeder/local/seed.yaml` —— 全局本地覆盖，**不提交**
3. `<dataset>/seed.local.yaml` —— 数据集级本地覆盖，**不提交**
4. 所有 `--local-overrides <path>` 传入的文件，按顺序最后生效

`tools/seeder/local/`、`*.local.yaml`、`*.local.yml` 均已被 `tools/seeder/.gitignore` 忽略。

### 本地覆盖文件格式

与 `seed.yaml` 格式相同，只需 `plugins.overrides` 字段：

```yaml
plugins:
  overrides:
    - plugin: openai-vectorizer
      scope: GLOBAL
      config:
        model-id: "${VECTORIZER_MODEL:-qwen3-embedding:8b}"
        baseURL: "${VECTORIZER_URL:-http://127.0.0.1:11434/v1}"
        apiKey: "${VECTORIZER_API_KEY:-dummy-key}"
    - plugin: spacy-segmenter
      scope: GLOBAL
      config:
        serverUrl: "${SPACY_URL:-http://127.0.0.1:8000}"
```

`config` 可以是任意非 `null` JSON 值。大多数插件使用 object；动态 provider 类插件（如 `openai-llm-provider`、`tei-rerank-provider`）可使用 array。

### 合并规则

覆盖按 `(plugin, scope, scopeId)` 三元组匹配：

- 匹配到已有项 → **替换**
- 未匹配 → **追加**

数据集中含未设置 env 变量的旧插件配置（如 `${LLM_API_KEY}`）不会提前报错，会在本地覆盖合并完成后统一校验。这样本地覆盖可以将其完整替换掉。

### 初始化本地覆盖文件

从当前数据库导出目标插件配置到 `tools/seeder/local/seed.yaml`：通过查询 `PluginConfigInstance JOIN PluginInstallation` 中 `scope_type = 'GLOBAL'` 的记录即可获得各插件的当前配置，生成的文件放在 `tools/seeder/local/` 内不会被提交。

---

## 数据集目录结构

```
datasets/<name>/
├── seed.yaml              # 入口配置（YAML，支持 ${VAR:-default} env 插值）
├── seed/
│   ├── project.json       # 必须：项目定义
│   ├── users.json         # 可选：用户账户
│   ├── glossary.json      # 可选：术语库
│   ├── memory.json        # 可选：翻译记忆
│   └── elements.json      # 可选：文档元素
```

**重要**：`datasets/` 目录已 gitignore，包含 API key 等敏感配置的数据集不会被提交。

---

## seed.yaml 配置

```yaml
name: "my-dataset"
description: "开发测试用数据集"

seed:
  project: seed/project.json
  users: seed/users.json # 可选
  glossary: seed/glossary.json # 可选
  memory: seed/memory.json # 可选
  elements: seed/elements.json # 可选

plugins:
  loader: real # "real" 使用真实插件, "test" 使用 mock
  overrides:
    # 仅填写不含 API key 的基础插件；有 key 的插件放到 local/seed.yaml
    - plugin: pgvector-storage
      scope: GLOBAL
      config: {}
    - plugin: openai-vectorizer
      scope: GLOBAL
      config:
        model-id: "${VECTORIZER_MODEL:-qwen3-embedding:4b}"
        baseURL: "${VECTORIZER_URL:-http://172.17.0.1:11434/v1}"
        apiKey: "${VECTORIZER_API_KEY:-ollama}"
    - plugin: spacy-segmenter
      scope: GLOBAL
      config:
        serverUrl: "${SPACY_URL:-http://172.17.0.1:8000}"
```

---

## 数据文件 Schema

### project.json（必须）

```json
{
  "name": "Test Project",
  "sourceLanguage": "en",
  "translationLanguages": ["zh-Hans"]
}
```

### users.json

```json
{
  "users": [
    {
      "ref": "user:admin",
      "email": "admin@encmys.cn",
      "name": "Admin",
      "password": "password",
      "role": "superadmin"
    }
  ]
}
```

`password` 字段为明文，seed 时自动哈希。`ref` 用于在其他数据文件中引用此用户。

### glossary.json

```json
{
  "glossary": {
    "name": "Test Glossary",
    "sourceLanguage": "en",
    "translationLanguage": "zh-Hans",
    "concepts": [
      {
        "ref": "concept:test",
        "definition": "A test concept",
        "terms": [
          {
            "term": "Test",
            "termLanguageId": "en",
            "translation": "测试",
            "translationLanguageId": "zh-Hans"
          }
        ]
      }
    ]
  }
}
```

### memory.json

```json
{
  "memory": {
    "name": "Test Memory",
    "items": [
      {
        "ref": "mem:test:hello",
        "source": "Hello world",
        "translation": "你好世界",
        "sourceLanguage": "en",
        "translationLanguage": "zh-Hans"
      }
    ]
  }
}
```

### elements.json

```json
{
  "elements": [
    {
      "ref": "el:001",
      "text": "Hello world"
    }
  ]
}
```

---

## Ref 系统

与 eval 框架共享相同的 ref 规范。同一数据集内所有 ref 必须唯一。

| 类型     | 推荐格式                    | 示例                     |
| -------- | --------------------------- | ------------------------ |
| 用户     | `user:<name>`               | `user:admin`             |
| 项目     | `project`                   | `project`                |
| 术语概念 | `concept:<category>:<name>` | `concept:entity:creeper` |
| 翻译记忆 | `mem:<category>:<key>`      | `mem:adv:find_fortress`  |
| 文档元素 | `el:<三位数字>`             | `el:001`                 |

---

## 常见问题排查

**`PASSWORD auth provider not found`**：password-auth-provider 插件未安装。确保 `pnpm moon run :build` 已执行，且插件目录 `@cat-plugin/` 存在。

**`Duplicate ref`**：数据文件中存在重复的 ref 字符串。确保每个 ref 全局唯一。

**`Environment variable "X" is not set`**：seed.yaml 中引用了未设置的环境变量。使用 `${VAR:-default}` 语法提供默认值，或在 shell 中 `export VAR=value`。如果是含私密 API key 的插件，将其 override 放到 `tools/seeder/local/seed.yaml`，这样本地覆盖会替换掉数据集中的占位配置。

**向量化失败**：外部服务（vectorizer、spacy）不可用。使用 `--skip-vectorization` 跳过向量化阶段，核心数据仍会正常填充。

**数据库连接失败**：检查 `apps/app/.env` 中的 `DATABASE_URL` 配置。

**schema 校验失败**：Zod 错误会指明具体的文件和字段。根据错误信息修正 JSON 数据文件。
