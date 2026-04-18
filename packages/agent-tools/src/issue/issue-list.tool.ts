import type { AgentToolDefinition } from "@cat/agent";

import { executeQuery, getDbHandle, listIssues } from "@cat/domain";
import * as z from "zod";

const issueListArgs = z.object({
  /**
   * @zh Issue 状态过滤（不传则列出所有）
   * @en Status filter (omit to list all statuses)
   */
  status: z
    .enum(["OPEN", "CLOSED"])
    .optional()
    .describe("Filter by issue status. Omit to list all."),
  /**
   * @zh 最多返回条数
   * @en Maximum number of issues to return
   */
  limit: z
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe("Maximum number of issues to return (1-100)"),
  /**
   * @zh 分页偏移
   * @en Pagination offset
   */
  offset: z.int().nonnegative().default(0).describe("Pagination offset"),
});

/**
 * @zh issue_list 工具: 列出当前项目的 Issue 列表，支持状态过滤。
 * @en issue_list tool: list issues in the current project with optional status filter.
 */
export const issueListTool: AgentToolDefinition = {
  name: "issue_list",
  description:
    "List issues in the current project. Supports filtering by status. Returns an array of issue objects.",
  parameters: issueListArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = issueListArgs.parse(args);

    return await executeQuery({ db }, listIssues, {
      projectId: ctx.session.projectId,
      status: parsed.status,
      limit: parsed.limit,
      offset: parsed.offset,
    });
  },
};
