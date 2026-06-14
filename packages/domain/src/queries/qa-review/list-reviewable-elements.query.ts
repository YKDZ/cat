import { qaReviewQueueItem, sql, type SQL } from "@cat/db";
import {
  EditorElementQuerySchema,
  QaReviewQueueFiltersSchema,
  type EditorContentNodePathItem,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

import { buildEditorScopeElementFilterSql } from "@/queries/content/editor-scope-elements.query";

import { buildQaReviewQueueFiltersSql } from "./list-review-queue-items.query.ts";

export const ListQaReviewableElementsQuerySchema =
  EditorElementQuerySchema.extend({
    queueFilters: QaReviewQueueFiltersSchema.default({
      queueStatus: [],
      riskBucket: [],
      findingAction: [],
      includeResolved: false,
    }),
  });

export type ListQaReviewableElementsQuery = z.infer<
  typeof ListQaReviewableElementsQuerySchema
>;

export type QaReviewableElement = {
  elementId: number;
  projectId: string;
  sourceText: string;
  sourceLanguageId: string;
  primaryContentNodeId: string | null;
  primaryContentNodeLabel: string | null;
  primaryContentNodeKind: string | null;
  contentNodePath: EditorContentNodePathItem[];
  localOrder: number | null;
  contentNodeSortKey: string;
  candidateCount: number;
  maxRiskScore: number;
  riskBucket: typeof qaReviewQueueItem.$inferSelect.riskBucket;
  hardFindingCount: number;
  softFindingCount: number;
  informationalFindingCount: number;
  unresolvedAnnotationCount: number;
  approvedTranslationId: number | null;
  latestActivityAt: Date;
};

/**
 * Build SQL for QA reviewable elements aggregated by element.
 *
 * @param input - Query input
 * @returns - Aggregated query SQL
 */
export const buildQaReviewableElementsSql = (
  input: ListQaReviewableElementsQuery,
): SQL => {
  const query = ListQaReviewableElementsQuerySchema.parse(input);
  const scopeKey = query.branchId ? `branch:${query.branchId}` : "main";

  return sql`
    ${buildEditorScopeElementFilterSql(query)}
    SELECT
      scoped.id AS "elementId",
      scoped."projectId" AS "projectId",
      scoped.value AS "sourceText",
      scoped."languageId" AS "sourceLanguageId",
      scoped."primaryContentNodeId" AS "primaryContentNodeId",
      scoped."primaryContentNodeLabel" AS "primaryContentNodeLabel",
      scoped."primaryContentNodeKind" AS "primaryContentNodeKind",
      scoped."contentNodePath" AS "contentNodePath",
      scoped."localOrder" AS "localOrder",
      scoped."contentNodeSortKey" AS "contentNodeSortKey",
      COUNT(qi.id)::int AS "candidateCount",
      MAX(qi."risk_score")::int AS "maxRiskScore",
      (ARRAY_AGG(qi."risk_bucket" ORDER BY qi."risk_score" DESC, qi.id DESC))[1] AS "riskBucket",
      SUM(qi."hard_finding_count")::int AS "hardFindingCount",
      SUM(qi."soft_finding_count")::int AS "softFindingCount",
      SUM(qi."informational_finding_count")::int AS "informationalFindingCount",
      SUM(qi."unresolved_annotation_count")::int AS "unresolvedAnnotationCount",
      scoped."approvedTranslationId" AS "approvedTranslationId",
      MAX(qi."last_activity_at") AS "latestActivityAt"
    FROM ordered_rows scoped
    INNER JOIN "QaReviewQueueItem" qi
      ON qi."element_id" = scoped.id
     AND qi."project_id" = ${query.projectId}::uuid
     AND qi."language_id" = ${query.languageToId}
     AND qi."scope_key" = ${scopeKey}
     AND ${buildQaReviewQueueFiltersSql(query.queueFilters)}
    GROUP BY
      scoped.id,
      scoped."projectId",
      scoped.value,
      scoped."languageId",
      scoped."primaryContentNodeId",
      scoped."primaryContentNodeLabel",
      scoped."primaryContentNodeKind",
      scoped."contentNodePath",
      scoped."localOrder",
      scoped."contentNodeSortKey",
      scoped."approvedTranslationId"
    ORDER BY
      MAX(qi."risk_score") DESC,
      SUM(qi."hard_finding_count") DESC,
      SUM(qi."unresolved_annotation_count") DESC,
      MAX(qi."last_activity_at") DESC,
      scoped."contentNodeSortKey" ASC,
      COALESCE(scoped."localOrder", 0) ASC,
      scoped.id ASC
  `;
};

/**
 * List reviewable QA elements paginated by element.
 *
 * @param ctx - Query context
 * @param input - Query input
 * @returns - Aggregated reviewable elements
 */
export const listQaReviewableElements: Query<
  ListQaReviewableElementsQuery,
  QaReviewableElement[]
> = async (ctx, input) => {
  const query = ListQaReviewableElementsQuerySchema.parse(input);
  const result = await ctx.db.execute<QaReviewableElement>(sql`
    SELECT *
    FROM (${buildQaReviewableElementsSql(query)}) reviewable_elements
    LIMIT ${query.pageSize}
    OFFSET ${query.page * query.pageSize}
  `);

  return result.rows;
};
