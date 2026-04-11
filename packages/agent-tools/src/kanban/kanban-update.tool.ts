import type { AgentToolDefinition } from "@cat/agent";

import { executeCommand, getDbHandle, updateCardStatus } from "@cat/domain";
import { KanbanCardStatusSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

const kanbanUpdateArgs = z.object({
  /**
   * @zh 卡片的内部整数 ID
   * @en Internal integer ID of the card
   */
  cardId: z
    .int()
    .positive()
    .optional()
    .describe("Internal integer ID of the kanban card"),
  /**
   * @zh 新状态
   * @en New status for the card
   */
  status: KanbanCardStatusSchema.describe(
    "New status: OPEN | CLAIMED | IN_PROGRESS | REVIEW | DONE | FAILED | NEEDS_REWORK",
  ),
});

/**
 * @zh kanban_update 工具: 更新看板卡片的状态。
 * @en kanban_update tool: update the status of a kanban card.
 */
export const kanbanUpdateTool: AgentToolDefinition = {
  name: "kanban_update",
  description:
    "Update the status of a kanban card. Use this to move a card through the workflow (e.g., CLAIMED → IN_PROGRESS → REVIEW).",
  parameters: kanbanUpdateArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = kanbanUpdateArgs.parse(args);
    const cardId = parsed.cardId ?? ctx.session.kanbanCardId;

    if (!cardId) {
      throw new Error("kanban_update requires cardId");
    }

    return await executeCommand({ db }, updateCardStatus, {
      cardId,
      status: parsed.status,
    });
  },
};
