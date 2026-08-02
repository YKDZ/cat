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
import * as z from "zod";

import type { Query } from "#/types.ts";

export const ListScopedMemoryRecallDerivationStatesQuerySchema = z.strictObject(
  {
    memoryIds: z.array(z.uuidv4()),
    sourceLanguageId: z.string().min(1),
    translationLanguageId: z.string().min(1),
  },
);

export type ScopedRecallDerivationStateView = {
  targetId: string;
  stateId: number | null;
  languageId: string;
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
  z.infer<typeof ListScopedMemoryRecallDerivationStatesQuerySchema>,
  ScopedRecallDerivationStateView[]
> = async (ctx, input) => {
  if (input.memoryIds.length === 0) return [];
  const sourceString = aliasedTable(vectorizedString, "scopedSourceString");
  const translationString = aliasedTable(
    vectorizedString,
    "scopedTranslationString",
  );
  return await ctx.db
    .select({
      targetId: sql<string>`${memoryItem.id}::text`,
      stateId: recallDerivationState.id,
      languageId: sql<string>`${input.sourceLanguageId}`,
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
        eq(recallDerivationState.languageId, input.sourceLanguageId),
      ),
    )
    .where(
      and(
        inArray(memoryItem.memoryId, input.memoryIds),
        or(
          and(
            eq(sourceString.languageId, input.sourceLanguageId),
            eq(translationString.languageId, input.translationLanguageId),
          ),
          and(
            eq(translationString.languageId, input.sourceLanguageId),
            eq(sourceString.languageId, input.translationLanguageId),
          ),
        ),
      ),
    )
    .orderBy(memoryItem.id);
};
