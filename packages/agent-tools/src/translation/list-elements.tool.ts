import type { AgentToolDefinition } from "@cat/agent";

import { executeQuery, getDbHandle, getDocumentElements } from "@cat/domain";
import * as z from "zod";

import { assertDocumentInSession } from "./assert-session-scope.ts";

const listElementsArgs = z.object({
  documentId: z
    .uuidv4()
    .optional()
    .describe("Document UUID. Falls back to session documentId"),
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
    "List translatable elements in a document with pagination. Returns element ID, source text, translation status, and sort index. Use this to browse the document and find elements that need translation.",
  parameters: listElementsArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = listElementsArgs.parse(args);
    const documentId = parsed.documentId ?? ctx.session.documentId;

    if (!documentId) {
      throw new Error("list_elements requires documentId");
    }

    await assertDocumentInSession(documentId, ctx);

    const languageId = parsed.languageId ?? ctx.session.languageId;
    const { client: db } = await getDbHandle();
    const rows = await executeQuery({ db }, getDocumentElements, {
      documentId,
      page: parsed.page,
      pageSize: parsed.pageSize,
      searchQuery: parsed.searchQuery,
      languageId,
      isTranslated: parsed.isTranslated,
      isApproved: parsed.isApproved,
    });

    return {
      elements: rows.map((row) => ({
        id: row.id,
        sourceText: row.value,
        languageId: row.languageId,
        status: row.status,
        sortIndex: row.sortIndex,
      })),
      page: parsed.page,
      pageSize: parsed.pageSize,
      hasMore: rows.length === parsed.pageSize,
    };
  },
};
