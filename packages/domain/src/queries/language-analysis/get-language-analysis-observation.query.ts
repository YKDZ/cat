import { eq, languageAnalysisObservation } from "@cat/db";
import {
  LanguageAnalysisBlockerPolicy,
  LanguageAnalysisObservationViewSchema,
  LanguageAnalysisObservationSchema,
  NormalizedLanguageIdSchema,
  toLanguageAnalysisSelectionKey,
  type LanguageAnalysisObservation,
  type LanguageAnalysisObservationView,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

import { resolveLanguageAnalysisSelection } from "./get-language-analysis-selection.query.ts";

export const GetLanguageAnalysisObservationQuerySchema = z.strictObject({
  languageId: NormalizedLanguageIdSchema,
});

export type GetLanguageAnalysisObservationQuery = z.infer<
  typeof GetLanguageAnalysisObservationQuerySchema
>;

export const getLanguageAnalysisObservation: Query<
  GetLanguageAnalysisObservationQuery,
  LanguageAnalysisObservation | null
> = async (ctx, query) => {
  const [record] = await ctx.db
    .select({
      languageId: languageAnalysisObservation.languageId,
      policyEpoch: languageAnalysisObservation.policyEpoch,
      selectionKey: languageAnalysisObservation.selectionKey,
      selectionRevision: languageAnalysisObservation.selectionRevision,
      configurationFingerprint:
        languageAnalysisObservation.configurationFingerprint,
      assessment: languageAnalysisObservation.assessment,
      observedAt: languageAnalysisObservation.observedAt,
    })
    .from(languageAnalysisObservation)
    .where(eq(languageAnalysisObservation.languageId, query.languageId))
    .limit(1);
  return record === undefined
    ? null
    : LanguageAnalysisObservationSchema.parse(record);
};

export const ReadLanguageAnalysisObservationQuerySchema = z.strictObject({
  languageId: NormalizedLanguageIdSchema,
  ttlMs: z.int().positive(),
  now: z.coerce.date().optional(),
});

export type ReadLanguageAnalysisObservationQuery = z.infer<
  typeof ReadLanguageAnalysisObservationQuerySchema
>;

/**
 * Read-only policy view for navigation and diagnostics. Missing, expired, or
 * policy-obsolete observations are represented as UNKNOWN and never trigger a
 * live analyzer call.
 */
export const readLanguageAnalysisObservation: Query<
  ReadLanguageAnalysisObservationQuery,
  LanguageAnalysisObservationView
> = async (ctx, input) => {
  const query = ReadLanguageAnalysisObservationQuerySchema.parse(input);
  const now = query.now ?? new Date();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const resolved = await resolveLanguageAnalysisSelection(ctx, query);
    const observation = await getLanguageAnalysisObservation(ctx, query);
    const confirmed = await resolveLanguageAnalysisSelection(ctx, query);
    if (resolved.policyEpoch !== confirmed.policyEpoch) continue;

    const selection = confirmed.selection;
    const currentObservation =
      observation !== null &&
      selection?.implementation !== null &&
      selection !== null &&
      selection.configurationFingerprint !== null &&
      observation.policyEpoch === confirmed.policyEpoch &&
      observation.selectionKey === selection.key &&
      observation.selectionRevision === selection.revision &&
      observation.configurationFingerprint ===
        selection.configurationFingerprint &&
      now.getTime() - observation.observedAt.getTime() <= query.ttlMs
        ? observation
        : null;
    const exactKey = toLanguageAnalysisSelectionKey(query.languageId);
    const assessment =
      currentObservation?.assessment ??
      (selection === null
        ? {
            status: "BLOCKED" as const,
            languageId: query.languageId,
            policyEpoch: confirmed.policyEpoch,
            selection: null,
            blocker: {
              ...LanguageAnalysisBlockerPolicy.MISSING_SELECTION,
              reason: "MISSING_SELECTION" as const,
              languageId: query.languageId,
              implementation: null,
              observedAt: now,
            },
            assessedAt: now,
          }
        : {
            status: "UNKNOWN" as const,
            languageId: query.languageId,
            policyEpoch: confirmed.policyEpoch,
            selection,
            blocker: null,
            assessedAt: now,
          });

    return LanguageAnalysisObservationViewSchema.parse({
      languageId: query.languageId,
      source:
        selection === null
          ? "NONE"
          : selection.key === exactKey
            ? "EXACT"
            : "WILDCARD",
      selection,
      tombstone: confirmed.tombstone,
      observation: currentObservation,
      assessment,
    });
  }
  throw new Error("Language Analysis policy changed repeatedly during read.");
};
