import { sql } from "@cat/db";
import * as z from "zod";

import type { ProjectContentNodeRow } from "@/queries/content/list-project-content-nodes.query";
import type { Query } from "@/types";

/**
 * @zh 列出编辑器作用域可见内容节点的查询 Schema。
 * @en Schema for listing content nodes visible to an editor scope.
 */
export const ListEditorScopeContentNodesQuerySchema = z.object({
  projectId: z.uuidv4(),
  branchId: z.int().positive().optional(),
});

/**
 * @zh 列出编辑器作用域可见内容节点的查询类型。
 * @en Type for listing content nodes visible to an editor scope.
 */
export type ListEditorScopeContentNodesQuery = z.infer<
  typeof ListEditorScopeContentNodesQuerySchema
>;

const branchOverlayCtesSql = (branchId: number | undefined) => {
  if (branchId === undefined) {
    return sql`
      visible_content_nodes AS (SELECT * FROM "ContentNode"),
      visible_content_relations AS (SELECT * FROM "ContentRelation")
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
        AND entry."entity_type" IN ('content_node', 'content_relation')
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
    )
  `;
};

/**
 * @zh 列出指定项目在主干或分支覆盖视图下可见的内容节点。
 * @en List content nodes visible for a project under main or branch-overlay visibility.
 */
export const listEditorScopeContentNodes: Query<
  ListEditorScopeContentNodesQuery,
  ProjectContentNodeRow[]
> = async (ctx, query) => {
  const result = await ctx.db.execute<ProjectContentNodeRow>(sql`
    WITH RECURSIVE
    ${branchOverlayCtesSql(query.branchId)}
    SELECT
      node.id,
      node."project_id" AS "projectId",
      node."creator_id" AS "creatorId",
      node.kind,
      node."display_label" AS "displayLabel",
      node."importer_id" AS "importerId",
      node."source_root_ref" AS "sourceRootRef",
      node."stable_source_node_ref" AS "stableSourceNodeRef",
      node."source_uri" AS "sourceUri",
      node."source_path" AS "sourcePath",
      node."source_type" AS "sourceType",
      node."language_id" AS "languageId",
      node."export_role" AS "exportRole",
      node."boundary_type" AS "boundaryType",
      node."file_handler_id" AS "fileHandlerId",
      node."file_id" AS "fileId",
      node."lifecycle_status" AS "lifecycleStatus",
      node.provenance,
      node.metadata,
      node."created_at" AS "createdAt",
      node."updated_at" AS "updatedAt",
      parent_rel."source_node_id" AS "parentId",
      parent_rel."local_order" AS "localOrder"
    FROM visible_content_nodes node
    LEFT JOIN visible_content_relations parent_rel
      ON parent_rel."target_node_id" = node.id
     AND parent_rel."target_endpoint_kind" = 'NODE'
     AND parent_rel."is_primary" = TRUE
     AND parent_rel."lifecycle_status" = 'ACTIVE'
    LEFT JOIN "ContentRelationType" relation_type
      ON relation_type.id = parent_rel."relation_type_id"
     AND relation_type."participates_in_containment" = TRUE
    WHERE node."project_id" = ${query.projectId}::uuid
      AND node."lifecycle_status" = 'ACTIVE'
      AND (parent_rel.id IS NULL OR relation_type.id IS NOT NULL)
    ORDER BY COALESCE(parent_rel."local_order", 0) ASC, node."display_label" ASC, node.id ASC
  `);

  return result.rows;
};
