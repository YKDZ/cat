import {
  ContentBoundaryTypeSchema,
  ContentIdentityStatusSchema,
  ContentNodeExportRoleSchema,
  ContentNodeKindSchema,
  ContentNodeLifecycleStatusSchema,
  ContentRelationLifecycleStatusSchema,
  RelationEndpointKindSchema,
} from "@cat/shared";
import * as z from "zod";

/**
 * @zh 编辑器分支覆盖中使用的内容节点行 Schema。
 * @en Content-node row schema used by editor branch overlays.
 */
export const EditorOverlayContentNodeRowSchema = z.object({
  id: z.uuidv4(),
  projectId: z.uuidv4(),
  creatorId: z.uuidv4().nullable(),
  kind: ContentNodeKindSchema,
  displayLabel: z.string(),
  importerId: z.string().nullable(),
  sourceRootRef: z.string().nullable(),
  stableSourceNodeRef: z.string().nullable(),
  sourceUri: z.string().nullable(),
  sourcePath: z.string().nullable(),
  sourceType: z.string().nullable(),
  languageId: z.string().nullable(),
  exportRole: ContentNodeExportRoleSchema,
  boundaryType: ContentBoundaryTypeSchema,
  fileHandlerId: z.int().nullable(),
  fileId: z.int().nullable(),
  lifecycleStatus: ContentNodeLifecycleStatusSchema,
  provenance: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * @zh 编辑器分支覆盖内容节点行类型。
 * @en Content-node row type for editor branch overlays.
 */
export type EditorOverlayContentNodeRow = z.infer<
  typeof EditorOverlayContentNodeRowSchema
>;

/**
 * @zh 编辑器分支覆盖中使用的内容关系行 Schema。
 * @en Content-relation row schema used by editor branch overlays.
 */
export const EditorOverlayContentRelationRowSchema = z.object({
  id: z.uuidv4(),
  projectId: z.uuidv4(),
  relationTypeId: z.int(),
  sourceEndpointKind: RelationEndpointKindSchema,
  sourceNodeId: z.uuidv4().nullable(),
  sourceElementId: z.int().nullable(),
  targetEndpointKind: RelationEndpointKindSchema,
  targetNodeId: z.uuidv4().nullable(),
  targetElementId: z.int().nullable(),
  isPrimary: z.boolean(),
  localOrder: z.int().nullable(),
  confidenceBasisPoints: z.int(),
  lifecycleStatus: ContentRelationLifecycleStatusSchema,
  weightHint: z.unknown().nullable(),
  provenance: z.unknown().nullable(),
  validationMetadata: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * @zh 编辑器分支覆盖内容关系行类型。
 * @en Content-relation row type for editor branch overlays.
 */
export type EditorOverlayContentRelationRow = z.infer<
  typeof EditorOverlayContentRelationRowSchema
>;

/**
 * @zh 编辑器分支覆盖中使用的元素行 Schema。
 * @en Element row schema used by editor branch overlays.
 */
export const EditorOverlayElementRowSchema = z.object({
  id: z.int(),
  projectId: z.uuidv4(),
  importerId: z.string().nullable(),
  sourceRootRef: z.string().nullable(),
  sourceNodeRef: z.string().nullable(),
  stableSourceRef: z.string().nullable(),
  identityStatus: ContentIdentityStatusSchema,
  identityConfidence: z.int(),
  meta: z.unknown().nullable(),
  sourceStartLine: z.int().nullable(),
  sourceEndLine: z.int().nullable(),
  sourceLocationMeta: z.unknown().nullable(),
  creatorId: z.uuidv4().nullable(),
  vectorizedStringId: z.int(),
  approvedTranslationId: z.int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * @zh 编辑器分支覆盖元素行类型。
 * @en Element row type for editor branch overlays.
 */
export type EditorOverlayElementRow = z.infer<
  typeof EditorOverlayElementRowSchema
>;

/**
 * @zh 编辑器分支覆盖中使用的翻译状态 Schema。
 * @en Translation-state schema used by editor branch overlays.
 */
export const EditorOverlayTranslationStateSchema = z.object({
  translatableElementId: z.int(),
  languageId: z.string(),
  text: z.string(),
  translatorId: z.uuidv4().nullable(),
  approved: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * @zh 编辑器分支覆盖翻译状态类型。
 * @en Translation-state type for editor branch overlays.
 */
export type EditorOverlayTranslationState = z.infer<
  typeof EditorOverlayTranslationStateSchema
>;
