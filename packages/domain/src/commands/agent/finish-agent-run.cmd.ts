import { agentRun, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const FinishAgentRunCommandSchema = z.object({
  /**
   * agentRun external UUID
   */
  runId: z.uuidv4(),
  /**
   * Final run status
   */
  status: z.enum(["completed", "failed", "cancelled"]),
});

export type FinishAgentRunCommand = z.infer<typeof FinishAgentRunCommandSchema>;

/**
 * Update AgentRun status to a terminal state and record completion time.
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
