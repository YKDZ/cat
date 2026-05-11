import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * @zh content_node 实体 diff 策略（CASCADING：节点的展示标签/文件/角色变更影响所有子节点和元素）
 * @en ContentNode entity diff strategy (CASCADING: label/file/role changes affect all child nodes and elements)
 */
export const contentNodeDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "content_node",
  semanticLabel: "Content node",
  impactScope: "CASCADING",
  watchedFields: [
    "displayLabel",
    "kind",
    "sourcePath",
    "sourceUri",
    "exportRole",
    "boundaryType",
    "fileHandlerId",
    "fileId",
    "lifecycleStatus",
  ],
});

/**
 * @zh content_relation 实体 diff 策略（CASCADING：关系的顺序/类型变更影响导出结构）
 * @en ContentRelation entity diff strategy (CASCADING: order/type changes affect export structure)
 */
export const contentRelationDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "content_relation",
  semanticLabel: "Content relation",
  impactScope: "CASCADING",
  watchedFields: [
    "relationTypeId",
    "sourceEndpointKind",
    "sourceNodeId",
    "sourceElementId",
    "targetEndpointKind",
    "targetNodeId",
    "targetElementId",
    "isPrimary",
    "localOrder",
    "lifecycleStatus",
  ],
});

/**
 * @zh content_relation_type 实体 diff 策略（CASCADING：关系类型定义变更影响所有关联关系）
 * @en ContentRelationType entity diff strategy (CASCADING: type definition changes affect all associated relations)
 */
export const contentRelationTypeDiffStrategy: DiffStrategy =
  createGenericStrategy({
    entityType: "content_relation_type",
    semanticLabel: "Content relation type",
    impactScope: "CASCADING",
    watchedFields: [
      "namespace",
      "name",
      "version",
      "semanticFamily",
      "allowedEndpointPairs",
      "participatesInContainment",
      "participatesInExport",
      "supportsOrdering",
      "weightingEligible",
    ],
  });

/**
 * @zh context_evidence 实体 diff 策略（LOCAL：证据变更仅影响本地上下文）
 * @en ContextEvidence entity diff strategy (LOCAL: evidence changes affect only local context)
 */
export const contextEvidenceDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "context_evidence",
  semanticLabel: "Context evidence",
  impactScope: "LOCAL",
  watchedFields: [
    "attachedEndpointKind",
    "kind",
    "trustLevel",
    "freshnessAt",
    "jsonData",
    "fileId",
    "storageProviderId",
    "textData",
    "displayLabel",
  ],
});

/**
 * @zh context_profile 实体 diff 策略（CASCADING：上下文配置文件影响整个项目的上下文组装）
 * @en ContextProfile entity diff strategy (CASCADING: profile changes affect project-wide context assembly)
 */
export const contextProfileDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "context_profile",
  semanticLabel: "Context profile",
  impactScope: "CASCADING",
  watchedFields: ["name", "payload", "isDefault"],
});

/**
 * @zh scope_binding 实体 diff 策略（LOCAL：作用域绑定仅影响绑定资产的可见性）
 * @en ScopeBinding entity diff strategy (LOCAL: scope bindings affect only asset visibility)
 */
export const scopeBindingDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "scope_binding",
  semanticLabel: "Scope binding",
  impactScope: "LOCAL",
  watchedFields: [
    "assetKind",
    "assetId",
    "mode",
    "contentNodeId",
    "contentRelationId",
    "weightBoost",
  ],
});

/**
 * @zh semantic_diff 实体 diff 策略（LOCAL：语义差分条目仅记录变更，不级联）
 * @en SemanticDiffEntry entity diff strategy (LOCAL: semantic diff entries record changes without cascading)
 */
export const semanticDiffEntryDiffStrategy: DiffStrategy =
  createGenericStrategy({
    entityType: "semantic_diff",
    semanticLabel: "Semantic diff",
    impactScope: "LOCAL",
    watchedFields: ["diffKind", "vectorInvalidationReason", "payload"],
  });
