### 3.2 提示词管理与上下文组装 (PromptEngine + ContextStore)

**Prompt 结构分层**:

```
System Prompt (分 slot 拼接):
  ═══ 静态注入层 (每轮自动注入) ═══
  slot #1:  角色定义 (Agent MD body 的静态部分)
  slot #2:  安全规则 (SecurityGuard 注入)
  slot #3:  Skill 内容 (激活的 Skills 拼接)
  slot #4:  全局规则 (人类内容优先 · 规范板遵循规则 · 验收标准遵循规则 · 微工作流效率规则)
  slot #5:  Scratchpad (当前 Session 工作笔记)
  slot #13: 成本状态 (CostController 注入的预算信息)

  ═══ 按需获取层 (Agent 通过工具主动检索) ═══
  slot #12: [已移除自动注入] 经验性知识 → Agent 调用 search_memory 工具按需获取
  slot #14: [已移除自动注入] 高权重信号 → Agent 调用 search_memory(minGoldenWeight=1.5) 按需获取
  slot #15: [已移除自动注入] 项目规范 → Agent 调用 search_norms 工具按需获取
  slot #16: [已移除自动注入] 验收标准 → Agent 调用 run_acceptance_check 工具按需获取

Messages:
  [...历史消息经压缩管线处理]
  [当前用户消息 / 工具结果]

Tools:
  [...当前 Agent 可用工具列表]
  [search_memory, search_norms, run_acceptance_check — 按需获取类工具始终可用]
```

> **v0.14 重大变更**: slot #12/#14/#15/#16 从"每轮自动注入"转为"Agent 通过工具主动检索"的按需获取模型（详见 §3.2.5）。ContextStore 不再在每轮 buildPrompt() 中自动查询这些数据源，而是提供工具接口供 Agent 在 Reasoning 中根据任务需要自主决定检索时机和内容。

**ContextStore 数据组装** (仅静态注入层):

```
ContextStore
  ├── fetchProjectContext(projectId)     → slot #4-#5
  ├── fetchScratchpad(sessionId)         → slot #5
  └── fetchCostStatus(budgetId)          → slot #13

  按需获取工具 (Agent 侧调用):
  ├── search_memory(query, scope?, types?, tags?, limit?, minGoldenWeight?)
  │     → 替代原 fetchMemories() 自动注入 slot #12
  │     → 替代原 fetchGoldenSignals() 自动注入 slot #14 (使用 minGoldenWeight=1.5 参数)
  ├── search_norms(projectId, query)
  │     → 替代原 fetchNorms() 自动注入 slot #15
  └── run_acceptance_check(cardId?)
        → 替代原 fetchAcceptanceCriteria() 自动注入 slot #16

  特点:
  - 静态注入层内容轻量、稳定、每轮必要
  - 按需获取层内容重量级、任务相关、Agent 自主判断检索时机
  - 大幅降低每轮 Prompt 的基础 token 消耗
  - Agent 可在工作流的关键节点（如翻译前查规范、提交前查验收标准）精准检索
```

#### 3.2.2 Scratchpad (Agent 工作笔记)

Scratchpad 是黑板 (Blackboard) 中的一个**指定命名空间**，Agent 可通过 `update_scratchpad` 工具显式读写结构化笔记。用途包括：

- 记录翻译过程中发现的模式和偏好
- 维护跨轮次的 todo 列表
- 暂存中间分析结果

Scratchpad 数据存储于黑板快照中，随 Session 持久化，随回溯自动恢复到对应版本。在每轮 `buildPrompt()` 时，ContextStore 将 Scratchpad 内容注入静态层。

**与记忆系统的边界**: Scratchpad 是**会话级快捷通道**——当前会话中频繁引用的工作笔记。当 Agent 在 Scratchpad 中积累了跨会话有价值的知识时，可通过 `promote_scratchpad` 工具将其提升为持久记忆（见 §3.13）。两者的详细对比见 §3.13.3。

**与规范板的关系**: Scratchpad 是 Agent 的私有工作笔记，规范板是项目的公共标准。Agent 可以将 Scratchpad 中发现的有价值翻译模式通过 `propose_norm` 工具提议为规范板条目（需人类审批），实现从个人经验到组织知识的提升路径。

#### 3.2.3 消息压缩管线 (5 级)

```
原始 messages[]
  ↓ 1. toolResultBudget()    — 限制单次工具结果 ≤ 5K tokens
  ↓ 2. snipCompact()         — 旧轮次消息替换为 [summary] tombstone
  ↓ 3. microCompact()        — 移除重复的上下文引用
  ↓ 4. contextCollapse()     — 折叠已完成的工具调用序列
  ↓ 5. autoCompact()         — 当总 token > 阈值，触发压缩
  ↓
压缩后 messages[] → LLM API
```

**压缩触发策略** (D5 已决策: 可插拔策略接口):

- **固定百分比策略**: 总 token > 上下文窗口 × 80% 时触发（默认）
- **自适应策略**: 根据近 N 轮的 token 增长速率预测性触发
- **轻量评估策略**: 使用小模型评估当前上下文的信息密度，选择性压缩低密度内容
- 策略通过接口抽象，运行时可按 agent 配置切换

#### 3.2.4 变量插值与条件控制

**变量插值**: 现有 `AgentDefinitionSchema` 中的 `systemPromptVariables` 支持 `{{variable}}` 语法。变量源为 `context`（项目上下文）/ `config`（agent 配置）/ `input`（用户输入）/ `issue`（当前任务上下文）/ `team`（团队状态）/ `cost`（成本状态）/ `norms`（规范板上下文）/ `acceptance`（验收标准上下文）。

- **✅ Decision D12: 提示词模板条件逻辑** → Section 级声明式条件 (C): 每个 prompt section 可声明 `when` 条件（如 `when: context.hasTermbase`），由 PromptEngine 在拼接时评估。

#### 3.2.5 上下文按需获取模型 _(v0.14 新增)_

> **回应补充关切 2**: "需要仔细考虑什么是必须首先静态插入的，而什么可以动态让 agent 通过工具主动获取以减少上下文压力。" 在 v0.13 及之前的设计中，slot #12/#14/#15/#16 和 precheck_notes 在每轮 buildPrompt() 时由 ContextStore 自动检索并注入 system prompt。这导致每轮 Reasoning 的 **基础 token 消耗过高**——即使 Agent 本轮不需要查阅记忆或规范，这些内容仍然占据上下文窗口。

**问题诊断**:

| 问题                | 描述                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **上下文膨胀**      | slot #12 (记忆) + #14 (黄金信号) + #15 (规范) + #16 (验收标准) 合计可占 4000~8000 tokens，每轮无条件消耗         |
| **检索浪费**        | 每轮 buildPrompt 触发 4 次数据库查询 (fetchMemories + fetchGoldenSignals + fetchNorms + fetchAcceptanceCriteria) |
| **注意力稀释**      | LLM 的注意力在大量上下文中被稀释，真正相关的信息可能被淹没在每轮注入的全量数据中                                 |
| **与 LLM 主权冲突** | 系统决定注入什么、注入多少——这本质上是替 LLM 做了"需要什么信息"的决策，违反原则 11 (LLM 主权不可侵犯)            |
| **precheck_notes**  | PreCheck 节点的 ROUTINE 结果写入黑板 precheck_notes 命名空间，被动注入也增加每轮基础 token                       |

**解决方案——静态注入层与按需获取层分离**:

```
┌───────────────────────────────────────────────────────────────────┐
│                    PromptEngine 上下文模型                         │
│                                                                   │
│  ┌─────────────────────────────────┐                              │
│  │     静态注入层                    │                              │
│  │     (每轮 buildPrompt 自动注入)    │                              │
│  │                                   │                              │
│  │  slot #1: 角色定义                │  ← 稳定、必要、轻量         │
│  │  slot #2: 安全规则                │                              │
│  │  slot #3: Skill 内容              │                              │
│  │  slot #4: 全局规则                │                              │
│  │  slot #5: Scratchpad              │                              │
│  │  slot #13: 成本状态               │                              │
│  │                                   │                              │
│  │  预估 token: 1000~2500            │                              │
│  └─────────────────────────────────┘                              │
│                                                                   │
│  ┌─────────────────────────────────┐                              │
│  │     按需获取层                    │                              │
│  │     (Agent 通过工具主动检索)       │                              │
│  │                                   │                              │
│  │  原 slot #12 → search_memory()    │  ← 重量级、任务相关        │
│  │  原 slot #14 → search_memory      │                              │
│  │         (minGoldenWeight=1.5)     │                              │
│  │  原 slot #15 → search_norms()     │                              │
│  │  原 slot #16 → run_acceptance_    │                              │
│  │                check()            │                              │
│  │  precheck_notes → read_precheck() │                              │
│  │                                   │                              │
│  │  预估 token: 0 (未检索时)         │                              │
│  │         → 2000~6000 (按需检索后)  │                              │
│  └─────────────────────────────────┘                              │
│                                                                   │
│  slot #4 全局规则中新增提示:                                       │
│  "你拥有以下按需检索工具。在开始任务前，                            │
│   主动检索相关记忆(search_memory)、                                 │
│   项目规范(search_norms)、                                         │
│   验收标准(run_acceptance_check)。                                 │
│   仅在需要时检索,避免无关检索。"                                    │
└───────────────────────────────────────────────────────────────────┘
```

**分层判定标准**:

| 判定维度     | 静态注入层                           | 按需获取层                                     |
| ------------ | ------------------------------------ | ---------------------------------------------- |
| **稳定性**   | 内容在 Session 内基本不变            | 内容随任务进展动态变化                         |
| **必要性**   | 每轮推理都需要（安全规则、角色定义） | 仅在特定场景需要（翻译前查规范、提交前查验收） |
| **体积**     | 轻量 (总计 < 2500 tokens)            | 重量 (单项可达 2000+ tokens)                   |
| **检索成本** | 无额外查询或查询极轻量               | 涉及向量检索、数据库查询                       |
| **LLM 主权** | 系统必须注入的安全/角色框架          | LLM 应自主决定何时需要什么信息                 |

**Agent 侧的工作流变化**:

```
v0.13 (自动注入):
  每轮 ReasoningNode:
    buildPrompt() → 自动填充 slot #1~#16 → LLM 推理 → 工具调用 → ...
    LLM 被动接收全量上下文，无法控制信息获取

v0.14 (按需获取):
  Session 初始化:
    Agent 阅读 slot #4 中的全局规则，知晓可用的按需检索工具
    Agent 在 Skill 引导下，在关键节点主动检索:
      1. 任务开始 → search_norms() 了解项目翻译标准
      2. 翻译前 → search_memory() 回顾相关经验
      3. 遇到术语 → search_memory(types=["TERMINOLOGY_USAGE"])
      4. 提交前 → run_acceptance_check() 预检验收条件
    LLM 主动控制信息获取的时机和粒度
```

**precheck_notes 的处理**: PreCheck 节点的 ROUTINE 级结果（普通邮件摘要、VCS rebase 成功、规范板变更等）不再自动注入 Scratchpad 或 system prompt。改为写入黑板的 `precheck_notes` 命名空间，Agent 可通过 `read_precheck` 工具按需读取。URGENT 级结果（安全告警、验收失败反馈、VCS 冲突等）仍以 URGENT 消息直接注入 messages（§3.6.4.1 不变）。

**兼容性与退路**:

- **PromptEngine 仍保留静态注入 slot #12~#16 的能力**——通过 Agent Definition 的 `promptConfig.autoInjectSlots` 配置项控制。默认 `[]`（不自动注入），可设为 `[12, 14, 15, 16]` 回退到 v0.13 行为。
- 这允许简单 Agent（如单步翻译器）继续使用自动注入模式，而复杂 Agent（如 Coordinator）使用按需获取以节省上下文。

- **✅ Decision D37: 上下文 slot 静态注入 vs 按需获取分界** → 分层模型 (C): slot #1~#5, #13 静态注入; slot #12, #14~#16, precheck_notes 按需获取。且该分层策略支持 **Agent 级定制**: 不同角色的 Agent 可通过 `promptConfig.autoInjectSlots` 配置需要注入的 slot 子集——例如术语维护 Agent 不需要注入 Issue/PR 相关内容或翻译记忆，安全规则和角色定义 (#1, #2) 不可跳过。

#### 3.2.6 Agent 级 Slot 注入策略定制 _(v0.17 新增)_

> **回应补充关切**: §3.2.5 的静态/按需分层是全局默认设计，但实际上**不同角色的 Agent 对 Slot 注入行为的需求截然不同**。例如：一个简单的指令跟随翻译 Agent 可能希望 search_memory 的结果总是自动注入（因为其 ReasoningNode 几乎不主动检索）；一个 Coordinator 则完全不需要翻译记忆但必须持有团队状态；部分 Agent 甚至需要跳过某些默认静态 Slot（如无 Issue 任务的辅助型 Agent 不需要 slot #5 Scratchpad）。

**问题**: `promptConfig.autoInjectSlots` 仅控制"哪些按需层 Slot 回退为自动注入"，但缺少两个维度的精细控制：

1. **静态层 Slot 的禁用**: 某些 Agent 不需要特定的静态 Slot（如 Scratchpad），但当前设计中静态层 Slot 始终全量注入。
2. **按需层 Slot 的强制静态化**: 某些 Agent 无检索意识或检索能力弱（简单角色），需要将特定"按需"内容回退为每轮静态注入——但 `autoInjectSlots` 只能整体列举 slot 编号，无法为每个 Slot 附加条件或限制。

**解决方案——`promptConfig.slotPolicy` 精细配置**:

```
promptConfig:
  autoInjectSlots: [12, 15]    # 向后兼容: 简写形式, 将 slot #12, #15 回退为自动注入
  slotPolicy:                  # v0.17: 精细覆盖 (优先级高于 autoInjectSlots)
    "#1":  { mode: "static" }             # 角色定义——始终静态 (不可 disabled)
    "#2":  { mode: "static" }             # 安全规则——始终静态 (不可 disabled)
    "#3":  { mode: "static" }             # Skill 内容——默认静态
    "#5":  { mode: "disabled" }           # Scratchpad——此 Agent 不使用工作笔记
    "#12": { mode: "static", maxTokens: 2000 }  # 经验记忆——强制每轮注入 (限制体积)
    "#13": { mode: "disabled" }           # 成本状态——此 Agent 不关心预算
    "#15": { mode: "on-demand" }          # 项目规范——保持按需获取 (覆盖 autoInjectSlots)
```

**`slotPolicy` 配置模型**:

| 属性        | 类型                                    | 说明                                                  |
| ----------- | --------------------------------------- | ----------------------------------------------------- |
| `mode`      | `"static" \| "on-demand" \| "disabled"` | 覆盖该 Slot 的注入行为                                |
| `maxTokens` | `number?`                               | 仅 `static` 模式有效: 限制该 Slot 注入的最大 token 数 |
| `when`      | `string?`                               | 条件表达式 (复用 §3.2.4 条件控制): 仅满足条件时生效   |

**安全约束**: `slot #1` (角色定义) 和 `slot #2` (安全规则) 的 mode 不得设为 `"disabled"`——PromptEngine 在 buildPrompt 时强制忽略此配置，确保安全规则始终存在。

**优先级解析**:

```
PromptEngine.resolveSlotMode(slotId, agentConfig):
  1. 若 slotPolicy[slotId] 存在 → 使用 slotPolicy 配置
  2. 若 slotId ∈ autoInjectSlots → mode = "static"
  3. 否则 → 使用全局默认 (slot #1~#5,#13 = static; #12,#14~#16 = on-demand)
  4. 安全兜底: slot #1, #2 始终强制 static (不可 disabled)
```

> **v0.17 变更**: 新增 `promptConfig.slotPolicy` 精细配置，允许 Agent 定义对每个 Slot 的注入行为进行三态控制 (static/on-demand/disabled)。`autoInjectSlots` 保留为向后兼容的简写形式，`slotPolicy` 优先级更高。

#### 3.2.7 消息数组头部稳定性与 KV Cache 优化 _(v0.17 新增)_

> **回应补充关切**: 提示词引擎未强调 message 数组的头部稳定性。对于支持 KV Cache 的 LLM API 提供方（如 OpenAI、Anthropic），**稳定的消息头部可以最大化 KV Cache 命中率**，从而显著节省推理成本（命中 KV Cache 的 token 通常以半价或更低价格计费）。

**问题本质**: LLM API 提供方的 KV Cache 以请求的 **message 数组前缀**为键——如果连续两次请求的 messages 共享相同的前缀，后续请求可复用已缓存的 KV 计算结果。但 PromptEngine 的静态注入层如果在每轮拼接时产生**不必要的头部变动**（如 Scratchpad 内容变化导致 system prompt 整体变化），则 KV Cache 被频繁失效。

**设计原则——头部稳定性优先**:

```
Message 数组结构 (KV Cache 友好):

  ┌─────────────────────────────────────────────────────┐
  │  messages[0]: system                                │
  │  ┌───────────────────────────────────────────────┐  │
  │  │  ★ 稳定区 (跨轮次不变)                         │  │  ← KV Cache 可复用
  │  │  slot #1: 角色定义                             │  │
  │  │  slot #2: 安全规则                             │  │
  │  │  slot #3: Skill 内容                           │  │
  │  │  slot #4: 全局规则                             │  │
  │  ├───────────────────────────────────────────────┤  │
  │  │  ◇ 易变区 (可能每轮变化)                       │  │  ← KV Cache 难以复用
  │  │  slot #5: Scratchpad (内容可能每轮更新)        │  │
  │  │  slot #13: 成本状态 (余额随时变化)             │  │
  │  └───────────────────────────────────────────────┘  │
  ├─────────────────────────────────────────────────────┤
  │  messages[1..N-1]: 历史消息 (经压缩管线处理)       │  ← 增量追加, 不改头部
  ├─────────────────────────────────────────────────────┤
  │  messages[N]: 当前轮用户消息/工具结果               │
  └─────────────────────────────────────────────────────┘
```

**具体策略**:

1. **System Prompt 内部的 Slot 排序**: PromptEngine 在组装 system prompt 时，将**跨轮次内容不变的 Slot 排在前面**（slot #1 → #2 → #3 → #4），**可能变化的 Slot 放在末尾**（slot #5, #13）。由于 API 的 KV Cache 是前缀匹配，前部稳定区越长，Cache 命中率越高。

2. **Scratchpad 变更批量化**: Agent 频繁调用 `update_scratchpad` 会导致 slot #5 每轮变化从而破坏头部稳定性。PromptEngine 在 buildPrompt 时**比对当前 Scratchpad 与上一轮的 hash**——内容无变化则复用上一轮的 slot #5 字面量，避免序列化差异导致的 KV Cache 失效。

3. **成本状态惰性更新**: slot #13 的成本数据不在每轮更新为精确值，而是在**变化超过阈值时才更新**（如余额变化 > 5%）。细微变化不影响 LLM 决策但会破坏 Cache。

4. **压缩管线兼容**: §3.2.3 消息压缩管线在压缩旧消息时，确保**只修改 messages 数组的尾部**——已压缩的 tombstone 一旦生成不再改变，保证历史消息部分也具有前缀稳定性。

**KV Cache 优化指标** (§3.19 可观测性扩展):

| 指标 ID | 名称                          | 说明                                             |
| ------- | ----------------------------- | ------------------------------------------------ |
| M38     | `prompt.kv_cache.hit_ratio`   | 估算 KV Cache 命中率 (稳定前缀 token / 总 token) |
| M39     | `prompt.head_stability.ratio` | system prompt 跨轮次稳定区占比                   |

> **v0.17 变更**: PromptEngine 新增头部稳定性设计原则。System prompt 内的 Slot 排列顺序优化为稳定区在前、易变区在后，以最大化 API 提供方的 KV Cache 命中率。新增 Scratchpad hash 比对和成本状态惰性更新机制。

#### 3.2.8 多模态上下文支持 (图片) _(v0.18 新增)_

> **回应补充关切**: §3.2 此前完全基于纯文本上下文设计，但 CAT 翻译场景中**图片是重要的上下文来源**——翻译者经常需要看到 UI 截图才能判断最佳译文（如按钮文案 "Open" 在文件管理界面译为"打开"、在营业时间场景译为"营业中"），源文档可能包含带文字的图片（信息图、扫描件），翻译风格指南和品牌规范通常包含视觉示例。随着主流 LLM（GPT-4o、Claude 3.5+、Gemini）普遍支持多模态输入，PromptEngine 必须将图片上下文纳入消息模型。

##### 3.2.8.1 Content Part 模型

当前 messages 数组中的 `content` 字段隐式假定为纯文本字符串。扩展为**多部件内容模型 (Content Part Model)**——每条 message 的 content 可以是纯文本字符串（向后兼容）或 `ContentPart[]` 数组：

```
ContentPart (联合类型):
  ├── TextPart:     { type: "text", text: string }
  ├── ImagePart:    — 图片传递方式由 D47 三策略决定, 统一为 ImagePart 联合:
  │     ├── Base64 模式: { type: "image_url", imageUrl: { url: "data:image/...;base64,...", detail? } }
  │     ├── URL 模式:    { type: "image_url", imageUrl: { url: "https://...", detail? } }
  │     └── FileId 模式: { type: "file", fileId: string }   ← Provider Files API 引用
  └── (可扩展: 未来可添加 AudioPart, DocumentPart 等)

Message.content:
  ├── string                — 纯文本 (向后兼容, 等价于单个 TextPart)
  └── ContentPart[]         — 多部件内容 (含文本 + 图片混合)
```

> **v0.19 变更**: ContentPart 的 ImagePart 从单一 `image_url` 格式扩展为三种传递方式 (base64 / url / file_id)，对应 D47 决策的三策略模型。ContextStore.resolveImageReferences() 根据用户配置的 `imageDeliveryPreference` 选择具体格式。

> **设计约束**: System prompt (messages[0]) 始终为纯文本——图片仅出现在 **user messages** 和 **tool results** 中。这保证了 system prompt 的头部稳定性 (§3.2.7) 不受图片内容影响。

##### 3.2.8.2 翻译场景中的图片上下文来源

| 来源类型                           | 说明                                                                        | 注入方式              | 典型场景                                                |
| ---------------------------------- | --------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| **UI 截图 (Screenshot Context)**   | 待翻译字符串在用户界面中的截图，展示字符串出现的视觉上下文                  | 工具结果返回图片 part | `search_context(segmentId)` 返回关联的 UI 截图          |
| **源文档图片 (Document Image)**    | 源文件中嵌入的图片（Markdown 中的图片引用、富文本中的内联图片）             | 工具结果返回图片 part | `read_segment` 返回包含图片的源内容                     |
| **参考图片 (Reference Image)**     | 翻译风格指南、品牌规范中的视觉示例（排版样例、截图标注等）                  | 按需检索工具          | `search_memory(types=["CONTEXT_KNOWLEDGE"])` 返回品牌图 |
| **人类标注截图 (Annotated Image)** | 人类审校者通过 HITL 上传的标注截图（圈出问题区域、标注修改建议）            | HITL 回复中携带图片   | `request_human_input` 的人类回复包含截图附件            |
| **扫描/OCR 源文件**                | 源文件为扫描件或图片格式（PDF 扫描页、照片中的文本），需 LLM 直接"读"图翻译 | 工具结果返回图片 part | 文件处理器提取页面图片供 Agent 翻译                     |

**ContextStore 扩展**:

```
ContextStore (多模态扩展)
  ├── [已有] fetchProjectContext() / fetchScratchpad() / fetchCostStatus()
  └── [更新] resolveImageReferences(content: ContentPart[], config: ImageDeliveryConfig): ContentPart[]
        → 将内容中的图片引用按用户配置的 imageDeliveryPreference 解析为最终格式
        → 支持三种图片传递方式 (D47 三策略):
           a. File ID 引用: { type: "file", fileId: "..." } — 通过 LLMProvider.uploadFile() 上传后引用
           b. URL 引用: { imageUrl: { url: "https://..." } } — 签名 URL, 由 Provider 直接获取
           c. Base64 内联: { imageUrl: { url: "data:image/png;base64,..." } } — 自托管友好
        → 选择策略由用户 imageDeliveryPreference.preferredMode 决定, 受 LLMProvider.supportedImageInputModes 约束
        → 详见 §3.2.8.8 三策略图片传递模型
```

##### 3.2.8.3 图片 Token 估算

图片在 LLM API 中有独立于文本的 token 计算逻辑，且**不同 Provider 的计算方式差异很大**:

```
LLMGateway.estimateTokens(messages) 扩展:
  对每条 message.content 中的 ContentPart:
    ├── TextPart → 现有文本 tokenizer 计算
    └── ImagePart → LLMProvider.estimateImageTokens(imageUrl, detail)
          ├── OpenAI 系: 基于图片分辨率的 tile 计算
          │     low detail: 固定 85 tokens
          │     high detail: 170 × ceil(width/512) × ceil(height/512) + 85
          ├── Anthropic 系: 基于像素总数
          │     tokens ≈ ceil(width × height / 750)
          └── 其他: Provider 自行实现, 默认 fallback = 1000 tokens
```

**与成本控制 (§3.22) 的联动**: `cost_ledger` 新增 `imageTokens` 字段，区分文本 token 和图片 token 的消耗。不同 Provider 对图片 token 的计价可能与文本不同（如 Anthropic 图片按 input token 计价但无额外费率，OpenAI 图片 token 按标准 input 费率计价），`tokenNormalizationFactor` 需考虑图片 token 的换算。

##### 3.2.8.4 消息压缩管线中的图片处理

§3.2.3 的五级压缩管线需对图片 part 做特殊处理:

```
图片感知压缩规则:

  Level 1 — toolResultBudget():
    ├── 文本 part: 限制 ≤ 5K tokens (不变)
    └── 图片 part: 限制单条工具结果中图片 ≤ maxImagesPerToolResult (默认 3)
          超出时按时间倒序保留最新的 N 张, 丢弃的图片替换为文本描述 tombstone:
          "[image removed: UI screenshot of settings page, 1200x800px]"

  Level 2 — snipCompact():
    ├── 文本 part: 替换为 [summary] tombstone (不变)
    └── 图片 part: 旧轮次的图片 part 替换为文本描述 tombstone
          "[image: {alt_text or auto_description}, removed at compaction round N]"
          → 保留文本描述使 LLM 知晓该位置曾有图片、图片大致内容

  Level 3 — microCompact():
    └── 去重: 若多轮次引用同一图片 URL, 仅保留首次出现, 后续替换为
          "[same image as round N]" 文本引用

  Level 4 — contextCollapse():
    └── 已完成的工具调用序列中的图片: 折叠时一并移除, 保留文本摘要

  Level 5 — autoCompact():
    └── 图片优先回收: 当总 token 逼近阈值时, 图片 part 比文本 part 的回收优先级更高
          (单张图片可能占 500~2000 tokens, 回收效率高)
```

**图片描述生成**: 压缩管线移除图片时需要生成文本替代描述。采用**惰性策略**——如果图片 part 自带 `alt` 文本（如工具返回时附加的描述），直接使用；否则在压缩触发时调用一次轻量 LLM (或 Provider 侧的 vision 描述 API) 生成 ≤ 50 tokens 的描述文本。此调用计入压缩管线成本。

##### 3.2.8.5 KV Cache 与图片的交互

图片 content part 对 §3.2.7 KV Cache 头部稳定性的影响:

- **system prompt 不含图片** (设计约束): 因此图片不影响 system prompt 的 KV Cache 稳定区。
- **历史消息中的图片**: 一旦图片被压缩管线替换为文本 tombstone，该 tombstone 具有前缀稳定性 (§3.2.7 Level 4 约束: 已压缩内容不再改变)。
- **当前轮图片**: 仅出现在 messages 数组末尾 (用户消息/工具结果)，不影响已有前缀的 Cache。
- **结论**: 图片内容与 KV Cache 优化策略兼容，无需额外机制。

##### 3.2.8.6 能力门控与降级

并非所有 LLM 均支持多模态输入。PromptEngine 在组装 messages 时需进行**视觉能力门控**:

```
PromptEngine.buildPrompt() 扩展:

  1. 查询 LLMGateway.getModelCapabilities(modelId):
     → supportsVision: boolean
     → maxImageSize: { width, height }?               — Provider 限制的最大分辨率
     → maxImagesPerRequest: number?                    — 单次请求最大图片数
     → supportedImageInputModes: ("file_id"|"url"|"base64")[]  — 支持的图片传递方式 (D47)

  2. 若 supportsVision = false:
     → 所有 ImagePart 自动降级为文本描述
     → 降级策略: 使用图片的 alt 文本, 或调用 vision 模型生成描述后缓存
     → 日志记录: 标记 "image_context_degraded" 事件 (§3.19)

  3. 若 supportsVision = true:
     → 按 maxImageSize 缩放过大图片 (由 ContextStore.resolveImageReferences 处理)
     → 按 maxImagesPerRequest 截断超限图片 (优先保留与当前任务最相关的图片)
     → 按 imageDeliveryPreference + supportedImageInputModes 选择传递方式 (§3.2.8.8)
```

**降级缓存**: 对于频繁引用的图片 (如项目级 UI 截图)，其文本描述在首次降级生成后缓存到图片元数据中，后续非 vision 模型直接复用缓存描述，避免重复调用 vision 模型。

**Agent 定义层声明**: Agent Definition (§3.4) 的 `llm` 配置中新增 `requiresVision` 可选字段:

```yaml
llm:
  providerId: 1
  temperature: 0.3
  maxTokens: 4096
  requiresVision: true # 此 Agent 需要视觉能力 (如处理带截图的翻译任务)
```

当 `requiresVision: true` 但绑定的 LLM Provider 不支持 vision 时，AgentRuntime 在 Session 初始化时发出警告，并根据 `CostController` 降级策略尝试路由到支持 vision 的备选模型。

##### 3.2.8.7 安全考量——视觉层注入攻击

图片上下文引入新的安全攻击面——**视觉提示词注入 (Visual Prompt Injection)**:

- **攻击路径**: 恶意翻译源图片中嵌入人眼难以察觉但 LLM 可识别的文本指令（如在截图背景中叠加低对比度的 "ignore all rules" 文本）。
- **防御层** (扩展 §3.25 SecurityGuard):
  1. **图片来源白名单**: 仅允许来自已注册 Storage Provider 的图片 URL；拒绝外部任意 URL 的直接引用。
  2. **图片尺寸/格式校验**: 拒绝异常尺寸 (如 1x50000 像素的条带图片)、非标准格式的图片。
  3. **隐写/注入检测** (可选): 对高安全级别项目，可启用图片预处理管线——检测图片中是否包含隐藏文本层或异常编码。
  4. **输出行为监控** (现有): §3.25.3 的 OutputFilter 对 LLM 在处理图片上下文后的输出行为进行异常检测——若在处理图片后突然产生非预期工具调用，触发安全告警。

- **✅ Decision D47: 多模态上下文传递策略** → 用户可选三策略模型: LLMProvider 基础设施扩展为支持三种图片传递方式 (file_id 上传引用 / URL 引用 / Base64 内联)，由前端用户在项目或 Provider 配置中随时选择偏好的输入方式。系统不强制固定策略——files 端点虽最优雅但有远程存储限额、成本和安全顾虑，URL 模式依赖 Provider 可达性，Base64 模式自托管最友好但消息体积大。三策略并存由 `LLMProvider.supportedImageInputModes` 声明 Provider 能力，用户偏好通过 `imageDeliveryPreference` 配置覆盖。

##### 3.2.8.8 三策略图片传递模型 _(v0.19 D47 落地)_

D47 决策明确了图片传递的三种策略，对应主流 LLM API 标准 (OpenAI Files API、Anthropic Files API 等):

```
ImageDeliveryMode (三策略):
  ├── "file_id"   — 先通过 Provider 的 Files 端点上传图片，消息中以 file_id 引用
  │     适用: 云端 Provider (OpenAI, Anthropic) 且图片复用频率高
  │     优势: 消息体积最小、支持跨请求复用、Provider 侧缓存
  │     限制: 远程服务器持久存储→总量/大小限制、存储成本、隐私顾虑
  │
  ├── "url"       — 图片存储在 Object Storage，消息中传递签名 URL
  │     适用: 云端 Provider + 图片已在可达 CDN/Storage 上
  │     优势: 消息体积小、无需上传步骤
  │     限制: 需 Provider 可访问 URL (自托管内网场景不通)、部分 Provider 不支持
  │
  └── "base64"    — 图片转为 base64 Data URI 直接嵌入消息体
        适用: 自托管 Provider (Ollama 等)、内网环境、隐私敏感场景
        优势: 无外部依赖、自托管最友好、隐私性最好
        限制: 消息体积膨胀 (~33% 开销)、不利于 Provider 侧缓存复用
```

**用户可选配置模型**:

```
项目级 / Provider 级配置:
  imageDeliveryPreference:
    preferredMode: "base64" | "url" | "file_id"  — 用户偏好 (前端可随时切换)
    fallbackChain: ["base64"]                     — 偏好不可用时的降级链
    fileIdConfig:                                  — file_id 模式专用配置
      autoCleanup: boolean (true)                  — 是否自动清理已上传文件
      maxRetentionHours: number (24)               — 文件保留时长
      maxTotalFiles: number (100)                  — 单项目最大上传文件数
```

**ContextStore.resolveImageReferences() 扩展**:

```
resolveImageReferences(content: ContentPart[], config: ImageDeliveryConfig): ContentPart[]
  1. 读取用户 imageDeliveryPreference.preferredMode
  2. 查询 LLMProvider.supportedImageInputModes — 确认 Provider 支持该模式
  3. 若 Provider 不支持偏好模式 → 按 fallbackChain 降级
  4. 按最终确定的模式转换图片引用:
     ├── "file_id": 调用 LLMProvider.uploadFile(imageData) → 获取 fileId → 构造引用
     ├── "url":     生成签名 URL (已有 Object Storage 集成)
     └── "base64":  读取图片数据 → 编码为 data:image/...;base64,...
  5. file_id 模式下维护上传文件注册表, 支持过期清理 (autoCleanup)
```

**LLMProvider 接口扩展** (联动 §3.1):

```
LLMProvider (v0.19 扩展):
  ├── [已有] chat() / modelInfo() / estimateImageTokens()
  ├── [新增] supportedImageInputModes: ("file_id" | "url" | "base64")[]
  │     → 声明此 Provider 支持的图片传递方式 (至少包含 "base64")
  ├── [新增] uploadFile(data: Buffer, mimeType: string): Promise<FileReference>
  │     → 仅 file_id 模式需要; 不支持的 Provider 抛出 UnsupportedOperationError
  └── [新增] deleteFile(fileId: string): Promise<void>
        → file_id 模式下清理已上传文件
```

**安全约束** (联动 §3.25):

- **file_id 模式**: 上传至 Provider 远程服务器的文件受 `fileIdConfig.maxTotalFiles` 和 `maxRetentionHours` 限制，防止存储滥用。SecurityGuard 拦截超限上传。
- **url 模式**: 仅允许来自已注册 Storage Provider 的签名 URL (§3.2.8.7 图片来源白名单不变)。
- **base64 模式**: 图片内容直接嵌入请求体，不经过外部网络传输——隐私性最高。
- **前端切换**: 用户切换 `preferredMode` 视为项目配置变更，记录审计日志。

> **v0.18 变更**: PromptEngine 新增 §3.2.8 多模态上下文支持。消息内容模型从纯文本扩展为 `ContentPart[]`（文本 + 图片混合）；消息压缩管线新增图片感知处理规则（图片优先回收、tombstone 文本替代）；新增视觉能力门控和非 vision 模型降级策略；安全模型扩展视觉注入防御；新增 D47。

> **v0.19 变更**: D47 定案——图片传递策略从自适应选择演化为**用户可选三策略模型** (file_id / url / base64)，新增 §3.2.8.8 详述三策略实现。ContentPart ImagePart 扩展支持 `file` 类型 (FileId 引用)；ContextStore.resolveImageReferences() 升级为接受 `ImageDeliveryConfig` 配置；LLMProvider 新增 `supportedImageInputModes` / `uploadFile()` / `deleteFile()` 接口；新增 `imageDeliveryPreference` 项目级配置。

---
