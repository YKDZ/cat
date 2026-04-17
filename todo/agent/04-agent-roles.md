## 4. 翻译场景中的典型 Agent 角色

| Agent               | 触发方式                   | 核心工具                                                                                                                                    | agentSecurityLevel | 说明           |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------- |
| **Translator**      | Issue 任务 / 事件触发      | translate, search_tm, search_termbase, search_context, search_memory, search_norms, run_acceptance_check, issue_claim, create_memory       | restricted         | 主力翻译 agent |
| **Reviewer**        | Issue REVIEW 状态 / 事件   | review_translation, qa_check, search_termbase, search_memory, search_norms, run_acceptance_check, create_memory                             | restricted         | 译后审校       |
| **TermManager**     | 定时 + term.suggested 事件 | create_term, search_termbase, search_context, search_memory, search_norms, create_memory, propose_norm                                      | restricted         | 术语库长期维护 |
| **TMCurator**       | translation.approved 事件  | search_tm, batch操作                                                                                                                        | restricted         | 翻译记忆库维护 |
| **QAAnalyst**       | batch 完成事件             | qa_check, 统计工具, search_norms, create_memory                                                                                             | restricted         | 质量分析报告   |
| **Coordinator**     | project.created 事件       | issue_create, pr_update, send_mail, delegate_task, compose_team, create_memory, warm_start_status, list_norms, search_norms, propose_norm | trusted            | Team 编排者    |
| **WarmStartAgent**  | 项目初始化 / admin 触发    | warm_start_learn, warm_start_status, create_memory, search_memory, propose_norm                                                             | trusted            | 热启动知识学习 |
| **GovernanceAgent** | admin_command / 定时       | 跨项目统计、成本汇总、安全审计查询、send_mail                                                                                               | trusted            | 跨项目治理监控 |

> **v0.14 变更**: Coordinator 新增 `delegate_task` 和 `compose_team` 工具 (§3.9.2, §3.9.3.1)，使其能在运行时动态组建子团队和委派任务链。Coordinator 的 `agentSecurityLevel=trusted` 使其可获得 `canComposeTeam=true` 与 `maxDelegationDepth>0` 安全策略 (§3.25)。
> **v0.16 变更**: Coordinator 通过 `issue_create(parentIssueId)` (§3.9.3.2) 支持将 Issue 拆分为多个子 Issue。

**端到端翻译项目示例流程**:

```mermaid
sequenceDiagram
    participant Event as 项目创建事件
    participant Sched as SchedulerService
    participant SG as SecurityGuard
    participant Cost as CostController
    participant Coord as Coordinator
    participant WS as WarmStartAgent
    participant NB as NormsBoard
    participant AG as AcceptanceGate
    participant KH as KnowledgeHealthMonitor
    participant Term as TermManager
    participant Trans as Translator(s)
    participant Rev as Reviewer
    participant TMC as TMCurator
    participant KB as Issue/PR 系统
    participant Mem as MemoryStore

    Event->>Sched: project.created
    Sched->>SG: SecurityCheck(trigger)
    SG-->>Sched: allowed ✓
    Sched->>Cost: checkBudget(project)
    Cost-->>Sched: allowed ✓
    Sched->>Coord: 创建 Session (triggerContext: event)

    Coord->>Coord: 检查项目是否有已有双语内容
    alt 有已有内容 (热启动)
        Coord->>WS: delegate_task(warm_start_learn)
        WS->>Mem: warm_start_learn(阶段 1: 术语提取)
        WS->>Mem: warm_start_learn(阶段 2: 风格抽样)
        WS->>NB: propose_norm(热启动提取的风格规则 → DRAFT)
        WS->>Coord: send_mail(热启动完成, 覆盖率报告)
        Note over Coord: 人工抽检门控 (HITL) + 规范板审批
    end

    Coord->>NB: search_norms(projectId) → 按需检索项目规范就绪状态
    Coord->>Mem: search_memory(类似项目经验, vector similarity)
    Coord->>Coord: 分析项目规模和语言对 (结合历史记忆 + 任务粒度启发式 §3.7.5)
    Coord->>KB: 创建 Issue Board, 按粒度启发式生成 Issue (含 DAG 依赖 + allowedAssignees + batchSize + acceptanceCriteria)

    alt 大型项目 (需要委派)
        Coord->>Coord: delegate_task(翻译子任务, targetRole=Translator, mode=FIRE_AND_CHECK)
        Coord->>Coord: compose_team(审校团队, roles=[Reviewer×2], ttl=7d)
        Note over Coord: 委派链 delegationDepth=1, delegationChainId 生成
    end

    Coord->>Term: 启动术语扫描 (delegate_task 或 @mention Issue)
    Term->>Term: 扫描源文件 → 提取候选术语
    Term->>Mem: create_memory(术语决策记录, scope=PROJECT, content=TranslatableString)
    Term->>NB: propose_norm(术语统一规范 → DRAFT)
    Term-->>Coord: 术语库就绪

    loop 并行翻译 (Fan-out/Fan-in 模式)
        Trans->>KB: issue_claim (领取 OPEN Issue, 检查 DAG 依赖, batchSize > 1 时批量处理)
        Trans->>NB: search_norms(projectId, task相关规范) → 按需获取当前任务所需规范
        Trans->>Mem: search_memory(相关翻译经验, vector similarity, goldenWeight 加权)
        Note over KH: 记录 memory→derivative 溯源
        Trans->>Trans: [ReasoningNode → ToolNode → DecisionNode 循环]
        Trans->>AG: finish → AcceptanceGate.evaluate()
        alt 验收 PASS
            Trans->>Mem: create_memory(翻译风格心得, scope=AGENT)
            Trans->>KB: pr_update (移到 REVIEW)
        else 验收 FAIL
            AG->>Trans: 注入 feedback → PreCheck → 重试
        end
    end

    loop 审校 (Agent/Team 同构 §3.27.10)
        Rev->>KB: issue_claim (领取 REVIEW 状态 Issue)
        Rev->>NB: search_norms(projectId, 审校相关规范) → 按需获取
        Rev->>Mem: search_memory(审校标准和常见问题, minGoldenWeight 优先)
        Rev->>Rev: 对比原文译文 · 术语一致性 · 规范合规性 · 流畅度
        Rev->>AG: 提交 changeset_review 记录 (reviewerType=single_agent/team_vote)
        alt 通过
            Rev->>KB: pr_update (移到 DONE)
            KH->>KH: updateOutcome(derivative, accepted)
        else 拒绝
            Rev->>Trans: send_mail (附修改意见)
            Rev->>Mem: create_memory(典型错误模式, scope=TEAM)
            Rev->>KB: pr_update (移回 OPEN → Audit Mode 直接生效 / Isolation Mode 触发 VCS 投影)
            KH->>KH: updateOutcome(derivative, rejected) → 重算 healthScore
        end
    end

    TMC->>TMC: 将已审核翻译入库 TM
    Coord->>Mem: create_memory(项目完成总结, scope=PROJECT)
    Coord->>Coord: 监控 Issue 系统 → 全部关闭 → 通知管理者
```
