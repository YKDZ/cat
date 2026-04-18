import type { AgentToolDefinition } from "@cat/agent";

import { createIssue, executeCommand, getDbHandle } from "@cat/domain";
import * as z from "zod";

const issueCreateArgs = z.object({
  /**
   * @zh Issue 标题
   * @en Issue title
   */
  title: z.string().min(1).describe("The title of the issue to create"),
  /**
   * @zh Issue 正文（Markdown）
   * @en Issue body in Markdown
   */
  body: z
    .string()
    .optional()
    .describe("The body/description of the issue in Markdown"),
  /**
   * @zh 标签列表
   * @en List of labels to apply
   */
  labels: z
    .array(z.string())
    .optional()
    .describe("Labels to attach to the issue"),
});

/**
 * @zh issue_create 工具: 在当前项目内创建一个 Issue。
 * @en issue_create tool: create a new Issue in the current project.
 */
export const issueCreateTool: AgentToolDefinition = {
  name: "issue_create",
  description:
    "Create a new issue in the current project. Returns the created issue details.",
  parameters: issueCreateArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = issueCreateArgs.parse(args);
    const projectId = ctx.session.projectId;

    return await executeCommand({ db }, createIssue, {
      projectId,
      title: parsed.title,
      body: parsed.body ?? "",
      authorAgentId: parseInt(ctx.session.agentId, 10) || undefined,
      assignees: [],
      labels: parsed.labels ?? [],
    });
  },
};
