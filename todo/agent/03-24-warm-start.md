### 3.24 热启动子系统 (WarmStart)

#### 3.24.1 问题说明

新翻译项目面临 **冷启动** 问题：Agent 没有项目特定的术语偏好、风格基线和审校规则，初期翻译质量低且风格不一致。如果项目已有历史翻译数据（如 TM/术语库/已翻译文件），应能从中快速学习建立基线。

#### 3.24.2 多阶段学习流程

```
┌───────────────────────────────────────────────────┐
│ 阶段 1: 术语提取 (NLP 路径, 非 LLM)                │
│   · 使用 spacy 等 NLP 工具扫描源文件 + 已有翻译   │
│   · 提取高频术语对, 与现有术语库做 diff            │
│   · 新术语写入 Memory (source=WARM_START)          │
│   · 全量执行, 不走 Agent 系统                      │
└───────────────┬───────────────────────────────────┘
                ▼
┌───────────────────────────────────────────────────┐
│ 阶段 2: 风格学习 (LLM 辅助, 抽样)                  │
│   · 分层抽样: 按文件类型/领域, 每组 ≤50 对         │
│   · LLM 分析: 识别翻译风格模式 (正式度/人称/语态)  │
│   · 产出: 风格偏好 Memory + 规范板 DRAFT 提案       │
│   · 人工抽检门控: LLM 提取结果需人工确认            │
└───────────────┬───────────────────────────────────┘
                ▼
┌───────────────────────────────────────────────────┐
│ 阶段 3: 审校规则推断 (LLM 辅助, 抽样)              │
│   · 分析已审校替换内容中的修改模式                  │
│   · LLM 归纳: 提取隐含的审校偏好和常见错误模式     │
│   · 产出: 审校规则 Memory + 规范板 DRAFT 提案       │
│   · 人工抽检门控: 规则需确认后提升 goldenWeight     │
└───────────────────────────────────────────────────┘
```

#### 3.24.3 适用条件

| 条件             | 说明                                                       |
| ---------------- | ---------------------------------------------------------- |
| **已有双语对照** | 项目至少有一定数量的源-译对照 (建议 ≥ 100 对)              |
| **术语库存在**   | 有现成术语库可对照 (可选，增强阶段 1 效果)                 |
| **TM 可用**      | Translation Memory 中有同领域历史翻译 (可选，增强阶段 2/3) |
| **人力资源可用** | 至少一位管理者可在 HITL 门控时完成抽检审批                 |

不满足条件时，热启动会部分跳过受影响的阶段，输出覆盖率报告。

#### 3.24.4 成本控制

热启动可能涉及大量数据，必须控制 LLM 调用成本：

| 策略             | 说明                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| **分层抽样**     | 阶段 2/3 不扫描全量数据；按文件类型/领域分层随机抽样，默认每组 ≤50 对  |
| **渐进学习**     | 首次执行快速抽样建立基线，后续翻译过程中持续微调（online learning）    |
| **预算上限**     | 热启动有独立预算池，与翻译任务预算隔离；超出预算时停止学习并报告覆盖率 |
| **人工抽检门控** | 阶段 2/3 的 LLM 提取结果需人工抽样确认后才提升 goldenWeight            |

#### 3.24.5 工具定义

```
warm_start_learn(projectId, phases, options) → WarmStartResult
  phases:      ['terminology', 'style', 'review']  // 可选择运行哪些阶段
  options: {
    sampleSize:  number,        // 每组抽样条数, 默认 50
    budget:      number,        // 本次学习 token 预算
    autoApprove: boolean,       // 是否跳过人工抽检门控 (仅开发/测试环境)
    fileFilter:  string[],      // 限定学习哪些文件
  }
  返回: {
    phase1: { termsCreated: number, termsSkipped: number },
    phase2: { styleMemoriesCreated: number, samplesProcessed: number },
    phase3: { reviewRulesCreated: number, samplesProcessed: number },
    totalTokens: number,
    coverageEstimate: number,   // 0-1, 估计的内容覆盖率
  }

warm_start_status(projectId) → WarmStartStatus
  返回: {
    hasRun: boolean,
    lastRunAt: ISO8601,
    coverage: number,
    memoriesCreated: number,
    pendingHumanReview: number, // 等待人工抽检的记忆条数
  }
```

#### 3.24.6 与 Memory 子系统的集成

热启动创建的 Memory 遵循 §3.13 的完整生命周期，特别是：

- **source=WARM_START**: 区分热启动学习与 Agent 运行时创建的记忆
- **goldenWeight**: 初始值 0.7（由 actorRole=warm_start × signalType=WARM_START_CONFIRMED 计算）。低于保护阈值 1.5，Agent 可自行覆盖，体现"热启动知识需在实际使用中验证"的设计
- **人工确认升级路径**: 经人工抽检确认后，可通过以下方式提升权重：
  - 修改 signalType 为 MANUAL_TRANSLATION (×1.5) → goldenWeight 升至 1.05
  - 修改 actorRoleAtCreation 为实际确认者角色（如 project_translator=1.3 → goldenWeight 1.95）
  - 达到 1.5 保护阈值后受 §3.13.9 保护规则约束
- **可覆盖性**: 后续人类编辑可覆盖热启动记忆（遵循 §3.13.9 反降级规则 — goldenWeight 只升不降，除非人类显式操作）
- **冲突处理**: 若热启动提取的术语与已有术语库冲突，以人工术语库为准（Principle 7）
- **NormsBoard 转化**: 热启动阶段 2/3 提取的风格规则可由 Coordinator 提交为 DRAFT 规范条目 (§3.26)，经人类审批后正式化为 slot #15 规范注入——此路径为推荐方式
- **按需获取**: 热启动创建的记忆不再自动注入 Prompt，Agent 通过 `search_memory` 工具按需检索（§3.2.5）

#### 3.24.7 Agent 角色

热启动由专用 **WarmStartAgent** 执行（详见 §4 角色表），该 Agent：

- 仅在项目初始化阶段或管理员显式触发时运行
- 使用 `warm_start_learn` / `warm_start_status` 工具
- 结果通过 Mail 通知 Coordinator，由 Coordinator 决定是否触发人工抽检 HITL

#### 3.24.8 安全约束

- WarmStartAgent 的 `agentSecurityLevel` 设为 `trusted`（需读取项目全量数据）
- SecurityGuard 验证: 热启动不得修改已有翻译内容，仅允许**创建** Memory
- 热启动学习的 LLM 调用受 SecurityGuard 输出过滤，防止学习过程中的 prompt injection 回传

- **✅ Decision D32: 热启动学习模式** → 混合模式 (C): 术语提取全量执行（走 spacy 等 NLP 路径，不经 Agent 系统），风格/审校学习首次轻量抽样建立基线后渐进补充。

