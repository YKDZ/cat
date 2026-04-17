## 5. 分阶段实施路线图

### Phase 0a — Agent 核心运行时最小闭环（约 2–3 周）

**目标**: 单个 Agent 能在 DAG 引导下执行简单翻译任务，Issue/PR 完成基础任务流。本阶段聚焦 Agent 核心循环 (LLM → 推理 → 工具调用 → 决策) 的最小可用实现。

**涉及规划文档**:
[03-01-llm-interface.md](03-01-llm-interface.md) · [03-02-prompt-engine.md](03-02-prompt-engine.md) · [03-03-tool-system.md](03-03-tool-system.md) · [03-04-agent-definition.md](03-04-agent-definition.md) · [03-06-agent-runtime.md](03-06-agent-runtime.md) · [03-07-issue-pr.md](03-07-issue-pr.md) · [03-19-observability.md](03-19-observability.md)

| 类别           | 具体内容                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LLM 接口**   | LLMInterface（§3.1 单 provider）、令牌桶速率限制、优先级队列                                                                                                                                                                                |
| **Prompt**     | PromptEngine 静态注入层 only（slot #1–5, #13）、基本变量插值、无压缩管线、无多模态                                                                                                                                                          |
| **工具系统**   | ToolRegistry 基础框架、translate / search*tm / search_termbase / issue*\* 等核心工具注册、sideEffectType 声明                                                                                                                              |
| **DAG**        | DAG 执行三节点（Reasoning → Tool → Decision）、会话持久化、maxTurns 保护、基础错误处理 (truncation budget only)。引擎采用语义层包装 (✅ D57)，复用 `@cat/graph` + `@cat/workflow` 基础设施，在 `packages/agent` 中实现 Agent 专属节点语义层 |
| **Issue/PR**   | issue CRUD、PR 创建、OPEN/CLOSED 状态机、领取/释放 (issue_claim / issue_release)、batchSize=1 固定、无 DAG 依赖                                                                                                  |
| **Agent 定义** | AgentDefinition MD 解析器 (使用 `gray-matter` 等专用库从 frontmatter 提取结构化配置，body 作 systemPrompt)、重构 `AgentDefinitionSchema` 适配 MD 存储 (✅ D56)、单角色 Translator                                                           |
| **infra**      | 数据库表 agent_session / issue / pull_request (不含 acceptanceCriteria) / tool_call_log；Redis 连接；基本 API 路由                                                                                                                    |
| **可观测性**   | Observability §3.19 中 L01–L05 日志 (agent.run / dag.node / llm.call / tool.execute / error)、M01–M05 基础指标 (tokens / node_count / tool_count / error_rate / throughput)；结构化日志输出                                                 |
| **前端基础**   | 基础聊天界面、IssuePRBoard 任务视图                                                                                                                                                                                                          |
| **出口标准**   | 一条完整的翻译 Issue 从 OPEN → CLOSED 流转通过（单 Agent、无审校、无验收关卡、无 VCS）；DAG 三节点循环执行可观测；maxTurns 保护生效                                                                                                              |

### Phase 0b — EntityVCS 审计基座与增强（约 2–3 周）

**目标**: EntityVCS Audit Mode 提供全实体变更审计，Issue/PR 增加 DAG 依赖，PromptEngine 接入按需获取层和压缩管线。本阶段在 Phase 0a 的基础上补全平台基座能力。

**涉及规划文档**:
[03-02-prompt-engine.md](03-02-prompt-engine.md) · [03-06-agent-runtime.md](03-06-agent-runtime.md) · [03-07-issue-pr.md](03-07-issue-pr.md) · [03-14-changeset-vcs.md](03-14-changeset-vcs.md) · [03-19-observability.md](03-19-observability.md) · [03-20-frontend.md](03-20-frontend.md)

| 类别            | 具体内容                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **EntityVCS**   | §3.14 Audit Mode (Tier 1) 完整实现——全实体 ChangeSet 审计轨迹；changeset / changeset_entry 表；VCS-aware 中间件拦截读写操作；13 种 entityType 的 DiffStrategy 注册；ApplicationMethodRegistry 注册 (§3.14.11)，含异步依赖声明 (AsyncDependencySpec) 和 VectorizedStringApplicationMethod 默认实现；ChangeSet 审核 API；回滚（反向 ChangeSet）；OCC 乐观并发控制；Trust Mode 降级通道 |
| **Prompt 增强** | PromptEngine 按需获取层（slot #12, #14–16 on-demand injection）、压缩管线（5 阶段: truncation → extraction → summarization → dedup → KVCache）                                                                                                                                                                                                                                       |
| **DAG 增强**    | DAG contextOverflow budget 恢复策略                                                                                                                                                                                                                                                                                                                                                  |
| **Issue/PR 增强** | DAG 依赖（dependsOn / blockedBy, FINISH_TO_START / DATA 两种依赖类型）、Issue 粒度启发式 (§3.7.5 batchSize 自动计算)                                                                                                                                                                                                                                                                   |
| **infra**       | 数据库表 changeset / changeset_entry / entity_snapshot；ChangeSet 审核 API 路由                                                                                                                                                                                                                                                                                                      |
| **可观测性**    | VCS 变更指标 (changeset.created.count, changeset_entry.by_type)；L06–L08 日志 (changeset / issue_dep)；M06–M08 指标                                                                                                                                                                                                                                                                 |
| **前端**        | ChangeSetReviewPanel 基础版（分组视图 + 逐条审批）；ChangeSetAuditLog 浏览                                                                                                                                                                                                                                                                                                           |
| **出口标准**    | Phase 0a 的翻译流程所有写操作产生 ChangeSet 审计轨迹；可通过 ChangeSet UI 查看变更历史并执行回滚；OCC 冲突检测生效；按需获取层成功注入上下文；压缩管线在 token 超限时自动触发；TranslatableString 向量化等异步依赖操作正确通过 ApplicationMethodRegistry 管理——ChangeSet entry 的 asyncStatus 生命周期 (PENDING→READY/FAILED) 完整闭环                                               |

### Phase 1 — 多角色协同与团队基础（约 2–3 周）

**目标**: 多 Agent 角色通过 Team 协调与协议化通信完成协同翻译，DAG 和 Issue/PR 增强以支撑多角色场景。

**涉及规划文档**:
[03-02-prompt-engine.md](03-02-prompt-engine.md) · [03-03-tool-system.md](03-03-tool-system.md) · [03-04-agent-definition.md](03-04-agent-definition.md) · [03-06-agent-runtime.md](03-06-agent-runtime.md) · [03-07-issue-pr.md](03-07-issue-pr.md) · [03-09-team.md](03-09-team.md) · [03-10-mail.md](03-10-mail.md) · [03-17-scheduler.md](03-17-scheduler.md) · [03-19-observability.md](03-19-observability.md) · [04-agent-roles.md](04-agent-roles.md)

| 类别             | 具体内容                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **新角色**       | Reviewer、TermManager、Coordinator（AgentDefinition 各自配置）                                                                                           |
| **协作**         | TeamCoordinator §3.9 基础版（Fan-out/Fan-in、依赖触发、per-card acceptanceCriteria 配置、Coordinator 角色澄清）；inter-agent send_mail（协议化通信 D53） |
| **Team 终止**    | 通用 Team 会话终止机制 (§3.9.1) 基础版：teamCycleCount/maxTeamCycles 字段、Pipeline with Feedback 反馈循环退出                                           |
| **DAG 增强**     | Decision Node 的 maxTurns/needsReview 分支、ReasoningNode reflection 机制、WaitingDelegation 状态 (§3.6)                                                 |
| **Issue/PR 增强** | DAG 依赖（dependsOn/blockedBy）、Issue 粒度启发式 §3.7.5（batchSize 自动计算）、allowedAssignees                                                           |
| **Prompt 增强**  | PromptEngine 静态/按需分层 (§3.2.5)；promptConfig.autoInjectSlots 配置（search_memory 等按需工具将在 Phase 2 接入 Memory 后可用）                        |
| **微工作流基础** | PromptEngine slot #4 微工作流效率规则注入 (§3.6.7)、ToolDefinition.batchHint 元数据、Agent 定义模板工具调用效率规则                                      |
| **可观测性**     | M06-M15、L06-L12 指标和日志                                                                                                                              |
| **出口标准**     | 三角色协同翻译→审校→术语统一场景通过；Pipeline with Feedback 反馈循环终止验证；微工作流批量工具调用可观测性验证                                          |

### Phase 2 — 记忆系统、验收与任务分解（约 2–3 周）

**目标**: MemoryStore 提供跨会话知识积累，AcceptanceGate 引入任务质量关卡，基础委派和 Issue 拆分实现任务分解能力。

**涉及规划文档**:
[03-03-tool-system.md](03-03-tool-system.md) · [03-06-agent-runtime.md](03-06-agent-runtime.md) · [03-07-issue-pr.md](03-07-issue-pr.md) · [03-09-team.md](03-09-team.md) · [03-11-subagent.md](03-11-subagent.md) · [03-13-memory.md](03-13-memory.md) · [03-17-scheduler.md](03-17-scheduler.md) · [03-19-observability.md](03-19-observability.md) · [03-27-acceptance-gate.md](03-27-acceptance-gate.md) · [03-29-hook-system.md](03-29-hook-system.md)

| 类别              | 具体内容                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **记忆系统**      | MemoryStore §3.13 完整实现（MemoryRecord CRUD、vector 嵌入、goldenWeight 四因子评分含 healthPenalty、search_memory 按需检索、scope 隔离、capacity 驱逐）                                                 |
| **基础验收**      | AcceptanceGate 基础功能：acceptance_criteria_template 表、completeness + qa_check 两种 checker、Decision Node finish→acceptance 分支、maxAcceptanceRetries、run_acceptance_check 工具                    |
| **基础委派**      | delegate_task 工具 (§3.9.3.1) WAIT 模式、单层委派 (maxDelegationDepth=1)、DelegationTrigger (§3.17)                                                                                                      |
| **死锁预防基础**  | WaitGraphService 在线环检测 (§3.9.4)：delegate_task WAIT 模式建立等待边前执行环检测，检出时降级为 FIRE_AND_CHECK                                                                                         |
| **Issue 拆分**    | issue_create(parentIssueId) (§3.9.3.2) 基础功能：SUSPEND_PARENT 模式、splitGroupId 聚合追溯、子 Issue 自动完成检测                                                                                                      |
| **Hook 系统基础** | HookRunner 核心实现 (§3.29)、SessionStart/SessionEnd/PreToolUse/PostToolUse/PreReasoningNode/PostDecisionNode 六个核心事件、统一退出码 (0/1/2)、超时保护与错误隔离、基础可观测性 (M42-M43 hook 执行指标) |
| **Issue/PR 增强** | acceptanceCriteria JSON 字段、delegationChainId/delegationDepth 字段、parentIssueId/splitGroupId 字段                                                                                                  |
| **可观测性**      | M28-M29 验收相关指标；M32-M33 委派链指标；M42-M43 hook 执行指标                                                                                                                                          |
| **出口标准**      | 记忆跨会话复用验证；验收 PASS/FAIL 路径均通过；单层 delegate_task 委派场景通过；Issue 拆分基础场景通过；WAIT 模式死锁环检测降级验证；Hook 系统基础事件触发验证                                      |

### Phase 3 — NormsBoard、安全强化与 VCS 隔离（约 2–3 周）

**目标**: NormsBoard 提供项目级翻译规范治理，SecurityGuard 完成安全强化，EntityVCS 升级至 Isolation Mode 提供完整分支隔离能力。

**涉及规划文档**:
[03-09-team.md](03-09-team.md) · [03-11-subagent.md](03-11-subagent.md) · [03-14-changeset-vcs.md](03-14-changeset-vcs.md) · [03-17-scheduler.md](03-17-scheduler.md) · [03-19-observability.md](03-19-observability.md) · [03-20-frontend.md](03-20-frontend.md) · [03-22-cost-control.md](03-22-cost-control.md) · [03-25-security.md](03-25-security.md) · [03-26-norms-board.md](03-26-norms-board.md) · [03-27-acceptance-gate.md](03-27-acceptance-gate.md) · [03-29-hook-system.md](03-29-hook-system.md)

| 类别               | 具体内容                                                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NormsBoard**     | §3.26 完整实现（规则 CRUD、DRAFT→ACTIVE 生命周期、hitCount/adoptionRate 统计、search_norms 按需获取）；§3.26.7 独立数据源边界 — NormsBoard 与 Memory 无自动同步                                                                                             |
| **EntityVCS 高级** | §3.14 Isolation Mode (Tier 2) 完整实现——工作分支、分支视图 overlay、Rebase、三方合并 UI、DiffStrategy 冲突解决、delegationChainId 追踪、splitGroupId 追踪、异构实体变更集可视化 (§3.14.10 分组/时间线/文档/冲突/影响五种视图)、PRVCSProjection 单向投影 |
| **安全**           | SecurityGuard §3.25 完整实现（权限检查、速率限制、敏感内容过滤、验收标准保护、DelegCheck 委派链安全检查）                                                                                                                                                   |
| **委派增强**       | delegate_task FIRE_AND_CHECK 模式、多层委派 (maxDelegationDepth 可配置)、委派链预算控制 (§3.22)                                                                                                                                                             |
| **死锁检测完整**   | WaitGraphService 离线全图巡检 (§3.9.4)：SchedulerService DeadlockDetector 定时扫描、HITL 死锁告警通知、M38-M39 死锁相关指标                                                                                                                                 |
| **Issue 拆分增强** | issue_create PARALLEL_PARENT 模式、聚合追溯双视图 (统一+逐 Issue)、IssueSplitAggregationView/IssueSplitTree UI 组件                                                                                                                                                 |
| **验收增强**       | 新增 checker 类型：terminology_consistency、norms_compliance、bleu_threshold；AcceptanceGate 纯程序化设计 (§3.27.9)                                                                                                                                         |
| **可观测性**       | M16-M25 全量指标、L13-L20 全量日志；M34-M37 动态组队/HITLHub 指标；L21-L25 全量日志                                                                                                                                                                         |
| **出口标准**       | NormsBoard 与 Memory 边界隔离验证；Isolation Mode 分支→合并→冲突解决全流程通过；异构实体变更集可视化五种视图验证；多层委派场景通过；Issue 拆分聚合追溯双视图验证；norms_compliance checker 验收场景通过                                                       |

### Phase 4 — 热启动、知识健康、模块化与动态组队（约 2–3 周）

**目标**: 项目间知识复用（热启动 + 知识健康追踪），ModuleComposer 提供渐进式能力组装，动态组队实现按需团队组建。

**涉及规划文档**:
[03-09-team.md](03-09-team.md) · [03-12-timeline.md](03-12-timeline.md) · [03-13-memory.md](03-13-memory.md) · [03-17-scheduler.md](03-17-scheduler.md) · [03-18-task-executor.md](03-18-task-executor.md) · [03-19-observability.md](03-19-observability.md) · [03-20-frontend.md](03-20-frontend.md) · [03-22-cost-control.md](03-22-cost-control.md) · [03-24-warm-start.md](03-24-warm-start.md) · [03-27-acceptance-gate.md](03-27-acceptance-gate.md) · [03-28-knowledge-health.md](03-28-knowledge-health.md) · [03-29-hook-system.md](03-29-hook-system.md) · [04-agent-roles.md](04-agent-roles.md)

| 类别              | 具体内容                                                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **热启动**        | WarmStartService §3.24 完整实现（多阶段学习、进度跟踪、HITL 门控、NormsBoard 转化路径）                                                                                                                                                                                                   |
| **知识健康追踪**  | knowledge_derivative 表、KnowledgeHealthMonitor §3.28 核心功能（recordDerivative/updateOutcome/computeHealthScore）、MemoryStore healthPenalty 联动、前端 KnowledgeHealthDashboard 基础版                                                                                                 |
| **模块化**        | ModuleComposer §3.12 完整实现（Level 1-3 模块注册 + 组装 + 验证、DAG hook 套用）；AcceptanceGateModule 作为 Level 2 模块                                                                                                                                                                  |
| **动态组队**      | compose_team 工具 (§3.9.2) 完整实现、DynamicTeam 生命周期管理、TTLEnforcer (§3.17)、DynamicTeamExecutor (§3.18)                                                                                                                                                                           |
| **Hook 系统完整** | 协作事件 (DelegationStart/Complete、TeamMemberJoin/Leave、MailReceived)；治理事件 (AcceptanceEvaluated、MemoryCreated、NormProposed/Activated、BudgetThreshold、HealthScoreChanged)；SecurityGuard/CostController/Observability 横切逻辑迁移为 hook handler；ModuleComposer hook 注册集成 |
| **验收联动**      | AcceptanceGate 与 KnowledgeHealthMonitor 反馈回路                                                                                                                                                                                                                                         |
| **新角色**        | WarmStartAgent、QAAnalyst（AgentDefinition 配置）                                                                                                                                                                                                                                         |
| **可观测性**      | M30-M31 知识健康指标                                                                                                                                                                                                                                                                      |
| **出口标准**      | 热启动 → 新项目复用历史知识完整场景通过；Level 3 模块组装端到端验证；动态组队创建→执行→解散全生命周期验证；知识健康追踪 + healthPenalty Memory 联动验证；Hook 系统协作+治理事件全触发验证                                                                                                 |

### Phase 5 — 高级治理与自适应（约 3–4 周）

**目标**: 完善治理能力，知识健康自愈闭环，自适应调度，HITLHub 统一面板。

**涉及规划文档**:
[03-09-team.md](03-09-team.md) · [03-12-timeline.md](03-12-timeline.md) · [03-13-memory.md](03-13-memory.md) · [03-15-hitl.md](03-15-hitl.md) · [03-16-permission.md](03-16-permission.md) · [03-17-scheduler.md](03-17-scheduler.md) · [03-19-observability.md](03-19-observability.md) · [03-20-frontend.md](03-20-frontend.md) · [03-21-responsibility.md](03-21-responsibility.md) · [03-22-cost-control.md](03-22-cost-control.md) · [03-26-norms-board.md](03-26-norms-board.md) · [03-27-acceptance-gate.md](03-27-acceptance-gate.md) · [03-28-knowledge-health.md](03-28-knowledge-health.md) · [03-29-hook-system.md](03-29-hook-system.md) · [04-agent-roles.md](04-agent-roles.md)

| 类别              | 具体内容                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **治理**          | GovernanceAgent；CostController §3.22 完整实现（预算/速率/计费 + 二级上报 + 委派链预算级别）；Responsibility §3.21 全量错误兜底（含委派链失败）                                                                                |
| **知识自愈**      | KnowledgeHealthMonitor §3.28 runHealthAudit 定时巡检、Rule 5 Health-driven demotion（goldenWeight 自动下调）、NormsBoard hitRate≤阈值告警、前端告警面板                                                                        |
| **验收高级**      | custom checker（脚本扩展）；项目级验收模板继承/覆盖；验收通过率统计与趋势图；Reviewer Agent/Team 群体智能 (§3.27.10) \_review 追溯模型                                                                                         |
| **Hook 治理**     | Hook handler 运行时监控面板；canBlock 权限审计；hook 执行延迟告警；自动禁用持续异常的 handler；hook 相关 M42-M45 全量可观测性指标                                                                                              |
| **Team 终止高级** | 通用 Team 会话终止机制 (§3.9.1) 完整实现：所有 5 种 Team 模式的终止语义、terminationPolicy 完整配置、branchFailPolicy、全模式超时保护                                                                                          |
| **调度增强**      | SchedulerService §3.17 完整规则（触发器组合、冷却期、优先级）、定时触发器（NormsBoard 巡检 + 知识健康巡检 + DynamicTeam TTL 强制）                                                                                             |
| **HITLHub**       | §3.15.3 三层分类完整实现；§3.15.4 HITLHub 统一面板（hitl_request 模型、优先级排序、分类聚合视图）；审批队列 UI                                                                                                                 |
| **权限**          | Permissions §3.16 ReBAC 全量实现（角色模板、project scope 隔离、AcceptanceCriteria 对象类型、DynamicTeam 主体、delegator 关系）                                                                                                |
| **可视化**        | §3.20 全量组件（SessionTimelinePlayer 实时直播模式 §3.20.1、AcceptanceResultView、AcceptanceCriteriaEditor、KnowledgeHealthDashboard 完整版、DynamicTeamManager、DelegationChainView、IssueSplitAggregationView、HITLHubPanel） |
| **出口标准**      | 成本超限 → 自动暂停 → 管理者批准 → 恢复 全流程通过；知识健康巡检 → 低分 memory 自动降权 → 验证翻译质量不受马太效应影响；HITLHub 全流程验证；SessionTimelinePlayer 实时直播端到端验证；通用 Team 终止机制全模式验证             |

### Phase 6 — 生态扩展与优化（持续）

**目标**: 平台级扩展能力、跨项目智能化、社区生态。

**涉及规划文档**:
[03-06-agent-runtime.md](03-06-agent-runtime.md) · [03-07-issue-pr.md](03-07-issue-pr.md) · [03-12-timeline.md](03-12-timeline.md) · [03-13-memory.md](03-13-memory.md)

| 类别               | 具体内容                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Level 4-5 模块** | ModuleComposer Level 4（插件内多模块协同） + Level 5（社区插件市场）                                       |
| **跨项目智能化**   | 跨项目知识图谱分析、智能项目模板推荐、自适应验收阈值                                                       |
| **性能优化**       | Memory 向量检索优化（IVFFlat→HNSW）、大批量 Issue 调度优化、DAG 并行分支执行                                  |
| **社区生态**       | 自定义 FileHandler 插件、自定义 LLM Provider 插件、自定义 checker 插件、社区规范包市场、社区 Hook 插件市场 |
| **出口标准**       | 社区插件可独立开发和分发；跨项目健康数据支撑组织级质量面板                                                 |
