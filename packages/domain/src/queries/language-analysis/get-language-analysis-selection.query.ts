import {
  asc,
  eq,
  languageAnalysisPolicy,
  languageAnalysisSelection,
} from "@cat/db";
import {
  LanguageAnalysisSelectionKeySchema,
  LanguageAnalysisSelectionSchema,
  LanguageAnalysisWildcardSelectionKey,
  NormalizedLanguageIdSchema,
  type LanguageAnalysisSelection,
} from "@cat/shared";
import * as z from "zod";

import type { DbContext, Query } from "#/types.ts";

export const GetLanguageAnalysisSelectionQuerySchema = z.strictObject({
  key: LanguageAnalysisSelectionKeySchema,
});

export type GetLanguageAnalysisSelectionQuery = z.infer<
  typeof GetLanguageAnalysisSelectionQuerySchema
>;

export const getLanguageAnalysisSelection: Query<
  GetLanguageAnalysisSelectionQuery,
  LanguageAnalysisSelection | null
> = async (ctx, query) => {
  const [record] = await ctx.db
    .select({
      key: languageAnalysisSelection.key,
      implementation: languageAnalysisSelection.implementation,
      revision: languageAnalysisSelection.revision,
      configurationFingerprint:
        languageAnalysisSelection.configurationFingerprint,
      updatedAt: languageAnalysisSelection.updatedAt,
    })
    .from(languageAnalysisSelection)
    .where(eq(languageAnalysisSelection.key, query.key))
    .limit(1);
  return record === undefined
    ? null
    : LanguageAnalysisSelectionSchema.parse(record);
};

/** Administration listing includes tombstones so an operator can diagnose policy history. */
export const listLanguageAnalysisSelections: Query<
  Record<never, never>,
  LanguageAnalysisSelection[]
> = async (ctx) => {
  const records = await ctx.db
    .select({
      key: languageAnalysisSelection.key,
      implementation: languageAnalysisSelection.implementation,
      revision: languageAnalysisSelection.revision,
      configurationFingerprint:
        languageAnalysisSelection.configurationFingerprint,
      updatedAt: languageAnalysisSelection.updatedAt,
    })
    .from(languageAnalysisSelection)
    .orderBy(asc(languageAnalysisSelection.key));
  return records.map((record) => LanguageAnalysisSelectionSchema.parse(record));
};

export const ResolveLanguageAnalysisSelectionQuerySchema = z.strictObject({
  languageId: NormalizedLanguageIdSchema,
});

export type ResolvedLanguageAnalysisSelection = {
  policyEpoch: number;
  selection: LanguageAnalysisSelection | null;
  tombstone: LanguageAnalysisSelection | null;
};

export const getLanguageAnalysisPolicyEpoch: Query<
  Record<never, never>,
  number
> = async (ctx: DbContext) => {
  const [record] = await ctx.db
    .select({ epoch: languageAnalysisPolicy.epoch })
    .from(languageAnalysisPolicy)
    .where(eq(languageAnalysisPolicy.id, 1))
    .limit(1);
  return record?.epoch ?? 0;
};

/**
 * Exact canonical policy wins; an exact tombstone deliberately permits
 * wildcard. Epoch reads bracket selection resolution so the returned snapshot
 * never combines a pre-mutation selection with a post-mutation epoch.
 */
export const resolveLanguageAnalysisSelection: Query<
  z.infer<typeof ResolveLanguageAnalysisSelectionQuerySchema>,
  ResolvedLanguageAnalysisSelection
> = async (ctx, query) => {
  const key = LanguageAnalysisSelectionKeySchema.parse(query.languageId);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const epochBefore = await getLanguageAnalysisPolicyEpoch(ctx, {});
    const exact = await getLanguageAnalysisSelection(ctx, { key });
    const selection =
      exact?.implementation !== null && exact !== null
        ? exact
        : await getLanguageAnalysisSelection(ctx, {
            key: LanguageAnalysisWildcardSelectionKey,
          });
    const epochAfter = await getLanguageAnalysisPolicyEpoch(ctx, {});
    if (epochBefore === epochAfter) {
      return {
        policyEpoch: epochAfter,
        selection,
        tombstone:
          exact?.implementation !== null && exact !== null ? null : exact,
      };
    }
  }
  throw new Error("Language Analysis policy changed repeatedly during read.");
};
