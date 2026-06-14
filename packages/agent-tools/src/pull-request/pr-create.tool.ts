import type { AgentToolDefinition } from "@cat/agent";

import { createPR, executeCommand, getDbHandle } from "@cat/domain";
import * as z from "zod";

const prCreateArgs = z.object({
  /**
   * PR title
   */
  title: z.string().min(1).describe("The title of the pull request"),
  /**
   * PR body in Markdown
   */
  body: z
    .string()
    .optional()
    .describe("The body/description of the pull request in Markdown"),
  /**
   * Associated issue ID (optional)
   */
  issueId: z
    .int()
    .positive()
    .optional()
    .describe("The internal ID of the issue to link to this PR"),
});

/**
 * pr_create tool: create a standalone PR in the current project (issue link is optional).
 */
export const prCreateTool: AgentToolDefinition = {
  name: "pr_create",
  description:
    "Create a new pull request in the current project. " +
    "Optionally link to an existing issue. Returns the created PR details.",
  parameters: prCreateArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = prCreateArgs.parse(args);

    const agentId = parseInt(ctx.session.agentId, 10) || undefined;

    return await executeCommand({ db }, createPR, {
      projectId: ctx.session.projectId,
      title: parsed.title,
      body: parsed.body ?? "",
      authorAgentId: agentId,
      reviewers: [],
      issueId: parsed.issueId,
    });
  },
};
