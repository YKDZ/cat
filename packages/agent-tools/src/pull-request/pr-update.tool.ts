import type { AgentToolDefinition } from "@cat/agent";

import { executeCommand, getDbHandle, updatePRStatus } from "@cat/domain";
import * as z from "zod";

const prUpdateArgs = z.object({
  /**
   * @zh PR 内部 ID
   * @en Internal PR ID
   */
  prId: z
    .int()
    .positive()
    .describe("The internal integer ID of the pull request to update"),
  /**
   * @zh 目标 PR 状态
   * @en Target PR status
   */
  status: z
    .enum(["DRAFT", "OPEN", "REVIEW", "CHANGES_REQUESTED", "MERGED", "CLOSED"])
    .describe("The new status for the pull request"),
});

/**
 * @zh pr_update 工具: 更新 PR 状态（DRAFT / OPEN / REVIEW / CHANGES_REQUESTED / MERGED / CLOSED）。
 * @en pr_update tool: update the status of a pull request.
 */
export const prUpdateTool: AgentToolDefinition = {
  name: "pr_update",
  description:
    "Update the status of a pull request. " +
    "Valid transitions: DRAFT → OPEN → REVIEW → MERGED/CLOSED. " +
    "Returns the updated pull request.",
  parameters: prUpdateArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, _ctx) {
    const { client: db } = await getDbHandle();
    const parsed = prUpdateArgs.parse(args);

    return await executeCommand({ db }, updatePRStatus, {
      prId: parsed.prId,
      status: parsed.status,
    });
  },
};
