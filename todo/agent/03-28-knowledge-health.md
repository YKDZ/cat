### 3.28 知识健康监测子系统 (KnowledgeHealthMonitor)

> **回应补充关切 3**: "高优先级的记忆或规则板规则会被反复采取……如果这些黄金标准出现了错误……是否有纠偏机制？" 知识健康监测子系统追踪知识的**衍生品表现**，当高权重知识的衍生翻译频繁被拒绝/修改/弃用时，主动触发健康预警和自动降级。

#### 3.28.1 问题说明（马太效应与知识僵化）

goldenWeight 机制 (§3.13) 通过高权重保护确保高质量知识不被轻易覆盖。但这引入了**马太效应**风险：

1. **强者愈强**: 高 goldenWeight 的记忆被更频繁检索（通过 search_memory 工具），产生更多衍生翻译，这些翻译又可能进一步强化原始记忆的权重
2. **错误放大**: 若高权重记忆本身包含错误（如过时的术语偏好、不适用于新场景的风格规则），错误会**系统性传播**到所有使用该记忆的翻译中
3. **纠偏困难**: goldenWeight >= 1.5 的记忆受 §3.13.9 写保护, Agent 无法自行修正，人类若未注意到则错误持续
4. **规范板类似风险**: ACTIVE 状态的规范条目同样可能包含不适当的规则，但其影响更广（所有通过 search_norms 检索到该规范的 Agent 都会受影响）

**知识健康监测子系统**通过追踪知识产出链的**下游表现**来检测上游知识的健康度——如果一条高权重记忆的衍生翻译频繁被审校拒绝，说明这条记忆可能有问题。

#### 3.28.2 衍生品溯源模型

为追踪知识的下游影响，需建立**知识→衍生品**的溯源关系：

```
knowledge_derivative
  ├── id: UUID
  ├── sourceType: "memory" | "norm"        -- 知识来源类型
  ├── sourceId: UUID                       -- agent_memory.id 或 norms_board_entry.id
  ├── derivativeType: "translation" | "terminology_decision" | "review_verdict"
  ├── derivativeId: string                 -- 衍生产物标识 (segmentId / termId / reviewId)
  ├── sessionId: FK → agent_session        -- 产生衍生的 Session
  ├── dagNodeId: string                    -- 产生衍生的 DAG 节点
  ├── retrievalMethod: "search_memory" | "search_norms" | "auto_inject"
  │     -- 记录知识是通过哪种方式被 Agent 获取的（按需检索 vs 自动注入）
  ├── outcome: "accepted" | "rejected" | "modified" | "abandoned" | "pending"
  │     accepted:  翻译通过审校不变
  │     rejected:  翻译被审校拒绝
  │     modified:  翻译被审校修改后接受
  │     abandoned: 翻译被直接废弃/重做
  │     pending:   尚未审校
  ├── outcomeAt: timestamp?
  └── createdAt
```

**溯源数据采集**: Agent 调用 `search_memory` / `search_norms` 工具时，ToolNode 自动记录返回的具体 Memory ID 和 NormsBoard ID，作为 DAG 节点 metadata 的一部分。当该节点产出翻译后，`knowledge_derivative` 记录被创建。后续审校结果通过 Issue/PR 状态变化事件回填 `outcome`。

#### 3.28.3 健康度评分算法

KnowledgeHealthMonitor 为每条参与衍生的知识计算 `derivativeHealthScore`:

```
derivativeHealthScore(sourceId) → number (0.0 - 1.0)

输入: 该知识源的所有衍生品及其 outcome
计算:
  1. 收集最近 N 天内的衍生品 (默认 N=30)
  2. 排除 outcome=pending 的条目
  3. 计算各 outcome 的加权得分:
     - accepted:  +1.0
     - modified:  +0.5  (部分价值)
     - rejected:  -0.5  (负面信号)
     - abandoned: -1.0  (强烈负面信号)
  4. healthScore = clamp(
       (Σ outcomeScore × recencyWeight) / count,
       0.0, 1.0
     )
     recencyWeight: 越近的衍生品权重越高 (指数衰减, halfLife=7d)
  5. 衍生品数量不足 (< minSamples, 默认 5) 时:
     healthScore = 0.8  (信心不足, 给予中性偏正评分)
```

- **✅ Decision D35: KnowledgeHealth 评分算法** → 时间加权比率 (B)，指数衰减 halfLife=7d。在实现简洁性和时间敏感性之间取得最佳平衡，参数含义直观。

**评分特征**:

- **时间敏感**: 近期的拒绝比远期的拒绝影响更大（捕捉"知识已过时"的信号）
- **最小样本量**: 衍生品不足时不轻易判定为不健康（避免冷启动误判）
- **比率无偏**: 会被频繁检索的高权重知识天然有更多衍生品，但 healthScore 是**比率**而非绝对数量，不存在偏差

#### 3.28.4 健康度阈值与联动

`derivativeHealthScore` 写入 `agent_memory.derivativeHealthScore` 字段 (§3.13.2)，并触发以下联动：

| 健康度区间 | 系统行为                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| 0.8 - 1.0  | 正常，无额外操作                                                                                            |
| 0.5 - 0.8  | 注意: healthPenalty = 1.0 (无惩罚)，但 KnowledgeHealthDashboard 标记为黄色                                  |
| 0.3 - 0.5  | 警告: healthPenalty = derivativeHealthScore (§3.13.4)；search_memory 结果降权；WARNING 事件；通知管理员     |
| 0.0 - 0.3  | 严重: 上述所有 + **goldenWeight >= 1.5 的记忆失去 decay 免疫** (§3.13.8)；触发自动降级通知 (§3.13.9 Rule 5) |

**对 NormsBoard 条目的监测**: 规范板条目同样参与衍生品追踪。当 ACTIVE 规范的 derivativeHealthScore 低于 0.5 时，系统向 project_admin 发送通知:

```
⚠️ 规范条目 "[术语] API 翻译规范" 的衍生翻译健康度下降至 0.42
  · 最近 30 天: 12 条衍生翻译, 其中 5 条被审校拒绝
  · 建议操作: 审查该规范是否需要更新或归档
  · [查看详情] [归档规范] [忽略]
```

#### 3.28.5 KnowledgeHealthMonitor 服务

```
KnowledgeHealthMonitor
  ├── recordDerivative(sourceType, sourceId, derivative): void
  │     → 创建 knowledge_derivative 记录
  │     → 由 ToolNode 在 search_memory/search_norms 返回结果时自动调用
  │
  ├── updateOutcome(derivativeId, outcome): void
  │     → 审校结果回填
  │     → 触发: Issue/PR 状态变更事件 (CLOSED = accepted, reopened = rejected)
  │     → 触发增量重算 healthScore
  │
  ├── computeHealthScore(sourceType, sourceId): number
  │     → 执行 §3.28.3 算法
  │     → 写入 agent_memory.derivativeHealthScore 或缓存 (NormsBoard 条目用 Redis)
  │
  ├── runHealthAudit(projectId?): HealthAuditReport
  │     → 批量扫描项目内所有活跃知识源的健康度
  │     → 返回: 按健康度排序的知识列表 + 异常知识预警
  │     → 由 Scheduler 定时触发 (每日) 或管理员手动触发
  │
  └── getHealthDashboard(projectId): HealthDashboardData
        → 返回: 健康度分布直方图, Top-10 不健康知识, 趋势曲线
        → 供 KnowledgeHealthDashboard 组件使用
```

#### 3.28.6 Prompt 层集成

KnowledgeHealthMonitor 通过以下路径影响 Agent 的知识获取:

1. **search_memory 结果降权**: Agent 调用 search_memory 时，healthPenalty 作为乘法因子降低不健康记忆的有效 goldenWeight，使其在搜索结果排序中排名下降
2. **search_norms 无直接影响**: 规范板条目的检索不受 healthScore 影响（ACTIVE 规范始终可检索）——对不健康规范的处理走人类审批路径而非自动降级
3. **自动注入兼容**: 若使用传统自动注入模式（`promptConfig.autoInjectSlots` 包含 slot #12/#14），healthPenalty 同样影响注入排序

#### 3.28.7 与验收闭环的协同

AcceptanceGate (§3.27) 和 KnowledgeHealthMonitor 形成正向反馈:

```
验收 FAIL → 反馈注入 → Agent 修改翻译 → 新翻译通过
  │                                        │
  │  原始翻译基于高权重记忆 A               │  修改后翻译可能不再依赖记忆 A
  │                                        │
  ▼                                        ▼
knowledge_derivative(A, rejected)     knowledge_derivative(A, modified)
  │
  ▼
记忆 A 的 derivativeHealthScore 下降
  │
  ▼ (若 < 0.3)
记忆 A 失去 decay 免疫 → 自动降级通知
```

这一协同确保: 若某条高权重记忆引导 Agent 产出的翻译频繁无法通过验收，该记忆会被**自动标记为不健康**，最终由人类决定修正或归档。

#### 3.28.8 Memory-NormsBoard 边界执行

- **✅ Decision D36: Memory-NormsBoard 边界强制方式** → 数据库约束 (B): agent_memory 表移除 NORM 枚举值，写入时 CHECK 约束拒绝。由于系统尚未实现，不存在迁移成本。

