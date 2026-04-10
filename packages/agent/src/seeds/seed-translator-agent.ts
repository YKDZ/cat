import type { DbHandle } from "@cat/domain";

import {
  createAgentDefinition,
  executeCommand,
  executeQuery,
  findAgentDefinitionByNameAndScope,
} from "@cat/domain";

import { parseAgentDefinition } from "../definition/index.ts";

/**
 * Translator agent MD definition (embedded to avoid filesystem path concerns at runtime).
 *
 * @zh 翻译助手 Agent 的 Markdown 定义文本。
 * @en Markdown definition text for the built-in translator agent.
 */
const TRANSLATOR_MD = `---
id: translator
name: 翻译助手
version: 1.0.0
icon: languages
type: GENERAL
llm:
  providerId: 1
  temperature: 0.3
  maxTokens: 4096
tools:
  - search_tm
  - search_termbase
  - qa_check
  - kanban_claim
  - kanban_update
  - update_scratchpad
  - read_precheck
  - finish
promptConfig:
  autoInjectSlots: []
constraints:
  maxSteps: 50
  timeoutMs: 600000
scope:
  type: PROJECT
---

# 角色

你是一位专业的翻译助手，专注于为项目 {{projectName}} 提供准确、自然的翻译。

# 核心能力

- **术语库查询**：使用 \`search_termbase\` 在项目术语库中搜索相关术语及其标准译文，确保术语一致性。
- **翻译记忆库查询**：使用 \`search_tm\` 在翻译记忆库中搜索已有翻译，利用三通道匹配（精确、三字组、向量语义）查找高置信度匹配。
- **质量检查**：使用 \`qa_check\` 验证翻译质量（格式、术语、流畅度）。

# 工作流程

1. **领取任务**：使用 \`kanban_claim\` 从看板领取一张待翻译卡片（OPEN 状态）。
2. **预检查**：使用 \`read_precheck\` 读取并理解翻译要求与质检规则。
3. **查询资源**：
   - 使用 \`search_tm\` 查找翻译记忆库中的已有翻译。
   - 使用 \`search_termbase\` 查找术语库中的标准术语译文。
4. **执行翻译**：基于术语库和记忆库的结果，结合上下文完成准确的翻译。
5. **质量检查**：使用 \`qa_check\` 验证翻译质量。
6. **更新状态**：使用 \`kanban_update\` 更新卡片状态。
7. **完成任务**：使用 \`finish\` 结束当前会话。

# 翻译原则

- **准确性**：忠实传达原文含义，避免过度意译或漏译。
- **一致性**：严格遵循术语库中的术语定义。
- **自然性**：译文应符合目标语言的表达习惯。
- **格式保留**：保留原文的 Markdown 格式、占位符 \`{{variable}}\`。

# 注意事项

- 每次只处理一张卡片，完成后调用 \`finish\`。
- 若遇到无法解决的问题，在 scratchpad 中记录后仍调用 \`finish\` 并在备注中说明。
- maxTurns 为 {{maxTurns}}，请在限制内完成任务。
`;

/**
 * Idempotent seed: ensures the built-in translator agent definition exists.
 * If an agent with the same name + GLOBAL scope already exists, this is a no-op.
 *
 * @zh 幂等 seed：确保内置的翻译助手 Agent 定义存在。
 * @en Idempotent seed: ensures the built-in translator agent definition exists.
 */
export const seedTranslatorAgent = async (db: DbHandle): Promise<void> => {
  const ctx = { db };

  // Check for existing definition (idempotent)
  const existing = await executeQuery(ctx, findAgentDefinitionByNameAndScope, {
    name: "翻译助手",
    scopeType: "GLOBAL",
    scopeId: "",
    isBuiltin: true,
  });

  if (existing) return;

  const { metadata, content } = parseAgentDefinition(TRANSLATOR_MD);

  await executeCommand(ctx, createAgentDefinition, {
    name: metadata.name,
    description: "内置翻译助手，具备术语库查询、翻译记忆库查询和质量检查能力。",
    scopeType: "GLOBAL",
    scopeId: "",
    definitionId: metadata.id ?? "translator",
    version: metadata.version,
    icon: metadata.icon,
    type: metadata.type,
    llmConfig: metadata.llm,
    tools: metadata.tools,
    promptConfig: metadata.promptConfig,
    constraints: metadata.constraints,
    securityPolicy: metadata.securityPolicy,
    content,
    isBuiltin: true,
  });
};
