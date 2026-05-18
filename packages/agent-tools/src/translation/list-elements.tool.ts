import type { AgentToolDefinition } from "@cat/agent";

import {
  executeQuery,
  getDbHandle,
  listEditorScopeElements,
} from "@cat/domain";
import * as z from "zod";

import {
  assertContentNodesInSession,
  assertDocumentInSession,
  assertProjectInSession,
  resolveEffectiveContentNodeIds,
} from "./assert-session-scope.ts";

const legacyStatusFilter = (input: {
  isTranslated?: boolean;
  isApproved?: boolean;
}) => {
  if (input.isApproved === true) return "approved" as const;
  if (input.isApproved === false) return "unapproved" as const;
  if (input.isTranslated === true) return "translated" as const;
  if (input.isTranslated === false) return "untranslated" as const;
  return "all" as const;
};

const listElementsArgs = z.object({
  projectId: z
    .uuidv4()
    .optional()
    .describe("Project UUID. Falls back to session projectId"),
  documentId: z
    .uuidv4()
    .optional()
    .describe("Deprecated compatibility field for a single content node"),
  contentNodeIds: z
    .array(z.uuidv4())
    .optional()
    .describe("Content node filters. Empty means the whole project."),
  page: z.int().min(0).default(0).describe("Page number (0-indexed)"),
  pageSize: z
    .int()
    .min(1)
    .max(50)
    .default(16)
    .describe("Number of elements per page"),
  searchQuery: z
    .string()
    .optional()
    .describe("Filter elements by source text content (ILIKE)"),
  languageId: z
    .string()
    .optional()
    .describe(
      "Target language ID (BCP-47) to check translation status. Falls back to session languageId",
    ),
  isTranslated: z
    .boolean()
    .optional()
    .describe("Filter: only translated or untranslated elements"),
  isApproved: z
    .boolean()
    .optional()
    .describe("Filter: only approved or unapproved elements"),
});

export const listElementsTool: AgentToolDefinition = {
  name: "list_elements",
  description:
    "List translatable elements in the current editor scope with pagination. Supports project-wide browsing, subtree filters, and legacy documentId compatibility. Returns element ID, source text, translation status, primary content-node metadata, and sort index.",
  parameters: listElementsArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = listElementsArgs.parse(args);
    const projectId = parsed.projectId ?? ctx.session.projectId;
    if (!projectId) {
      throw new Error("list_elements requires projectId");
    }

    const languageId = parsed.languageId ?? ctx.session.languageId;
    if (!languageId) {
      throw new Error("list_elements requires languageId");
    }

    const requestedContentNodeIds = parsed.documentId
      ? [parsed.documentId]
      : parsed.contentNodeIds;
    const contentNodeIds = resolveEffectiveContentNodeIds(
      requestedContentNodeIds,
      ctx,
    );

    if (parsed.documentId) {
      await assertDocumentInSession(parsed.documentId, ctx);
    }

    assertProjectInSession(projectId, ctx);
    await assertContentNodesInSession(contentNodeIds, ctx);

    const { client: db } = await getDbHandle();
    const rows = await executeQuery({ db }, listEditorScopeElements, {
      projectId,
      languageToId: languageId,
      branchId: ctx.session.branchId,
      contentNodeIds,
      page: parsed.page,
      pageSize: parsed.pageSize,
      searchQuery: parsed.searchQuery ?? "",
      statusFilter: legacyStatusFilter({
        isTranslated: parsed.isTranslated,
        isApproved: parsed.isApproved,
      }),
    });

    return {
      scope: { projectId, contentNodeIds, languageId },
      elements: rows.map((row) => ({
        id: row.id,
        sourceText: row.value,
        languageId: row.languageId,
        status: row.status,
        primaryContentNodeId: row.primaryContentNodeId,
        primaryContentNodeLabel: row.primaryContentNodeLabel,
        sortIndex: row.localOrder,
      })),
      page: parsed.page,
      pageSize: parsed.pageSize,
      hasMore: rows.length === parsed.pageSize,
    };
  },
};
