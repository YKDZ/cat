# CAT Agent 系统 — 架构规划文档

> **文档版本**: v0.31  
> **状态**: 架构规划阶段  
> **前置文档**: [v0.30](.history/v0.30/00-index.md)  
> **原始完整文档**: [TODO_AGENT_ARCH.v16.md](../TODO_AGENT_ARCH.v16.md)  
> **变更摘要**: (1) D57 (Agent DAG 引擎与现有图基础设施的关系) 定案——最终决议为 **语义层包装 (A)**，在 `packages/agent` 中实现 Agent 专属节点语义层，复用 `@cat/graph` + `@cat/workflow` 基础设施，必要时可做通用扩展。决策块压缩。(2) §3.6 章节 D57 决策块从完整三选项讨论压缩为单行 ✅ 摘要，“与现有 Graph 系统的关系”段落同步更新为 D57 定案表述。(3) §2 架构、§5 路线图、§6 代码资产中 D57 的引用全部从“待决定/见 D57”更新为已定案状态，Phase 0a DAG 行解消 D57 依赖警告。(4) §7 决策日志 D57 条目更新为 ✅ 已决定。(5) §8 附录 B 更新为 v0.30→v0.31 变更总览。

---

## 文档结构

本文档从原始 v0.16 单文件（~5100 行）按章节拆分为以下子文档，便于索引、维护和协作编辑。

### §1. 项目背景与目标

| 文件                                 | 内容                                                                                   | 行数 |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ---- |
| [01-background.md](01-background.md) | 项目定位、核心架构原则（13 条）、系统必要性分析、五级功能裁剪模型、与编码 Agent 的区别 | ~175 |

### §2. 总体架构

| 文件                                     | 内容                                                                                             | 行数 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| [02-architecture.md](02-architecture.md) | 分层架构总览（Mermaid 图）、核心包规划（agent / agent-tools / agent-team）、核心数据流（时序图） | ~180 |

### §3. 子系统详细设计

§3 是全文主体，按 29 个子系统拆分为独立文件：

| 文件                                                   | 子系统                            | 关键内容                                                                                                                                                                                                                                                           | 行数 |
| ------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| [03-01-llm-interface.md](03-01-llm-interface.md)       | §3.1 LLM 接口层                   | LLMGateway、LLMProvider、令牌桶、优先级队列                                                                                                                                                                                                                        | ~55  |
| [03-02-prompt-engine.md](03-02-prompt-engine.md)       | §3.2 提示词管理与上下文组装       | PromptEngine、ContextStore、Scratchpad、消息压缩管线、变量插值、按需获取模型、slotPolicy、KV Cache 头部稳定性、多模态上下文支持、三策略图片传递、微工作流效率规则                                                                                                  | ~530 |
| [03-03-tool-system.md](03-03-tool-system.md)           | §3.3 工具系统                     | 工具注册、权限控制、工具分类（业务操作/记忆/通信/治理/元工具）、batchHint 亲和性、工具执行上下文总线 (D52: 统一 ToolExecutionContext)、现有 AgentToolProvider 对齐                                                                                                 | ~125 |
| [03-04-agent-definition.md](03-04-agent-definition.md) | §3.4 Agent 定义系统               | MD-based 定义格式、Frontmatter Schema、System Prompt 模板、Frontmatter 字段规划表、✅ D56 (完全 MD 存储)                                                                                                                                                           | ~165 |
| [03-05-skills.md](03-05-skills.md)                     | §3.5 Skills 系统                  | Skill 定义格式、动态注入机制、Skill 示例                                                                                                                                                                                                                           | ~67  |
| [03-06-agent-runtime.md](03-06-agent-runtime.md)       | §3.6 Agent Runtime (DAG 执行引擎) | 通用 DAG 模型、节点类型、执行流程、分支/合并、快照回溯、重放机制、微工作流批量调用、Hook 集成点、错误恢复分类 (D51: 三类独立预算)、现有 @cat/graph + @cat/workflow 复用关系、✅ D57 DAG 引擎策略                                                                   | ~390 |
| [03-07-issue-pr.md](03-07-issue-pr.md)                 | §3.7 Issue + PR 系统              | Issue/PR 数据模型、状态机、评论子系统、交叉引用、TrustSettings                                                                                                                                                                                                     | ~150 |
| [03-08-traceability.md](03-08-traceability.md)         | §3.8 任务追溯体系                 | 完整追溯链模型、triggerContext → Session → ChangeSet 追溯、VCS 锚点                                                                                                                                                                                                | ~65  |
| [03-09-team.md](03-09-team.md)                         | §3.9 Team 系统 (多 Agent 协作)    | 5 种 Team 模式、通用会话终止机制、动态组队、委派机制、Issue 拆分、跨子系统死锁检测                                                                                                                                                                                   | ~581 |
| [03-10-mail.md](03-10-mail.md)                         | §3.10 Agent 通信系统 (协议驱动)   | Team 内通信、DAG 拓扑约束、统一通信协议 (D53: protocol-first)、8 种 ProtocolType、body 自动渲染                                                                                                                                                                    | ~130 |
| [03-11-subagent.md](03-11-subagent.md)                 | §3.11 委派系统 (Delegation)       | 统一的 delegate_task 接口、DelegationReplayStore、委派链安全约束、死锁预防                                                                                                                                                                                         | ~170 |
| [03-12-timeline.md](03-12-timeline.md)                 | §3.12 时间线与回溯系统            | SessionTimelinePlayer、实时直播模式、回溯功能                                                                                                                                                                                                                      | ~46  |
| [03-13-memory.md](03-13-memory.md)                     | §3.13 记忆系统                    | 三级记忆（Agent/Team/Project）、记忆类型、权重模型、黄金标准、级联失效                                                                                                                                                                                             | ~397 |
| [03-14-changeset-vcs.md](03-14-changeset-vcs.md)       | §3.14 变更集与版本控制 (平台基座) | ChangeSet 生命周期、EntityVCS 分支模型、冲突解决、审核流程、全实体覆盖 (13 种)、类型专属 DiffStrategy (基于真实 Schema)、实体内生异步依赖 (TranslatableString 向量化)、ApplicationMethodRegistry (AsyncDependencySpec + 穿透写入 + asyncStatus 追踪)、变更集可视化 | ~830 |
| [03-15-hitl.md](03-15-hitl.md)                         | §3.15 人类在环 (HITL)             | HITLHub 面板、审批策略、人类干预点、实时暂停/恢复                                                                                                                                                                                                                  | ~247 |
| [03-16-permission.md](03-16-permission.md)             | §3.16 权限系统                    | Permission & ReBAC、Agent 权限模型、扩展清单 (subject/relation/object 新增项)                                                                                                                                                                                      | ~75  |
| [03-17-scheduler.md](03-17-scheduler.md)               | §3.17 调度服务                    | SchedulerService、触发策略、并发控制、DeadlockDetector                                                                                                                                                                                                             | ~75  |
| [03-18-task-executor.md](03-18-task-executor.md)       | §3.18 TaskExecutor 同构抽象       | Agent/Team 统一接口、同构原则实现                                                                                                                                                                                                                                  | ~35  |
| [03-19-observability.md](03-19-observability.md)       | §3.19 可观测性 & 日志             | 事件存储、指标采集、日志分级                                                                                                                                                                                                                                       | ~100 |
| [03-20-frontend.md](03-20-frontend.md)                 | §3.20 前端组件体系                | Issue/PR 视图、Team 视图、ChangeSet 审核 (五种视图模式)、DAG 调试器、时间线播放器等                                                                                                                                                                                  | ~235 |
| [03-21-responsibility.md](03-21-responsibility.md)     | §3.21 责任模型                    | Agent 责任链、审计追溯                                                                                                                                                                                                                                             | ~61  |
| [03-22-cost-control.md](03-22-cost-control.md)         | §3.22 成本控制模型                | 多层预算、成本归因、自动降级、账本系统、微工作流成本效率、异步依赖两阶段成本追踪                                                                                                                                                                                   | ~186 |
| [03-23-debug-baseline.md](03-23-debug-baseline.md)     | §3.23 调试与基线测试              | DAG 调试工具、基线测试框架、回归检测                                                                                                                                                                                                                               | ~208 |
| [03-24-warm-start.md](03-24-warm-start.md)             | §3.24 热启动子系统                | WarmStart 缓存策略、预计算、上下文预加载                                                                                                                                                                                                                           | ~116 |
| [03-25-security.md](03-25-security.md)                 | §3.25 安全强化模型                | 提示词注入防御、权限隔离、安全审计                                                                                                                                                                                                                                 | ~168 |
| [03-26-norms-board.md](03-26-norms-board.md)           | §3.26 规范板子系统                | NormsBoard 数据模型、审批流程、Agent 集成                                                                                                                                                                                                                          | ~259 |
| [03-27-acceptance-gate.md](03-27-acceptance-gate.md)   | §3.27 任务验收闭环                | QA-checker、验收矩阵、AcceptanceGate 接口、与 Reviewer 的分离                                                                                                                                                                                                      | ~305 |
| [03-28-knowledge-health.md](03-28-knowledge-health.md) | §3.28 知识健康监测                | 派生谱系追踪、健康度评分、动态降权、预警机制                                                                                                                                                                                                                       | ~155 |
| [03-29-hook-system.md](03-29-hook-system.md)           | §3.29 Hook System (钩子系统)      | 事件驱动可扩展性、HookEvent/HookResult/HookRunner、统一退出码、ModuleComposer 集成、安全约束                                                                                                                                                                       | ~270 |

### §4–§8. 补充章节

| 文件                                     | 内容                                                                   | 行数 |
| ---------------------------------------- | ---------------------------------------------------------------------- | ---- |
| [04-agent-roles.md](04-agent-roles.md)   | §4 翻译场景中的典型 Agent 角色（Translator, Reviewer, TermManager 等） | ~107 |
| [05-roadmap.md](05-roadmap.md)           | §5 分阶段实施路线图（Phase 0a–6, VCS 基座在 Phase 0b）                 | ~150 |
| [06-code-assets.md](06-code-assets.md)   | §6 现有代码资产复用清单 (16 项，v0.29 校验)                            | ~65  |
| [07-decision-log.md](07-decision-log.md) | §7 决策记录（Decision Log，D1–D57 全部定案）                           | ~63  |
| [08-appendix.md](08-appendix.md)         | §8 附录 A（C4 Container 图）+ 附录 B（v0.30→v0.31 变更总览）           | ~95  |

---

## 交叉引用说明

子文档之间的章节引用（如 `§3.9.1`、`§3.13`）保持原始编号不变，读者可通过本索引定位到对应文件。主要高频交叉引用关系：

```
03-14-changeset-vcs.md (VCS 平台基座, 原则 13)
  ├── → 03-07-issue-pr.md (Issue/PR 与 VCS 关联)
  ├── → 03-08-traceability.md (VCS 锚点)
  ├── → 03-15-hitl.md (审批与 VCS 回滚)
  ├── → 03-20-frontend.md (变更集可视化)
  └── → 03-25-security.md (dry-run VCS 校验)

03-09-team.md (Team)
  ├── → 03-10-mail.md (Agent 通信系统, 协议驱动)
  ├── → 03-18-task-executor.md (TaskExecutor 同构)
  ├── → 03-08-traceability.md (追溯体系)
  └── → 03-27-acceptance-gate.md (验收闭环)

03-13-memory.md (记忆)
  ├── → 03-02-prompt-engine.md (Scratchpad / ContextStore)
  ├── → 03-14-changeset-vcs.md (PROJECT级记忆版本控制)
  ├── → 03-26-norms-board.md (规范板)
  └── → 03-28-knowledge-health.md (知识健康)

03-06-agent-runtime.md (DAG 引擎)
  ├── → 03-12-timeline.md (时间线回溯)
  ├── → 03-23-debug-baseline.md (调试与基线)
  ├── → 03-19-observability.md (可观测性)
  └── → 03-29-hook-system.md (Hook 集成点)

03-29-hook-system.md (Hook 系统)
  ├── → 03-06-agent-runtime.md (DAG 集成点)
  ├── → 03-03-tool-system.md (工具执行上下文)
  ├── → 03-12-timeline.md (ModuleComposer 集成)
  ├── → 03-25-security.md (安全约束)
  └── → 03-22-cost-control.md (成本计量)

03-07-issue-pr.md (Issue + PR)
  ├── → 03-14-changeset-vcs.md (变更集与 PR 关联)
  ├── → 03-16-permission.md (TrustSettings)
  └── → 03-08-traceability.md (交叉引用追溯)
```

---
