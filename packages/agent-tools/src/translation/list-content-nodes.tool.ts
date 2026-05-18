import type { AgentToolDefinition } from "@cat/agent";

import {
  executeQuery,
  getDbHandle,
  listProjectContentNodes,
} from "@cat/domain";
import * as z from "zod";

import { assertProjectInSession } from "./assert-session-scope.ts";

const listContentNodesArgs = z
  .object({
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
      .describe("Number of content nodes to return per page"),
  })
  .strict();

/**
 * @zh list_content_nodes 工具：分页列出项目中的内容节点。
 * @en list_content_nodes tool: list project content nodes with pagination.
 */
export const listContentNodesTool: AgentToolDefinition = {
  name: "list_content_nodes",
  description:
    "List content nodes in a project, including directories, file nodes, and other structural nodes.",
  parameters: listContentNodesArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = listContentNodesArgs.parse(args);
    const projectId = parsed.projectId ?? ctx.session.projectId;

    if (!projectId) {
      throw new Error("list_content_nodes requires projectId");
    }

    assertProjectInSession(projectId, ctx);

    const { client: db } = await getDbHandle();
    const allRows = await executeQuery({ db }, listProjectContentNodes, {
      projectId,
    });
    const start = parsed.page * parsed.pageSize;
    const end = start + parsed.pageSize;
    const contentNodes = allRows.slice(start, end).map((row) => ({
      id: row.id,
      label: row.displayLabel,
      projectId: row.projectId,
      creatorId: row.creatorId,
      kind: row.kind,
      exportRole: row.exportRole,
      boundaryType: row.boundaryType,
      fileHandlerId: row.fileHandlerId,
      fileId: row.fileId,
      isContainer: row.kind === "DIRECTORY" || row.kind === "PROJECT_ROOT",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      parentId: row.parentId,
      localOrder: row.localOrder,
    }));

    return {
      contentNodes,
      page: parsed.page,
      pageSize: parsed.pageSize,
      hasMore: end < allRows.length,
    };
  },
};
