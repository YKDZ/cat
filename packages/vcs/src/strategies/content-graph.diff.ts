import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * ContentNode entity diff strategy (CASCADING: label/file/role changes affect all child nodes and elements)
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
 * ContentRelation entity diff strategy (CASCADING: order/type changes affect export structure)
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
 * ContentRelationType entity diff strategy (CASCADING: type definition changes affect all associated relations)
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
 * ContextEvidence entity diff strategy (LOCAL: evidence changes affect only local context)
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
 * ContextProfile entity diff strategy (CASCADING: profile changes affect project-wide context assembly)
 */
export const contextProfileDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "context_profile",
  semanticLabel: "Context profile",
  impactScope: "CASCADING",
  watchedFields: ["name", "payload", "isDefault"],
});

/**
 * ScopeBinding entity diff strategy (LOCAL: scope bindings affect only asset visibility)
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
 * SemanticDiffEntry entity diff strategy (LOCAL: semantic diff entries record changes without cascading)
 */
export const semanticDiffEntryDiffStrategy: DiffStrategy =
  createGenericStrategy({
    entityType: "semantic_diff",
    semanticLabel: "Semantic diff",
    impactScope: "LOCAL",
    watchedFields: ["diffKind", "vectorInvalidationReason", "payload"],
  });
