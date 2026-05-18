import * as z from "zod";

import { TranslatableElementSchema } from "@/schema/drizzle/content.ts";
import {
  ContentBoundaryTypeSchema,
  ContentNodeExportRoleSchema,
  ContentNodeKindSchema,
} from "@/schema/enum.ts";
import { ElementTranslationStatusSchema } from "@/schema/misc.ts";

/**
 * @zh 编辑器翻译状态过滤器可选值。`translated` 包含已批准翻译；`unapproved` 表示已有翻译但尚未批准。
 * @en Supported editor translation-status filter values. `translated` includes approved translations; `unapproved` means translated but not yet approved.
 */
export const EditorTranslationStatusFilterValues = [
  "all",
  "untranslated",
  "translated",
  "approved",
  "unapproved",
] as const;

/**
 * @zh 编辑器翻译状态过滤 Schema。
 * @en Editor translation-status filter schema.
 */
export const EditorTranslationStatusFilterSchema = z.enum(
  EditorTranslationStatusFilterValues,
);

/**
 * @zh 编辑器翻译状态过滤类型。
 * @en Editor translation-status filter type.
 */
export type EditorTranslationStatusFilter = z.infer<
  typeof EditorTranslationStatusFilterSchema
>;

/**
 * @zh URL 与 API 使用的编辑器作用域。
 * @en Editor scope used by URLs and API requests.
 */
export const EditorScopeSchema = z.object({
  projectId: z.uuidv4(),
  languageToId: z.string().min(1),
  branchId: z.int().positive().optional(),
  contentNodeIds: z.array(z.uuidv4()).max(50).default([]),
  searchQuery: z.string().default(""),
  statusFilter: EditorTranslationStatusFilterSchema.default("all"),
  page: z.int().min(1).default(1),
  pageSize: z.int().min(1).max(100).default(16),
});

/**
 * @zh 编辑器作用域类型。
 * @en Editor scope type.
 */
export type EditorScope = z.infer<typeof EditorScopeSchema>;

/**
 * @zh 分页元素查询输入；`page` 为 0 基，与后端现有分页行为保持一致。
 * @en Paginated element-query input; `page` is zero-based to match the existing backend pagination behavior.
 */
export const EditorElementQuerySchema = EditorScopeSchema.omit({
  page: true,
}).extend({
  page: z.int().min(0).default(0),
});

/**
 * @zh 编辑器分页元素查询类型。
 * @en Paginated editor element-query type.
 */
export type EditorElementQuery = z.infer<typeof EditorElementQuerySchema>;

/**
 * @zh 首个元素或“下一个元素”查询输入。
 * @en Query input for the first matching element or the next matching element.
 */
export const EditorFirstElementQuerySchema = EditorElementQuerySchema.omit({
  page: true,
  pageSize: true,
}).extend({
  afterElementId: z.int().positive().optional(),
});

/**
 * @zh 首个元素查询类型。
 * @en First-element query type.
 */
export type EditorFirstElementQuery = z.infer<
  typeof EditorFirstElementQuerySchema
>;

/**
 * @zh 计算元素所在页的查询输入。
 * @en Query input for calculating the page index containing an element.
 */
export const EditorElementPageIndexQuerySchema = EditorElementQuerySchema.omit({
  page: true,
}).extend({
  elementId: z.int().positive(),
});

/**
 * @zh 元素页码索引查询类型。
 * @en Element page-index query type.
 */
export type EditorElementPageIndexQuery = z.infer<
  typeof EditorElementPageIndexQuerySchema
>;

/**
 * @zh 编辑器作用域中的内容节点路径项。
 * @en Content-node path item inside an editor scope.
 */
export const EditorContentNodePathItemSchema = z.object({
  id: z.uuidv4(),
  label: z.string(),
  kind: ContentNodeKindSchema,
});

/**
 * @zh 编辑器内容节点路径项类型。
 * @en Editor content-node path-item type.
 */
export type EditorContentNodePathItem = z.infer<
  typeof EditorContentNodePathItemSchema
>;

/**
 * @zh 解析后的内容节点过滤器，供 UI 芯片和 Agent 上下文展示。
 * @en Resolved content-node filter for UI chips and Agent-context rendering.
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
 * @zh 编辑器内容节点过滤器类型。
 * @en Editor content-node filter type.
 */
export type EditorContentNodeFilter = z.infer<
  typeof EditorContentNodeFilterSchema
>;

/**
 * @zh 后端解析后的编辑器作用域视图。
 * @en Backend-resolved editor scope view.
 */
export const EditorScopeViewSchema = EditorScopeSchema.extend({
  combinationMode: z.literal("UNION").default("UNION"),
  contentNodeFilters: z.array(EditorContentNodeFilterSchema).default([]),
  invalidContentNodeIds: z.array(z.uuidv4()).default([]),
});

/**
 * @zh 编辑器作用域视图类型。
 * @en Editor scope-view type.
 */
export type EditorScopeView = z.infer<typeof EditorScopeViewSchema>;

/**
 * @zh 编辑器列表中的元素行，包含其主内容节点元数据。
 * @en Element row shown in the editor list, including primary content-node metadata.
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
});

/**
 * @zh 编辑器元素行类型。
 * @en Editor element-row type.
 */
export type EditorElement = z.infer<typeof EditorElementSchema>;
