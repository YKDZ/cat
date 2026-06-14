import { agentSession, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const CompleteAgentSessionCommandSchema = z.object({
  /**
   * Session external UUID
   */
  sessionId: z.uuidv4(),
  /**
   * Final status (default COMPLETED)
   */
  finalStatus: z
    .enum(["COMPLETED", "FAILED", "CANCELLED"])
    .default("COMPLETED"),
});

export type CompleteAgentSessionCommand = z.infer<
  typeof CompleteAgentSessionCommandSchema
>;

/**
 * Mark an AgentSession as a terminal state (COMPLETED / FAILED / CANCELLED).
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
