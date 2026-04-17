### 3.29 Hook System（钩子系统）

> **v0.21 新增** — 受 Claude Code Agent 架构 Hook System 启发，为 CAT Agent System 引入事件驱动的可扩展性机制。

#### 3.29.1 设计动机

CAT 系统在 v0.20 已有 28 个子系统，每个子系统的横切需求（审计日志、成本计量、安全检查、规范合规性检查等）散布在各子系统内部。随着子系统持续增长，横切逻辑的维护成本呈超线性增长：

| 问题               | 现状                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| **扩展侵入性**     | 新增横切需求（如"每次工具调用后记录审计日志"）需要修改 AgentRuntime 核心循环代码  |
| **耦合蔓延**       | SecurityGuard、CostController、Observability 各自在 DAG 循环中硬编码检查点        |
| **插件化阻碍**     | ModuleComposer (§3.12) 能注册工具和 Skill，但无法在运行时注入"在某时机执行某逻辑" |
| **第三方扩展困难** | Phase 4 目标的社区插件市场 (§5) 缺少安全的扩展点机制                              |

**核心思想**：主循环只负责暴露**时机（timing point）**，真正的附加行为交给 hook。Hook 不是主循环的替代品，而是主循环在固定时机对外发出的调用。

#### 3.29.2 核心概念

**三个基础概念**：

```
HookEvent   — 描述"发生了什么"（事件名 + 载荷）
HookResult  — 描述"hook 想做什么"（退出码 + 消息）
HookRunner  — 统一调度入口（主循环只与 runner 交互）
```

**HookEvent**:

```typescript
interface HookEvent<T extends HookEventName = HookEventName> {
  name: T;
  /** 事件发生的上下文 */
  payload: HookEventPayload[T];
  /** 触发时间戳 */
  timestamp: number;
  /** 所属 sessionId */
  sessionId: string;
  /** 所属 agentId */
  agentId: string;
}
```

**HookResult**:

```typescript
interface HookResult {
  /** 0=继续, 1=阻止当前动作, 2=注入补充消息后继续 */
  exitCode: 0 | 1 | 2;
  /** exitCode=1 时的阻止原因 / exitCode=2 时的补充消息 */
  message?: string;
  /** 可选：修改后的 payload（仅 Pre* 事件支持） */
  mutatedPayload?: Record<string, unknown>;
}
```

**退出码语义**:

| 退出码 | 语义     | Pre\* 事件行为                      | Post\* 事件行为             |
| ------ | -------- | ----------------------------------- | --------------------------- |
| `0`    | 继续     | 放行，继续执行                      | 无附加动作                  |
| `1`    | 阻止     | 阻止当前动作，向 LLM 返回阻止原因   | 仅记录（Post 阶段无法回滚） |
| `2`    | 补充消息 | 注入补充消息到 messages，再继续执行 | 追加补充消息到 messages     |

> **设计选择**: 采用统一退出码（0/1/2）而非每种事件独立语义。理由：CAT 是翻译 agent 系统而非通用编码 agent，hook 扩展场景相对聚焦，统一语义降低 hook 开发者的认知负担。后期如需细化，可在 `HookResult` 中增加 `semantics` 字段实现向后兼容。

**HookRunner**:

```typescript
interface HookRunner {
  /** 注册 hook handler */
  register(
    eventName: HookEventName,
    handler: HookHandler,
    options?: HookRegistrationOptions,
  ): void;
  /** 注销 hook handler */
  unregister(eventName: HookEventName, handlerId: string): void;
  /** 执行指定事件的所有 handler */
  run(event: HookEvent): Promise<HookResult>;
}

interface HookRegistrationOptions {
  /** handler 唯一标识 */
  id: string;
  /** 优先级，数值越小越先执行，默认 100 */
  priority?: number;
  /** 来源模块 ID（用于 ModuleComposer 集成） */
  moduleId?: string;
  /** 是否允许阻止（exitCode=1），默认 false */
  canBlock?: boolean;
}
```

#### 3.29.3 事件目录

**核心事件（Phase 0–1 即实现）**:

| 事件名             | 触发时机                        | payload 关键字段                                  | 可阻止 |
| ------------------ | ------------------------------- | ------------------------------------------------- | ------ |
| `SessionStart`     | AgentSession 创建后、首轮推理前 | `{ sessionId, agentId, triggerContext }`          | ✗      |
| `SessionEnd`       | AgentSession 正常/异常结束时    | `{ sessionId, reason, tokenUsage }`               | ✗      |
| `PreToolUse`       | ToolNode 执行工具前             | `{ toolName, args, toolCallId, sessionId }`       | ✓      |
| `PostToolUse`      | ToolNode 执行工具后             | `{ toolName, args, result, duration, tokenCost }` | ✗      |
| `PreReasoningNode` | ReasoningNode 调用 LLM 前       | `{ sessionId, turnIndex, promptTokenEstimate }`   | ✗      |
| `PostDecisionNode` | DecisionNode 做出决策后         | `{ sessionId, decision, turnIndex }`              | ✗      |

**协作事件（Phase 1–2 实现）**:

| 事件名               | 触发时机                          | payload 关键字段                                    | 可阻止 |
| -------------------- | --------------------------------- | --------------------------------------------------- | ------ |
| `DelegationStart`    | delegate_task 工具执行时          | `{ delegatorId, targetRole, mode, chainId, depth }` | ✓      |
| `DelegationComplete` | 被委派任务完成/失败时             | `{ chainId, result, duration }`                     | ✗      |
| `TeamMemberJoin`     | 动态组队 compose_team 添加成员    | `{ teamId, agentId, role }`                         | ✗      |
| `TeamMemberLeave`    | 团队成员退出（TTL 到期/手动移除） | `{ teamId, agentId, reason }`                       | ✗      |
| `MailReceived`       | Agent 收到协议消息                | `{ recipientId, senderId, protocolType, urgency }`  | ✗      |

**治理事件（Phase 2–3 实现）**:

| 事件名                | 触发时机                       | payload 关键字段                           | 可阻止 |
| --------------------- | ------------------------------ | ------------------------------------------ | ------ |
| `AcceptanceEvaluated` | AcceptanceGate 验收完成        | `{ cardId, verdict, checkerResults }`      | ✗      |
| `MemoryCreated`       | create_memory 工具执行后       | `{ memoryId, scope, type, goldenWeight }`  | ✗      |
| `NormProposed`        | propose_norm 工具执行后        | `{ normId, status, proposerId }`           | ✗      |
| `NormActivated`       | NormsBoard 规则从 DRAFT→ACTIVE | `{ normId, activatedBy }`                  | ✗      |
| `BudgetThreshold`     | CostController 预算触达阈值    | `{ budgetId, usagePercent, level }`        | ✗      |
| `HealthScoreChanged`  | KnowledgeHealth 健康度分数变化 | `{ memoryId, oldScore, newScore, reason }` | ✗      |

**实体生命周期事件（Phase 0b 实现，配合 §3.14.11 EntityVCS 异步依赖）**:

| 事件名                        | 触发时机                                                      | payload 关键字段                                                                            | 可阻止 |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| `EntityAsyncDepPending`       | ApplicationMethodRegistry 触发异步依赖任务后                  | `{ entityType, entityId, changesetEntryId, asyncTaskId, estimatedCompletionAt? }`           | ✗      |
| `EntityAsyncDepCompleted`     | 异步依赖任务成功完成（回调 / 轮询确认）                       | `{ entityType, entityId, changesetEntryId, asyncTaskId, resultSummary }`                    | ✗      |
| `EntityAsyncDepFailed`        | 异步依赖任务失败或超时                                        | `{ entityType, entityId, changesetEntryId, asyncTaskId, errorMessage, retryable: boolean }` | ✗      |
| `ChangeSetAsyncStatusChanged` | ChangeSet 聚合异步状态变更 (ALL_READY/HAS_PENDING/HAS_FAILED) | `{ changeSetId, previousStatus, newStatus, pendingCount, failedCount }`                     | ✗      |

> 这些事件均为不可阻止的通知型事件（Post-\*语义），供 CostController 成本核销、Observability 指标采集、Issue/PR 投影更新等下游模块订阅。

> **Principle 11 (LLM 主权不可侵犯) 兼容性**: Pre\* 事件的 `exitCode=1` 阻止权仅限于安全和成本类 hook（通过 `canBlock` 注册选项控制）。普通业务 hook 只能观察（exitCode=0）或补充消息（exitCode=2），不得阻止 LLM 的工具调用意图。

#### 3.29.4 执行模型

**Handler 执行顺序**:

```
HookRunner.run(event):
  1. 收集该事件所有已注册 handler，按 priority 升序排列
  2. 依次执行 handler（串行）:
     - handler 返回 exitCode=0 → 继续下一个 handler
     - handler 返回 exitCode=1 且 canBlock=true → 立即返回阻止结果（短路）
     - handler 返回 exitCode=1 且 canBlock=false → 降级为 exitCode=0 + 日志告警
     - handler 返回 exitCode=2 → 收集 message，继续下一个 handler
  3. 所有 handler 执行完毕：
     - 若有 exitCode=2 的消息 → 合并所有 message，返回 exitCode=2
     - 否则 → 返回 exitCode=0
```

**超时保护**: 单个 handler 执行超过 `hookTimeoutMs`（默认 5000ms）时自动中断，记录超时日志，视为 exitCode=0（不影响主流程）。

**错误隔离**: handler 抛出异常时捕获并记录，视为 exitCode=0。Hook 不得导致主循环崩溃。

```
┌─ AgentRuntime DAG 循环 ─────────────────────────────────────────┐
│                                                                   │
│  ┌─ PreCheck ─┐                                                   │
│  │            │                                                   │
│  └────────────┘                                                   │
│       │                                                           │
│       ▼                                                           │
│  ══ hookRunner.run(PreReasoningNode) ══                           │
│       │                                                           │
│  ┌─ ReasoningNode ─┐                                              │
│  │  buildPrompt()   │                                              │
│  │  LLM.chat()      │                                              │
│  └──────────────────┘                                              │
│       │                                                           │
│       ▼                                                           │
│  ┌─ ToolNode ──────────────────────────────────────────┐          │
│  │  for each tool_call:                                 │          │
│  │    ══ hookRunner.run(PreToolUse) ══                   │          │
│  │    if blocked → return blocked result                 │          │
│  │    execute tool                                       │          │
│  │    ══ hookRunner.run(PostToolUse) ══                   │          │
│  └──────────────────────────────────────────────────────┘          │
│       │                                                           │
│       ▼                                                           │
│  ┌─ DecisionNode ─┐                                               │
│  │  evaluate       │                                               │
│  └─────────────────┘                                               │
│       │                                                           │
│  ══ hookRunner.run(PostDecisionNode) ══                            │
│       │                                                           │
│  continue / finish                                                │
└───────────────────────────────────────────────────────────────────┘
```

#### 3.29.5 与 ModuleComposer 的集成

ModuleComposer (§3.12) 是 CAT 的模块注册中心。Hook 注册作为模块能力的一部分纳入 ModuleComposer 管理：

```typescript
// Module 定义中声明 hooks
const auditModule: ModuleDefinition = {
  id: "audit-logger",
  level: 1, // Level 1: 单功能模块
  hooks: [
    {
      eventName: "PostToolUse",
      handlerId: "audit-tool-log",
      priority: 200,
      canBlock: false,
      handler: async (event) => {
        await auditLog.record(event.payload);
        return { exitCode: 0 };
      },
    },
  ],
  // ... tools, skills 等其他模块能力
};
```

**模块生命周期联动**:

- 模块注册时 → 自动注册其声明的 hook handler
- 模块卸载时 → 自动注销其所有 hook handler
- 模块依赖校验 → hook handler 的 `canBlock` 权限需通过 SecurityGuard 审批

#### 3.29.6 与现有子系统的关系

| 现有子系统           | 当前实现方式             | Hook 化改造方向                                            | 阶段    |
| -------------------- | ------------------------ | ---------------------------------------------------------- | ------- |
| SecurityGuard §3.25  | DAG 循环中硬编码检查     | `PreToolUse` hook (canBlock=true, priority=10)             | Phase 2 |
| CostController §3.22 | DAG 循环中硬编码计量     | `PostToolUse` hook 记录 token、`BudgetThreshold` 事件发出  | Phase 2 |
| Observability §3.19  | 各处散布 log/metric 调用 | `Post*` hook 统一采集指标                                  | Phase 2 |
| AcceptanceGate §3.27 | DecisionNode finish 分支 | `AcceptanceEvaluated` 事件供外部观察（不改变验收流程本身） | Phase 2 |

> **渐进迁移策略**: Hook 系统不要求现有子系统立即迁移。Phase 0–1 中 SecurityGuard 和 CostController 仍在 DAG 循环中硬编码运行；Phase 2 引入 Hook 后，逐步将这些横切逻辑迁移为 hook handler，最终 DAG 循环只保留纯状态推进逻辑。

#### 3.29.7 与错误恢复的协同 _(参见 D51)_

Hook 执行本身的错误恢复策略：

- **handler 超时**: 自动中断 + 告警日志，不影响主流程
- **handler 异常**: 捕获 + 降级为 exitCode=0，不影响主流程
- **handler 持续失败**: 连续 N 次异常后自动禁用该 handler，发出 `HookHandlerDisabled` 内部事件

> **核心原则**: Hook 系统的可靠性设计遵循"旁路不可牵连主路"——任何 hook handler 的故障都不得导致 DAG 主循环异常。

#### 3.29.8 安全约束

- `canBlock=true` 的 handler 仅限 `agentSecurityLevel=trusted` 的模块注册
- hook handler 无法直接修改 AgentSession 状态，只能通过返回值影响主循环
- `mutatedPayload` 仅 Pre\* 事件支持，且受 SecurityGuard 白名单约束
- hook handler 的执行时间和资源消耗纳入 CostController 计量

---

- **✅ Decision D50: Hook 系统执行模型** → 统一退出码 + 串行优先级 (A)

  **选项**:
  - A. 统一退出码 (0/1/2) + 按优先级串行执行 + 短路阻止
  - B. 每事件独立语义 + 并行执行 + 多数表决
  - C. 纯观察模式（仅 exitCode=0），不支持阻止和消息注入

  **选定 A**。理由：
  1. CAT 是翻译 agent 系统，hook 使用场景相对编码 agent 更聚焦，统一语义降低开发者认知负担
  2. 串行执行保证确定性，避免并行 hook 的竞态条件
  3. `canBlock` 显式注册制约束阻止权，平衡安全需求与 LLM 主权 (Principle 11)
  4. 如未来需要更复杂语义，可通过 `HookResult.semantics` 扩展字段向后兼容
