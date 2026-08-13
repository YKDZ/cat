import {
  and,
  changeset,
  changesetEntry,
  desc,
  eq,
  getColumns,
  inArray,
  qaReviewAnnotation,
  qaReviewDecision,
  qaReviewFinding,
  qaReviewQueueItem,
  qaReviewRun,
  qaReviewSuggestion,
  sql,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { DbHandle, Query } from "#/types.ts";

const OPEN_QUEUE_STATUSES = [
  "OPEN",
  "CLAIMED",
  "APPROVABLE",
  "BLOCKED",
  "REQUEST_CHANGES",
] as const;

export const GetQaReviewableElementDetailQuerySchema = z.object({
  projectId: z.uuidv4(),
  languageId: z.string().min(1),
  branchId: z.int().positive().nullable().optional(),
  elementId: z.int().positive(),
});

export type GetQaReviewableElementDetailQuery = z.infer<
  typeof GetQaReviewableElementDetailQuerySchema
>;

export type QaReviewCandidateDetail = {
  queueItem: typeof qaReviewQueueItem.$inferSelect;
  translation: {
    id: number;
    text: string;
    translatorId: string | null;
    createdAt: Date;
  } | null;
  latestRunSummary: string | null;
  findings: Array<typeof qaReviewFinding.$inferSelect>;
  annotations: Array<typeof qaReviewAnnotation.$inferSelect>;
  decisions: Array<typeof qaReviewDecision.$inferSelect>;
  suggestions: Array<typeof qaReviewSuggestion.$inferSelect>;
};

export type QaReviewableElementDetail = {
  elementId: number;
  projectId: string;
  sourceText: string;
  sourceLanguageId: string;
  approvedTranslation: {
    id: number;
    text: string;
    translatorId: string | null;
    createdAt: Date;
  } | null;
  candidates: QaReviewCandidateDetail[];
};

const groupByNumberKey = <TRow>(
  rows: TRow[],
  getKey: (row: TRow) => number | null,
): Map<number, TRow[]> => {
  const grouped = new Map<number, TRow[]>();
  for (const row of rows) {
    const key = getKey(row);
    if (key === null) continue;
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
};

const resolveTranslationById = async (
  db: DbHandle,
  translationId: number | null,
) => {
  if (translationId === null) {
    return null;
  }

  return (
    (
      await db
        .select({
          id: translation.id,
          text: vectorizedString.value,
          translatorId: translation.translatorId,
          createdAt: translation.createdAt,
        })
        .from(translation)
        .innerJoin(
          vectorizedString,
          eq(vectorizedString.id, translation.stringId),
        )
        .where(eq(translation.id, translationId))
        .limit(1)
    )[0] ?? null
  );
};

const resolveApprovedTranslationForQaDetail = async (
  db: DbHandle,
  input: {
    branchId: number | null;
    projectId: string;
    mainApprovedTranslationId: number | null;
    elementId: number;
    languageId: string;
  },
) => {
  if (!input.branchId) {
    return await resolveTranslationById(db, input.mainApprovedTranslationId);
  }

  const branchApprovedRow = (
    await db
      .select({ entityId: changesetEntry.entityId })
      .from(changesetEntry)
      .innerJoin(changeset, eq(changeset.id, changesetEntry.changesetId))
      .where(
        and(
          eq(changeset.projectId, input.projectId),
          eq(changeset.branchId, input.branchId),
          eq(changesetEntry.entityType, "translation"),
          sql`${changesetEntry.after} ->> 'translatableElementId' = ${String(input.elementId)}`,
          sql`${changesetEntry.after} ->> 'languageId' = ${input.languageId}`,
          sql`${changesetEntry.after} ->> 'approved' = 'true'`,
        ),
      )
      .orderBy(desc(changesetEntry.createdAt), desc(changesetEntry.id))
      .limit(1)
  )[0];

  const branchApprovedTranslationId =
    branchApprovedRow?.entityId !== undefined
      ? Number.parseInt(branchApprovedRow.entityId, 10)
      : NaN;

  if (Number.isInteger(branchApprovedTranslationId)) {
    return await resolveTranslationById(db, branchApprovedTranslationId);
  }

  return await resolveTranslationById(db, input.mainApprovedTranslationId);
};

/**
 * Get QA reviewable element detail including all pending candidates and approval state.
 *
 * @param ctx - Query context
 * @param input - Query input
 * @returns - Element detail or null
 */
export const getQaReviewableElementDetail: Query<
  GetQaReviewableElementDetailQuery,
  QaReviewableElementDetail | null
> = async (ctx, input) => {
  const query = GetQaReviewableElementDetailQuerySchema.parse(input);
  const scopeKey = query.branchId ? `branch:${query.branchId}` : "main";

  const elementRow = (
    await ctx.db
      .select({
        id: translatableElement.id,
        projectId: translatableElement.projectId,
        sourceText: vectorizedString.value,
        sourceLanguageId: vectorizedString.languageId,
        approvedTranslationId: translatableElement.approvedTranslationId,
      })
      .from(translatableElement)
      .innerJoin(
        vectorizedString,
        eq(vectorizedString.id, translatableElement.vectorizedStringId),
      )
      .where(
        and(
          eq(translatableElement.projectId, query.projectId),
          eq(translatableElement.id, query.elementId),
        ),
      )
      .limit(1)
  )[0];

  if (!elementRow) {
    return null;
  }

  const queueRows = await ctx.db
    .select({ ...getColumns(qaReviewQueueItem) })
    .from(qaReviewQueueItem)
    .where(
      and(
        eq(qaReviewQueueItem.projectId, query.projectId),
        eq(qaReviewQueueItem.languageId, query.languageId),
        eq(qaReviewQueueItem.elementId, query.elementId),
        eq(qaReviewQueueItem.scopeKey, scopeKey),
        inArray(qaReviewQueueItem.status, [...OPEN_QUEUE_STATUSES]),
        sql`${qaReviewQueueItem.translationId} IS NOT NULL`,
      ),
    )
    .orderBy(
      desc(qaReviewQueueItem.riskScore),
      desc(qaReviewQueueItem.lastActivityAt),
      desc(qaReviewQueueItem.id),
    );

  const candidates: QaReviewCandidateDetail[] = [];
  if (queueRows.length > 0) {
    const queueItemIds = queueRows.map((row) => row.id);
    const translationIds = queueRows.flatMap((row) =>
      row.translationId === null ? [] : [row.translationId],
    );
    const translationRows = await ctx.db
      .select({
        id: translation.id,
        text: vectorizedString.value,
        translatorId: translation.translatorId,
        createdAt: translation.createdAt,
      })
      .from(translation)
      .innerJoin(
        vectorizedString,
        eq(vectorizedString.id, translation.stringId),
      )
      .where(inArray(translation.id, translationIds));
    const runRows = await ctx.db
      .select({
        translationId: qaReviewRun.translationId,
        summary: qaReviewRun.summary,
      })
      .from(qaReviewRun)
      .where(
        and(
          eq(qaReviewRun.projectId, query.projectId),
          eq(qaReviewRun.elementId, query.elementId),
          inArray(qaReviewRun.translationId, translationIds),
        ),
      )
      .orderBy(desc(qaReviewRun.createdAt), desc(qaReviewRun.id));
    const findingRows = await ctx.db
      .select({ ...getColumns(qaReviewFinding) })
      .from(qaReviewFinding)
      .where(
        and(
          eq(qaReviewFinding.projectId, query.projectId),
          eq(qaReviewFinding.elementId, query.elementId),
          inArray(qaReviewFinding.translationId, translationIds),
        ),
      )
      .orderBy(
        desc(qaReviewFinding.riskScore),
        desc(qaReviewFinding.createdAt),
        desc(qaReviewFinding.id),
      );
    const annotationRows = await ctx.db
      .select({ ...getColumns(qaReviewAnnotation) })
      .from(qaReviewAnnotation)
      .where(inArray(qaReviewAnnotation.queueItemId, queueItemIds))
      .orderBy(
        sql`${qaReviewAnnotation.rootAnnotationId} NULLS FIRST`,
        qaReviewAnnotation.createdAt,
        qaReviewAnnotation.id,
      );
    const decisionRows = await ctx.db
      .select({ ...getColumns(qaReviewDecision) })
      .from(qaReviewDecision)
      .where(inArray(qaReviewDecision.queueItemId, queueItemIds))
      .orderBy(desc(qaReviewDecision.createdAt), desc(qaReviewDecision.id));
    const annotationIds = annotationRows.map((annotation) => annotation.id);
    const suggestionRows =
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

    const translationsById = new Map(
      translationRows.map((row) => [row.id, row]),
    );
    const latestRunByTranslationId = new Map<number, string | null>();
    for (const row of runRows) {
      if (
        row.translationId !== null &&
        !latestRunByTranslationId.has(row.translationId)
      ) {
        latestRunByTranslationId.set(row.translationId, row.summary);
      }
    }
    const findingsByTranslationId = groupByNumberKey(
      findingRows,
      (row) => row.translationId,
    );
    const annotationsByQueueItemId = groupByNumberKey(
      annotationRows,
      (row) => row.queueItemId,
    );
    const decisionsByQueueItemId = groupByNumberKey(
      decisionRows,
      (row) => row.queueItemId,
    );
    const queueItemIdByAnnotationId = new Map(
      annotationRows.map((row) => [row.id, row.queueItemId]),
    );
    const suggestionsByQueueItemId = groupByNumberKey(
      suggestionRows,
      (row) => queueItemIdByAnnotationId.get(row.annotationId) ?? null,
    );

    for (const queueItem of queueRows) {
      const translationId = queueItem.translationId;
      candidates.push({
        queueItem,
        translation:
          translationId === null
            ? null
            : (translationsById.get(translationId) ?? null),
        latestRunSummary:
          translationId === null
            ? null
            : (latestRunByTranslationId.get(translationId) ?? null),
        findings:
          translationId === null
            ? []
            : (findingsByTranslationId.get(translationId) ?? []),
        annotations: annotationsByQueueItemId.get(queueItem.id) ?? [],
        decisions: decisionsByQueueItemId.get(queueItem.id) ?? [],
        suggestions: suggestionsByQueueItemId.get(queueItem.id) ?? [],
      });
    }
  }

  const approvedTranslation = await resolveApprovedTranslationForQaDetail(
    ctx.db,
    {
      branchId: query.branchId ?? null,
      projectId: query.projectId,
      mainApprovedTranslationId: elementRow.approvedTranslationId,
      elementId: query.elementId,
      languageId: query.languageId,
    },
  );

  return {
    elementId: elementRow.id,
    projectId: elementRow.projectId,
    sourceText: elementRow.sourceText,
    sourceLanguageId: elementRow.sourceLanguageId,
    approvedTranslation,
    candidates,
  };
};
