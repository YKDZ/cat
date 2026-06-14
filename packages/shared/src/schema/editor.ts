import * as z from "zod";

import { TranslatableElementSchema } from "@/schema/drizzle/content.ts";
import {
  ContentBoundaryTypeSchema,
  ContentNodeExportRoleSchema,
  ContentNodeKindSchema,
} from "@/schema/enum.ts";
import { ElementTranslationStatusSchema } from "@/schema/misc.ts";

/**
 * Supported editor translation-status filter values. `translated` includes approved translations; `unapproved` means translated but not yet approved.
 */
export const EditorTranslationStatusFilterValues = [
  "all",
  "untranslated",
  "translated",
  "approved",
  "unapproved",
] as const;

/**
 * Editor translation-status filter schema.
 */
export const EditorTranslationStatusFilterSchema = z.enum(
  EditorTranslationStatusFilterValues,
);

/**
 * Editor translation-status filter type.
 */
export type EditorTranslationStatusFilter = z.infer<
  typeof EditorTranslationStatusFilterSchema
>;

/**
 * Supported element sort modes for editor and batch operations.
 */
export const ElementSortModeValues = ["structure", "reuse-first"] as const;

/**
 * Element sort-mode schema.
 */
export const ElementSortModeSchema = z.enum(ElementSortModeValues);

/**
 * Element sort-mode type.
 */
export type ElementSortMode = z.infer<typeof ElementSortModeSchema>;

/**
 * Priority reason codes; the frontend localizes display labels.
 */
export const ElementPriorityReasonCodeValues = [
  "REUSE_SEED",
  "TEMPLATE_MATCH",
  "NEIGHBOR_CONTEXT",
  "CLUSTER_CONTINUITY",
  "FOUNDATION",
  "STRUCTURE_FALLBACK",
  "LOW_CONFIDENCE",
] as const;

/**
 * Priority reason-code schema.
 */
export const ElementPriorityReasonCodeSchema = z.enum(
  ElementPriorityReasonCodeValues,
);

/**
 * Priority reason-code type.
 */
export type ElementPriorityReasonCode = z.infer<
  typeof ElementPriorityReasonCodeSchema
>;

/**
 * Lightweight priority summary for one element.
 */
export const ElementPrioritySummarySchema = z.object({
  mode: ElementSortModeSchema,
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reasonCodes: z.array(ElementPriorityReasonCodeSchema).default([]),
  structurePosition: z.int().min(0),
  priorityPosition: z.int().min(0),
});

/**
 * Lightweight priority summary type for one element.
 */
export type ElementPrioritySummary = z.infer<
  typeof ElementPrioritySummarySchema
>;

/**
 * Runtime-only context seed for batch auto-translation; never persisted to TM.
 */
export const ScopeTranslationSeedSchema = z.object({
  elementId: z.int().positive(),
  source: z.string().min(1),
  translation: z.string().min(1),
  sourceLanguageId: z.string().min(1),
  targetLanguageId: z.string().min(1),
  primaryContentNodeId: z.uuidv4().nullable(),
  confidence: z.number().min(0).max(1),
  trustLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  reason: z.literal("batch-runtime").default("batch-runtime"),
});

/**
 * Runtime-only context seed type for batch auto-translation.
 */
export type ScopeTranslationSeed = z.infer<typeof ScopeTranslationSeedSchema>;

/**
 * Editor scope used by URLs and API requests.
 */
export const EditorScopeSchema = z.object({
  projectId: z.uuidv4(),
  languageToId: z.string().min(1),
  branchId: z.int().positive().optional(),
  contentNodeIds: z.array(z.uuidv4()).max(50).default([]),
  searchQuery: z.string().default(""),
  statusFilter: EditorTranslationStatusFilterSchema.default("all"),
  sortMode: ElementSortModeSchema.default("structure"),
  page: z.int().min(1).default(1),
  pageSize: z.int().min(1).max(100).default(16),
});

/**
 * Editor scope type.
 */
export type EditorScope = z.infer<typeof EditorScopeSchema>;

/**
 * Batch operation scope; an empty contentNodeIds means the whole project, while elementIds adds direct element targets.
 */
export const OperationScopeSchema = z.object({
  projectId: z.uuidv4(),
  branchId: z.int().positive().optional(),
  contentNodeIds: z.array(z.uuidv4()).max(50).default([]),
  elementIds: z.array(z.int().positive()).max(1000).default([]),
  sortMode: ElementSortModeSchema.default("structure"),
});

/**
 * Batch operation scope type.
 */
export type OperationScope = z.infer<typeof OperationScopeSchema>;

/**
 * Paginated element-query input; `page` is zero-based to match the existing backend pagination behavior.
 */
export const EditorElementQuerySchema = EditorScopeSchema.omit({
  page: true,
}).extend({
  page: z.int().min(0).default(0),
});

/**
 * Paginated editor element-query type.
 */
export type EditorElementQuery = z.infer<typeof EditorElementQuerySchema>;

/**
 * Query input for the first matching element or the next matching element.
 */
export const EditorFirstElementQuerySchema = EditorElementQuerySchema.omit({
  page: true,
  pageSize: true,
}).extend({
  afterElementId: z.int().positive().optional(),
});

/**
 * First-element query type.
 */
export type EditorFirstElementQuery = z.infer<
  typeof EditorFirstElementQuerySchema
>;

/**
 * Query input for calculating the page index containing an element.
 */
export const EditorElementPageIndexQuerySchema = EditorElementQuerySchema.omit({
  page: true,
}).extend({
  elementId: z.int().positive(),
});

/**
 * Element page-index query type.
 */
export type EditorElementPageIndexQuery = z.infer<
  typeof EditorElementPageIndexQuerySchema
>;

/**
 * Content-node path item inside an editor scope.
 */
export const EditorContentNodePathItemSchema = z.object({
  id: z.uuidv4(),
  label: z.string(),
  kind: ContentNodeKindSchema,
});

/**
 * Editor content-node path-item type.
 */
export type EditorContentNodePathItem = z.infer<
  typeof EditorContentNodePathItemSchema
>;

/**
 * Resolved content-node filter for UI chips and Agent-context rendering.
 */
export const EditorContentNodeFilterSchema = z.object({
  id: z.uuidv4(),
  label: z.string(),
  kind: ContentNodeKindSchema,
  boundaryType: ContentBoundaryTypeSchema,
  exportRole: ContentNodeExportRoleSchema,
  includeDescendants: z.literal(true).default(true),
  parentId: z.uuidv4().nullable(),
  path: z.array(EditorContentNodePathItemSchema),
});

/**
 * Editor content-node filter type.
 */
export type EditorContentNodeFilter = z.infer<
  typeof EditorContentNodeFilterSchema
>;

/**
 * Backend-resolved editor scope view.
 */
export const EditorScopeViewSchema = EditorScopeSchema.extend({
  combinationMode: z.literal("UNION").default("UNION"),
  contentNodeFilters: z.array(EditorContentNodeFilterSchema).default([]),
  invalidContentNodeIds: z.array(z.uuidv4()).default([]),
});

/**
 * Editor scope-view type.
 */
export type EditorScopeView = z.infer<typeof EditorScopeViewSchema>;

/**
 * Element row shown in the editor list, including primary content-node metadata.
 */
export const EditorElementSchema = TranslatableElementSchema.extend({
  value: z.string(),
  languageId: z.string(),
  status: ElementTranslationStatusSchema,
  primaryContentNodeId: z.uuidv4(),
  primaryContentNodeLabel: z.string(),
  primaryContentNodeKind: ContentNodeKindSchema,
  contentNodePath: z.array(EditorContentNodePathItemSchema),
  localOrder: z.int().nullable(),
  contentNodeSortKey: z.string(),
  priority: ElementPrioritySummarySchema.optional(),
});

/**
 * Editor element-row type.
 */
export type EditorElement = z.infer<typeof EditorElementSchema>;
