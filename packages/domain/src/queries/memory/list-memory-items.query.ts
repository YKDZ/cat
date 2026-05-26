import {
  aliasedTable,
  and,
  count,
  desc,
  eq,
  ilike,
  memory,
  memoryItem,
  memoryPromotionRecord,
  or,
  sql,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListMemoryItemsQuerySchema = z.object({
  memoryId: z.uuidv4(),
  pageIndex: z.int().min(1),
  pageSize: z.int().min(1).max(100),
  searchText: z.string().trim().min(1).optional(),
});

export type ListMemoryItemsQuery = z.infer<typeof ListMemoryItemsQuerySchema>;

export type MemoryItemListPage = {
  total: number;
  items: Array<{
    id: number;
    memoryId: string;
    source: string;
    translation: string;
    sourceLanguageId: string;
    translationLanguageId: string;
    sourceElementId: number | null;
    translationId: number | null;
    creatorId: string | null;
    createdAt: Date;
    updatedAt: Date;
    sourceScope: "PROJECT" | "PERSONAL";
    promotedTargetMemoryItemId: number | null;
  }>;
};

export const listMemoryItems: Query<
  ListMemoryItemsQuery,
  MemoryItemListPage
> = async (ctx, query) => {
  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");

  const whereClause = and(
    eq(memoryItem.memoryId, query.memoryId),
    query.searchText
      ? or(
          ilike(sourceString.value, `%${query.searchText}%`),
          ilike(translationString.value, `%${query.searchText}%`),
        )
      : undefined,
  );

  const totalRow = await ctx.db
    .select({ value: count() })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .where(whereClause)
    .limit(1);

  const rows = await ctx.db
    .select({
      id: memoryItem.id,
      memoryId: memoryItem.memoryId,
      source: sourceString.value,
      translation: translationString.value,
      sourceLanguageId: sourceString.languageId,
      translationLanguageId: translationString.languageId,
      sourceElementId: memoryItem.sourceElementId,
      translationId: memoryItem.translationId,
      creatorId: memoryItem.creatorId,
      createdAt: memoryItem.createdAt,
      updatedAt: memoryItem.updatedAt,
      sourceScope: memory.scope,
      promotedTargetMemoryItemId: sql<number | null>`(
        select max(${memoryPromotionRecord.targetMemoryItemId})
        from ${memoryPromotionRecord}
        where ${memoryPromotionRecord.sourcePersonalMemoryItemId} = ${memoryItem.id}
          and ${memoryPromotionRecord.status} = 'PROMOTED'
      )`,
    })
    .from(memoryItem)
    .innerJoin(memory, eq(memory.id, memoryItem.memoryId))
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .where(whereClause)
    .orderBy(desc(memoryItem.id))
    .limit(query.pageSize)
    .offset((query.pageIndex - 1) * query.pageSize);

  return {
    total: Number(totalRow[0]?.value ?? 0),
    items: rows,
  };
};
