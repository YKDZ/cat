import type { AgentToolDefinition } from "@cat/agent";

import { claimIssue, createPR, executeCommand, getDbHandle } from "@cat/domain";
import * as z from "zod/v4";

const issueClaimArgs = z.object({
  /**
   * @zh 领取者 Agent ID（使用 session 中的 agentId 即可，无需显式传入）
   * @en Claimant agent ID (defaults to session agentId; no need to pass explicitly)
   */
  agentId: z
    .int()
    .positive()
    .optional()
    .describe(
      "Override the agent ID to claim as. Defaults to the session agent.",
    ),
});

/**
 * @zh issue_claim 工具: 原子性领取当前项目的首个可用 Issue。
 * - Trust 模式: 仅领取 Issue，不创建 PR。
 * - Isolation 模式: 领取 Issue + 自动创建 PR + 关联 Issue。
 *
 * @en issue_claim tool: atomically claim the first available Issue in the project.
 * - Trust mode: claim issue only, no PR created.
 * - Isolation mode: claim issue + auto-create PR + link to issue.
 */
export const issueClaimTool: AgentToolDefinition = {
  name: "issue_claim",
  description:
    "Atomically claim the first available issue in the current project. " +
    "In isolation mode, a PR is automatically created and linked to the claimed issue. " +
    "Returns the claimed issue details (and PR details in isolation mode), or null if no issue is available.",
  parameters: issueClaimArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const { client: db } = await getDbHandle();
    const parsed = issueClaimArgs.parse(args);

    const agentId =
      parsed.agentId ?? (parseInt(ctx.session.agentId, 10) || undefined);

    // Claim the issue
    const claimedIssue = await executeCommand({ db }, claimIssue, {
      projectId: ctx.session.projectId,
      agentId,
    });

    if (claimedIssue === null) {
      return null;
    }

    // In isolation mode: auto-create a linked PR
    if (ctx.vcsMode === "isolation") {
      const pr = await executeCommand({ db }, createPR, {
        projectId: ctx.session.projectId,
        title: `PR for: ${claimedIssue.title}`,
        body: `Auto-created PR linked to Issue #${claimedIssue.number}.`,
        authorAgentId: agentId,
        reviewers: [],
        issueId: claimedIssue.id,
      });

      return {
        issue: claimedIssue,
        pr,
        mode: "isolation",
      };
    }

    return {
      issue: claimedIssue,
      mode: "trust",
    };
  },
};
