import type { AgentToolDefinition } from "@cat/agent";

import { executeQuery, getDbHandle, listProjectDocuments } from "@cat/domain";
import * as z from "zod/v4";

import { assertProjectInSession } from "./assert-session-scope.ts";

const getDocumentsArgs = z.object({
  projectId: z
    .uuidv4()
    .optional()
    .describe("Project UUID. Falls back to session projectId"),
  page: z.int().min(0).default(0).describe("Page number (0-indexed)"),
  pageSize: z
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of project documents to return per page"),
});

/**
 * @zh get_documents 工具：分页列出项目中的文档与目录元信息。
 * @en get_documents tool: list project documents and directories with pagination.
 */
export const getDocumentsTool: AgentToolDefinition = {
  name: "get_documents",
  description:
    "List documents in a project with pagination. Returns document metadata including parent relationships and directory flags so the agent can pick which document to inspect next.",
  parameters: getDocumentsArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = getDocumentsArgs.parse(args);
    const projectId = parsed.projectId ?? ctx.session.projectId;

    if (!projectId) {
      throw new Error("get_documents requires projectId");
    }

    assertProjectInSession(projectId, ctx);

    const { client: db } = await getDbHandle();
    const rows = await executeQuery({ db }, listProjectDocuments, {
      projectId,
      page: parsed.page,
      pageSize: parsed.pageSize + 1,
    });
    const documents = rows.slice(0, parsed.pageSize);

    return {
      documents: documents.map((row) => ({
        id: row.id,
        name: row.name,
        projectId: row.projectId,
        creatorId: row.creatorId,
        fileHandlerId: row.fileHandlerId,
        fileId: row.fileId,
        isDirectory: row.isDirectory,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        parentId: row.parentId,
      })),
      page: parsed.page,
      pageSize: parsed.pageSize,
      hasMore: rows.length > parsed.pageSize,
    };
  },
};
