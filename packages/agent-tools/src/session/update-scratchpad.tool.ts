import type { AgentToolDefinition } from "@cat/agent";

import {
  executeCommand,
  executeQuery,
  getDbHandle,
  loadAgentRunSnapshot,
  saveAgentRunSnapshot,
} from "@cat/domain";
import * as z from "zod/v4";

const updateScratchpadArgs = z.object({
  /**
   * @zh 当前 AgentRun 的外部 UUID（由 AgentRuntime 注入上下文中使用）
   * @en External UUID of the current AgentRun (injected by AgentRuntime as context)
   */
  runId: z.uuid().optional().describe("External UUID of the current AgentRun"),
  /**
   * @zh 新的 Scratchpad 内容（Agent 的工作笔记）
   * @en New scratchpad content (agent's working notes)
   */
  scratchpad: z
    .string()
    .describe("The updated scratchpad content (agent working notes)"),
});

/**
 * @zh update_scratchpad 工具: 更新 Agent 的工作笔记（Scratchpad）。
 * @en update_scratchpad tool: update the agent's working notes (scratchpad).
 */
export const updateScratchpadTool: AgentToolDefinition = {
  name: "update_scratchpad",
  description:
    "Update the agent's working notes (scratchpad). Use this to record your reasoning, plans, and intermediate results for future reference across turns.",
  parameters: updateScratchpadArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = updateScratchpadArgs.parse(args);
    const runId = parsed.runId ?? ctx.session.runId;

    if (!runId) {
      throw new Error("update_scratchpad requires runId");
    }

    // Load current blackboard snapshot
    const snapshot = await executeQuery({ db }, loadAgentRunSnapshot, {
      externalId: runId,
    });
    const currentData =
      typeof snapshot === "object" &&
      snapshot !== null &&
      !Array.isArray(snapshot)
        ? snapshot
        : {};

    const updatedSnapshot = {
      ...currentData,
      scratchpad: parsed.scratchpad,
    };

    await executeCommand({ db }, saveAgentRunSnapshot, {
      externalId: runId,
      snapshot: updatedSnapshot,
    });

    return { success: true };
  },
};
