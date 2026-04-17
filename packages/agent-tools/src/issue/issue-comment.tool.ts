import type { AgentToolDefinition } from "@cat/agent";

import {
  createIssueComment,
  createThread,
  executeCommand,
  getDbHandle,
} from "@cat/domain";
import * as z from "zod/v4";

const issueCommentArgs = z.object({
  /**
   * @zh Issue 的内部整数 ID
   * @en Internal integer ID of the issue
   */
  issueId: z
    .int()
    .positive()
    .describe("Internal integer ID of the issue to comment on"),
  /**
   * @zh 评论内容（Markdown）
   * @en Comment body in Markdown
   */
  body: z.string().min(1).describe("The body of the comment in Markdown"),
});

/**
 * @zh issue_comment 工具: 在 Issue 上发表评论。
 * @en issue_comment tool: post a comment on an Issue.
 */
export const issueCommentTool: AgentToolDefinition = {
  name: "issue_comment",
  description:
    "Post a comment on an issue. Creates a new comment thread with the provided body.",
  parameters: issueCommentArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = issueCommentArgs.parse(args);
    const agentId = parseInt(ctx.session.agentId, 10) || undefined;

    const { result: thread } = await createThread(
      { db },
      {
        targetType: "issue",
        targetId: parsed.issueId,
        isReviewThread: false,
      },
    );

    return await executeCommand({ db }, createIssueComment, {
      threadId: thread.id,
      body: parsed.body,
      authorAgentId: agentId,
      targetType: "issue",
      targetId: parsed.issueId,
    });
  },
};
