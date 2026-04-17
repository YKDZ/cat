### 3.27 任务验收闭环子系统 (TaskAcceptanceGate)

> **回应补充关切 1**: "如何让 agent 确定自己的任务……真的**足量**且**高质量**地完成了？" 验收闭环子系统为每个任务定义可计算的验收标准，在 Agent 宣称完成时自动执行多维度验收检查，拒绝不达标的产出。

#### 3.27.0 纯程序化原则

AcceptanceGate 是**高度确定性和程序化**的子系统，不包含概率性判断（那是 LLM 的智能范畴）。所有 checker 均为确定性规则引擎或可计算函数，不包含 LLM 调用。

需要 LLM 参与的质量评审（如翻译流畅度、风格一致性等涉及主观判断的维度）通过 **Team Pipeline with Feedback 模式** (§3.9 模式 4) 实现——由独立的 Reviewer Agent 根据提示词引导对 Producer 的工作质量做评价并反馈，而非由验收系统直接调用 LLM。

这一分离确保：

- **验收系统**: 确定性 · 可审计 · 零成本 · 结果完全可解释
- **质量评审**: LLM 智能 · Team 协作 · 通用 Team 会话终止机制保障 (§3.9.1 teamCycleCount/maxTeamCycles)

#### 3.27.1 问题说明

Agent 系统中，Agent 通过 `pr_update(status=REVIEW)` 宣称任务完成。但这一宣称**完全依赖 LLM 自我判断**，存在以下风险：

1. **遗漏**: Agent 只翻译了部分段落即宣称完成（尤其在批处理 batchSize > 1 时）
2. **低质量通过**: Agent 产出的翻译质量不达标，但 LLM 缺乏客观评判能力
3. **规范违反**: 翻译结果违反规范板 (§3.26) 中的显式规则
4. **术语不一致**: 未正确应用术语库中的术语映射

验收闭环子系统在 Agent finish 节点与实际状态变更之间插入一道**可计算的质量关卡**。

#### 3.27.2 架构位置

AcceptanceGate 集成在 AgentRuntime (§3.6) 的 Decision Node 中：

```
                        Agent DAG 执行
                              │
                    ┌─────────▼─────────┐
                    │ Decision Node: d1  │
                    │  action = "finish" │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼──────────────┐
                    │  AcceptanceGate         │
                    │  (纯程序化验收关卡)      │
                    │                        │
                    │  1. 获取验收标准        │
                    │  2. 逐项执行 checker    │
                    │  3. 汇总判定结果        │
                    └──┬──────┬──────┬───────┘
                       │      │      │
                    PASS   PARTIAL  FAIL
                       │      │      │
                       ▼      ▼      ▼
                    完成状态  人工审   注入反馈
                    变更      核流程   → PreCheck
                                      → 重试
```

#### 3.27.3 验收标准模型

验收标准按**任务类型**定义默认模板，可按项目/Issue 级别覆盖：

```
acceptance_criteria_template
  ├── id: UUID
  ├── taskType: string                     -- 任务类型标识 (如 "translate", "review", "terminology_scan")
  ├── projectId: FK → project?             -- null = 全局默认; 非 null = 项目级覆盖
  ├── checkers: jsonb[]                    -- checker 列表 (见下)
  ├── passPolicy: "all" | "majority" | "weighted"
  │     all:       所有 checker 必须 PASS
  │     majority:  超半数 PASS
  │     weighted:  按权重加权 ≥ threshold (默认 0.8)
  ├── passThreshold: float?                -- weighted 策略时的通过阈值
  ├── maxRetries: int (default 3)          -- FAIL 后最大重试次数
  ├── onMaxRetriesExhausted: "partial" | "escalate" | "block"
  │     partial:   标记为 PARTIAL, 进入人工审核
  │     escalate:  通知 Supervisor / Project Admin
  │     block:     Issue 保持 OPEN 状态, 等待人工介入
  └── createdAt, updatedAt

checker 对象:
  {
    name: string,                          -- checker 标识 (如 "completeness", "qa_check", "terminology_consistency")
    type: "builtin" | "tool",              -- 仅支持确定性 checker 类型 (无 LLM)
    weight: float (default 1.0),           -- weighted 策略时的权重
    config: Record<string, unknown>,       -- checker 特定配置
    required: boolean (default false)      -- true = 此 checker FAIL 则整体 FAIL (无论 passPolicy)
  }
```

> **设计说明**: checker type 仅为 `"builtin" | "tool"`，不包含 `"llm"` 类型。需要 LLM 智能参与的质量评审通过 Team 群体智能完成——Team 可包含 Reviewer Agent 在会话过程中动态评估质量并反馈迭代 (§3.27.10)。AcceptanceGate 执行时，Team 内的质量迭代已经完成。

**内置 checker 类型**:

| checker 名                | type    | 说明                                                                     | 默认配置                                  |
| ------------------------- | ------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `completeness`            | builtin | 检查批处理中所有段落是否已翻译；对比 issue.segmentIds vs 已翻译 ID | `{ "minCompletionRate": 1.0 }`            |
| `qa_check`                | tool    | 调用 QA checker 插件 (已有)，检查拼写/格式/标签一致性                    | `{ "maxErrors": 0, "severity": "error" }` |
| `terminology_consistency` | tool    | 检查术语库中的术语是否正确应用                                           | `{ "minConsistency": 0.95 }`              |
| `norms_compliance`        | tool    | 检查翻译是否遵循规范板 ACTIVE 条目（字符串匹配/正则/规则引擎）           | `{ "categories": ["all"] }`               |
| `bleu_threshold`          | builtin | 当有参考翻译时，检查 BLEU 分数是否达标                                   | `{ "minBleu": 0.5 }`                      |
| `custom`                  | tool    | 调用自定义工具执行检查                                                   | `{ "toolName": "...", "args": {} }`       |

#### 3.27.4 AcceptanceGate 服务

```
AcceptanceGate
  ├── evaluate(sessionId, issueId, agentOutput): AcceptanceResult
  │     0. asyncCheck = checkChangeSetAsyncStatus(sessionId, issueId)
  │        → asyncCheck.status == 'HAS_PENDING' → return { verdict: WAIT, reason: '异步依赖处理中', pendingEntries }
  │        → asyncCheck.status == 'HAS_FAILED'  → return { verdict: FAIL, reason: '异步依赖失败', failedEntries }
  │        → asyncCheck.status == 'ALL_READY'   → 继续
  │     1. criteria = resolveAcceptanceCriteria(issueId)
  │        → Issue 级自定义 > 项目级模板 > 全局默认
  │     2. results = await Promise.all(
  │          criteria.checkers.map(c => runChecker(c, agentOutput))
  │        )
  │     3. verdict = applyPassPolicy(criteria.passPolicy, results)
  │     4. return { verdict: PASS | FAIL | PARTIAL, checkerResults, retryCount }
  │
  ├── runChecker(checker, agentOutput): CheckerResult
  │     → builtin: 内置逻辑执行 (纯计算, 零 LLM 成本)
  │     → tool:    通过 ToolRegistry 调用对应工具 (规则引擎/字符串匹配/外部检查)
  │     → 返回: { name, passed: boolean, score?: number, details: string }
  │
  ├── resolveAcceptanceCriteria(issueId): AcceptanceCriteria
  │     → 优先级: issue.acceptanceCriteria (jsonb) > project template > global default
  │
  └── onFail(sessionId, result: AcceptanceResult): void
        → retryCount < maxRetries:
            注入 feedback 到 DAG PreCheck (§3.6.4.1)
            feedback = { type: "ACCEPTANCE_FAIL", checkerResults, suggestions }
            分类为 URGENT (§3.6 PreCheck 优先级)
            → DAG 重新进入 ReasoningNode 循环
        → retryCount >= maxRetries:
            按 onMaxRetriesExhausted 策略处理
```

#### 3.27.5 与 DAG 执行的集成

AcceptanceGate 在 Decision Node 的 finish 分支中执行（§3.6 已定义集成点）：

```
Decision Node d1 (finish 判断):
  ├── action = "continue"  → 继续 ReasoningNode 循环
  ├── action = "finish"    → AcceptanceGate.evaluate(...)
  │     ├── WAIT  → 异步依赖未就绪 → 注入等待提示 → PreCheck (含异步轮询)
  │     ├── PASS  → DAG 正常结束 → pr_update(REVIEW)
  │     ├── FAIL  → AcceptanceGate.onFail(...)
  │     │           → 注入 feedback → PreCheck → ReasoningNode (重试)
  │     └── PARTIAL → pr_update(PARTIAL) → 通知人类审核
  └── action = "tool_call" → ToolNode 执行
```

**重试时的 Prompt 注入**: AcceptanceGate FAIL 的 feedback 通过 §3.6.4.1 PreCheck 注入机制以 URGENT 优先级注入 Agent 上下文：

```
[PreCheck 注入: ACCEPTANCE_FAIL feedback]
⚠️ 你上一次提交未通过验收检查 (第 2/3 次尝试)：
- ❌ completeness: 仅翻译了 45/50 个段落 (要求 100%)
- ✅ qa_check: 无拼写错误
- ❌ terminology_consistency: "cloud" 在 3 处未翻译为"云" (术语一致性 92%, 要求 ≥ 95%)
请修正以上问题后重新提交。
```

#### 3.27.6 Issue 扩展

Issue 模型新增 `acceptanceCriteria` 字段（§3.7 已定义）：

- `acceptanceCriteria: jsonb?` — Issue 级验收标准覆盖（为 null 时使用项目/全局默认）
- `acceptanceResult: jsonb?` — 最后一次验收结果快照
- `acceptanceRetryCount: int (default 0)` — 当前重试次数

Coordinator 在创建/拆分 Issue 时可为每个 Issue 配置验收标准：

```
Coordinator 任务分解示例:
  issue_create({
    parentIssueId: parentId,
    acceptanceCriteria: {
      checkers: [
        { name: "completeness", type: "builtin", required: true },
        { name: "qa_check", type: "tool", weight: 1.5 },
        { name: "terminology_consistency", type: "tool", weight: 1.2 },
        { name: "norms_compliance", type: "tool", weight: 1.0 },
      ],
      passPolicy: "weighted",
      passThreshold: 0.85,
      maxRetries: 2
    }
  })
```

#### 3.27.7 Agent 自检工具

`run_acceptance_check` 工具（§3.3 已定义）允许 Agent 在正式提交前**主动**执行验收自检：

```
run_acceptance_check(issueId?) → AcceptancePreview
  → 不改变 Issue 状态，仅返回当前输出的验收预检结果
  → Agent 可据此在 finish 前自行修正
  → sideEffectType: "none" (纯检查，无副作用)
```

**Skill 层推荐**: Agent Definition 的 workflow steps (§3.4) 和 Skill steps (§3.5) 已包含"验收自检"步骤，引导 Agent 在 finish 前主动调用该工具。

#### 3.27.8 成本考量

AcceptanceGate 作为纯程序化子系统，计算成本极低：

- **builtin checker**: 零 LLM 成本（纯数据库查询/比较）
- **tool checker**: 低成本（规则引擎、字符串匹配、外部工具调用，均不涉及 LLM）

这是纯程序化设计的核心优势之一——验收检查本身不消耗 LLM 预算，可以在每次 finish 时无成本顾虑地执行。

#### 3.27.9 验收系统纯程序化设计

> **回应用户关切 4**: AcceptanceGate 是**纯程序化守门人**——仅执行确定性、可量化的检查，**不包含任何 Agent/LLM 参与的概率性判断**。

AcceptanceGate 通过 **ToolRegistry** 调用 checker，所有 checker 均为纯函数或确定性规则引擎，不涉及 LLM 调用。

**纯程序化设计的三层含义**:

1. **Checker 层**: 每个 checker 是一个纯函数 `(agentOutput, config) → CheckerResult`，通过 ToolRegistry 注册。不持有对任何 Agent/Team 的引用，不调用 LLM。
2. **Criteria 层**: `acceptance_criteria_template` 只描述"需要通过哪些程序化检查"，不描述"谁来执行检查"。
3. **判定层**: AcceptanceGate 基于 checker 结果按 `passPolicy` 计算最终 PASS/FAIL，整个过程完全确定性。

```
AcceptanceGate 视角 (纯程序化):
  ┌─────────────────────────────────────────┐
  │  AcceptanceGate                         │
  │                                         │
  │  checkers (全部为确定性检查):            │
  │    completeness  ──► builtin 逻辑       │
  │    qa_check      ──► ToolRegistry       │
  │    terminology   ──► ToolRegistry       │
  │    norms_compliance ──► ToolRegistry    │
  │    custom        ──► ToolRegistry       │
  │                                         │
  │  ❌ 不包含: review_verdict              │
  │  ❌ 不包含: 任何 LLM/Agent 调用        │
  │  完全不持有 Agent/Team 引用             │
  └─────────────────────────────────────────┘
```

> **v0.15 变更**: 移除 `review_verdict` checker。概率性质量评审（翻译自然度、风格适配度等）不属于 AcceptanceGate 职责，由 Team 群体智能承担 (§3.27.10)。AcceptanceGate 的判断结果对任何人都是可预测、可复现的。

#### 3.27.10 Reviewer Agent/Team 作为 Team 群体智能

> **回应用户关切 4 (D40 澄清)**: Reviewer Agent/Team **不是** AcceptanceGate 的组成部分。AcceptanceGate 仅执行纯程序化检查 (§3.27.9)。Reviewer Agent/Team 属于 **Team 群体智能**的一部分——它们在会话过程中动态评估翻译质量并反馈给 Team 成员进行迭代。

**定位澄清**:

```
┌──────────────────────────────────────────────────────────────────┐
│ Team 群体智能层 (会话过程中的质量迭代)                            │
│                                                                  │
│   Producer Agent ←→ Reviewer Agent (Team 成员之一)               │
│     翻译产出         动态评估质量、反馈修改建议、判断是否可提交   │
│                                                                  │
│   · Reviewer 是 Team 的任意配置成员，遵循 §3.9 模式 4 Pipeline  │
│     with Feedback 模式                                           │
│   · 评审过程在 Team 会话内完成，通过邮件或 Issue/PR 反馈           │
│   · Reviewer 可以是单个 Agent 也可以是 Agent Team（原则 2）      │
│   · 评审结果写入 changeset_review 表，供追溯使用                 │
│                                                                  │
│   ✅ 职责: 概率性质量判断 (翻译自然度、风格适配度、领域准确性)   │
└──────────────────────────────────────────────────────────────────┘
                        ↓ Producer 认为质量足够后调用 finish
┌──────────────────────────────────────────────────────────────────┐
│ AcceptanceGate 层 (finish 时的程序化守门)                         │
│                                                                  │
│   checkers: completeness, qa_check, terminology, norms, custom   │
│                                                                  │
│   ✅ 职责: 确定性程序化检查 (完整度、术语一致性、规范合规)       │
│   ❌ 不包含: 任何 Agent/LLM 参与的概率性判断                    │
└──────────────────────────────────────────────────────────────────┘
```

**Reviewer 的多种配置方式** (Principle 2 — Agent/Team 同构):

| 配置方式                   | 实现                                                                                     | 适用场景               |
| -------------------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| **单 Reviewer Agent**      | Team 中包含一个 Reviewer 角色 Agent，在 DAG 中与 Producer 交替执行                       | 简单/低风险翻译        |
| **Producer-Reviewer Team** | §3.9 模式 4 (Pipeline with Feedback): Producer + Reviewer 循环，通用终止机制控制迭代次数 | 标准翻译               |
| **多 Reviewer 辩论 Team**  | 多个 Reviewer Agent 各自评审后通过邮件讨论达成共识                                       | 高风险/关键翻译        |
| **动态 Reviewer Team**     | Producer 通过 compose_team (§3.9.2) 临时组建专项 Review Team                             | 遇到专业领域时临时组建 |
| **人类 Reviewer**          | 人类通过 UI 直接参与 Team 的评审流程                                                     | 最终签发               |

**changeset_review 数据模型** (用于追溯，非 AcceptanceGate 输入):

```
changeset_review
  ├── id: UUID
  ├── changesetId: FK → changeset
  ├── reviewerType: "agent" | "team" | "human"
  ├── reviewerId: string           -- Agent ID / Team ID / User ID
  ├── verdict: "APPROVE" | "REQUEST_CHANGES" | "ESCALATE"
  ├── comments: text?              -- 评审意见
  ├── iterationRound: int          -- 第几轮迭代
  └── createdAt
```

> **v0.15 变更**: D40 最终澄清——Reviewer Agent/Team 属于 Team 群体智能，在会话过程中动态判断质量并反馈迭代；AcceptanceGate 不再包含 `review_verdict` checker。两者职责互补但严格分离: Team 群体智能负责概率性质量迭代，AcceptanceGate 负责确定性程序化守门。`changeset_review` 数据模型保留用于追溯和可观测性，但不作为 AcceptanceGate 的输入。

- **✅ Decision D40: Review 子系统定位** → Reviewer Agent/Team 属于 Team 群体智能（会话过程中动态评估质量并反馈迭代），不是 AcceptanceGate 的组件。AcceptanceGate 仅执行纯程序化、确定性检查。

- **✅ Decision D34: AcceptanceGate checker 组合策略** → 按任务类型模板 + Issue 级覆盖 (B)，且验收系统为纯程序化、高度确定性设计，不包含概率性 LLM 判断。LLM 参与的质量评审通过 Team 群体智能中的 Reviewer Agent/Team 承担 (§3.27.10)。
