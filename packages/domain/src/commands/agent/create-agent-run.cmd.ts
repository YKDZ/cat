import { agentRun, agentSession, eq } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateAgentRunCommandSchema = z.object({
  /**
   * Corresponding agentSession external UUID
   */
  sessionId: z.uuidv4(),
  /**
   * Graph definition (GraphDefinition JSON)
   */
  graphDefinition: nonNullSafeZDotJson,
  /**
   * Deduplication key (optional, for idempotency)
   */
  deduplicationKey: z.string().optional(),
});

export type CreateAgentRunCommand = z.infer<typeof CreateAgentRunCommandSchema>;

export type CreateAgentRunResult = {
  /** External UUID of the new agentRun */
  runId: string;
  /** Internal ID of the new agentRun */
  runDbId: number;
};

/**
 * Create a new AgentRun and update AgentSession.currentRunId.
 */
export const createAgentRun: Command<
  CreateAgentRunCommand,
  CreateAgentRunResult
> = async (ctx, command) => {
  // Look up session internal ID
  const session = assertSingleNonNullish(
    await ctx.db
      .select({ id: agentSession.id })
      .from(agentSession)
      .where(eq(agentSession.externalId, command.sessionId))
      .limit(1),
  );

  // Create the run
  const run = assertSingleNonNullish(
    await ctx.db
      .insert(agentRun)
      .values({
        sessionId: session.id,
        status: "running",
        graphDefinition: command.graphDefinition,
        deduplicationKey: command.deduplicationKey ?? null,
      })
      .returning({ id: agentRun.id, externalId: agentRun.externalId }),
  );

  // Update session's currentRunId
  await ctx.db
    .update(agentSession)
    .set({ currentRunId: run.id, updatedAt: new Date() })
    .where(eq(agentSession.id, session.id));

  return { result: { runId: run.externalId, runDbId: run.id }, events: [] };
};
