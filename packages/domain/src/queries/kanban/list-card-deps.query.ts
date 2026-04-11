import { eq, kanbanCard, kanbanCardDep } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListCardDepsQuerySchema = z.object({
  /** @zh 查询目标卡片的数据库 ID @en Database ID of the card to query */
  cardId: z.int().positive(),
  /**
   * @zh 依赖方向：`blocking` = 该卡片所依赖的卡片（前置），`blocked_by` = 依赖该卡片的卡片（后置）
   * @en Dependency direction: `blocking` = cards this card depends on (prerequisites), `blocked_by` = cards that depend on this card (successors)
   */
  direction: z.enum(["blocking", "blocked_by"]).default("blocking"),
});

export type ListCardDepsQuery = z.infer<typeof ListCardDepsQuerySchema>;

export interface CardDepRow {
  cardId: number;
  dependsOnCardId: number;
  depType: string;
  relatedCardId: number;
  relatedCardTitle: string;
  relatedCardStatus: string;
}

/**
 * @zh 查询看板卡片的依赖关系列表。
 * @en List dependency relationships for a kanban card.
 */
export const listCardDeps: Query<ListCardDepsQuery, CardDepRow[]> = async (
  ctx,
  query,
) => {
  const dep = kanbanCardDep;
  const card = kanbanCard;

  if (query.direction === "blocking") {
    // Cards that `cardId` depends on (prerequisites)
    const rows = await ctx.db
      .select({
        cardId: dep.cardId,
        dependsOnCardId: dep.dependsOnCardId,
        depType: dep.depType,
        relatedCardId: card.id,
        relatedCardTitle: card.title,
        relatedCardStatus: card.status,
      })
      .from(dep)
      .innerJoin(card, eq(card.id, dep.dependsOnCardId))
      .where(eq(dep.cardId, query.cardId));
    return rows;
  } else {
    // Cards that depend on `cardId` (successors)
    const rows = await ctx.db
      .select({
        cardId: dep.cardId,
        dependsOnCardId: dep.dependsOnCardId,
        depType: dep.depType,
        relatedCardId: card.id,
        relatedCardTitle: card.title,
        relatedCardStatus: card.status,
      })
      .from(dep)
      .innerJoin(card, eq(card.id, dep.cardId))
      .where(eq(dep.dependsOnCardId, query.cardId));
    return rows;
  }
};
