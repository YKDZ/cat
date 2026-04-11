import type { AgentToolDefinition } from "@cat/agent";

import { claimCard, executeCommand, getDbHandle } from "@cat/domain";
import * as z from "zod/v4";

const claimCardArgs = z.object({
  /**
   * @zh 看板 ID（内部整数 ID）
   * @en Board internal integer ID
   */
  boardId: z
    .int()
    .positive()
    .optional()
    .describe("The internal board ID to claim a card from"),
  /**
   * @zh 可领取的状态列表（默认 OPEN 和 NEEDS_REWORK）
   * @en Statuses eligible for claiming (defaults to OPEN and NEEDS_REWORK)
   */
  claimableStatuses: z
    .array(z.enum(["OPEN", "NEEDS_REWORK"]))
    .default(["OPEN", "NEEDS_REWORK"])
    .describe("Which statuses are claimable"),
});

/**
 * @zh kanban_claim 工具: 从看板原子性地领取一张可用卡片。
 * @en kanban_claim tool: atomically claim an available kanban card.
 */
export const kanbanClaimTool: AgentToolDefinition = {
  name: "kanban_claim",
  description:
    "Atomically claim an available kanban card from the board. Returns the claimed card details or null if no card is available.",
  parameters: claimCardArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = claimCardArgs.parse(args);
    const boardId = parsed.boardId ?? ctx.session.kanbanBoardId;

    if (!boardId) {
      throw new Error("kanban_claim requires boardId");
    }

    return await executeCommand({ db }, claimCard, {
      boardId,
      claimableStatuses: parsed.claimableStatuses,
    });
  },
};
