import type { AgentToolDefinition } from "@cat/agent";

import { executeQuery, getDbHandle, loadAgentRunSnapshot } from "@cat/domain";
import * as z from "zod";

const readPrecheckArgs = z.object({
  /**
   * @zh 当前 AgentRun 的外部 UUID（由 AgentRuntime 注入上下文中使用）
   * @en External UUID of the current AgentRun (injected by AgentRuntime as context)
   */
  runId: z.uuid().optional().describe("External UUID of the current AgentRun"),
});

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

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
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = readPrecheckArgs.parse(args);
    const runId = parsed.runId ?? ctx.session.runId;

    if (!runId) {
      throw new Error("read_precheck requires runId");
    }

    const snapshot = await executeQuery({ db }, loadAgentRunSnapshot, {
      externalId: runId,
    });

    const boardData = isRecord(snapshot) ? snapshot : {};

    return {
      precheckNotes:
        typeof boardData["precheck_notes"] === "string"
          ? boardData["precheck_notes"]
          : "",
      scratchpad:
        typeof boardData["scratchpad"] === "string"
          ? boardData["scratchpad"]
          : "",
    };
  },
};
