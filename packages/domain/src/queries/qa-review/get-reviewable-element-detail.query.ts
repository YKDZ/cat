import {
  and,
  changeset,
  changesetEntry,
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

import type { DbHandle, Query } from "@/types";

import { listQaReviewAnnotations } from "./list-review-annotations.query.ts";
import { listQaReviewFindings } from "./list-review-findings.query.ts";

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
  findings: Awaited<ReturnType<typeof listQaReviewFindings>>;
  annotations: Awaited<ReturnType<typeof listQaReviewAnnotations>>;
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

  const candidates = await Promise.all(
    queueRows.map(async (queueItem) => {
      const translationRow = await resolveTranslationById(
        ctx.db,
        queueItem.translationId,
      );

      const [latestRun, findings, annotations, decisions] = await Promise.all([
        ctx.db
          .select({ summary: qaReviewRun.summary })
          .from(qaReviewRun)
          .where(
            and(
              eq(qaReviewRun.projectId, query.projectId),
              eq(qaReviewRun.elementId, query.elementId),
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
        translation: translationRow,
        latestRunSummary: latestRun,
        findings,
        annotations,
        decisions,
        suggestions,
      };
    }),
  );

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
