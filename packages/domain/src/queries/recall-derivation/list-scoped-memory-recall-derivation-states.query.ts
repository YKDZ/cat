import {
  aliasedTable,
  and,
  eq,
  inArray,
  memoryItem,
  or,
  recallDerivationState,
  sql,
  vectorizedString,
} from "@cat/db";
import {
  NormalizedLanguageIdSchema,
  type NormalizedLanguageId,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const ListScopedMemoryRecallDerivationStatesQuerySchema = z.strictObject(
  {
    memoryIds: z.array(z.uuidv4()),
    sourceLanguageId: NormalizedLanguageIdSchema,
    translationLanguageId: NormalizedLanguageIdSchema,
  },
);

export type ListScopedMemoryRecallDerivationStatesQuery = z.input<
  typeof ListScopedMemoryRecallDerivationStatesQuerySchema
>;

export type ScopedRecallDerivationStateView = {
  targetId: string;
  stateId: number | null;
  languageId: NormalizedLanguageId;
  status: typeof recallDerivationState.$inferSelect.status | null;
  demandRevision: number | null;
  blocker: typeof recallDerivationState.$inferSelect.blocker | null;
  canonicalInputVersion:
    | typeof recallDerivationState.$inferSelect.canonicalInputVersion
    | null;
  requiredDerivationVersion:
    | typeof recallDerivationState.$inferSelect.requiredDerivationVersion
    | null;
  currentCanonicalInputVersion:
    | typeof recallDerivationState.$inferSelect.currentCanonicalInputVersion
    | null;
  currentDerivationVersion:
    | typeof recallDerivationState.$inferSelect.currentDerivationVersion
    | null;
};

export const listScopedMemoryRecallDerivationStates: Query<
  ListScopedMemoryRecallDerivationStatesQuery,
  ScopedRecallDerivationStateView[]
> = async (ctx, input) => {
  const query = ListScopedMemoryRecallDerivationStatesQuerySchema.parse(input);
  if (query.memoryIds.length === 0) return [];
  const sourceString = aliasedTable(vectorizedString, "scopedSourceString");
  const translationString = aliasedTable(
    vectorizedString,
    "scopedTranslationString",
  );
  return await ctx.db
    .select({
      targetId: sql<string>`${memoryItem.id}::text`,
      stateId: recallDerivationState.id,
      languageId: sql<NormalizedLanguageId>`${query.sourceLanguageId}`,
      status: recallDerivationState.status,
      demandRevision: recallDerivationState.demandRevision,
      blocker: recallDerivationState.blocker,
      canonicalInputVersion: recallDerivationState.canonicalInputVersion,
      requiredDerivationVersion:
        recallDerivationState.requiredDerivationVersion,
      currentCanonicalInputVersion:
        recallDerivationState.currentCanonicalInputVersion,
      currentDerivationVersion: recallDerivationState.currentDerivationVersion,
    })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .leftJoin(
      recallDerivationState,
      and(
        eq(recallDerivationState.targetKind, "MEMORY_ITEM"),
        sql`${recallDerivationState.targetId} = ${memoryItem.id}::text`,
        eq(recallDerivationState.languageId, query.sourceLanguageId),
      ),
    )
    .where(
      and(
        inArray(memoryItem.memoryId, query.memoryIds),
        or(
          and(
            eq(sourceString.languageId, query.sourceLanguageId),
            eq(translationString.languageId, query.translationLanguageId),
          ),
          and(
            eq(translationString.languageId, query.sourceLanguageId),
            eq(sourceString.languageId, query.translationLanguageId),
          ),
        ),
      ),
    )
    .orderBy(memoryItem.id);
};
