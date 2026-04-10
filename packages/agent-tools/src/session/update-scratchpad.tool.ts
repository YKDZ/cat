import type { AgentToolDefinition } from "@cat/agent";

import {
  executeCommand,
  executeQuery,
  getAgentRunRuntimeState,
  getDbHandle,
  saveAgentRunSnapshot,
} from "@cat/domain";
import * as z from "zod/v4";

const updateScratchpadArgs = z.object({
  /**
   * @zh 当前 AgentRun 的外部 UUID（由 AgentRuntime 注入上下文中使用）
   * @en External UUID of the current AgentRun (injected by AgentRuntime as context)
   */
  runId: z.uuid().describe("External UUID of the current AgentRun"),
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
  async execute(args, _ctx) {
    const { client: db } = await getDbHandle();
    const parsed = updateScratchpadArgs.parse(args);

    // Load current blackboard snapshot
    const state = await executeQuery({ db }, getAgentRunRuntimeState, {
      runId: parsed.runId,
    });
    const currentData =
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      (state?.metadata as Record<string, unknown> | null) ?? {};

    // Update scratchpad in the blackboard's data
    const updatedSnapshot = {
      ...currentData,
      data: {
        // oxlint-disable-next-line no-unsafe-type-assertion -- data field is a nested JSON object
        ...((currentData["data"] as Record<string, unknown>) ?? {}),
        scratchpad: parsed.scratchpad,
      },
    };

    await executeCommand({ db }, saveAgentRunSnapshot, {
      externalId: parsed.runId,
      snapshot: updatedSnapshot,
    });

    return { success: true };
  },
};
