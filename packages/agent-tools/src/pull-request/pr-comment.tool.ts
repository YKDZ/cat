import type { AgentToolDefinition } from "@cat/agent";

import {
  createIssueComment,
  createThread,
  executeCommand,
  getDbHandle,
} from "@cat/domain";
import * as z from "zod";

const prCommentArgs = z.object({
  /**
   * @zh PR 的内部整数 ID
   * @en Internal integer ID of the pull request
   */
  prId: z
    .int()
    .positive()
    .describe("Internal integer ID of the pull request to comment on"),
  /**
   * @zh 评论内容（Markdown）
   * @en Comment body in Markdown
   */
  body: z.string().min(1).describe("The body of the comment in Markdown"),
});

/**
 * @zh pr_comment 工具: 在 PR 上发表评论。
 * @en pr_comment tool: post a comment on a pull request.
 */
export const prCommentTool: AgentToolDefinition = {
  name: "pr_comment",
  description:
    "Post a comment on a pull request. Creates a new comment thread with the provided body.",
  parameters: prCommentArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = prCommentArgs.parse(args);
    const agentId = parseInt(ctx.session.agentId, 10) || undefined;

    const { result: thread } = await createThread(
      { db },
      {
        targetType: "pr",
        targetId: parsed.prId,
        isReviewThread: false,
      },
    );

    return await executeCommand({ db }, createIssueComment, {
      threadId: thread.id,
      body: parsed.body,
      authorAgentId: agentId,
      targetType: "pr",
      targetId: parsed.prId,
    });
  },
};
