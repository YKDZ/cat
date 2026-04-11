import type { AgentToolDefinition } from "@cat/agent";

import {
  completeAgentSession,
  executeCommand,
  getDbHandle,
  updateCardStatus,
} from "@cat/domain";
import * as z from "zod/v4";

const finishArgs = z.object({
  /**
   * @zh 会话外部 UUID（agentSession.externalId）
   * @en Session external UUID (agentSession.externalId)
   */
  sessionId: z
    .uuid()
    .optional()
    .describe("External UUID of the current agent session"),
  /**
   * @zh 完成原因说明（供日志和审计使用）
   * @en Completion reason (for logging and audit)
   */
  reason: z
    .string()
    .default("Task completed successfully")
    .describe("Reason for finishing"),
  /**
   * @zh 关联的看板卡片内部 ID（若有，自动更新为 DONE）
   * @en Associated kanban card internal ID (if provided, automatically set to DONE)
   */
  kanbanCardId: z
    .int()
    .positive()
    .optional()
    .describe("Kanban card ID to mark as DONE"),
});

/**
 * @zh finish 工具: 宣告 Agent 任务完成，结束 DAG 循环。
 * @en finish tool: signal task completion and exit the DAG loop.
 */
export const finishTool: AgentToolDefinition = {
  name: "finish",
  description:
    "Signal that the agent has completed its task. Marks the session as done and optionally moves the kanban card to DONE status. Call this when all translation work is complete and QA has passed.",
  parameters: finishArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = finishArgs.parse(args);
    const sessionId = parsed.sessionId ?? ctx.session.sessionId;
    const kanbanCardId = parsed.kanbanCardId ?? ctx.session.kanbanCardId;

    if (!sessionId) {
      throw new Error("finish requires sessionId");
    }

    // Mark the session as COMPLETED via domain command
    await executeCommand({ db }, completeAgentSession, {
      sessionId,
      finalStatus: "COMPLETED",
    });

    // If kanban card ID provided, move it to DONE
    if (kanbanCardId !== undefined) {
      await executeCommand({ db }, updateCardStatus, {
        cardId: kanbanCardId,
        status: "DONE",
      });
    }

    return { finished: true, reason: parsed.reason };
  },
};
