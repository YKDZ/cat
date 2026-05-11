import * as z from "zod";

import {
  ContentBoundaryTypeSchema,
  ContentEvidenceKindSchema,
  ContentNodeExportRoleSchema,
  ContentNodeKindSchema,
  ContentRelationDirectionalitySchema,
  ContentRelationSemanticFamilySchema,
  ContextConsumerPurposeSchema,
  EvidenceTrustLevelSchema,
  RelationEndpointKindSchema,
  ScopeBindingAssetKindSchema,
  ScopeBindingModeSchema,
  SemanticDiffKindSchema,
  VectorInvalidationReasonSchema,
} from "@/schema/enum.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const StableElementIdentitySchema = z.object({
  importerId: z.string().min(1),
  sourceRootRef: z.string().min(1),
  sourceNodeRef: z.string().min(1),
  stableSourceRef: z.string().min(1),
});
export type StableElementIdentity = z.infer<typeof StableElementIdentitySchema>;

export const ContentRelationEndpointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("NODE"), nodeRef: z.string().min(1) }),
  z.object({ kind: z.literal("ELEMENT"), elementRef: z.string().min(1) }),
]);
export type ContentRelationEndpoint = z.infer<
  typeof ContentRelationEndpointSchema
>;

export const ContentRelationAllowedEndpointPairSchema = z.object({
  source: RelationEndpointKindSchema,
  target: RelationEndpointKindSchema,
});
export type ContentRelationAllowedEndpointPair = z.infer<
  typeof ContentRelationAllowedEndpointPairSchema
>;

export const RegisteredRelationTypeInputSchema = z.object({
  namespace: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1).default("1.0.0"),
  ownerPluginId: z.string().nullable().optional(),
  semanticFamily: ContentRelationSemanticFamilySchema,
  allowedEndpointPairs: z
    .array(ContentRelationAllowedEndpointPairSchema)
    .min(1),
  directionality: ContentRelationDirectionalitySchema.default("DIRECTED"),
  participatesInContainment: z.boolean().default(false),
  participatesInExport: z.boolean().default(false),
  supportsOrdering: z.boolean().default(false),
  weightingEligible: z.boolean().default(false),
  defaultTrustLevel: EvidenceTrustLevelSchema.default("COLLECTED"),
  deprecation: safeZDotJson.nullable().optional(),
  migration: safeZDotJson.nullable().optional(),
  metadata: safeZDotJson.nullable().optional(),
});
export type RegisteredRelationTypeInput = z.infer<
  typeof RegisteredRelationTypeInputSchema
>;

export const CoreRelationTypeDefinitions = [
  {
    namespace: "core",
    name: "contains",
    version: "1.0.0",
    semanticFamily: "CONTAINMENT",
    allowedEndpointPairs: [
      { source: "NODE", target: "NODE" },
      { source: "NODE", target: "ELEMENT" },
    ],
    directionality: "DIRECTED",
    participatesInContainment: true,
    participatesInExport: true,
    supportsOrdering: true,
    weightingEligible: true,
    defaultTrustLevel: "VERIFIED",
  },
  {
    namespace: "core",
    name: "same-file",
    version: "1.0.0",
    semanticFamily: "SCOPE",
    allowedEndpointPairs: [{ source: "ELEMENT", target: "ELEMENT" }],
    directionality: "UNDIRECTED",
    participatesInContainment: false,
    participatesInExport: false,
    supportsOrdering: false,
    weightingEligible: true,
    defaultTrustLevel: "COLLECTED",
  },
  {
    namespace: "core",
    name: "source-reference",
    version: "1.0.0",
    semanticFamily: "SOURCE_REFERENCE",
    allowedEndpointPairs: [
      { source: "NODE", target: "ELEMENT" },
      { source: "ELEMENT", target: "NODE" },
    ],
    directionality: "DIRECTED",
    participatesInContainment: false,
    participatesInExport: false,
    supportsOrdering: false,
    weightingEligible: true,
    defaultTrustLevel: "COLLECTED",
  },
] as const satisfies readonly RegisteredRelationTypeInput[];

export const StructuredContentNodeInputSchema = z.object({
  ref: z.string().min(1),
  kind: ContentNodeKindSchema,
  displayLabel: z.string().min(1),
  parentRef: z.string().min(1).nullable().optional(),
  importerId: z.string().min(1),
  sourceRootRef: z.string().min(1),
  stableSourceNodeRef: z.string().min(1),
  sourceUri: z.string().nullable().optional(),
  sourcePath: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  languageId: z.string().nullable().optional(),
  exportRole: ContentNodeExportRoleSchema.default("NONE"),
  boundaryType: ContentBoundaryTypeSchema.default("NONE"),
  file: z
    .object({ fileId: z.int(), fileHandlerId: z.int().nullable().optional() })
    .nullable()
    .optional(),
  metadata: safeZDotJson.nullable().optional(),
  provenance: safeZDotJson.nullable().optional(),
});
export type StructuredContentNodeInput = z.infer<
  typeof StructuredContentNodeInputSchema
>;

export const StructuredTranslatableElementInputSchema = z.object({
  ref: z.string().min(1),
  stableSourceRef: z.string().min(1),
  sourceNodeRef: z.string().min(1),
  text: z.string(),
  languageId: z.string(),
  localOrder: z.int().optional(),
  meta: safeZDotJson.nullable().optional(),
  location: z
    .object({
      startLine: z.int().optional(),
      endLine: z.int().optional(),
      custom: safeZDotJson.optional(),
    })
    .optional(),
});
export type StructuredTranslatableElementInput = z.infer<
  typeof StructuredTranslatableElementInputSchema
>;

export const StructuredRelationInputSchema = z.object({
  type: z.object({
    namespace: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1).default("1.0.0"),
  }),
  source: ContentRelationEndpointSchema,
  target: ContentRelationEndpointSchema,
  isPrimary: z.boolean().default(false),
  localOrder: z.int().nullable().optional(),
  confidenceBasisPoints: z.int().min(0).max(10000).default(10000),
  provenance: safeZDotJson.nullable().optional(),
  metadata: safeZDotJson.nullable().optional(),
});
export type StructuredRelationInput = z.infer<
  typeof StructuredRelationInputSchema
>;

export const StructuredEvidenceInputSchema = z.object({
  ref: z.string().min(1).optional(),
  attachedTo: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("NODE"), nodeRef: z.string().min(1) }),
    z.object({ kind: z.literal("ELEMENT"), elementRef: z.string().min(1) }),
    z.object({ kind: z.literal("RELATION"), relationRef: z.string().min(1) }),
  ]),
  kind: ContentEvidenceKindSchema,
  textData: z.string().nullable().optional(),
  jsonData: safeZDotJson.nullable().optional(),
  fileId: z.int().nullable().optional(),
  storageProviderId: z.int().nullable().optional(),
  displayLabel: z.string().nullable().optional(),
  trustLevel: EvidenceTrustLevelSchema.default("COLLECTED"),
  freshness: z.iso.datetime().nullable().optional(),
  provenance: safeZDotJson.nullable().optional(),
});
export type StructuredEvidenceInput = z.infer<
  typeof StructuredEvidenceInputSchema
>;

export const StructuredContentPayloadSchema = z.object({
  payloadVersion: z.literal("content-graph/v1"),
  projectId: z.uuidv4(),
  sourceLanguageId: z.string(),
  importerId: z.string().min(1),
  sourceRootRef: z.string().min(1),
  relationTypes: z.array(RegisteredRelationTypeInputSchema).default([]),
  nodes: z.array(StructuredContentNodeInputSchema).min(1),
  elements: z.array(StructuredTranslatableElementInputSchema),
  relations: z.array(StructuredRelationInputSchema).default([]),
  evidence: z.array(StructuredEvidenceInputSchema).default([]),
  options: z.object({ branchId: z.int().optional() }).optional(),
});
export type StructuredContentPayload = z.infer<
  typeof StructuredContentPayloadSchema
>;

export const ContextProfileRelationWeightsSchema = z.record(
  z.string(),
  z.number().min(0).max(100),
);
export type ContextProfileRelationWeights = z.infer<
  typeof ContextProfileRelationWeightsSchema
>;

export const ContextProfileConsumerBudgetSchema = z.object({
  maxItems: z.int().min(1),
  maxTokens: z.int().min(1).optional(),
  maxTraversalDepth: z.int().min(0).default(2),
});
export type ContextProfileConsumerBudget = z.infer<
  typeof ContextProfileConsumerBudgetSchema
>;

export const ContextProfilePayloadSchema = z.object({
  preset: z.string().min(1),
  relationWeights: ContextProfileRelationWeightsSchema,
  consumerBudgets: z.record(
    ContextConsumerPurposeSchema,
    ContextProfileConsumerBudgetSchema,
  ),
  traversalCaps: safeZDotJson.default({}),
  trustFreshnessRules: safeZDotJson.default({}),
  fallbackBehavior: z
    .enum(["LOCAL_SEQUENCE", "PROJECT_DEFAULT"])
    .default("LOCAL_SEQUENCE"),
});
export type ContextProfilePayload = z.infer<typeof ContextProfilePayloadSchema>;

export const FlattenedContextEvidenceSchema = z.object({
  purpose: ContextConsumerPurposeSchema,
  priority: z.int().min(0),
  label: z.string().min(1),
  score: z.number().min(0),
  sourceEndpoint: z.string().min(1),
  relatedEndpoint: z.string().min(1).nullable(),
  trustLevel: EvidenceTrustLevelSchema,
  freshness: z.iso.datetime().nullable(),
  clipped: z.boolean(),
  payload: safeZDotJson,
  expansion: z
    .object({
      relationIds: z.array(z.string()).default([]),
      evidenceIds: z.array(z.int()).default([]),
      explanation: z.string(),
    })
    .nullable(),
});
export type FlattenedContextEvidence = z.infer<
  typeof FlattenedContextEvidenceSchema
>;

export const ScopeBindingInputSchema = z.object({
  assetKind: ScopeBindingAssetKindSchema,
  assetId: z.string().min(1),
  mode: ScopeBindingModeSchema,
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("NODE"), nodeId: z.uuidv4() }),
    z.object({ kind: z.literal("RELATION"), relationId: z.uuidv4() }),
  ]),
  weightBoost: z.int().min(0).max(10000).default(0),
  metadata: safeZDotJson.nullable().optional(),
});
export type ScopeBindingInput = z.infer<typeof ScopeBindingInputSchema>;

export const SemanticDiffEntryPayloadSchema = z.object({
  diffKind: SemanticDiffKindSchema,
  vectorInvalidationReason: VectorInvalidationReasonSchema,
  oldIdentity: StableElementIdentitySchema.nullable(),
  newIdentity: StableElementIdentitySchema.nullable(),
  oldText: z.string().nullable(),
  newText: z.string().nullable(),
  preservationPolicy: safeZDotJson,
});
export type SemanticDiffEntryPayload = z.infer<
  typeof SemanticDiffEntryPayloadSchema
>;
