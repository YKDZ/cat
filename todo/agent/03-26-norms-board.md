### 3.26 规范板子系统 (NormsBoard)

#### 3.26.1 问题说明

Agent 系统的翻译质量不仅依赖于记忆和术语库等**隐式知识**（通过向量检索召回），还需要**显式规范**——项目级别的翻译标准、风格指南、质量。这些规范类似于 Claude Code 的 `.cc` rules 机制：由人类编写或审批的、要求结构化的、可直接注入 Prompt 的规则文档。

**Issue/PR 系统** 解决的是"做什么"——任务的派发和流转；**规范板 (NormsBoard)** 解决的是"怎么做"——翻译标准的制定和维护。两者共同构成人类与 Agent 交互的双核心（Principle 8）。

#### 3.26.2 设计目标

1. **人类可直接编辑**: 规范条目以 Markdown 文档形式存在，人类可通过 NormsBoardEditor 直接创建和修改
2. **Agent 可提案**: Agent 在翻译过程中发现反复出现的模式时，可通过 `propose_norm` 工具提交规范提案，经人类审批后生效
3. **按需注入 Prompt**: Agent 通过 `search_norms` 工具按需检索相关规范（§3.2.5 按需获取层），不再自动全量注入
4. **版本化管理**: 规范条目变更通过 EntityVCS (§3.14) 追踪，支持回溯和审计
5. **与 Memory 互补**: 规范板提供**确定性规则**（always/never），Memory 提供**概率性经验**（tend to/usually）——两者数据源完全独立，不存在双写同步（见 §3.26.7）

#### 3.26.3 数据模型

```
norms_board_entry
  ├── id: UUID
  ├── projectId: FK → project
  ├── title: string                         -- 简短标题 (如 "数字格式规范")
  ├── content: text (Markdown)              -- 规范正文, Markdown 格式
  ├── category: enum
  │     'TERMINOLOGY'    -- 术语类规范 (如 "cloud 统一翻译为'云'而非'云端'")
  │     'STYLE'          -- 风格类规范 (如 "使用简体中文书面语，避免口语化表达")
  │     'FORMAT'         -- 格式类规范 (如 "日期格式统一为 YYYY-MM-DD")
  │     'QUALITY'        -- 质量类规范 (如 "不允许出现未翻译的英文片段")
  │     'WORKFLOW'       -- 流程类规范 (如 "含法律术语的段落必须人工审校")
  │     'GENERAL'        -- 通用规范
  ├── scope: enum
  │     'ALL'            -- 适用于项目内所有语言对
  │     'LANGUAGE_PAIR'  -- 仅适用于特定语言对
  │     'FILE_TYPE'      -- 仅适用于特定文件类型
  ├── scopeFilter: jsonb?                   -- scope 非 ALL 时的过滤条件
  │     例: { "sourceLang": "en", "targetLang": "zh-CN" }
  │     例: { "fileType": "markdown" }
  ├── status: enum
  │     'DRAFT'          -- 草稿 (Agent 提案或人类未完成)
  │     'ACTIVE'         -- 生效中 (Agent 通过 search_norms 检索)
  │     'ARCHIVED'       -- 已归档 (不再可检索, 但保留历史)
  ├── priority: int (1-100, default 50)     -- 优先级, 决定检索结果排序
  ├── authorUserId: FK → user?              -- 人类作者
  ├── proposedByAgentId: UUID?              -- Agent 提案者 (人类创建时为 null)
  ├── proposalSessionId: UUID?              -- 提案来源的 Agent Session
  ├── approvedByUserId: FK → user?          -- 审批者
  ├── approvedAt: timestamp?
  ├── tags: text[]                          -- 自由标签, 如 ["urgent", "terminology"]
  ├── version: int                          -- EntityVCS 版本号
  ├── createdAt, updatedAt
  └── deletedAt: timestamp?                -- 软删除
```

**与 Memory 的区别**:

| 维度     | Memory (§3.13)               | NormsBoard (§3.26)                   |
| -------- | ---------------------------- | ------------------------------------ |
| 性质     | 经验性、概率性（"通常…"）    | 规范性、确定性（"必须…/禁止…"）      |
| 来源     | Agent 自动创建 + 热启动      | 人类编写 + Agent 提案经人类审批      |
| 检索方式 | 向量语义检索 (search_memory) | 分类+作用域精确匹配 (search_norms)   |
| 粒度     | 单条经验片段                 | 完整规则文档 (Markdown)              |
| 生命周期 | 自动 decay + 合并            | 手动管理 (DRAFT → ACTIVE → ARCHIVED) |
| 权威性   | 由 goldenWeight 梯度表达     | 一律权威 (ACTIVE 状态即为项目标准)   |
| 数据源   | agent_memory 表              | norms_board_entry 表                 |

#### 3.26.4 NormsBoardEngine 服务

```
NormsBoardEngine
  ├── create(entry: NewNormsBoardEntry): NormsBoardEntry
  │     → 人类创建: status 直接为 ACTIVE (或 DRAFT，由作者选择)
  │     → Agent 提案: status 强制为 DRAFT
  │
  ├── update(id, patch: Partial<NormsBoardEntry>): NormsBoardEntry
  │     → 仅人类可修改 ACTIVE 条目
  │     → Agent 不能直接修改 (需通过 HITL 或新提案)
  │     → 变更通过 EntityVCS 记录
  │
  ├── approve(id, userId): NormsBoardEntry
  │     → DRAFT → ACTIVE，记录审批者
  │     → 触发 Scheduler 事件 norms_change (§3.17)
  │
  ├── archive(id, userId): NormsBoardEntry
  │     → ACTIVE → ARCHIVED
  │     → 触发 norms_change 事件，后续 Agent search_norms 不再返回该条目
  │
  ├── fetchActiveNorms(projectId, context: NormsContext): NormsBoardEntry[]
  │     → context 包含: sourceLang, targetLang, fileType
  │     → 筛选: status=ACTIVE + scope 匹配
  │     → 排序: priority DESC
  │     → 供 search_norms 工具的后端实现
  │
  ├── searchNorms(projectId, query: string): NormsBoardEntry[]
  │     → 关键词搜索 (title + content + tags)
  │     → Agent 在推理过程中通过 search_norms 工具调用
  │
  └── proposeNorm(agentId, sessionId, entry: NormProposal): NormsBoardEntry
        → 创建 DRAFT 条目，标记 proposedByAgentId
        → 触发 HITL 请求 → 人类审批/修改/拒绝
```

#### 3.26.5 Agent 交互模式

**Agent 按需检索规范** (search_norms 工具，§3.2.5 按需获取层):

```
Agent 推理循环
  └── ReasoningNode: Agent 决定需要查阅项目规范
        └── ToolNode: search_norms(projectId, query="日期格式规范")
              └── NormsBoardEngine.searchNorms(...)
                    → 返回匹配的 ACTIVE 条目
                    → Agent 据此调整翻译

  search_norms 返回格式:
  ───────────────────
  ## 匹配的项目翻译规范
  以下规范必须严格遵守。违反规范的翻译将被拒绝。

  ### [术语] 数字格式规范 (优先级: 80)
  - 千位分隔符使用逗号: 1,000 → 1,000
  - 小数点使用句号: 3.14 → 3.14
  - 百分号前不加空格: 50% （非 50 %）

  ### [风格] 正式书面语规范 (优先级: 70)
  - 使用"您"而非"你"
  - 避免口语化表达（如"搞定"→"完成"）
  ───────────────────
```

**Skill 引导检索**: Agent Definition 的 workflow steps (§3.4) 和 Skill steps (§3.5) 包含"查阅项目规范"步骤，引导 Agent 在翻译开始前主动调用 `search_norms` 获取相关规范。

**Agent 提案** (propose_norm 工具):

```
Agent 在翻译中反复遇到同一模式 (如 API → 应用程序接口)
  └── ToolNode: propose_norm({
        title: "API 术语翻译规范",
        content: "建议将 'API' 保留英文原文，不翻译为'应用程序接口'...",
        category: "TERMINOLOGY",
        reason: "在本项目 docs/api/ 目录下 15 处出现，保留原文更符合技术文档惯例"
      })
  └── NormsBoardEngine.proposeNorm(agentId, sessionId, ...)
        → 创建 DRAFT 条目
        → 触发 HITL: 人类审批
              → 批准: DRAFT → ACTIVE → 后续所有 Agent 可通过 search_norms 检索
              → 修改后批准: 人类编辑内容后 ACTIVE
              → 拒绝: DRAFT → ARCHIVED + 记录拒绝原因 (写入 Memory as REJECTION_REASON)
```

#### 3.26.6 人类交互模式

人类通过 NormsBoardEditor (§3.20) 直接管理规范板：

1. **创建规范**: 在编辑器中撰写 Markdown 内容，选择分类和作用域，直接发布为 ACTIVE
2. **审批提案**: 查看 Agent 提交的 DRAFT 列表，逐条审批/修改/拒绝
3. **编辑规范**: 修改已有 ACTIVE 条目，变更自动通过 EntityVCS 记录
4. **归档规范**: 将过时规范归档（不删除，保留审计追踪）
5. **浏览和搜索**: 按分类/标签/状态筛选规范条目

**NormsBoardEditor 与 Issue/PR 系统的并列关系**:

```
┌──────────────────────────────────────────────┐
│              项目工作台 (ProjectWorkbench)      │
│                                               │
│  ┌──────────────┐    ┌──────────────────┐    │
│  │  Issue/PR 系统 │    │  规范板 (Norms)   │    │
│  │               │    │                   │    │
│  │  - Issue 列表  │    │  - 术语规范       │    │
│  │  - PR 审核     │    │  - 风格规范       │    │
│  │  - Agent 认领  │    │  - 格式规范       │    │
│  │  - 进度追踪    │    │  - Agent 提案     │    │
│  │               │    │  - 审批队列       │    │
│  │  "做什么"      │    │  "怎么做"         │    │
│  └──────────────┘    └──────────────────┘    │
│                                               │
│  两者通过 Agent 工具调用同时影响 Agent 行为:   │
│  Issue/PR → 当前任务上下文 + 工具调用          │
│  Norms  → search_norms 按需检索 + propose_norm │
└──────────────────────────────────────────────┘
```

#### 3.26.7 与 Memory 子系统的边界

NormsBoard 与 Memory 是**完全独立的数据源**。两者不存在自动同步机制。

**独立数据源设计理由**:

1. 双写一致性: 若 NormsBoard 编辑需同步到 Memory，延迟窗口可能导致 Agent 看到过时数据
2. 检索评分混淆: 规范条目参与 goldenWeight 评分但其权威性本应是绝对的
3. 生命周期冲突: Memory 自动 decay 与 NormsBoard 手动管理冲突
4. 语义歧义: Memory 混入规范条目后模糊了"经验"与"规范"的界限

**完全独立数据源方案**:

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│    agent_memory 表          │     │    norms_board_entry 表      │
│    (经验性知识)              │     │    (规范性规则)              │
│                             │     │                             │
│  7 种记忆类型:              │     │  6 种规范分类:              │
│  INSIGHT · TERMINOLOGY ·    │     │  TERMINOLOGY · STYLE ·      │
│  STYLE_PREFERENCE ·         │     │  FORMAT · QUALITY ·         │
│  ERROR_PATTERN ·            │     │  WORKFLOW · GENERAL         │
│  DECISION_RATIONALE ·       │     │                             │
│  CONTEXT_NOTE ·             │     │  状态: DRAFT/ACTIVE/ARCHIVED│
│  WORKFLOW_PREFERENCE        │     │  检索: search_norms 工具    │
│                             │     │                             │
│  检索: search_memory 工具   │     │                             │
└─────────────────────────────┘     └─────────────────────────────┘
         ↑                                    ↑
   Agent 自动创建                       人类编写 / Agent 提案审批
   热启动产出                           独立检索通道
   goldenWeight 渐进评分                ACTIVE 即权威，无评分
```

**协同仅限于跨系统引用，不涉及数据同步**:

1. **Memory → 规范提案**: Agent 在 Memory 中发现高频出现的翻译模式时，可提炼为规范提案（通过 propose_norm）。这是**单向提炼**，提案经审批后成为 NormsBoard 条目，原始 Memory 保持不变。
2. **拒绝的提案 → 记忆**: 人类拒绝 Agent 提案时，拒绝原因以 signalType=REJECTION_REASON 写入 Memory（goldenWeight = actorRoleWeight × 2.0），确保 Agent 记住"为什么这个不是规范"。这是从 NormsBoard 流程到 Memory 的**单向写入**，不构成同步。
3. **热启动 → 规范板**: 热启动 (§3.24) 提取的风格规则由 Coordinator 提交为 DRAFT 规范条目，经人类审批后正式化。热启动产出的 Memory 保持为经验性知识，不与规范板重复。

**数据库层边界保障**: agent_memory 表移除 NORM 枚举值，写入时 CHECK 约束拒绝，从数据库层面阻止规范性内容混入 Memory 表。

#### 3.26.8 与权限系统的集成

NormsBoardEntry 作为 ReBAC 对象 (§3.16):

| 操作                | 权限要求                                          |
| ------------------- | ------------------------------------------------- |
| 创建 ACTIVE 条目    | project_admin, project_translator                 |
| 创建 DRAFT 条目     | 任何有项目访问权的用户 + Agent (via propose_norm) |
| 审批 DRAFT → ACTIVE | project_admin                                     |
| 编辑 ACTIVE 条目    | project_admin, 原作者                             |
| 归档条目            | project_admin                                     |
| 搜索/查看条目       | 任何有项目访问权的用户 + Agent                    |

#### 3.26.9 与 EntityVCS 的集成

每个 NormsBoard 条目的变更通过 EntityVCS 追踪：

- 创建、编辑、状态变更均生成 VCS 记录
- 支持查看条目的完整变更历史
- 支持回滚到任意历史版本
- 条目 diff 在 NormProposalReview (§3.20) 中可视化展示

#### 3.26.10 Prompt 注入容量控制

由于 v0.14 采用按需获取模型（§3.2.5），规范板内容不再自动全量注入 Prompt。Agent 通过 `search_norms` 工具按需检索，每次检索返回与查询最相关的条目。容量控制策略：

1. **优先级排序**: 按 priority DESC 排列检索结果
2. **作用域过滤**: 仅返回与当前任务 (languagePair, fileType) 匹配的条目
3. **Token 预算**: search_norms 返回结果有 token 上限（默认 2000 tokens），超出时截断低优先级条目
4. **摘要降级**: 当匹配条目过多时，低优先级条目只返回标题而非全文
5. **多次查询**: Agent 可通过不同 query 多次调用 search_norms，分维度检索所需规范

**向后兼容**: 若项目配置 `promptConfig.autoInjectSlots` 包含 slot #15，则规范板仍走自动注入路径（§3.2.5 向后兼容方案）。

