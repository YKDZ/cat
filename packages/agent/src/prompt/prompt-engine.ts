import type { ChatMessage } from "@cat/plugin-core";
import type { ParsedAgentDefinition } from "@cat/shared";

import { interpolate } from "./variable-interpolation.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Slot Policy ─────────────────────────────────────────────────────────────

/**
 * @zh 单个 slot 的注入策略配置。
 * @en Injection policy configuration for a single slot.
 */
export interface SlotPolicy {
  /**
   * @zh 注入模式：
   * - `static`: 始终静态注入（默认）
   * - `on-demand`: 排除出 system prompt，由 LLM 通过工具主动获取
   * - `disabled`: 完全不注入（对强制 slot 如 #1/#2 无效）
   * @en Injection mode:
   * - `static`: always inject statically (default)
   * - `on-demand`: exclude from system prompt; LLM fetches it via tool
   * - `disabled`: never inject (ignored for mandatory slots like #1/#2)
   */
  mode: "static" | "on-demand" | "disabled";
  /** @zh 可选 token 预算限制 @en Optional token budget cap */
  maxTokens?: number;
}

// ─── Prompt Config ─────────────────────────────────────────────────────────

/**
 * @zh PromptEngine 动态配置。
 * @en Dynamic configuration for PromptEngine.
 */
export interface PromptConfig {
  /**
   * @zh 强制静态注入的 slot 编号列表（覆盖 slotPolicy 中的 on-demand/disabled）。
   * @en Slot numbers to force-inject statically (overrides on-demand/disabled in slotPolicy).
   */
  autoInjectSlots?: number[];
  /**
   * @zh 每个 slot 的注入策略映射（key 格式 "#12"）。
   * @en Per-slot injection policy map (key format "#12").
   */
  slotPolicy?: Record<string, SlotPolicy>;
}

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
  /** @zh 动态 slot 注入策略配置 @en Dynamic slot injection policy configuration */
  promptConfig?: PromptConfig;
  /** @zh 上一轮 scratchpad 哈希（用于 KV cache 优化，防止无效更新）@en Previous scratchpad hash for KV cache optimization */
  previousScratchpadHash?: string;
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

const GLOBAL_RULES_BASE = `
## Global Rules

- Always call the \`finish\` tool when your task is complete.
- Use the \`update_scratchpad\` tool to record your working notes.
- Use \`read_precheck\` at the start of each turn to get guidance from the system.
- Quality-check your translations with \`qa_check\` before finishing.
`.trim();

const buildGlobalRules = (onDemandSlots: number[]): string => {
  if (onDemandSlots.length === 0) return GLOBAL_RULES_BASE;
  const hints = onDemandSlots
    .map((n) => `- slot #${n} 可通过工具获取（on-demand fetch）`)
    .join("\n");
  return `${GLOBAL_RULES_BASE}\n\n### On-Demand Context\n\n${hints}`;
};

// ─── Mandatory slots (cannot be disabled) ────────────────────────────────────

const MANDATORY_SLOTS = new Set([1, 2]);

// ─── PromptEngine ────────────────────────────────────────────────────────────

/**
 * @zh Phase 0b 版 PromptEngine：静态注入层 + 按需获取层，支持 slotPolicy 配置。
 * @en Phase 0b PromptEngine: static injection + on-demand fetch layer with slotPolicy support.
 */
export class PromptEngine {
  /**
   * @zh 解析指定 slot 的注入模式，按 slotPolicy → autoInjectSlots → 默认值顺序。
   * 强制 slot (#1, #2) 始终返回 "static"。
   * @en Resolve the injection mode for a slot: slotPolicy → autoInjectSlots → default.
   * Mandatory slots (#1, #2) always return "static".
   */
  resolveSlotMode(
    slotNumber: number,
    promptConfig?: PromptConfig,
  ): "static" | "on-demand" | "disabled" {
    // Mandatory slots cannot be disabled or on-demand
    if (MANDATORY_SLOTS.has(slotNumber)) return "static";

    const key = `#${slotNumber}`;
    // slotPolicy takes precedence
    const policy = promptConfig?.slotPolicy?.[key];
    if (policy) return policy.mode;

    // autoInjectSlots forces static
    if (promptConfig?.autoInjectSlots?.includes(slotNumber)) return "static";

    // Default: static
    return "static";
  }

  /**
   * @zh 根据输入构建完整的消息列表（含 system prompt）。
   * @en Build the full message list (including system prompt) from the input.
   */
  buildPrompt(input: BuildPromptInput): BuiltPrompt {
    const {
      agentDefinition,
      messages,
      scratchpad,
      precheckNotes,
      variables = {},
      costStatus,
      promptConfig,
    } = input;

    // Slot #1 — Role definition (mandatory: always static)
    const roleDefinition = interpolate(agentDefinition.content, variables);

    // Slot #2 — Safety rules (mandatory: always static)

    // Collect on-demand slot numbers for hint generation
    const onDemandSlots: number[] = [];
    // Check common optional slots (#12–#16) for on-demand mode
    for (const n of [12, 13, 14, 15, 16]) {
      if (this.resolveSlotMode(n, promptConfig) === "on-demand") {
        onDemandSlots.push(n);
      }
    }

    // Slot #4 — Global rules (includes on-demand hints)
    const globalRules = buildGlobalRules(onDemandSlots);

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

    // Slot #13 — Cost status (only if not on-demand or disabled)
    const costSlotMode = this.resolveSlotMode(13, promptConfig);
    const costSection =
      costStatus && costSlotMode === "static"
        ? `\n\n## Resource Status\n\nBudget ID: ${costStatus.budgetId}\nRemaining tokens: ${costStatus.remainingTokens.toLocaleString()}`
        : "";

    const systemContent = [
      roleDefinition,
      "\n\n",
      SAFETY_RULES,
      "\n\n",
      globalRules,
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
