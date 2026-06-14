import {
  alias,
  and,
  desc,
  eq,
  getColumns,
  inArray,
  qaReviewDecision,
  qaReviewQueueItem,
  qaReviewRun,
  qaReviewSuggestion,
  sql,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import { listQaReviewAnnotations } from "./list-review-annotations.query.ts";
import { listQaReviewFindings } from "./list-review-findings.query.ts";

const candidateTranslation = alias(translation, "candidateTranslation");
const candidateString = alias(vectorizedString, "candidateString");
const approvedTranslation = alias(translation, "approvedTranslation");
const approvedString = alias(vectorizedString, "approvedString");
const sourceString = alias(vectorizedString, "sourceString");

export const GetQaReviewQueueItemDetailQuerySchema = z.object({
  queueItemId: z.int().positive(),
});

export type GetQaReviewQueueItemDetailQuery = z.infer<
  typeof GetQaReviewQueueItemDetailQuerySchema
>;

export type QaReviewTranslationDetail = {
  id: number;
  text: string;
  translatorId: string | null;
  createdAt: Date;
} | null;

type AwaitedArrayItem<T> =
  T extends Promise<Array<infer TItem>> ? TItem : never;

export type QaReviewQueueItemDetail = {
  queueItem: typeof qaReviewQueueItem.$inferSelect;
  sourceText: string;
  sourceLanguageId: string;
  candidateTranslation: QaReviewTranslationDetail;
  approvedTranslation: QaReviewTranslationDetail;
  latestRunSummary: string | null;
  findings: Array<AwaitedArrayItem<ReturnType<typeof listQaReviewFindings>>>;
  annotations: Array<
    AwaitedArrayItem<ReturnType<typeof listQaReviewAnnotations>>
  >;
  suggestions: Array<typeof qaReviewSuggestion.$inferSelect>;
  decisions: Array<typeof qaReviewDecision.$inferSelect>;
};

/**
 * Get a single QA review queue item detail including source/candidate/approved translations and related findings/annotations/suggestions/decisions.
 */
export const getQaReviewQueueItemDetail: Query<
  GetQaReviewQueueItemDetailQuery,
  QaReviewQueueItemDetail | null
> = async (ctx, input) => {
  const query = GetQaReviewQueueItemDetailQuerySchema.parse(input);
  const queueItem = (
    await ctx.db
      .select({ ...getColumns(qaReviewQueueItem) })
      .from(qaReviewQueueItem)
      .where(eq(qaReviewQueueItem.id, query.queueItemId))
      .limit(1)
  )[0];

  if (!queueItem) {
    return null;
  }

  const elementRow = (
    await ctx.db
      .select({
        sourceText: sourceString.value,
        sourceLanguageId: sourceString.languageId,
        approvedTranslationId: translatableElement.approvedTranslationId,
      })
      .from(translatableElement)
      .innerJoin(
        sourceString,
        eq(sourceString.id, translatableElement.vectorizedStringId),
      )
      .where(eq(translatableElement.id, queueItem.elementId))
      .limit(1)
  )[0];

  if (!elementRow) {
    return null;
  }

  const [
    candidateRow,
    approvedRow,
    latestRun,
    findings,
    annotations,
    decisions,
  ] = await Promise.all([
    queueItem.translationId === null
      ? Promise.resolve(null)
      : ctx.db
          .select({
            id: candidateTranslation.id,
            text: candidateString.value,
            translatorId: candidateTranslation.translatorId,
            createdAt: candidateTranslation.createdAt,
          })
          .from(candidateTranslation)
          .innerJoin(
            candidateString,
            eq(candidateString.id, candidateTranslation.stringId),
          )
          .where(eq(candidateTranslation.id, queueItem.translationId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
    elementRow.approvedTranslationId === null
      ? Promise.resolve(null)
      : ctx.db
          .select({
            id: approvedTranslation.id,
            text: approvedString.value,
            translatorId: approvedTranslation.translatorId,
            createdAt: approvedTranslation.createdAt,
          })
          .from(approvedTranslation)
          .innerJoin(
            approvedString,
            eq(approvedString.id, approvedTranslation.stringId),
          )
          .where(eq(approvedTranslation.id, elementRow.approvedTranslationId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
    ctx.db
      .select({ summary: qaReviewRun.summary })
      .from(qaReviewRun)
      .where(
        and(
          eq(qaReviewRun.projectId, queueItem.projectId),
          eq(qaReviewRun.elementId, queueItem.elementId),
          sql`${qaReviewRun.translationId} IS NOT DISTINCT FROM ${queueItem.translationId}`,
        ),
      )
      .orderBy(desc(qaReviewRun.createdAt), desc(qaReviewRun.id))
      .limit(1)
      .then((rows) => rows[0]?.summary ?? null),
    listQaReviewFindings(ctx, {
      queueItemId: queueItem.id,
      includeSuppressed: true,
    }),
    listQaReviewAnnotations(ctx, {
      queueItemId: queueItem.id,
      includeHidden: true,
    }),
    ctx.db
      .select({ ...getColumns(qaReviewDecision) })
      .from(qaReviewDecision)
      .where(eq(qaReviewDecision.queueItemId, queueItem.id))
      .orderBy(desc(qaReviewDecision.createdAt), desc(qaReviewDecision.id)),
  ]);

  const annotationIds = annotations.map((annotation) => annotation.id);
  const suggestions =
    annotationIds.length === 0
      ? []
      : await ctx.db
          .select({ ...getColumns(qaReviewSuggestion) })
          .from(qaReviewSuggestion)
          .where(inArray(qaReviewSuggestion.annotationId, annotationIds))
          .orderBy(
            desc(qaReviewSuggestion.createdAt),
            desc(qaReviewSuggestion.id),
          );

  return {
    queueItem,
    sourceText: elementRow.sourceText,
    sourceLanguageId: elementRow.sourceLanguageId,
    candidateTranslation: candidateRow,
    approvedTranslation: approvedRow,
    latestRunSummary: latestRun,
    findings,
    annotations,
    suggestions,
    decisions,
  };
};
