import type { AgentToolDefinition } from "@cat/agent";

import { executeQuery, getDbHandle, listIssues } from "@cat/domain";
import * as z from "zod";

const issueListArgs = z.object({
  /**
   * Status filter (omit to list all statuses)
   */
  status: z
    .enum(["OPEN", "CLOSED"])
    .optional()
    .describe("Filter by issue status. Omit to list all."),
  /**
   * Maximum number of issues to return
   */
  limit: z
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe("Maximum number of issues to return (1-100)"),
  /**
   * Pagination offset
   */
  offset: z.int().nonnegative().default(0).describe("Pagination offset"),
});

/**
 * issue_list tool: list issues in the current project with optional status filter.
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
