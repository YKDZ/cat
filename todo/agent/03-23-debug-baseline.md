### 3.23 调试与基线测试

#### 3.23.1 调试难题分析

Team 系统调试难度源于三层交织：

```
               ┌──────────────────────────────────────────────────┐
 Layer 1       │  Issue/PR (异步任务流转)                           │
 (可见状态)     │  Issue/PR 状态变化, 可直接观察                     │
               └────────────┬────────────────────────┬────────────┘
                            │ 触发                    │ 状态回写
               ┌────────────▼────────────────────────▼────────────┐
 Layer 2       │  Protocol Messages (Agent 间通信)                   │
 (隐式通信)     │  协议消息交换不可见于 Issue/PR, 却影响决策          │
               └────────────┬────────────────────────┬────────────┘
                            │ 触发                    │ 回调
               ┌────────────▼────────────────────────▼────────────┐
 Layer 3       │  Scheduler (触发 + 并发控制)                       │
 (编排层)       │  去重、排队、生命周期管理                          │
               └──────────────────────────────────────────────────┘
```

**核心困难**: 一个 Bug 可能跨越三层表现：Scheduler 触发条件错误 → Agent 收到错误时机的协议消息 → 导致 Issue/PR 状态异常。传统日志难以追踪因果链。

**v0.14 新增难度**: 委派链和动态 Team 引入了第四层复杂性——跨 Team 边界的任务流转和临时 Team 的生命周期管理，使因果链可能跨越多个 Team 实例。

#### 3.23.2 跨层追踪关联

利用 OTel Trace + §3.8 任务追溯体系，建立三层因果关联：

```
TraceContext 传播:
  Issue.id ─────────────────────────────────────────────
       │                                                      │
       ├── Scheduler.TriggerEvent (triggerRuleId, dedupResult) │
       │       │                                               │
       │       ├── AgentSession (sessionId, DAGNodeId)         │  同一 TraceId
       │       │       │                                       │
       │       │       ├── Protocol.send (from, to, type, threadId) │
       │       │       ├── Tool.execute (name, args)           │
       │       │       ├── delegate_task (delegationChainId)   │
       │       │       └── LLM.call (model, tokens)            │
       │       │                                               │
       │       └── AgentSession.complete                       │
       │                                                      │
       └── Issue.statusChange ────────────────────────────
```

**追踪查询接口**:

```
DebugService
  ├── traceByIssue(issueId): FullTrace
  │     → 返回: 该 Issue 相关的所有 Session、Mail、DAGNode 及其因果链
  │
  ├── traceByMail(mailId): FullTrace
  │     → 返回: 触发该协议消息的 DAGNode → 所属 Session → 所属 Issue
  │
  ├── traceBySession(sessionId): FullTrace
  │     → 返回: 该 Session 的完整 DAG 执行图 + 关联 Issue + 发送/接收的协议消息
  │
  ├── traceByDelegationChain(delegationChainId): FullTrace
  │     → 返回: 整条委派链的所有层级任务、Session、ChangeSet 及因果关系
  │
  ├── diffPrompts(sessionId, nodeIdA, nodeIdB): PromptDiff
  │     → 对比两个 ReasoningNode 的完整 Prompt, 高亮变化部分
  │
  └── traceReplayRetry(runId, nodeId): ReplayRetryTrace
        → 返回: 指定节点的 replay/retry/fork 历史及各次执行的 outputSnapshot 对比
```

#### 3.23.3 AgentDAGDebugger 调试能力

配合 §3.6 的 DAG 执行模型，提供步骤级调试：

| 能力             | 说明                                                                          |
| ---------------- | ----------------------------------------------------------------------------- |
| **断点设置**     | 在任意 DAG 节点类型上设置断点 (如所有 ToolNode 或某特定 ReasoningNode)        |
| **单步执行**     | 逐节点执行 (Step Over); 进入子 DAG (Step Into, 用于委派链钻入)                |
| **Prompt 审查**  | 在 ReasoningNode 断点处查看完整 Prompt 内容 + LLM 原始响应                    |
| **黑板审查**     | 在任意节点查看当前 DAG 黑板状态 (变量、累计 token、工具结果)                  |
| **Replay/Retry** | 选择某历史 ReasoningNode → replay(确定性重放) 或 retry(重新调用 LLM)          |
| **Fork**         | 从指定节点创建新 Run 分支，保留 replay 到分叉点 + 新路径探索                  |
| **条件断点**     | 当黑板中某变量满足条件时暂停 (如 `totalTokens > 5000`)                        |
| **时间线回放**   | 以时间线方式回放整个 DAG 执行过程，观察状态演变（集成 SessionTimelinePlayer） |
| **Prompt Diff**  | 对比相邻 ReasoningNode 的 Prompt 差异，定位上下文变化                         |
| **委派链钻入**   | 从 delegate_task 工具调用节点直接钻入子任务的 DAG 执行，支持跨层级调试        |

#### 3.23.4 基线测试框架

基线测试验证 Agent 系统在**已知输入**下产生**可接受输出**，防止代码变更或 Prompt 修改导致行为退化。

**测试层级**:

```
┌─────────────────────────────────────────────────────────┐
│ L1: 单元测试 (Deterministic)                              │
│   · Tool 行为正确性                                       │
│   · CostController 阈值计算                               │
│   · ReBAC 默认行为回退逻辑                                │
│   · Memory 评分公式 (含 goldenWeight 动态计算)            │
│   · Gateway 优先级队列排序                                │
│   · Overlay 缓存命中/失效 (Isolation Mode only)           │
│   · OCC entity version 校验 (Audit Mode)                  │
│   · ModuleComposer 模块加载/组合逻辑                      │
│   · ReasoningNode replay 确定性验证                       │
│   · HITLConfigValidator 规则验证                          │
│   · SecurityGuard 拦截规则                                │
│   · goldenWeight 计算: actorRoleWeight × signalTypeWeight │
│   · NormsBoardEngine CRUD + 状态流转                      │
│   · AcceptanceGate checker 组合逻辑                       │
│   · AcceptanceGate 阈值判定 (PASS/FAIL/PARTIAL)          │
│   · KnowledgeHealthMonitor 评分算法                       │
│   · healthPenalty 计算 (derivativeHealthScore)            │
│   · delegate_task 深度限制校验                            │
│   · compose_team TTL 计算与成员权限校验                   │
│   · HITLHub 优先级队列排序与 SLA 计算                     │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ L2: 集成测试 (Semi-deterministic, Mock LLM)               │
│   · Agent DAG 执行流: 给定 Mock LLM 响应序列 →            │
│     验证 DAG 节点执行顺序、工具调用、黑板最终状态          │
│   · Scheduler 触发 → Session 创建 → 结果验证               │
│   · Mail 投递 → 接收者 DAG 中可调用 checkMail (协议消息自动解析)  │
│   · ChangeSet 创建 → Audit Mode 事后审核 / Isolation       │
│     Mode merge/abandon                                     │
│   · HITL 超时 → 升级/取消流程                              │
│   · HITL 策略模板预设行为验证                              │
│   · 记忆冲突 merge 流程                                    │
│   · 高权重记忆保护: Agent 无法覆盖 goldenWeight>=1.5 记忆  │
│   · 副作用 Journal replay/cancel/compensate 流程           │
│   · replay(runId, fromNode, toNode) 确定性 + retry 分歧    │
│   · 任务粒度调整: Coordinator 的 coalescing 启发式          │
│   · 热启动学习流程: warm_start_learn → 记忆创建            │
│   · SecurityGuard 全链路权限拦截                           │
│   · NormsBoard 条目注入 slot #15 正确性                    │
│   · Agent propose_norm → 人类审批 → ACTIVE 条目            │
│   · AcceptanceGate 验收流程: finish → check → PASS/FAIL    │
│     → FAIL 时 InjectFeedback 正确注入                      │
│   · AcceptanceGate maxRetries 耗尽 → PARTIAL 标记          │
│   · KnowledgeHealth 健康度 < 0.3 → 黄金记忆降级           │
│   · Memory-NormsBoard 边界: NORM 类型不可写入 Memory       │
│   · Pipeline with Feedback 有限退出: teamCycleCount 递增      │
│     → maxTeamCycles 耗尽 → ESCALATE 到人类               │
│   · delegate_task WAIT 模式: 父任务等待子任务完成           │
│   · delegate_task FIRE_AND_CHECK 模式: 父任务继续执行       │
│   · compose_team 生命周期: 创建→执行→TTL到期→解散          │
│   · 委派链深度限制: maxDelegationDepth 超限时拒绝          │
│   · HITLHub 三级分类路由 + SLA 超时升级                    │
│   · 上下文按需获取: search_memory 工具正确检索              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ L3: 基线测试 (Non-deterministic, Real LLM)                │
│   · 给定翻译场景 fixture → 执行完整 Agent →                │
│     用评分函数验证输出质量在可接受范围                      │
│   · 对比基线快照: 输出质量不得低于基线 N% 以上              │
│   · 成本消耗不得超过基线 M% 以上                           │
└─────────────────────────────────────────────────────────┘
```

**基线测试 Fixtures 设计**:

| Fixture 类型                    | 内容                                                  | 测试目标                                   |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| 干扰术语                        | 包含易混淆术语的源文本 + 预置术语库                   | Agent 是否正确查阅和应用术语               |
| 真实记忆                        | 包含正确上下文记忆的 Memory 预填充                    | Agent 是否正确利用记忆辅助翻译             |
| 虚假记忆                        | 包含过时/错误记忆的 Memory 预填充                     | Agent 是否被错误记忆误导                   |
| 高权重记忆优先                  | 高权重记忆与低权重 Agent 记忆矛盾                     | Agent 是否优先遵循高权重记忆               |
| 规范板遵循                      | 项目规范板含明确翻译规范                              | Agent 是否在翻译中遵循规范板规则           |
| 多语言切换                      | 翻译任务含多种语言段落                                | Agent 是否正确检测和处理语言边界           |
| 预算压力                        | 设置极低预算阈值                                      | CostController 降级是否正常生效            |
| HITL 超时                       | 设置 HITL 调用后立即超时                              | 超时处理和级联保护是否正确                 |
| 多 Agent 协作                   | Team 场景: 翻译→审校→终审                             | Issue/PR 流转、Mail 通信、合并结果         |
| 分支冲突                        | Isolation Mode 两 Agent 写同一 Segment                | VCS 冲突检测、自动合并、人工仲裁           |
| 记忆冲突                        | Isolation Mode 两分支改同一 PROJECT 记忆              | 记忆 merge 策略正确性                      |
| OCC 冲突                        | Audit Mode 两 Agent 并发写同一实体                    | OCC 版本冲突检测和 Agent 重读决策          |
| 批量翻译                        | 单文档 1000 条目的 coalescing 场景                    | Coordinator 是否正确合并为单会话           |
| 热启动                          | 项目已有 500 条双语翻译 + 术语库                      | 热启动学习是否正确提取风格基线             |
| Prompt 注入                     | 包含恶意提示注入的翻译源文本                          | SecurityGuard 是否正确拦截                 |
| 验收失败重试                    | 设置 AcceptanceGate 第一次 FAIL + 正确反馈            | Agent 是否根据 feedback 改进并最终 PASS    |
| 知识健康异常                    | 预填充高 goldenWeight 记忆但 derivativeHealth 极低    | KnowledgeHealthMonitor 是否触发降级/预警   |
| Pipeline with Feedback 退出循环 | 设置 maxTeamCycles=2 后 Reviewer 始终 REQUEST_CHANGES | teamCycleCount 到达上限后是否正确 ESCALATE |
| 多级委派链                      | 设置 maxDelegationDepth=3 的三级委派场景              | 委派链创建/执行/结果收集/ChangeSet 合并    |
| 动态 Team 生命周期              | compose_team 创建→执行→TTL 到期→强制解散              | TTL 强制执行、未完任务升级、资源回收       |
| 上下文按需获取                  | 移除自动注入后 Agent 通过工具主动检索上下文           | search_memory/search_norms 检索正确性      |

**质量评分函数**:

```
baselineScore(output, reference) → {
  bleu: number,                // BLEU 分数
  terminology: number,         // 术语一致性 (命中率)
  memoryUsage: number,         // 相关记忆利用率
  goldenUsage: number,         // 高权重记忆利用率 (加权命中率)
  normsCompliance: number,     // 规范板规则遵循率
  acceptancePassRate: number,  // 验收通过率
  knowledgeHealthScore: number,// 知识健康度
  toolEfficiency: number,      // 工具调用次数 vs 基线
  costEfficiency: number,      // token 消耗 vs 基线
  overall: number              // 加权综合分
}
```

基线快照存储在 `test-fixtures/agent-baseline/` 目录，每次发布前运行 L3 测试，与快照对比。快照更新需人工审核，防止无意间降低基线。

**场景回放**: 利用 OTel traces 录制真实执行过程，提取 LLM 请求/响应序列作为 Mock 数据，在 L2 层级回放验证。当 Agent 代码或 Prompt 变更后，回放验证行为未偏移。
