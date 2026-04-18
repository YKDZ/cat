import { agentSession, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const CompleteAgentSessionCommandSchema = z.object({
  /**
   * @zh 会话外部 UUID
   * @en Session external UUID
   */
  sessionId: z.uuidv4(),
  /**
   * @zh 最终状态（默认 COMPLETED）
   * @en Final status (default COMPLETED)
   */
  finalStatus: z
    .enum(["COMPLETED", "FAILED", "CANCELLED"])
    .default("COMPLETED"),
});

export type CompleteAgentSessionCommand = z.infer<
  typeof CompleteAgentSessionCommandSchema
>;

/**
 * @zh 将 AgentSession 的状态标记为终止态（COMPLETED / FAILED / CANCELLED）。
 * @en Mark an AgentSession as a terminal state (COMPLETED / FAILED / CANCELLED).
 */
export const completeAgentSession: Command<
  CompleteAgentSessionCommand
> = async (ctx, command) => {
  await ctx.db
    .update(agentSession)
    .set({ status: command.finalStatus, updatedAt: new Date() })
    .where(eq(agentSession.externalId, command.sessionId));

  return { result: undefined, events: [] };
};
