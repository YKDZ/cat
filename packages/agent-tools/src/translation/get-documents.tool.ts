import type { AgentToolDefinition } from "@cat/agent";

import {
  executeQuery,
  getDbHandle,
  listProjectContentNodes,
} from "@cat/domain";
import * as z from "zod";

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
    "List content nodes in a project. The returned documents array is a compatibility alias for content nodes.",
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
    const allRows = await executeQuery({ db }, listProjectContentNodes, {
      projectId,
    });

    const start = parsed.page * parsed.pageSize;
    const end = start + parsed.pageSize;
    const documents = allRows.slice(start, end);
    const contentNodes = documents.map((row) => ({
      id: row.id,
      name: row.displayLabel,
      projectId: row.projectId,
      creatorId: row.creatorId,
      kind: row.kind,
      exportRole: row.exportRole,
      boundaryType: row.boundaryType,
      fileHandlerId: row.fileHandlerId,
      fileId: row.fileId,
      isDirectory: row.kind === "DIRECTORY" || row.kind === "PROJECT_ROOT",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      parentId: row.parentId,
      localOrder: row.localOrder,
    }));

    return {
      contentNodes,
      documents: contentNodes,
      page: parsed.page,
      pageSize: parsed.pageSize,
      hasMore: end < allRows.length,
    };
  },
};
