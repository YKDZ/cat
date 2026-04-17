### 3.20 前端组件体系

| 分类              | 组件名                   | 状态    | 说明                                                                                |
| ----------------- | ------------------------ | ------- | ----------------------------------------------------------------------------------- |
| **Agent 会话**    | AgentChatInterface       | ✅ 已有 | 对话主界面                                                                          |
|                   | AgentThinkingIndicator   | ✅ 已有 | 思考中指示器                                                                        |
|                   | AgentToolCallCard        | ✅ 已有 | 工具调用详情                                                                        |
|                   | AgentToolConfirmCard     | ✅ 已有 | 工具确认交互                                                                        |
|                   | AgentNodeTimeline        | ✅ 已有 | 执行步骤时间线                                                                      |
|                   | AgentBlackboardDebug     | ✅ 已有 | 黑板状态调试                                                                        |
|                   | AgentRunResultCard       | ✅ 已有 | 运行结果                                                                            |
|                   | AgentMaxStepsCard        | ✅ 已有 | 步骤上限提示                                                                        |
|                   | AgentMessageBubble       | ✅ 已有 | 消息气泡                                                                            |
|                   | AgentNodeStatusBadge     | ✅ 已有 | 节点状态标记                                                                        |
|                   | AgentSelector            | ✅ 已有 | Agent 选择器                                                                        |
|                   | AgentTodoList            | 🆕 新增 | Agent 自维护 todo 列表                                                              |
|                   | AgentDelegationTree      | 🆕 新增 | 委派链调用树                                                                        |
|                   | AgentTokenUsage          | 🆕 新增 | Token 消耗图表                                                                      |
|                   | AgentDAGDebugger         | 🆕 新增 | DAG 节点级调试面板（断点/单步/Prompt审查）                                          |
| **Team**          | IssuePRBoard             | 🆕 新增 | Issue/PR 视图 (拖拽交互)                                                            |
|                   | IssueDAGOverlay          | 🆕 新增 | Issue DAG 依赖叠加层                                                                |
|                   | IssueDAGFullView         | 🆕 新增 | DAG 全览视图                                                                        |
|                   | TeamMailbox              | 🆕 新增 | 邮件列表 + 线程视图                                                                 |
|                   | TeamTopology             | 🆕 新增 | Agent 通信拓扑图                                                                    |
|                   | TeamStatusDashboard      | 🆕 新增 | 整体进度 + 指标面板                                                                 |
|                   | TeamTimelineView         | 🆕 新增 | Team 级别时间线                                                                     |
|                   | DynamicTeamManager       | 🆕 新增 | 动态 Team 生命周期管理（创建/成员/TTL/解散）                                        |
| **委派**          | DelegationChainView      | 🆕 新增 | 委派链可视化: 树状展示父→子任务关系及各级状态                                       |
|                   | DelegationDepthIndicator | 🆕 新增 | 当前任务的委派深度指示器                                                            |
| **Issue 拆分**    | IssueSplitAggregationView | 🆕 新增 | 拆分 Issue 聚合视图: 统一视图/逐 Issue 视图切换 (ChangeSet+成本)                   |
|                   | IssueSplitTree           | 🆕 新增 | Issue 拆分树: 父 Issue→子 Issue 层级关系和各自状态                                  |
| **时间线播放**    | SessionTimelinePlayer    | 🆕 新增 | 视频编辑器风格时间线播放器，支持回放+实时直播双模式 (§3.20.1)                       |
| **任务追溯**      | TaskTraceView            | 🆕 新增 | Issue→Session→DAGNode→Event 追溯                                                     |
|                   | TaskDecomposeTree        | 🆕 新增 | 任务分解树可视化                                                                    |
| **变更审核**      | ChangeSetReviewPanel     | 🆕 新增 | 变更集审核主界面 (§3.14.10 五种视图模式: 分组/时间线/文档/冲突/影响)                |
|                   | ChangeSetDiffView        | 🆕 新增 | 分支 diff 视图 (三方对比, 仅 Isolation Mode)                                        |
|                   | ChangeSetEntityDiffCard  | 🆕 新增 | 异构实体 diff 卡片——按 entityType 渲染专属 diff 视图 (翻译对比/术语变更/设置变更等) |
|                   | ChangeSetConflictPanel   | 🆕 新增 | 三方合并冲突解决界面——逐字段合并选择器, 支持全部 13 种 entityType                   |
|                   | ChangeSetImpactGraph     | 🆕 新增 | 变更级联影响图——展示 element→translation 重译等实体间影响传播链                     |
|                   | ChangeSetAuditLog        | 🆕 新增 | Audit Mode 变更审计日志浏览                                                         |
|                   | SideEffectJournalView    | 🆕 新增 | 待执行/已取消/已补偿副作用列表                                                      |
| **记忆管理**      | MemoryBrowser            | 🆕 新增 | 按 scope/lifecycle/entity/tags/source 多维度筛选                                    |
|                   | MemoryTimeline           | 🆕 新增 | 记忆的创建/修改/过期历史时间线                                                      |
|                   | MemoryEntityView         | 🆕 新增 | 某业务实体关联的所有记忆                                                            |
|                   | MemoryAgentProfile       | 🆕 新增 | Agent 记忆画像                                                                      |
|                   | MemoryVectorMap          | 🆕 新增 | 记忆向量空间降维可视化                                                              |
|                   | GoldenWeightDashboard    | 🆕 新增 | 黄金权重分布热力图/Agent 利用率/级联影响                                            |
| **规范板**        | NormsBoardEditor         | 🆕 新增 | Markdown 规范条目编辑器 (§3.26)                                                     |
|                   | NormsBoardBrowser        | 🆕 新增 | 按 category/tags/status 筛选规范条目                                                |
|                   | NormProposalReview       | 🆕 新增 | Agent 规范提案审批界面                                                              |
| **验收/知识健康** | AcceptanceResultView     | 🆕 新增 | 验收判定结果展示: PASS/FAIL/PARTIAL + 详细 checker 结果                             |
|                   | AcceptanceCriteriaEditor | 🆕 新增 | 任务级验收标准配置器: 覆盖默认标准/手动判定                                         |
|                   | KnowledgeHealthDashboard | 🆕 新增 | 知识健康仪表盘: derivativeHealthScore 分布/预警列表/降级历史                        |
| **HITL**          | HITLHubPanel             | 🆕 新增 | HITL 统一面板: 优先级队列/SLA 追踪/批量操作 (§3.15.4)                               |
|                   | HITLRequestDetail        | 🆕 新增 | 单个 HITL 请求详情（含委派链上下文）                                                |
| **版本管理**      | BranchManager            | 🆕 新增 | 项目分支列表 + 创建/合并/删除操作 (仅 Isolation)                                    |
|                   | SnapshotManager          | 🆕 新增 | 项目快照列表 + 创建/回归操作                                                        |
|                   | VCSModeSelector          | 🆕 新增 | 项目/Session 级 VCS 模式选择器                                                      |
| **成本控制**      | CostDashboard            | 🆕 新增 | 全局/项目/Agent 成本面板                                                            |
|                   | CostBudgetEditor         | 🆕 新增 | 预算配置和阈值设置                                                                  |
|                   | CostAttributionView      | 🆕 新增 | 成本归因追溯 (Session→Node→LLMCall)                                                 |
| **调试/测试**     | PromptDiffViewer         | 🆕 新增 | 跨节点 Prompt 变化对比                                                              |
|                   | BaselineTestRunner       | 🆕 新增 | 基线测试用例执行与结果对比                                                          |
|                   | ReplayRetryPanel         | 🆕 新增 | DAG 节点 replay/retry/fork 操作面板                                                 |
| **安全**          | SecurityAuditDashboard   | 🆕 新增 | SecurityGuard 拦截日志/安全事件仪表盘                                               |
| **管理**          | AgentDefinitionEditor    | 🆕 新增 | MD agent 定义编辑器                                                                 |
|                   | SkillEditor              | 🆕 新增 | MD skill 定义编辑器                                                                 |
|                   | AgentPermissionPanel     | 🆕 新增 | Agent 权限配置                                                                      |
|                   | SchedulerRuleEditor      | 🆕 新增 | 触发规则配置                                                                        |
|                   | OTelDashboard            | 🆕 新增 | 可观测性仪表盘                                                                      |
|                   | ModuleComposerInspector  | 🆕 新增 | 模块组合状态查看器                                                                  |
|                   | HITLConfigPresetSelector | 🆕 新增 | HITL 超时策略预设模板选择器                                                         |
|                   | WarmStartWizard          | 🆕 新增 | 项目热启动配置向导                                                                  |

#### 3.20.1 SessionTimelinePlayer

- **✅ Decision D43: 实时时间线流式播放** → 双模式架构 (A): SessionTimelinePlayer 同时支持**回放模式** (已完成 Session 的历史回放) 和**实时直播模式** (进行中 Session 的实时事件流)。两种模式共享同一时间线 UI，通过 WebSocket 事件流实现实时推送。

> 用户需要一种直观的方式来观察任何 Agent Session (单 Agent 或 Team) 中内容在系统中的流转全过程——不仅是已完成会话的回放，也包括**进行中会话的实时观察**（类似观看直播）。

**设计理念**: 借鉴视频编辑器的时间线 (timeline) 概念——用户可以像操作视频播放器一样**拖拽播放头**在任意时刻查看系统状态快照。v0.16 扩展为双模式架构，支持实时直播观看进行中的会话。

**双模式架构**:

```
SessionTimelinePlayer — 双模式架构
┌───────────────────────────────────────────────────────────┐
│                                                           │
│  模式 1: 回放模式 (Replay Mode)                            │
│  ──────────────────────────────────                       │
│  · 适用: 已完成的 Session (status = COMPLETED / FAILED)    │
│  · 数据源: agent_event 表历史记录 (全量加载)               │
│  · 交互: 播放/暂停/拖拽/倍速/跳转到任意时刻              │
│  · 时间线完整: 播放头可在 [0, totalDuration] 任意位置      │
│                                                           │
│  模式 2: 实时直播模式 (Live Mode)                          │
│  ──────────────────────────────                           │
│  · 适用: 进行中的 Session (status = RUNNING / PAUSED)      │
│  · 数据源: WebSocket 实时事件流 + 历史缓冲                 │
│  · 交互:                                                   │
│    - 默认跟随直播头 (Live Head): 自动滚动到最新事件        │
│    - 暂停: 停止自动滚动，固定在当前播放位置               │
│    - 回溯: 拖拽播放头到任意历史位置，浏览过去的事件       │
│    - 跳回直播: 点击 "LIVE" 按钮立即跳回直播头             │
│  · 缓冲策略: 保留最近 N 分钟事件在内存 (默认 30min)       │
│    超出缓冲范围的回溯从 DB 按需加载                        │
│  · Session 结束时: 自动切换为回放模式                      │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**UI 布局**:

```
SessionTimelinePlayer (双模式统一 UI)
┌──────────────────────────────────────────────────────────────┐
│ ◀ ▶ ⏸  ──────────────|──────────────── 14:23 / LIVE 🔴     │  ← 播放控制栏 (直播模式显示 LIVE 指示)
├──────────────────────────────────────────────────────────────┤
│ 🔵 DAG Nodes    ──●──●──●──────●──●──●──────●──●──         │  ← DAG 节点轨道
│ 🟢 Tool Calls   ────●─────●──────────●───●─────────         │  ← 工具调用轨道
│ 📬 Mail         ──────────●──────────────────●──────         │  ← 邮件发送/接收
│ 📋 Issue/PR    ──●────────────●─────────────────●──         │  ← Issue/PR 状态变化
│ 📝 ChangeSet    ────────────────────●──────────────●         │  ← 变更集创建/审核
│ 🧠 Memory       ──────●──────────●──────●──────────         │  ← 记忆创建/检索
│ 📏 Norms        ──────────●──────────────●──────────         │  ← 规范板变更
│ ✅ Acceptance   ────────────────────────────●────────         │  ← 验收判定
│ 🔗 Delegation   ──────────────●────────────────●────         │  ← 委派发起/完成
│ ✂️ IssueSplit  ────────●────────────────────────────         │  ← Issue 拆分事件
│ 💰 Cost         ──$─────$──────$────$───────$───────         │  ← Token 消耗 (持续)
│ 🔒 Security     ──────────────────────●─────────────         │  ← 安全事件
├──────────────────────────────────────────────────────────────┤
│ [Live Mode: 🔴 LIVE ──── Pause ──── History ──── Jump Live] │  ← 直播控制按钮组
└──────────────────────────────────────────────────────────────┘

状态快照面板 (播放头位置时刻的全局状态):
┌──────────────────────────────────────────────────────────────┐
│ 时刻: 14:23                                                  │
│ DAG 当前节点: reasoning_5 (第 3 轮)                           │
│ Issue 状态: OPEN (issue-42)                                  │
│ 黑板快照: { completedSegments: 234, totalSegments: 500, ... }│
│ 待处理邮件: 1 (来自 Reviewer-01)                              │
│ 记忆操作: 本轮创建 2 条, 检索 5 条                            │
│ 累计 Token: 12,345 (本轮: 2,100)                              │
│ 委派状态: 1 个 WAITING (法律条款翻译, depth=1)                 │
│ 拆分状态: issue-42 已拆分为 3 子 Issue (2/3 完成)             │
└──────────────────────────────────────────────────────────────┘
```

**实时直播实现方案**:

```
数据流架构:

  AgentRuntime (DAG 执行)
       │
       ├──→ agent_event 表 (持久化)
       │
       └──→ EventBus (内存事件)
              │
              └──→ WebSocket Gateway
                     │
                     ├──→ SessionTimelinePlayer (Live Mode 客户端 A)
                     ├──→ SessionTimelinePlayer (Live Mode 客户端 B)
                     └──→ ...

  WebSocket 事件格式:
  {
    type: "timeline_event",
    sessionId: string,
    event: {
      trackType: "dag_node" | "tool_call" | "mail" | "issue_pr" | "changeset"
                | "memory" | "norms" | "acceptance" | "delegation" | "issue_split"
                | "cost" | "security",
      timestamp: ISO8601,
      data: object          // 事件具体数据 (与 agent_event 结构一致)
    }
  }

  缓冲策略:
  - 客户端: 维护最近 30 分钟事件的环形缓冲区 (可配置)
  - 回溯超出缓冲范围: 发送 REST 请求从 DB 加载历史事件
  - Session 结束事件: { type: "session_complete", finalStatus } → 触发切换到回放模式
```

**直播模式交互详述**:

| 操作         | 行为                                                             | 状态               |
| ------------ | ---------------------------------------------------------------- | ------------------ |
| 打开直播     | 建立 WebSocket 连接，加载已有事件，播放头跟随直播头              | 🔴 LIVE            |
| 暂停         | 停止自动滚动，播放头固定在当前位置，新事件仍在缓冲区接收         | ⏸️ PAUSED (仍连接) |
| 回溯         | 拖拽播放头到历史位置，显示该时刻的状态快照和事件                 | 📜 HISTORY         |
| 跳回直播     | 播放头立即跳到最新事件位置，恢复自动滚动                         | 🔴 LIVE            |
| Session 结束 | 接收到 session_complete 事件，自动切换为回放模式，时间线完整可用 | ▶️ REPLAY          |

**核心功能**:

| 功能               | 说明                                                           |
| ------------------ | -------------------------------------------------------------- |
| **多轨道时间线**   | 每种事件类型一个轨道，按时间排列事件节点                       |
| **播放/暂停/跳转** | 像视频播放器一样前进/后退/跳转到任意时刻                       |
| **轨道过滤**       | 显示/隐藏特定轨道，聚焦关注领域                                |
| **事件详情**       | 点击任何事件节点查看完整详情（Prompt、工具参数、邮件内容等）   |
| **状态快照**       | 拖到任意时刻自动展示该时刻的黑板状态、Issue/PR 状态、累计成本    |
| **因果链高亮**     | 选中一个事件后，高亮该事件的前因和后果事件（跨轨道）           |
| **Team 模式**      | Team 下每个成员 Agent 独立一排轨道组，可折叠/展开              |
| **对比模式**       | 并排两个 Session 的时间线对比（用于 baseline 回归分析）        |
| **委派链模式**     | 展开 delegationChainId 下所有层级的时间线轨道                  |
| **实时直播**       | 进行中 Session 的 WebSocket 实时事件流，支持暂停/回溯/跳回直播 |

**数据源**: 基于 `agent_event` 表和 OTel Trace 数据，按 sessionId 过滤和排序。实时直播模式额外使用 WebSocket 推送。不需要额外存储——所有数据复用现有可观测性基础设施。

**Team 模式扩展**:

```
Team SessionTimelinePlayer
┌──────────────────────────────────────────────────────────────┐
│ ▸ 📊 Team Overview   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  ← 聚合视图
│ ▸ 🤖 Translator-01   ──●──●──●──────●──●──                   │  ← 可展开
│ ▸ 🤖 Translator-02   ────●──────●──●──────●──                 │
│ ▾ 🤖 Reviewer-01     ──────────────────●──●──●──●──           │  ← 展开态
│   │ 🔵 DAG Nodes     ──────────────────●──●──●──●──           │
│   │ 🟢 Tool Calls    ──────────────────────●──●────           │
│   │ 📬 Mail          ──────────────────●────────●──           │
│   │ ✅ Acceptance    ──────────────────────────●────           │
│   └ 💰 Cost          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │
│ ▸ 📬 Team Mail Flow  ──●──────●──────────●──────●──           │  ← 全 Team 邮件
│ ▸ 📋 Issue/PR Changes ──●────●──────●──────────●──●──         │  ← 全 Team Issue/PR
│ ▸ 🔗 Delegation      ──────────●────────────●──────           │  ← 委派链事件
└──────────────────────────────────────────────────────────────┘
```
