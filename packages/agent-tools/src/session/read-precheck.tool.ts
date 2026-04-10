import type { AgentToolDefinition } from "@cat/agent";

import {
  executeQuery,
  getAgentRunRuntimeState,
  getDbHandle,
} from "@cat/domain";
import * as z from "zod/v4";

const readPrecheckArgs = z.object({
  /**
   * @zh 当前 AgentRun 的外部 UUID（由 AgentRuntime 注入上下文中使用）
   * @en External UUID of the current AgentRun (injected by AgentRuntime as context)
   */
  runId: z.uuid().describe("External UUID of the current AgentRun"),
});

/**
 * @zh read_precheck 工具: 读取 PreCheckNode 在本轮写入的检查笔记。
 * @en read_precheck tool: read the precheck notes written by PreCheckNode in this turn.
 */
export const readPrecheckTool: AgentToolDefinition = {
  name: "read_precheck",
  description:
    "Read the precheck notes written by the system before this reasoning turn. These notes contain important context such as turn count, time remaining, and any urgent signals.",
  parameters: readPrecheckArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, _ctx) {
    const { client: db } = await getDbHandle();
    const parsed = readPrecheckArgs.parse(args);

    const state = await executeQuery({ db }, getAgentRunRuntimeState, {
      runId: parsed.runId,
    });

    // oxlint-disable-next-line no-unsafe-type-assertion -- metadata is JSONType; narrowed after null-coalescing
    const data = (state?.metadata as Record<string, unknown> | null) ?? {};
    // oxlint-disable-next-line no-unsafe-type-assertion -- data field is a nested JSON object
    const boardData = (data["data"] as Record<string, unknown>) ?? {};

    return {
      // oxlint-disable-next-line no-unsafe-type-assertion -- string fields from JSON scratchpad store
      precheckNotes: (boardData["precheck_notes"] as string | undefined) ?? "",
      // oxlint-disable-next-line no-unsafe-type-assertion -- string fields from JSON scratchpad store
      scratchpad: (boardData["scratchpad"] as string | undefined) ?? "",
    };
  },
};
