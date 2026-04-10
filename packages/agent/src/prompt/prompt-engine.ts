import type { ChatMessage } from "@cat/plugin-core";
import type { ParsedAgentDefinition } from "@cat/shared/schema/agent";

import { interpolate } from "./variable-interpolation.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @zh PromptEngine.buildPrompt() 的输入参数。
 * @en Input parameters for PromptEngine.buildPrompt().
 */
export interface BuildPromptInput {
  /** @zh Agent 定义（含 frontmatter 元数据和 MD 正文作为 system prompt 模板）@en Agent definition with metadata and MD body as system prompt template */
  agentDefinition: ParsedAgentDefinition;
  /** @zh 当前对话消息历史 @en Current conversation message history */
  messages: ChatMessage[];
  /** @zh Agent 工作本（Scratchpad）内容 @en Agent scratchpad content */
  scratchpad?: string;
  /** @zh PreCheckNode 写入的检查提示 @en Precheck notes written by PreCheckNode */
  precheckNotes?: string;
  /** @zh 变量插值映射（{{key}} → value）@en Variable interpolation map ({{key}} → value) */
  variables?: Record<string, string>;
  /** @zh 成本/配额状态 @en Cost/quota status */
  costStatus?: {
    remainingTokens: number;
    budgetId: string;
  };
}

/**
 * @zh buildPrompt() 的输出：已构建的完整消息列表。
 * @en Output of buildPrompt(): the fully constructed message list.
 */
export interface BuiltPrompt {
  /** @zh 传给 LLM 的完整消息列表（含 system 消息）@en Full message list to pass to LLM (including system message) */
  messages: ChatMessage[];
}

// ─── Safety Rules (Slot #2) ─────────────────────────────────────────────────

const SAFETY_RULES = `
## Safety Rules

- Do not perform destructive operations without explicit user confirmation.
- Do not transmit sensitive data to external systems unless explicitly authorized.
- Always validate inputs before processing.
`.trim();

// ─── Global Rules (Slot #4) ─────────────────────────────────────────────────

const GLOBAL_RULES = `
## Global Rules

- Always call the \`finish\` tool when your task is complete.
- Use the \`update_scratchpad\` tool to record your working notes.
- Use \`read_precheck\` at the start of each turn to get guidance from the system.
- Quality-check your translations with \`qa_check\` before finishing.
`.trim();

// ─── PromptEngine ────────────────────────────────────────────────────────────

/**
 * @zh Phase 0a 版 PromptEngine：静态注入层，支持 slot #1–#5 和 #13 的组合构建。
 * @en Phase 0a PromptEngine: static injection layer supporting slot #1–#5 and #13 composition.
 */
export class PromptEngine {
  /**
   * @zh 根据输入构建完整的消息列表（含 system prompt）。
   * @en Build the full message list (including system prompt) from the input.
   *
   * @param input - {@zh 构建 prompt 的输入参数} {@en Build prompt input parameters}
   * @returns - {@zh 构建后的 BuiltPrompt} {@en The constructed BuiltPrompt}
   */
  buildPrompt(input: BuildPromptInput): BuiltPrompt {
    const {
      agentDefinition,
      messages,
      scratchpad,
      precheckNotes,
      variables = {},
      costStatus,
    } = input;

    // Slot #1 — Role definition (from agent MD body, with variable interpolation)
    const roleDefinition = interpolate(agentDefinition.content, variables);

    // Slot #2 — Safety rules (hardcoded)
    // Slot #3 — Skill (Phase 0a: empty)
    // Slot #4 — Global rules (hardcoded)

    // Slot #5 — Scratchpad
    const scratchpadSection =
      scratchpad && scratchpad.trim().length > 0
        ? `\n\n## Working Notes (Scratchpad)\n\n${scratchpad.trim()}`
        : "";

    // Precheck notes (injected between global rules and scratchpad)
    const precheckSection =
      precheckNotes && precheckNotes.trim().length > 0
        ? `\n\n## System Check\n\n${precheckNotes.trim()}`
        : "";

    // Slot #13 — Cost status
    const costSection = costStatus
      ? `\n\n## Resource Status\n\nBudget ID: ${costStatus.budgetId}\nRemaining tokens: ${costStatus.remainingTokens.toLocaleString()}`
      : "";

    const systemContent = [
      roleDefinition,
      "\n\n",
      SAFETY_RULES,
      "\n\n",
      GLOBAL_RULES,
      precheckSection,
      scratchpadSection,
      costSection,
    ]
      .join("")
      .trim();

    const systemMessage: ChatMessage = {
      role: "system",
      content: systemContent,
    };

    return {
      messages: [systemMessage, ...messages],
    };
  }
}
