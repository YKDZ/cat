import { agentRun, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const FinishAgentRunCommandSchema = z.object({
  /**
   * @zh agentRun 外部 UUID
   * @en agentRun external UUID
   */
  runId: z.uuidv4(),
  /**
   * @zh 最终运行状态
   * @en Final run status
   */
  status: z.enum(["completed", "failed", "cancelled"]),
});

export type FinishAgentRunCommand = z.infer<typeof FinishAgentRunCommandSchema>;

/**
 * @zh 将 AgentRun 状态更新为终止态，并记录完成时间。
 * @en Update AgentRun status to a terminal state and record completion time.
 */
export const finishAgentRun: Command<FinishAgentRunCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .update(agentRun)
    .set({ status: command.status, completedAt: new Date() })
    .where(eq(agentRun.externalId, command.runId));

  return { result: undefined, events: [] };
};
