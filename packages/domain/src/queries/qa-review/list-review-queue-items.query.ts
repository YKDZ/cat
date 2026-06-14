import { qaReviewQueueItem, sql, type SQL } from "@cat/db";
import {
  EditorElementQuerySchema,
  QaReviewQueueFiltersSchema,
  type EditorContentNodePathItem,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

import { buildEditorScopeElementFilterSql } from "@/queries/content/editor-scope-elements.query";

const CLOSED_FINDING_DISPOSITIONS_SQL = sql`('FALSE_POSITIVE', 'ACCEPTED', 'SUPPRESSED', 'SUPERSEDED')`;

const enumListSql = (values: string[]) =>
  values.length === 0
    ? sql`NULL`
    : sql.join(
        values.map((value) => sql`${value}`),
        sql`, `,
      );

export const buildQaReviewQueueFiltersSql = (
  queueFilters: z.infer<typeof QaReviewQueueFiltersSchema>,
): SQL => sql`
  ${
    queueFilters.includeResolved
      ? sql`TRUE`
      : sql`qi.status NOT IN ('RESOLVED', 'SUPERSEDED')`
  }
  AND ${
    queueFilters.queueStatus.length === 0
      ? sql`TRUE`
      : sql`qi.status IN (${enumListSql(queueFilters.queueStatus)})`
  }
  AND ${
    queueFilters.riskBucket.length === 0
      ? sql`TRUE`
      : sql`qi."risk_bucket" IN (${enumListSql(queueFilters.riskBucket)})`
  }
  AND ${
    queueFilters.claimedBy === undefined
      ? sql`TRUE`
      : sql`qi."claimed_by" = ${queueFilters.claimedBy}::uuid`
  }
  AND ${
    queueFilters.findingAction.length === 0
      ? sql`TRUE`
      : sql`EXISTS (
          SELECT 1
          FROM "QaReviewFinding" finding
          WHERE finding."project_id" = qi."project_id"
            AND finding."element_id" = qi."element_id"
            AND finding."translation_id" IS NOT DISTINCT FROM qi."translation_id"
            AND finding.disposition NOT IN ${CLOSED_FINDING_DISPOSITIONS_SQL}
            AND finding.action IN (${enumListSql(queueFilters.findingAction)})
        )`
  }
`;

export const ListQaReviewQueueItemsQuerySchema =
  EditorElementQuerySchema.extend({
    queueFilters: QaReviewQueueFiltersSchema.default({
      queueStatus: [],
      riskBucket: [],
      findingAction: [],
      includeResolved: false,
    }),
  });

export type ListQaReviewQueueItemsQuery = z.infer<
  typeof ListQaReviewQueueItemsQuerySchema
>;

export type QaReviewQueueListItem = {
  queueItem: typeof qaReviewQueueItem.$inferSelect;
  sourceText: string;
  translationText: string | null;
  translatorId: string | null;
  primaryContentNodeId: string | null;
  primaryContentNodeLabel: string | null;
  primaryContentNodeKind: string | null;
  contentNodePath: EditorContentNodePathItem[];
  localOrder: number | null;
  contentNodeSortKey: string;
  latestRunSummary: string | null;
};

type QaReviewQueueListRawRow = {
  queueItemId: number;
  queueItemProjectId: string;
  queueItemLanguageId: string;
  queueItemElementId: number;
  queueItemTranslationId: number | null;
  queueItemBranchId: number | null;
  queueItemPullRequestId: number | null;
  queueItemScopeKey: string;
  queueItemStatus: typeof qaReviewQueueItem.$inferSelect.status;
  queueItemRiskBucket: typeof qaReviewQueueItem.$inferSelect.riskBucket;
  queueItemRiskScore: number;
  queueItemHardFindingCount: number;
  queueItemSoftFindingCount: number;
  queueItemInformationalFindingCount: number;
  queueItemUnresolvedAnnotationCount: number;
  queueItemAnnotationCount: number;
  queueItemClaimedBy: string | null;
  queueItemClaimedAt: Date | null;
  queueItemLastFindingAt: Date | null;
  queueItemLastActivityAt: Date;
  queueItemResolvedAt: Date | null;
  queueItemSupersededByTranslationId: number | null;
  queueItemOptimisticVersion: number;
  queueItemCreatedAt: Date;
  queueItemUpdatedAt: Date;
  sourceText: string;
  translationText: string | null;
  translatorId: string | null;
  primaryContentNodeId: string | null;
  primaryContentNodeLabel: string | null;
  primaryContentNodeKind: string | null;
  contentNodePath: EditorContentNodePathItem[];
  localOrder: number | null;
  contentNodeSortKey: string;
  latestRunSummary: string | null;
};

export const buildQaReviewQueueRowsSql = (
  input: ListQaReviewQueueItemsQuery,
): SQL => {
  const query = ListQaReviewQueueItemsQuerySchema.parse(input);
  const scopeKey = query.branchId ? `branch:${query.branchId}` : "main";

  return sql`
    ${buildEditorScopeElementFilterSql(query)}
    SELECT
      qi.id AS "queueItemId",
      qi."project_id" AS "queueItemProjectId",
      qi."language_id" AS "queueItemLanguageId",
      qi."element_id" AS "queueItemElementId",
      qi."translation_id" AS "queueItemTranslationId",
      qi."branch_id" AS "queueItemBranchId",
      qi."pull_request_id" AS "queueItemPullRequestId",
      qi."scope_key" AS "queueItemScopeKey",
      qi.status AS "queueItemStatus",
      qi."risk_bucket" AS "queueItemRiskBucket",
      qi."risk_score" AS "queueItemRiskScore",
      qi."hard_finding_count" AS "queueItemHardFindingCount",
      qi."soft_finding_count" AS "queueItemSoftFindingCount",
      qi."informational_finding_count" AS "queueItemInformationalFindingCount",
      qi."unresolved_annotation_count" AS "queueItemUnresolvedAnnotationCount",
      qi."annotation_count" AS "queueItemAnnotationCount",
      qi."claimed_by" AS "queueItemClaimedBy",
      qi."claimed_at" AS "queueItemClaimedAt",
      qi."last_finding_at" AS "queueItemLastFindingAt",
      qi."last_activity_at" AS "queueItemLastActivityAt",
      qi."resolved_at" AS "queueItemResolvedAt",
      qi."superseded_by_translation_id" AS "queueItemSupersededByTranslationId",
      qi."optimistic_version" AS "queueItemOptimisticVersion",
      qi."created_at" AS "queueItemCreatedAt",
      qi."updated_at" AS "queueItemUpdatedAt",
      scoped.value AS "sourceText",
      candidate_string.value AS "translationText",
      candidate_translation."translator_id" AS "translatorId",
      scoped."primaryContentNodeId" AS "primaryContentNodeId",
      scoped."primaryContentNodeLabel" AS "primaryContentNodeLabel",
      scoped."primaryContentNodeKind" AS "primaryContentNodeKind",
      scoped."contentNodePath" AS "contentNodePath",
      scoped."localOrder" AS "localOrder",
      scoped."contentNodeSortKey" AS "contentNodeSortKey",
      latest_run.summary AS "latestRunSummary"
    FROM "QaReviewQueueItem" qi
    INNER JOIN ordered_rows scoped
      ON scoped.id = qi."element_id"
    LEFT JOIN "Translation" candidate_translation
      ON candidate_translation.id = qi."translation_id"
    LEFT JOIN "VectorizedString" candidate_string
      ON candidate_string.id = candidate_translation."string_id"
    LEFT JOIN LATERAL (
      SELECT run.summary
      FROM "QaReviewRun" run
      WHERE run."project_id" = qi."project_id"
        AND run."element_id" = qi."element_id"
        AND run."translation_id" IS NOT DISTINCT FROM qi."translation_id"
      ORDER BY run."created_at" DESC, run.id DESC
      LIMIT 1
    ) latest_run ON TRUE
    WHERE qi."project_id" = ${query.projectId}::uuid
      AND qi."language_id" = ${query.languageToId}
      AND qi."scope_key" = ${scopeKey}
      AND ${buildQaReviewQueueFiltersSql(query.queueFilters)}
    ORDER BY
      qi."risk_score" DESC,
      qi."hard_finding_count" DESC,
      qi."unresolved_annotation_count" DESC,
      qi."last_activity_at" DESC,
      scoped."contentNodeSortKey" ASC,
      COALESCE(scoped."localOrder", 0) ASC,
      qi."element_id" ASC
  `;
};

/**
 * List QA review queue items with pagination using the shared editor scope and queue filters.
 */
export const listQaReviewQueueItems: Query<
  ListQaReviewQueueItemsQuery,
  QaReviewQueueListItem[]
> = async (ctx, input) => {
  const query = ListQaReviewQueueItemsQuerySchema.parse(input);
  const result = await ctx.db.execute<QaReviewQueueListRawRow>(sql`
    SELECT *
    FROM (${buildQaReviewQueueRowsSql(query)}) queue_rows
    LIMIT ${query.pageSize}
    OFFSET ${query.page * query.pageSize}
  `);

  return result.rows.map((row) => ({
    queueItem: {
      id: row.queueItemId,
      projectId: row.queueItemProjectId,
      languageId: row.queueItemLanguageId,
      elementId: row.queueItemElementId,
      translationId: row.queueItemTranslationId,
      branchId: row.queueItemBranchId,
      pullRequestId: row.queueItemPullRequestId,
      scopeKey: row.queueItemScopeKey,
      status: row.queueItemStatus,
      riskBucket: row.queueItemRiskBucket,
      riskScore: row.queueItemRiskScore,
      hardFindingCount: row.queueItemHardFindingCount,
      softFindingCount: row.queueItemSoftFindingCount,
      informationalFindingCount: row.queueItemInformationalFindingCount,
      unresolvedAnnotationCount: row.queueItemUnresolvedAnnotationCount,
      annotationCount: row.queueItemAnnotationCount,
      claimedBy: row.queueItemClaimedBy,
      claimedAt: row.queueItemClaimedAt,
      lastFindingAt: row.queueItemLastFindingAt,
      lastActivityAt: row.queueItemLastActivityAt,
      resolvedAt: row.queueItemResolvedAt,
      supersededByTranslationId: row.queueItemSupersededByTranslationId,
      optimisticVersion: row.queueItemOptimisticVersion,
      createdAt: row.queueItemCreatedAt,
      updatedAt: row.queueItemUpdatedAt,
    },
    sourceText: row.sourceText,
    translationText: row.translationText,
    translatorId: row.translatorId,
    primaryContentNodeId: row.primaryContentNodeId,
    primaryContentNodeLabel: row.primaryContentNodeLabel,
    primaryContentNodeKind: row.primaryContentNodeKind,
    contentNodePath: row.contentNodePath,
    localOrder: row.localOrder,
    contentNodeSortKey: row.contentNodeSortKey,
    latestRunSummary: row.latestRunSummary,
  }));
};
