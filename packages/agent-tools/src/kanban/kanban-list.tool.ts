import type { AgentToolDefinition } from "@cat/agent";

import { executeQuery, getDbHandle, listCards } from "@cat/domain";
import { KanbanCardStatusSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

const kanbanListArgs = z.object({
  /**
   * @zh 看板内部 ID。
   * @en Internal board ID.
   */
  boardId: z
    .int()
    .positive()
    .optional()
    .describe("Internal board ID to list cards from"),
  /**
   * @zh 卡片状态过滤。
   * @en Card status filter.
   */
  status: KanbanCardStatusSchema.optional(),
  /**
   * @zh 列 ID 过滤。
   * @en Column ID filter.
   */
  columnId: z.string().optional(),
});

/**
 * @zh `kanban_list` 工具：列出指定看板上的卡片。
 * @en The `kanban_list` tool lists cards on the specified kanban board.
 */
export const kanbanListTool: AgentToolDefinition = {
  name: "kanban_list",
  description:
    "List cards on a kanban board, optionally filtered by status or column.",
  parameters: kanbanListArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = kanbanListArgs.parse(args);
    const boardId = parsed.boardId ?? ctx.session.kanbanBoardId;

    if (!boardId) {
      throw new Error("kanban_list requires boardId");
    }

    const cards = await executeQuery({ db }, listCards, {
      boardId,
      status: parsed.status,
      columnId: parsed.columnId,
    });

    return cards.map((card) => ({
      id: card.id,
      externalId: card.externalId,
      title: card.title,
      status: card.status,
      columnId: card.columnId,
      linkedResourceType: card.linkedResourceType,
      linkedResourceId: card.linkedResourceId,
    }));
  },
};
