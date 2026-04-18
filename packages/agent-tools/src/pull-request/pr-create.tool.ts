import type { AgentToolDefinition } from "@cat/agent";

import { createPR, executeCommand, getDbHandle } from "@cat/domain";
import * as z from "zod";

const prCreateArgs = z.object({
  /**
   * @zh PR 标题
   * @en PR title
   */
  title: z.string().min(1).describe("The title of the pull request"),
  /**
   * @zh PR 正文（Markdown）
   * @en PR body in Markdown
   */
  body: z
    .string()
    .optional()
    .describe("The body/description of the pull request in Markdown"),
  /**
   * @zh 关联的 Issue ID（可选）
   * @en Associated issue ID (optional)
   */
  issueId: z
    .int()
    .positive()
    .optional()
    .describe("The internal ID of the issue to link to this PR"),
});

/**
 * @zh pr_create 工具: 在当前项目内独立创建一个 PR（不强制关联 Issue）。
 * @en pr_create tool: create a standalone PR in the current project (issue link is optional).
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
