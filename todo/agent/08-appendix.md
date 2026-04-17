## 8. 附录 A — C4 Container 级上下文图

```mermaid
C4Context
    title CAT Agent System — Container Diagram (v0.31)

    Person(admin, "管理者 / PM", "配置项目、审批 HITL、管理验收标准、审批委派/组队、配置图片传递策略")
    Person(translator, "人类译员", "协同翻译、审校、知识贡献、HITLHub 响应")

    System_Boundary(cat, "CAT Platform") {
        Container(ui, "Web UI (Vue 3 + Vike SSR)", "浏览器",
            "IssuePRBoard · MemoryInspector · NormsBoardPanel\nSessionTimelinePlayer (回放+实时直播双模式) · AcceptanceResultView\nAcceptanceCriteriaEditor · KnowledgeHealthDashboard\nHITLHubPanel · DelegationChainView · IssueSplitAggregationView\nDynamicTeamManager · AgentDelegationTree\nImageDeliveryPreferencePanel · DeadlockAlertPanel")

        Container(api, "API Server (Hono + oRPC)", "Node.js",
            "REST/WS API · oRPC · MCP\nSecurityGuard (含 DelegCheck · file_id 上传限额 · 协议消息 payload 校验) · CostController\nWebSocket Gateway (Timeline 实时推送)")

        Container(runtime, "Agent Runtime", "Node.js (进程内)",
            "AgentRuntime (DAG + 批量 tool_calls 微工作流 + ErrorRecoveryBudget) · PromptEngine (静态注入层+按需获取层+slotPolicy+多模态+三策略图片传递+微工作流引导)\nToolRegistry (含 batchHint 亲和性 + ToolExecutionContext 统一接口) · ModuleComposer · TaskExecutor\nSchedulerService (含 DeadlockDetector) · TeamCoordinator (委派+Issue 拆分+动态组队)\n通用 Team 会话终止机制 · AcceptanceGate (纯程序化·无Agent/LLM依赖)\nKnowledgeHealthMonitor · DelegationReplayStore · WaitGraphService\nHookRunner (事件驱动可扩展性·统一退出码)\nProtocol-driven Agent Communication (统一通信协议)")

        Container(memory, "MemoryStore", "Node.js + pgvector",
            "MemoryRecord CRUD · Vector Embedding\ngoldenWeight 评分 (含 healthPenalty)\nScope 隔离 · Capacity 驱逐\nsearch_memory 按需检索接口")

        Container(norms, "NormsBoard", "Node.js + PostgreSQL",
            "NormsBoardRule CRUD · DRAFT→ACTIVE 生命周期\nhitCount/adoptionRate 统计\n独立数据源 (不与 Memory 自动同步)\nsearch_norms 按需检索接口")

        Container(vcs, "EntityVCS", "Node.js + PostgreSQL",
            "平台基座 (原则 13) · 事件溯源\n全实体 diff/merge (13 种 entityType, 基于真实 Schema)\nAudit/Isolation 模式 · 类型专属 diff 算法\nApplicationMethodRegistry (异步依赖声明 + 穿透写入 + asyncStatus)\n变更集可视化 · 异构实体合并审核视图\n集合追加规则 (INSERT 无冲突 / UPDATE 逐字段检测)")

        ContainerDb(db, "PostgreSQL + pgvector", "数据库",
            "agent_session · issue · pull_request\nmemory_record · norms_board_rule · tool_call_log\nacceptance_criteria_template · knowledge_derivative\nentity_event · security_audit_log\nhitl_request · changeset_review\ndelegation_record · delegation_event\nagent_mail (协议驱动通信)")

        ContainerDb(redis, "Redis", "缓存/队列",
            "会话缓存 · 并发锁 · 速率限制\n调度队列 · 临时上下文 · DynamicTeam TTL")
    }

    System_Ext(llm, "LLM Provider", "OpenAI / Ollama / 其他")
    System_Ext(storage, "Object Storage", "S3 / 本地文件系统")

    Rel(admin, ui, "管理项目/审批/配置验收标准/审批委派")
    Rel(translator, ui, "翻译/审校/查看知识健康/HITLHub响应/观看实时时间线")
    Rel(ui, api, "HTTP/WS")
    Rel(api, runtime, "Session 创建/管理")
    Rel(runtime, memory, "search_memory/create_memory")
    Rel(runtime, norms, "search_norms/propose_norm")
    Rel(runtime, vcs, "版本追踪")
    Rel(runtime, db, "CRUD")
    Rel(runtime, redis, "缓存/锁/队列")
    Rel(runtime, llm, "LLM API 调用")
    Rel(runtime, storage, "Artifact 读写")
    Rel(memory, db, "pgvector 查询")
    Rel(norms, db, "规则 CRUD")
```

## 附录 B — v0.30 → v0.31 版本变更总览

| 领域                                   | 变更内容                                                                                                                                                                                                                                                                           | 影响章节 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **D57 定案压缩**                       | D57 (Agent DAG 引擎与现有图基础设施的关系) 最终决议为 **语义层包装 (A)**：Agent DAG 引擎在 `packages/agent` 中实现专属节点语义层，复用 `@cat/graph` Blackboard/Patch/Condition 和 `@cat/workflow` 检查点/幂等/补偿，必要时可做通用扩展。决策块从完整三选项讨论压缩为单行 ✅ 摘要。 | §3.6, §7 |
| **§3.6 "与现有 Graph 系统的关系"更新** | §3.6.3 中该段落更新为明确引用 D57 定案的语义层包装表述（含 PreCheck 节点），同时将原文中的 `packages/graph` 纠正为标准包名 `@cat/graph`。                                                                                                                                          | §3.6     |
| **§2 架构 D57 引用更新**               | v0.29 代码库对齐说明从"Agent DAG 引擎复用策略见 D57"更新为已定案状态的完整描述。                                                                                                                                                                                                   | §2       |
| **§5 路线图 D57 依赖解消**             | Phase 0a DAG 行从 "⚠️ 引擎实现取决于 D57 决策" 改为确定性说明：采用语义层包装复用 @cat/graph + @cat/workflow。                                                                                                                                                                     | §5       |
| **§6 代码资产 Graph/Workflow 行更新**  | Graph/Workflow 基础设施复用说明从"见 D57"更新为 D57 定案后的具体复用方式描述（语义层包装、Blackboard 状态传递、Patch 版本追踪、Checkpoint 持久化）。                                                                                                                               | §6       |

### 已知遗留问题 (pre-existing, 非 v0.29 引入)

| 问题         | 描述                                                                                                                                                                                                        | 严重度  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D29 编号碰撞 | 决策日志中 D29 = "Memory goldenWeight 衰减策略" (§3.13)，但 §3.6 中 D29 标注的是 "PreCheck 上下文注入策略"。两个不同决策使用了同一编号。此碰撞存在于 v0.28 及更早版本。建议后续版本修复——将其中一个重编号。 | WARNING |
