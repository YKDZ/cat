import { kanbanCardDep, sql } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const AddCardDepCommandSchema = z.object({
  /** @zh 依赖方卡片的数据库 ID @en Database ID of the dependent card */
  cardId: z.int().positive(),
  /** @zh 被依赖卡片的数据库 ID @en Database ID of the card being depended on */
  dependsOnCardId: z.int().positive(),
  /** @zh 依赖类型 @en Dependency type */
  depType: z.enum(["FINISH_TO_START", "DATA"]).default("FINISH_TO_START"),
});

export type AddCardDepCommand = z.infer<typeof AddCardDepCommandSchema>;

export class CyclicDependencyError extends Error {
  constructor(cardId: number, dependsOnCardId: number) {
    super(
      `Adding dependency ${cardId} → ${dependsOnCardId} would create a cycle`,
    );
    this.name = "CyclicDependencyError";
  }
}

/**
 * @zh 为看板卡片添加依赖关系，添加前执行 BFS 环路检测。
 * @en Add a dependency between two kanban cards, with BFS cycle detection before insert.
 */
export const addCardDep: Command<AddCardDepCommand> = async (ctx, command) => {
  const { cardId, dependsOnCardId, depType } = command;

  // Self-loop guard
  if (cardId === dependsOnCardId) {
    throw new CyclicDependencyError(cardId, dependsOnCardId);
  }

  // Recursive CTE cycle detection:
  // Check if dependsOnCardId already (transitively) depends on cardId.
  // If so, adding cardId → dependsOnCardId would create a cycle.
  const cycleRows = await ctx.db.execute<{ id: number }>(sql`
    WITH RECURSIVE deps AS (
      SELECT d."dependsOnCardId" AS id
      FROM "KanbanCardDep" d
      WHERE d."cardId" = ${dependsOnCardId}

      UNION ALL

      SELECT d."dependsOnCardId" AS id
      FROM "KanbanCardDep" d
      INNER JOIN deps ON d."cardId" = deps.id
    )
    SELECT id FROM deps WHERE id = ${cardId}
    LIMIT 1
  `);

  if (cycleRows.rows && cycleRows.rows.length > 0) {
    throw new CyclicDependencyError(cardId, dependsOnCardId);
  }

  // Insert the dependency (upsert to ensure idempotency)
  await ctx.db
    .insert(kanbanCardDep)
    .values({ cardId, dependsOnCardId, depType })
    .onConflictDoNothing();

  return { result: undefined, events: [] };
};
