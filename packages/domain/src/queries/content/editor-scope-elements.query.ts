import type {
  EditorElement,
  EditorElementPageIndexQuery,
  EditorElementQuery,
  EditorFirstElementQuery,
  EditorTranslationStatusFilter,
} from "@cat/shared";

import { sql } from "@cat/db";
import {
  EditorElementPageIndexQuerySchema,
  EditorElementQuerySchema,
  EditorFirstElementQuerySchema,
} from "@cat/shared";

import type { DbContext, Query } from "@/types";

import {
  buildElementPriorityPlan,
  MAX_REUSE_FIRST_SCOPE_ROWS,
  orderRowsByPriorityPlan,
  type PriorityRankableEditorElement,
} from "./element-priority";

/**
 * Schema for paginated editor-scope element queries.
 */
export const ListEditorScopeElementsQuerySchema = EditorElementQuerySchema;

/**
 * Type for paginated editor-scope element queries.
 */
export type ListEditorScopeElementsQuery = EditorElementQuery;

/**
 * Schema for editor-scope element count queries.
 */
export const CountEditorScopeElementsQuerySchema =
  EditorElementQuerySchema.omit({
    page: true,
    pageSize: true,
  });

/**
 * Type for editor-scope element count queries.
 */
export type CountEditorScopeElementsQuery = Omit<
  EditorElementQuery,
  "page" | "pageSize"
>;

/**
 * Schema for fetching the first matching element in an editor scope.
 */
export const GetEditorScopeFirstElementQuerySchema =
  EditorFirstElementQuerySchema;

/**
 * Type for fetching the first matching element in an editor scope.
 */
export type GetEditorScopeFirstElementQuery = EditorFirstElementQuery;

/**
 * Schema for editor-scope element page-index queries.
 */
export const GetEditorScopeElementPageIndexQuerySchema =
  EditorElementPageIndexQuerySchema;

/**
 * Type for editor-scope element page-index queries.
 */
export type GetEditorScopeElementPageIndexQuery = EditorElementPageIndexQuery;

export type EditorScopeSqlInput = CountEditorScopeElementsQuery;

type EditorScopeRow = PriorityRankableEditorElement;

const uuidListSql = (ids: string[]) =>
  ids.length === 0
    ? sql`NULL::uuid`
    : sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      );

const selectedNodePredicateSql = (query: EditorScopeSqlInput) =>
  query.contentNodeIds.length === 0
    ? sql`FALSE`
    : sql`cn.id IN (${uuidListSql(query.contentNodeIds)})`;

const scopePredicateSql = (query: EditorScopeSqlInput) =>
  query.contentNodeIds.length === 0
    ? sql`TRUE`
    : sql`primary_rel."source_node_id" IN (SELECT id FROM selected_nodes)`;

const searchPredicateSql = (query: EditorScopeSqlInput) =>
  query.searchQuery.trim() === ""
    ? sql`TRUE`
    : sql`source_string.value ILIKE ${`%${query.searchQuery.trim()}%`}`;

const branchOverlayCtesSql = (branchId: number | undefined) => {
  if (branchId === undefined) {
    return sql`
      visible_content_nodes AS (SELECT * FROM "ContentNode"),
      visible_content_relations AS (SELECT * FROM "ContentRelation"),
      visible_elements AS (SELECT * FROM "TranslatableElement"),
      visible_translation_states AS (
        SELECT
          translation_row.id,
          translation_row."translatable_element_id",
          translation_string."language_id",
          FALSE AS "is_branch_overlay",
          FALSE AS "is_approved_overlay"
        FROM "Translation" translation_row
        INNER JOIN "VectorizedString" translation_string
          ON translation_string.id = translation_row."string_id"
      )
    `;
  }

  return sql`
    latest_branch_entries AS (
      SELECT DISTINCT ON (entry."entity_type", entry."entity_id")
        entry."entity_type",
        entry."entity_id",
        entry.action,
        entry.after
      FROM "ChangesetEntry" entry
      INNER JOIN "Changeset" changeset
        ON changeset.id = entry."changeset_id"
      WHERE changeset."branch_id" = ${branchId}
        AND entry."entity_type" IN ('content_node', 'content_relation', 'element', 'translation')
      ORDER BY entry."entity_type", entry."entity_id", entry.id DESC
    ),
    visible_content_nodes AS (
      SELECT main.*
      FROM "ContentNode" main
      LEFT JOIN latest_branch_entries overlay
        ON overlay."entity_type" = 'content_node'
       AND overlay."entity_id" = main.id::text
      WHERE overlay."entity_id" IS NULL
      UNION ALL
      SELECT
        (overlay.after->>'id')::uuid AS id,
        (overlay.after->>'projectId')::uuid AS "project_id",
        (overlay.after->>'creatorId')::uuid AS "creator_id",
        (overlay.after->>'kind')::"ContentNodeKind" AS kind,
        overlay.after->>'displayLabel' AS "display_label",
        overlay.after->>'importerId' AS "importer_id",
        overlay.after->>'sourceRootRef' AS "source_root_ref",
        overlay.after->>'stableSourceNodeRef' AS "stable_source_node_ref",
        overlay.after->>'sourceUri' AS "source_uri",
        overlay.after->>'sourcePath' AS "source_path",
        overlay.after->>'sourceType' AS "source_type",
        overlay.after->>'languageId' AS "language_id",
        (overlay.after->>'exportRole')::"ContentNodeExportRole" AS "export_role",
        (overlay.after->>'boundaryType')::"ContentBoundaryType" AS "boundary_type",
        (overlay.after->>'fileHandlerId')::int AS "file_handler_id",
        (overlay.after->>'fileId')::int AS "file_id",
        COALESCE((overlay.after->>'lifecycleStatus')::"ContentNodeLifecycleStatus", 'ACTIVE') AS "lifecycle_status",
        overlay.after->'provenance' AS provenance,
        overlay.after->'metadata' AS metadata,
        COALESCE((overlay.after->>'createdAt')::timestamptz, now()) AS "created_at",
        COALESCE((overlay.after->>'updatedAt')::timestamptz, now()) AS "updated_at"
      FROM latest_branch_entries overlay
      WHERE overlay."entity_type" = 'content_node'
        AND overlay.action IN ('CREATE', 'UPDATE')
        AND overlay.after IS NOT NULL
    ),
    visible_content_relations AS (
      SELECT main.*
      FROM "ContentRelation" main
      LEFT JOIN latest_branch_entries overlay
        ON overlay."entity_type" = 'content_relation'
       AND overlay."entity_id" = main.id::text
      WHERE overlay."entity_id" IS NULL
      UNION ALL
      SELECT
        (overlay.after->>'id')::uuid AS id,
        (overlay.after->>'projectId')::uuid AS "project_id",
        (overlay.after->>'relationTypeId')::int AS "relation_type_id",
        (overlay.after->>'sourceEndpointKind')::"RelationEndpointKind" AS "source_endpoint_kind",
        (overlay.after->>'sourceNodeId')::uuid AS "source_node_id",
        (overlay.after->>'sourceElementId')::int AS "source_element_id",
        (overlay.after->>'targetEndpointKind')::"RelationEndpointKind" AS "target_endpoint_kind",
        (overlay.after->>'targetNodeId')::uuid AS "target_node_id",
        (overlay.after->>'targetElementId')::int AS "target_element_id",
        COALESCE((overlay.after->>'isPrimary')::boolean, FALSE) AS "is_primary",
        (overlay.after->>'localOrder')::int AS "local_order",
        COALESCE((overlay.after->>'confidenceBasisPoints')::int, 10000) AS "confidence_basis_points",
        COALESCE((overlay.after->>'lifecycleStatus')::"ContentRelationLifecycleStatus", 'ACTIVE') AS "lifecycle_status",
        overlay.after->'weightHint' AS "weight_hint",
        overlay.after->'provenance' AS provenance,
        overlay.after->'validationMetadata' AS "validation_metadata",
        COALESCE((overlay.after->>'createdAt')::timestamptz, now()) AS "created_at",
        COALESCE((overlay.after->>'updatedAt')::timestamptz, now()) AS "updated_at"
      FROM latest_branch_entries overlay
      WHERE overlay."entity_type" = 'content_relation'
        AND overlay.action IN ('CREATE', 'UPDATE')
        AND overlay.after IS NOT NULL
    ),
    visible_elements AS (
      SELECT main.*
      FROM "TranslatableElement" main
      LEFT JOIN latest_branch_entries overlay
        ON overlay."entity_type" = 'element'
       AND overlay."entity_id" = main.id::text
      WHERE overlay."entity_id" IS NULL
      UNION ALL
      SELECT
        (overlay.after->>'id')::int AS id,
        (overlay.after->>'projectId')::uuid AS "project_id",
        overlay.after->>'importerId' AS "importer_id",
        overlay.after->>'sourceRootRef' AS "source_root_ref",
        overlay.after->>'sourceNodeRef' AS "source_node_ref",
        overlay.after->>'stableSourceRef' AS "stable_source_ref",
        COALESCE((overlay.after->>'identityStatus')::"ContentIdentityStatus", 'ACTIVE') AS "identity_status",
        COALESCE((overlay.after->>'identityConfidence')::int, 10000) AS "identity_confidence",
        overlay.after->'meta' AS meta,
        (overlay.after->>'sourceStartLine')::int AS "source_start_line",
        (overlay.after->>'sourceEndLine')::int AS "source_end_line",
        overlay.after->'sourceLocationMeta' AS "source_location_meta",
        (overlay.after->>'creatorId')::uuid AS "creator_id",
        (overlay.after->>'vectorizedStringId')::int AS "vectorized_string_id",
        (overlay.after->>'approvedTranslationId')::int AS "approved_translation_id",
        COALESCE((overlay.after->>'createdAt')::timestamptz, now()) AS "created_at",
        COALESCE((overlay.after->>'updatedAt')::timestamptz, now()) AS "updated_at"
      FROM latest_branch_entries overlay
      WHERE overlay."entity_type" = 'element'
        AND overlay.action IN ('CREATE', 'UPDATE')
        AND overlay.after IS NOT NULL
    ),
    visible_translation_states AS (
      SELECT
        main.id,
        main."translatable_element_id",
        translation_string."language_id",
        FALSE AS "is_branch_overlay",
        FALSE AS "is_approved_overlay"
      FROM "Translation" main
      INNER JOIN "VectorizedString" translation_string
        ON translation_string.id = main."string_id"
      LEFT JOIN latest_branch_entries overlay
        ON overlay."entity_type" = 'translation'
       AND overlay."entity_id" = main.id::text
      WHERE overlay."entity_id" IS NULL
      UNION ALL
      SELECT
        NULL::int AS id,
        (overlay.after->>'translatableElementId')::int AS "translatable_element_id",
        overlay.after->>'languageId' AS "language_id",
        TRUE AS "is_branch_overlay",
        COALESCE((overlay.after->>'approved')::boolean, FALSE) AS "is_approved_overlay"
      FROM latest_branch_entries overlay
      WHERE overlay."entity_type" = 'translation'
        AND overlay.action IN ('CREATE', 'UPDATE')
        AND overlay.after IS NOT NULL
    )
  `;
};

const translatedExistsSql = (languageToId: string) => sql`EXISTS (
  SELECT 1
  FROM visible_translation_states translation_state
  WHERE translation_state."translatable_element_id" = element.id
    AND translation_state."language_id" = ${languageToId}
)`;

const approvedExistsSql = (languageToId: string) => sql`EXISTS (
  SELECT 1
  FROM visible_translation_states translation_state
  WHERE translation_state."translatable_element_id" = element.id
    AND translation_state."language_id" = ${languageToId}
    AND (
      translation_state.id = element."approved_translation_id"
      OR translation_state."is_approved_overlay" = TRUE
    )
)`;

const statusCaseSql = (languageToId: string) => sql`CASE
  WHEN ${approvedExistsSql(languageToId)} THEN 'APPROVED'
  WHEN ${translatedExistsSql(languageToId)} THEN 'TRANSLATED'
  ELSE 'NO'
END`;

const statusPredicateSql = (
  languageToId: string,
  statusFilter: EditorTranslationStatusFilter,
) => {
  if (statusFilter === "all") return sql`TRUE`;
  if (statusFilter === "untranslated") {
    return sql`NOT ${translatedExistsSql(languageToId)}`;
  }
  if (statusFilter === "translated") {
    return translatedExistsSql(languageToId);
  }
  if (statusFilter === "approved") {
    return approvedExistsSql(languageToId);
  }
  return sql`${translatedExistsSql(languageToId)} AND NOT ${approvedExistsSql(
    languageToId,
  )}`;
};

const orderedScopeSql = (query: EditorScopeSqlInput) => sql`
  WITH RECURSIVE
  ${branchOverlayCtesSql(query.branchId)},
  selected_nodes(id) AS (
    SELECT cn.id
    FROM visible_content_nodes cn
    WHERE cn."project_id" = ${query.projectId}::uuid
      AND cn."lifecycle_status" = 'ACTIVE'
      AND ${selectedNodePredicateSql(query)}
    UNION
    SELECT child_rel."target_node_id"
    FROM selected_nodes selected
    INNER JOIN visible_content_relations child_rel
      ON child_rel."source_node_id" = selected.id
     AND child_rel."source_endpoint_kind" = 'NODE'
     AND child_rel."target_endpoint_kind" = 'NODE'
     AND child_rel."target_node_id" IS NOT NULL
     AND child_rel."is_primary" = TRUE
     AND child_rel."lifecycle_status" = 'ACTIVE'
    INNER JOIN "ContentRelationType" child_type
      ON child_type.id = child_rel."relation_type_id"
     AND child_type."participates_in_containment" = TRUE
  ),
  node_tree(id, path_label, sort_key, path_json) AS (
    SELECT
      cn.id,
      cn."display_label"::text,
      (
        LPAD(COALESCE(parent_rel."local_order", 0)::text, 10, '0') ||
        ':' || cn."display_label" || ':' || cn.id::text
      )::text,
      jsonb_build_array(
        jsonb_build_object(
          'id',
          cn.id,
          'label',
          cn."display_label",
          'kind',
          cn.kind
        )
      )
    FROM visible_content_nodes cn
    LEFT JOIN visible_content_relations parent_rel
      ON parent_rel."target_node_id" = cn.id
     AND parent_rel."target_endpoint_kind" = 'NODE'
     AND parent_rel."is_primary" = TRUE
     AND parent_rel."lifecycle_status" = 'ACTIVE'
    LEFT JOIN "ContentRelationType" parent_type
      ON parent_type.id = parent_rel."relation_type_id"
     AND parent_type."participates_in_containment" = TRUE
    WHERE cn."project_id" = ${query.projectId}::uuid
      AND cn."lifecycle_status" = 'ACTIVE'
      AND parent_rel.id IS NULL
    UNION ALL
    SELECT
      child.id,
      (node_tree.path_label || ' / ' || child."display_label")::text,
      (
        node_tree.sort_key ||
        '/' ||
        LPAD(COALESCE(edge."local_order", 0)::text, 10, '0') ||
        ':' || child."display_label" || ':' || child.id::text
      )::text,
      node_tree.path_json || jsonb_build_array(
        jsonb_build_object(
          'id',
          child.id,
          'label',
          child."display_label",
          'kind',
          child.kind
        )
      )
    FROM node_tree
    INNER JOIN visible_content_relations edge
      ON edge."source_node_id" = node_tree.id
     AND edge."source_endpoint_kind" = 'NODE'
     AND edge."target_endpoint_kind" = 'NODE'
     AND edge."target_node_id" IS NOT NULL
     AND edge."is_primary" = TRUE
     AND edge."lifecycle_status" = 'ACTIVE'
    INNER JOIN "ContentRelationType" edge_type
      ON edge_type.id = edge."relation_type_id"
     AND edge_type."participates_in_containment" = TRUE
    INNER JOIN visible_content_nodes child
      ON child.id = edge."target_node_id"
     AND child."lifecycle_status" = 'ACTIVE'
  ),
  scoped_rows AS (
    SELECT
      element.id,
      element."project_id" AS "projectId",
      element."importer_id" AS "importerId",
      element."source_root_ref" AS "sourceRootRef",
      element."source_node_ref" AS "sourceNodeRef",
      element."stable_source_ref" AS "stableSourceRef",
      element."identity_status" AS "identityStatus",
      element."identity_confidence" AS "identityConfidence",
      element.meta,
      element."source_start_line" AS "sourceStartLine",
      element."source_end_line" AS "sourceEndLine",
      element."source_location_meta" AS "sourceLocationMeta",
      element."creator_id" AS "creatorId",
      element."vectorized_string_id" AS "vectorizedStringId",
      element."approved_translation_id" AS "approvedTranslationId",
      element."created_at" AS "createdAt",
      element."updated_at" AS "updatedAt",
      source_string.value,
      source_string."language_id" AS "languageId",
      ${statusCaseSql(query.languageToId)} AS status,
      primary_rel."source_node_id" AS "primaryContentNodeId",
      primary_node."display_label" AS "primaryContentNodeLabel",
      primary_node.kind AS "primaryContentNodeKind",
      COALESCE(
        node_tree.path_json,
        jsonb_build_array(
          jsonb_build_object(
            'id',
            primary_node.id,
            'label',
            primary_node."display_label",
            'kind',
            primary_node.kind
          )
        )
      ) AS "contentNodePath",
      primary_rel."local_order" AS "localOrder",
      COALESCE(
        node_tree.sort_key,
        primary_node."display_label" || ':' || primary_node.id::text
      ) AS "contentNodeSortKey"
    FROM visible_elements element
    INNER JOIN "VectorizedString" source_string
      ON source_string.id = element."vectorized_string_id"
    INNER JOIN visible_content_relations primary_rel
      ON primary_rel."target_element_id" = element.id
     AND primary_rel."target_endpoint_kind" = 'ELEMENT'
     AND primary_rel."source_endpoint_kind" = 'NODE'
     AND primary_rel."source_node_id" IS NOT NULL
     AND primary_rel."is_primary" = TRUE
     AND primary_rel."lifecycle_status" = 'ACTIVE'
    INNER JOIN visible_content_nodes primary_node
      ON primary_node.id = primary_rel."source_node_id"
     AND primary_node."project_id" = ${query.projectId}::uuid
     AND primary_node."lifecycle_status" = 'ACTIVE'
    LEFT JOIN node_tree ON node_tree.id = primary_node.id
    WHERE element."project_id" = ${query.projectId}::uuid
      AND element."identity_status" = 'ACTIVE'
      AND ${scopePredicateSql(query)}
      AND ${searchPredicateSql(query)}
      AND ${statusPredicateSql(query.languageToId, query.statusFilter)}
  ),
  ordered_rows AS (
    SELECT
      scoped_rows.*,
      (
        ROW_NUMBER() OVER (
          ORDER BY "contentNodeSortKey" ASC, COALESCE("localOrder", 0) ASC, id ASC
        ) - 1
      )::int AS position
    FROM scoped_rows
  )
`;

/**
 * Build the shared CTE/filter SQL used by editor-scope element queries.
 */
export const buildEditorScopeElementFilterSql = (
  query: EditorScopeSqlInput,
): ReturnType<typeof orderedScopeSql> => orderedScopeSql(query);

const listStructuralRows = async (
  ctx: DbContext,
  query: EditorScopeSqlInput,
  limit?: number,
): Promise<EditorScopeRow[]> => {
  const result = await ctx.db.execute<EditorScopeRow>(sql`
    ${orderedScopeSql(query)}
    SELECT *
    FROM ordered_rows
    ORDER BY position ASC
    ${limit === undefined ? sql`` : sql`LIMIT ${limit}`}
  `);

  return result.rows;
};

const listStructuralPageRows = async (
  ctx: DbContext,
  query: ListEditorScopeElementsQuery,
): Promise<EditorScopeRow[]> => {
  const offset = query.page * query.pageSize;
  const result = await ctx.db.execute<EditorScopeRow>(sql`
    ${orderedScopeSql(query)}
    SELECT *
    FROM ordered_rows
    WHERE position >= ${offset}
      AND position < ${offset + query.pageSize}
    ORDER BY position ASC
  `);

  return result.rows;
};

const attachStructuralFallbackPriority = <T extends EditorScopeRow>(
  rows: T[],
): Array<T & { priority: NonNullable<EditorElement["priority"]> }> =>
  rows.map((row) => ({
    ...row,
    priority: {
      mode: "reuse-first",
      score: 0,
      confidence: 1,
      reasonCodes: ["STRUCTURE_FALLBACK"],
      structurePosition: row.position,
      priorityPosition: row.position,
    },
  }));

const listReuseFirstRowsOrFallback = async (
  ctx: DbContext,
  query: EditorScopeSqlInput,
): Promise<{ rows: EditorScopeRow[]; fallback: boolean }> => {
  const probedRows = await listStructuralRows(
    ctx,
    query,
    MAX_REUSE_FIRST_SCOPE_ROWS + 1,
  );
  if (probedRows.length > MAX_REUSE_FIRST_SCOPE_ROWS) {
    return {
      rows: probedRows.slice(0, MAX_REUSE_FIRST_SCOPE_ROWS),
      fallback: true,
    };
  }

  try {
    const plan = buildElementPriorityPlan(probedRows, "reuse-first");
    return {
      rows: orderRowsByPriorityPlan(probedRows, plan),
      fallback: false,
    };
  } catch {
    return { rows: probedRows, fallback: true };
  }
};

/**
 * List elements by editor scope with pagination; an empty `contentNodeIds` means the whole project.
 */
export const listEditorScopeElements: Query<
  ListEditorScopeElementsQuery,
  EditorElement[]
> = async (ctx, query) => {
  const offset = query.page * query.pageSize;

  if (query.sortMode === "structure") {
    return await listStructuralPageRows(ctx, query);
  }

  const { rows, fallback } = await listReuseFirstRowsOrFallback(ctx, query);
  if (fallback) {
    return attachStructuralFallbackPriority(
      await listStructuralPageRows(ctx, query),
    );
  }

  return rows.slice(offset, offset + query.pageSize);
};

/**
 * Count the elements matching filters inside the editor scope.
 */
export const countEditorScopeElements: Query<
  CountEditorScopeElementsQuery,
  number
> = async (ctx, query) => {
  const result = await ctx.db.execute<{ count: string }>(sql`
    ${orderedScopeSql(query)}
    SELECT COUNT(*)::text AS count
    FROM ordered_rows
  `);

  return Number(result.rows[0]?.count ?? 0);
};

/**
 * Get the first matching element in the editor scope, or the first one after a given element.
 */
export const getEditorScopeFirstElement: Query<
  GetEditorScopeFirstElementQuery,
  EditorElement | null
> = async (ctx, query) => {
  if (query.sortMode === "reuse-first") {
    const currentPlan = await listReuseFirstRowsOrFallback(ctx, query);
    if (!currentPlan.fallback) {
      if (!query.afterElementId) {
        return currentPlan.rows[0] ?? null;
      }

      const unfilteredPlan = await listReuseFirstRowsOrFallback(ctx, {
        ...query,
        statusFilter: "all",
      });
      if (!unfilteredPlan.fallback) {
        const unfilteredPositionById = new Map(
          unfilteredPlan.rows.map((row, index) => [row.id, index]),
        );
        const afterPosition = query.afterElementId
          ? unfilteredPositionById.get(query.afterElementId)
          : undefined;

        if (afterPosition === undefined) {
          return currentPlan.rows[0] ?? null;
        }

        let best: EditorScopeRow | null = null;
        let bestPosition = Number.POSITIVE_INFINITY;
        for (const row of currentPlan.rows) {
          const position = unfilteredPositionById.get(row.id);
          if (position === undefined || position <= afterPosition) continue;
          if (position < bestPosition) {
            best = row;
            bestPosition = position;
          }
        }

        return best;
      }

      // fall through to the existing structural SQL below when reuse-first is
      // over the row budget or planner computation failed.
    }
  }

  // When afterElementId is given we look up its sort keys from the *unfiltered*
  // scope (statusFilter: "all") so that cross-filter navigation works correctly
  // even when the current element does not appear in the filtered result set
  // (e.g. navigating from a translated element to the next untranslated one).
  if (query.afterElementId) {
    const keyResult = await ctx.db.execute<{
      contentNodeSortKey: string;
      localOrder: number;
      id: number;
    }>(sql`
      ${orderedScopeSql({ ...query, statusFilter: "all" })}
      SELECT "contentNodeSortKey", COALESCE("localOrder", 0) AS "localOrder", id
      FROM ordered_rows
      WHERE id = ${query.afterElementId}
      LIMIT 1
    `);

    const afterRow = keyResult.rows[0];

    const afterConditionSql = afterRow
      ? sql`(
          "contentNodeSortKey" > ${afterRow.contentNodeSortKey}
          OR (
            "contentNodeSortKey" = ${afterRow.contentNodeSortKey}
            AND COALESCE("localOrder", 0) > ${afterRow.localOrder}
          )
          OR (
            "contentNodeSortKey" = ${afterRow.contentNodeSortKey}
            AND COALESCE("localOrder", 0) = ${afterRow.localOrder}
            AND id > ${afterRow.id}
          )
        )`
      : sql`TRUE`;

    const result = await ctx.db.execute<EditorScopeRow>(sql`
      ${orderedScopeSql(query)}
      SELECT *
      FROM ordered_rows
      WHERE ${afterConditionSql}
      ORDER BY "contentNodeSortKey" ASC, COALESCE("localOrder", 0) ASC, id ASC
      LIMIT 1
    `);

    return result.rows[0] ?? null;
  }

  const result = await ctx.db.execute<EditorScopeRow>(sql`
    ${orderedScopeSql(query)}
    SELECT *
    FROM ordered_rows
    ORDER BY position ASC
    LIMIT 1
  `);

  return result.rows[0] ?? null;
};

/**
 * Calculate the zero-based page index of an element under the same editor scope and filters; returns `null` if the element is out of scope.
 */
export const getEditorScopeElementPageIndex: Query<
  GetEditorScopeElementPageIndexQuery,
  number | null
> = async (ctx, query) => {
  if (query.sortMode === "reuse-first") {
    const { rows, fallback } = await listReuseFirstRowsOrFallback(ctx, query);
    if (!fallback) {
      const index = rows.findIndex((row) => row.id === query.elementId);
      return index === -1 ? null : Math.floor(index / query.pageSize);
    }
  }

  const result = await ctx.db.execute<{ pageIndex: number }>(sql`
    ${orderedScopeSql(query)}
    SELECT FLOOR(position / ${query.pageSize})::int AS "pageIndex"
    FROM ordered_rows
    WHERE id = ${query.elementId}
    LIMIT 1
  `);

  return result.rows[0]?.pageIndex ?? null;
};
